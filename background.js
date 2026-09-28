/**
 * EFF AI 助手 - Background Service Worker
 *
 * LLM 网关逻辑移植自 EFF-Monitoring backend/app/services/ai_gateway.py:
 *  - Ollama 原生接口(/api/chat 流式 + /api/tags 模型列表,/v1 后缀自动剥离)
 *  - OpenAI 兼容接口(/chat/completions SSE 流式 + 多候选 /models 探测,LM Studio 走此协议)
 *  - 连接失败时给出与原项目一致的可操作错误提示
 */

importScripts('shared/common.js');

const CHAT_PORT_NAME = 'eff-ai-chat';

/* ==================== LLM 网关 ==================== */

/** 构建请求(URL + 初始化参数),按提供商适配 */
function buildChatRequest(messages, settings, signal) {
  const temperature = Number.isFinite(settings.temperature) ? settings.temperature : 0.3;
  const model = settings.model || '';
  // 禁用思考:除 think:false 参数(仅 Ollama 且需模型模板支持)外,
  // 追加一条系统级指令,抑制 gemma/R1 等在正文里输出思考的模型(参数会被这类模型忽略)
  if (settings.disableThink) {
    messages = [{
      role: 'system',
      content: '直接输出最终答案:不要输出思考、分析或推理过程,不要使用 <think> 等思考标签。若习惯先思考,请在内部完成后只给结论。',
    }].concat(messages);
  }
  if (settings.provider === 'ollama') {
    const url = `${ollamaRoot(settings.baseUrl)}/api/chat`;
    // 思考型模型(如 qwen3.5 系列)思考阶段 content 为空、文字走 thinking 字段,
    // 界面会长时间空白;可通过设置禁用思考直接出结论。老版本 Ollama 会忽略该字段。
    const payload = { model: model || 'llama3', messages, stream: true, options: { temperature } };
    if (settings.disableThink) payload.think = false;
    return {
      url,
      init: {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      protocol: 'ollama',
    };
  }
  const headers = { 'Content-Type': 'application/json' };
  if (settings.apiKey) headers['Authorization'] = `Bearer ${settings.apiKey}`;
  return {
    url: openaiChatUrl(settings.baseUrl, settings.provider),
    init: {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify({ model, messages, temperature, stream: true }),
    },
    protocol: 'openai',
  };
}

/**
 * 从一行流式响应解析增量;返回 {text, phase: 'thinking'|'content'} 或 null。
 * thinking:Ollama 思考模型的 message.thinking;OpenAI 兼容的 delta.reasoning(_content)。
 */
function parseStreamLine(protocol, line) {
  const raw = line.trim();
  if (!raw) return null;
  try {
    const chunk = JSON.parse(raw);
    if (protocol === 'ollama') {
      const msg = chunk.message || {};
      if (typeof msg.thinking === 'string' && msg.thinking) return { text: msg.thinking, phase: 'thinking' };
      if (typeof msg.content === 'string' && msg.content) return { text: msg.content, phase: 'content' };
      return null;
    }
    const delta = (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) || {};
    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) return { text: delta.reasoning_content, phase: 'thinking' };
    if (typeof delta.reasoning === 'string' && delta.reasoning) return { text: delta.reasoning, phase: 'thinking' };
    if (typeof delta.content === 'string' && delta.content) return { text: delta.content, phase: 'content' };
    return null;
  } catch {
    return null;
  }
}

/**
 * <think> 标签分流器:部分模型(gemma、DeepSeek-R1 蒸馏版等)不支持 think 参数,
 * 思考以 <think>…</think> 文本形式混在 content 里。此状态机把开头的 think 块
 * 路由到 thinking 通道(界面上进折叠块),正文保持干净。
 * 仅在正文尚未开始时识别开标签——避免误伤报告正文中出现的字面 <think>。
 * emit(text, phase);flush() 在流结束时冲出滞留的尾部(标签可能跨块被暂存)。
 */
function makeThinkTagSplitter(emit) {
  const OPEN = '<think>';
  const CLOSE = '</think>';
  let started = false; // 是否已有正文输出(过了开头就不再识别开标签)
  let inThink = false;
  let pending = '';

  return {
    feed(chunk) {
      let buf = pending + chunk;
      pending = '';
      while (buf) {
        if (inThink) {
          const end = buf.indexOf(CLOSE);
          if (end === -1) {
            const hold = Math.min(CLOSE.length - 1, buf.length);
            const text = buf.slice(0, buf.length - hold);
            if (text) { emit(text, 'thinking'); }
            pending = buf.slice(buf.length - hold);
            return;
          }
          if (end > 0) emit(buf.slice(0, end), 'thinking');
          buf = buf.slice(end + CLOSE.length);
          inThink = false;
          started = true;
        } else {
          const start = started ? -1 : buf.indexOf(OPEN);
          if (start === -1) {
            const hold = started ? 0 : Math.min(OPEN.length - 1, buf.length);
            const text = buf.slice(0, buf.length - hold);
            if (text) { emit(text, 'content'); if (text.trim()) started = true; }
            pending = buf.slice(buf.length - hold);
            return;
          }
          if (start > 0 && buf.slice(0, start).trim()) {
            // 标签前已有正文:是字面 <think>(如报告中讲解标签用法),整段按正文处理
            emit(buf, 'content');
            started = true;
            return;
          }
          if (start > 0) emit(buf.slice(0, start), 'content'); // 开头的空白前缀
          buf = buf.slice(start + OPEN.length);
          inThink = true;
        }
      }
    },
    flush() {
      if (pending) {
        emit(pending, inThink ? 'thinking' : 'content');
        pending = '';
      }
    },
  };
}

/** 把网络/HTTP 异常翻译为用户可读的错误提示(含 Ollama CORS 提示) */
async function explainFetchError(err, resp, protocol) {
  if (err && err.name === 'AbortError') return '已停止生成。';
  if (err && (err instanceof TypeError || /Failed to fetch|NetworkError/i.test(String(err.message || '')))) {
    const who = protocol === 'ollama' ? 'Ollama 服务' : 'AI 服务';
    return `无法连接到${who},请确认:\n1. 服务已启动(ollama serve / LM Studio Server 已开启);\n2. 地址与端口正确;\n3. Ollama 需允许扩展来源:设置环境变量 OLLAMA_ORIGINS=* 后重启。`;
  }
  if (resp) {
    let detail = '';
    try { detail = (await resp.text()).slice(0, 300); } catch { /* ignore */ }
    if (resp.status === 403 && protocol === 'ollama') {
      return `Ollama 拒绝了扩展的访问(403)。请在启动 Ollama 前设置环境变量 OLLAMA_ORIGINS="*",并重启 Ollama。\n详情: ${detail}`;
    }
    if (resp.status === 404) {
      return `接口不存在(404),请检查 Base URL。Ollama 通常填 http://localhost:11434;LM Studio 通常填 http://localhost:1234/v1。\n详情: ${detail}`;
    }
    return `AI 服务错误 (HTTP ${resp.status}): ${detail}`;
  }
  return `请求失败: ${(err && err.message) || err}`;
}

/**
 * 流式对话:从 port 接收 {type:'chat', messages, settings},逐 token 回推。
 * MV3 SW 空闲 30s 会被回收,慢模型首 token 前可能长时间静默,这里用周期性 API 调用保活。
 */
function handleChatPort(port) {
  if (port.name !== CHAT_PORT_NAME) return;
  let aborted = false;
  let keepAliveTimer = null;
  const controller = new AbortController();

  port.onDisconnect.addListener(() => {
    aborted = true;
    controller.abort();
    if (keepAliveTimer) clearInterval(keepAliveTimer);
  });

  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== 'chat') return;
    const { messages } = msg;
    let settings = msg.settings;
    try {
      settings = settings || await loadSettings();
    } catch {
      settings = Object.assign({}, DEFAULT_SETTINGS);
    }
    const { url, init, protocol } = buildChatRequest(messages, settings, controller.signal);

    keepAliveTimer = setInterval(() => {
      chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
    }, 20000);

    try {
      const resp = await fetch(url, init);
      if (!resp.ok) {
        const hint = await explainFetchError(null, resp, protocol);
        safePost(port, { type: 'error', message: hint });
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      // <think> 标签分流:gemma/R1 类模型的思考混在 content 里,路由到折叠的思考块
      const splitter = makeThinkTagSplitter((text, phase) => safePost(port, { type: 'chunk', text, phase }));
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (protocol === 'openai') {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            const piece = parseStreamLine(protocol, payload);
            if (piece) {
              if (piece.phase === 'thinking') safePost(port, { type: 'chunk', text: piece.text, phase: 'thinking' });
              else splitter.feed(piece.text);
            }
          } else {
            const piece = parseStreamLine(protocol, line);
            if (piece) {
              if (piece.phase === 'thinking') safePost(port, { type: 'chunk', text: piece.text, phase: 'thinking' });
              else splitter.feed(piece.text);
            }
          }
        }
      }
      splitter.flush();
      safePost(port, { type: 'done' });
    } catch (err) {
      if (!aborted) {
        safePost(port, { type: 'error', message: await explainFetchError(err, null, protocol) });
      } else {
        safePost(port, { type: 'done' });
      }
    } finally {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
    }
  });
}

function safePost(port, msg) {
  try { port.postMessage(msg); } catch { /* 面板已关闭 */ }
}

/* ==================== 模型列表(移植 fetch_models) ==================== */

async function fetchModels(settings) {
  const provider = settings.provider || 'ollama';
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const timeout = 8000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);

  try {
    if (provider === 'ollama') {
      const url = `${ollamaRoot(baseUrl)}/api/tags`;
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) {
        return { ok: false, models: [], error: await explainFetchError(null, resp, 'ollama') };
      }
      const data = await resp.json();
      const models = (data.models || [])
        .map((m) => {
          // Ollama 会把 embedding 模型(如 bge-m3)也列出来,按 capabilities 过滤
          const caps = Array.isArray(m.capabilities) ? m.capabilities
            : (m.details && Array.isArray(m.details.capabilities)) ? m.details.capabilities : null;
          const chatCapable = !caps || caps.includes('chat') || caps.includes('completion') || caps.includes('tools');
          return { id: m.name, owned_by: 'Ollama', chatCapable };
        })
        .filter((m) => m.chatCapable)
        .map(({ id, owned_by }) => ({ id, owned_by }))
        .sort((a, b) => a.id.localeCompare(b.id));
      return { ok: true, models };
    }

    // OpenAI 兼容:与 ai_gateway.py 一致,构造多个候选 /models 地址依次探测
    const candidates = [];
    if (baseUrl.includes('/chat/completions')) {
      candidates.push(baseUrl.replace('/chat/completions', '/models'));
    }
    if (baseUrl.endsWith('/v1')) {
      candidates.push(`${baseUrl}/models`);
    } else {
      candidates.push(`${baseUrl}/v1/models`);
      candidates.push(`${baseUrl}/models`);
    }
    const headers = {};
    if (settings.apiKey) headers['Authorization'] = `Bearer ${settings.apiKey}`;

    let lastError = '';
    const seen = new Set();
    for (const url of candidates) {
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        const resp = await fetch(url, { headers, signal: ctrl.signal });
        if (!resp.ok) { lastError = `HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`; continue; }
        const data = await resp.json();
        const items = Array.isArray(data) ? data : data.data;
        if (Array.isArray(items)) {
          const models = items
            .map((item) => typeof item === 'string' ? { id: item, owned_by: 'Other' } : { id: item.id, owned_by: item.owned_by || 'Other' })
            .filter((m) => m.id)
            .sort((a, b) => a.id.localeCompare(b.id));
          return { ok: true, models };
        }
      } catch (err) {
        lastError = String((err && err.message) || err);
      }
    }
    return {
      ok: false,
      models: [],
      error: `未能获取模型列表(${lastError || '无可用地址'})。请确认服务已启动;LM Studio 需在 Server 设置中开启 CORS 与 "Serve on Local Network"(如非本机)。`,
    };
  } catch (err) {
    return {
      ok: false,
      models: [],
      error: `连接失败: ${(err && err.message) || err}。请确认服务已启动${provider === 'ollama' ? ',且 Ollama 已设置 OLLAMA_ORIGINS=*' : ''}。`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ==================== 侧边栏与右键菜单 ==================== */

async function openSidePanelForTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.sidePanel.open({ windowId: tab.windowId });
    return true;
  } catch (err) {
    console.warn('[EFF-AI] 打开侧边栏失败:', err);
    return false;
  }
}

async function storePendingAsk(mode, info, tab) {
  const selection = {
    text: info.selectionText || '',
    title: (tab && tab.title) || '',
    url: (tab && tab.url) || '',
  };
  await chrome.storage.session.set({ pendingAsk: { mode, selection, ts: Date.now() } });
  await openSidePanelForTab(tab.id);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

  const root = chrome.contextMenus.create({
    id: 'eff-ai-root',
    title: 'AlertTriage 研判',
    contexts: ['selection'],
  });
  Object.values(MODES).forEach((mode) => {
    if (mode.sidepanelOnly) return; // 「分析本页」等侧边栏专属操作不进右键菜单
    chrome.contextMenus.create({
      id: `eff-ai-${mode.id}`,
      parentId: root,
      title: `${mode.icon} ${mode.label}所选内容`,
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId || '');
  if (!id.startsWith('eff-ai-') || id === 'eff-ai-root' || !tab) return;
  const mode = id.replace('eff-ai-', '');
  if (MODES[mode]) storePendingAsk(mode, info, tab);
});

/* ==================== 页面正文提取(侧边栏「分析本页」) ==================== */

/** 提取注入函数:优先正文容器,压缩连续空行 */
function injectedExtract() {
  const main = document.querySelector('main, [role="main"], article, #content, .content');
  const root = (main && main.innerText && main.innerText.trim().length > 200) ? main : document.body;
  const text = (root.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  return { text: text || '', title: document.title || '', url: location.href || '' };
}

async function extractActivePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) throw new Error('找不到当前标签页');
  // 优先走已注入的 content script(页面已加载过扩展脚本)
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_TEXT' });
    if (resp && resp.ok && resp.text && resp.text.trim()) return resp;
  } catch { /* 未注入(如扩展刚更新后页面未刷新),走注入兜底 */ }
  const url = tab.url || '';
  if (!/^(https?|file):/i.test(url)) {
    throw new Error('当前是浏览器内置页面或扩展无权访问,请切换到普通网页(如告警平台页面)后重试');
  }
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectedExtract,
    });
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (/file:\/\//i.test(url)) {
      throw new Error('无法访问本地文件页面:请在扩展详情页开启「允许访问文件网址」后重试');
    }
    throw new Error(`页面注入失败,请刷新该页面后重试(${msg.slice(0, 80)})`);
  }
  const res = results && results[0] && results[0].result;
  if (res && res.text && res.text.trim()) return Object.assign({ ok: true }, res);
  throw new Error('页面无可提取的文本内容');
}

/* ==================== 消息路由 ==================== */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'OPEN_SIDEPANEL') {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    if (tabId != null) {
      openSidePanelForTab(tabId).then(sendResponse);
    } else {
      sendResponse(false);
    }
    return true; // async
  }

  if (msg.type === 'EXTRACT_PAGE') {
    extractActivePage()
      .then((resp) => sendResponse(resp))
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true;
  }

  if (msg.type === 'FETCH_MODELS') {
    loadSettings()
      .then((settings) => fetchModels(msg.settingsOverride ? Object.assign({}, settings, msg.settingsOverride) : settings))
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, models: [], error: String(err) }));
    return true;
  }

  if (msg.type === 'GET_SETTINGS') {
    loadSettings().then(sendResponse);
    return true;
  }
});

chrome.runtime.onConnect.addListener(handleChatPort);
