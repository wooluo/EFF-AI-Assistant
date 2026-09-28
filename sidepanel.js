/**
 * EFF AI 助手 - 侧边栏聊天逻辑
 * 流式输出(经 background 转发,协议适配见 background.js)、多轮对话、
 * 划词内容作为上下文卡片展示并随首轮消息注入。
 */

/* ================= Markdown 安全渲染 ================= */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function inlineMd(s) {
  return s
    .replace(/`([^`\n]+)`/g, '<code class="icode">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderMarkdown(src) {
  const blocks = [];
  // 围栏代码块先抽取为占位符(未闭合的代码块也渲染,适配流式中间态)
  let text = String(src || '').replace(/```([\w+#.-]*)[ \t]*\n?([\s\S]*?)(```|$)/g, (_m, lang, code) => {
    blocks.push(
      `<div class="eff-code">${lang ? `<span class="eff-lang">${escapeHtml(lang)}</span>` : ''}<code>${escapeHtml(code.replace(/\n$/, ''))}</code></div>`
    );
    return `\x00B${blocks.length - 1}\x00`;
  });

  const lines = escapeHtml(text).split('\n');
  const out = [];
  let para = [];
  let listType = null;  // 'ul' | 'ol'
  let listItems = [];
  let quote = [];
  let tableRows = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(inlineMd).join('<br>')}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (listType) {
      out.push(`<${listType}>${listItems.map((i) => `<li>${inlineMd(i)}</li>`).join('')}</${listType}>`);
      listType = null;
      listItems = [];
    }
  };
  const flushQuote = () => {
    const q = quote.filter((x) => x && x.trim());
    if (q.length) {
      out.push(`<blockquote>${q.map(inlineMd).join('<br>')}</blockquote>`);
    }
    quote = [];
  };
  const flushTable = () => {
    if (tableRows.length >= 2 && /^[\s|:-]+$/.test(tableRows[1])) {
      const rows = tableRows.map((r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()));
      const head = rows[0]; const body = rows.slice(2);
      const thead = `<tr>${head.map((c) => `<th>${inlineMd(c)}</th>`).join('')}</tr>`;
      const tbody = body.map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('');
      out.push(`<div class="md-table-wrap"><table>${thead}${tbody}</table></div>`);
    } else if (tableRows.length === 1) {
      para.push(tableRows[0]); flushPara();
    }
    tableRows = [];
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); flushTable(); };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const ph = line.match(/^\x00B(\d+)\x00$/);
    if (ph) { flushAll(); out.push(blocks[Number(ph[1])]); continue; }

    // 表格行
    if (/^\s*\|.*\|\s*$/.test(line)) { flushPara(); flushList(); tableRows.push(line.trim()); continue; }
    flushTable();

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const hr = /^\s*(-{3,}|\*{3,})\s*$/.test(line);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const bq = line.match(/^\s*(?:&gt;|>)\s?(.*)$/); // 转义后的 > 为 &gt;,两者都兼容

    if (heading) { flushAll(); const l = heading[1].length; out.push(`<h${l}>${inlineMd(heading[2])}</h${l}>`); }
    else if (hr) { flushAll(); out.push('<hr>'); }
    else if (ul) { flushPara(); flushQuote(); if (listType !== 'ul') { flushList(); listType = 'ul'; } listItems.push(ul[1]); }
    else if (ol) { flushPara(); flushQuote(); if (listType !== 'ol') { flushList(); listType = 'ol'; } listItems.push(ol[1]); }
    else if (bq) { flushPara(); flushList(); quote.push(bq[1]); }
    else if (line === '') { flushAll(); }
    else { flushList(); flushQuote(); para.push(line); }
  }
  flushAll();
  return out.join('');
}

/* ================= 状态 ================= */

const CHAT_PORT_NAME = 'eff-ai-chat';
const SESSION_KEY = 'effai-chat';

const els = {
  chatList: document.getElementById('chatList'),
  chatEmpty: document.getElementById('chatEmpty'),
  chatScroll: document.getElementById('chatScroll'),
  input: document.getElementById('input'),
  btnSend: document.getElementById('btnSend'),
  btnStop: document.getElementById('btnStop'),
  btnNewChat: document.getElementById('btnNewChat'),
  btnSettings: document.getElementById('btnSettings'),
  btnAnalyzePage: document.getElementById('btnAnalyzePage'),
  modelBadge: document.getElementById('modelBadge'),
  roleBadge: document.getElementById('roleBadge'),
  roleMenu: document.getElementById('roleMenu'),
  modelPickerWrap: document.getElementById('modelPickerWrap'),
  modelInput: document.getElementById('modelInput'),
  modelStatus: document.getElementById('modelStatus'),
  btnApplyModel: document.getElementById('btnApplyModel'),
  ctxCard: document.getElementById('ctxCard'),
  ctxTitle: document.getElementById('ctxTitle'),
  ctxPreview: document.getElementById('ctxPreview'),
  ctxToggle: document.getElementById('ctxToggle'),
  ctxClear: document.getElementById('ctxClear'),
};

let settings = Object.assign({}, DEFAULT_SETTINGS);
let history = [];        // [{role, content}]
let selection = null;    // 当前对话的网页引用 {text,title,url}
let streaming = false;
let streamPort = null;
let activeStream = null;   // { port, finalize } 当前流式会话;停止/新对话时直接调用 finalize
let forceNoThinkOnce = false; // 快判模式:首个请求强制禁用思考,保证秒出结论
let pendingAskHandledTs = 0;

/* ================= 持久化(会话级) ================= */

function persist() {
  chrome.storage.session.set({ [SESSION_KEY]: { history, selection } }).catch(() => {});
}

async function restore() {
  try {
    const data = await chrome.storage.session.get(SESSION_KEY);
    const saved = data && data[SESSION_KEY];
    if (saved && Array.isArray(saved.history) && saved.history.length) {
      history = saved.history;
      selection = saved.selection || null;
      history.forEach((m) => appendMessageEl(m.role, m.content));
      renderCtxCard();
      scrollBottom();
    }
  } catch { /* ignore */ }
}

/* ================= 渲染 ================= */

/* 空状态欢迎页:内容跟随当前角色 */
let emptyRenderedRoleId = null;

function renderEmptyState() {
  const role = getActiveRole(settings);
  const w = role.welcome && Array.isArray(role.welcome.tips) && role.welcome.tips.length
    ? role.welcome
    : {
        title: `你好,我是${role.name || 'AI 助手'}`,
        sub: role.desc || '由本地模型驱动,数据不出本机。',
        tips: [
          '🖱️ 在网页上<b>划选内容</b>即可提问',
          '📄 点输入框旁<b>「📄 分析本页」</b>分析整个页面',
          '✨ 支持多轮追问补充证据',
        ],
      };
  els.chatEmpty.innerHTML = '';
  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.textContent = role.icon || '✨';
  const h2 = document.createElement('h2');
  h2.textContent = w.title;
  const p = document.createElement('p');
  p.textContent = w.sub;
  const ul = document.createElement('ul');
  ul.className = 'empty-tips';
  w.tips.forEach((tip) => {
    const li = document.createElement('li');
    li.innerHTML = tip; // 提示文案来自内置角色定义或固定模板,自定义角色走 textContent 路径
    ul.appendChild(li);
  });
  els.chatEmpty.append(icon, h2, p, ul);
  emptyRenderedRoleId = role.id;
}

function toggleEmpty() {
  els.chatEmpty.hidden = history.length > 0;
  if (!els.chatEmpty.hidden && emptyRenderedRoleId !== getActiveRole(settings).id) {
    renderEmptyState();
  }
}

function appendMessageEl(role, content) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role === 'user' ? 'user' : role === 'assistant' ? 'ai' : 'error'}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (role === 'user' || role === 'error') {
    bubble.textContent = content;
  } else {
    const md = document.createElement('div');
    md.className = 'md';
    md.innerHTML = renderMarkdown(content || '');
    bubble.appendChild(md);
  }
  wrap.appendChild(bubble);

  if (role === 'assistant') {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'meta-btn';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(content || '').then(() => { copyBtn.textContent = '已复制 ✓'; setTimeout(() => { copyBtn.textContent = '复制'; }, 1500); });
    });
    meta.appendChild(copyBtn);
    wrap.appendChild(meta);
  }

  els.chatList.appendChild(wrap);
  toggleEmpty();
  return { wrap, bubble };
}

function renderCtxCard() {
  if (!selection) { els.ctxCard.hidden = true; return; }
  els.ctxCard.hidden = false;
  // 引用卡片一律默认收起(点「展开」查看内容)
  const collapsed = true;
  els.ctxCard.classList.toggle('collapsed', collapsed);
  els.ctxToggle.textContent = collapsed ? '展开' : '收起';
  const tag = els.ctxCard.querySelector('.ctx-tag');
  if (tag) tag.textContent = selection.kind === 'page' ? '📄 页面引用' : '📎 告警引用';
  els.ctxTitle.textContent = selection.title || selection.url || '';
  els.ctxPreview.textContent = selection.text.length > 500
    ? selection.text.slice(0, 500) + ' …'
    : selection.text;
}

function scrollBottom() {
  requestAnimationFrame(() => { els.chatScroll.scrollTop = els.chatScroll.scrollHeight; });
}

function setStreamingUI(on) {
  streaming = on;
  els.btnStop.hidden = !on;
  els.btnSend.disabled = on;
  els.btnSend.style.opacity = on ? 0.35 : '';
}

/* ================= 对话 ================= */

async function sendUserText(text) {
  if (streaming || !text.trim()) return;
  if (!settings.model && !settings.baseUrl) { /* 允许默认 */ }

  history.push({ role: 'user', content: text.trim() });
  appendMessageEl('user', text.trim());
  persist();
  scrollBottom();
  await streamAssistant();
}

async function streamAssistant() {
  const { wrap, bubble } = appendMessageEl('assistant', '');
  const md = bubble.querySelector('.md');
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  bubble.appendChild(cursor);
  setStreamingUI(true);
  // 首字等待提示:本地模型冷启动/思考型模型首 token 可能要几十秒
  md.innerHTML = '<div class="waiting-hint">正在等待模型输出…<br><span>本地模型加载或思考中,复杂研判可能需要 30 秒以上</span></div>';
  scrollBottom();

  // 引用内容只随首条用户消息注入一次(多轮追问不再重复占用上下文);系统提示词取当前角色
  const firstUser = history.find((m) => m.role === 'user');
  const inject = !!(selection && firstUser && !firstUser._hasCtx);
  if (inject) firstUser._hasCtx = true;
  const messages = buildMessages(history, getActiveRole(settings).prompt, inject ? selection : null, settings.maxSelectionChars);
  const effSettings = Object.assign({}, settings);
  if (forceNoThinkOnce) { effSettings.disableThink = true; forceNoThinkOnce = false; }

  let acc = '';        // 正文
  let thinkAcc = '';   // 思考过程(thinking 字段)
  let raf = 0;

  function renderLive() {
    raf = 0;
    let html = '';
    if (thinkAcc) {
      const brief = thinkAcc.length > 120 ? thinkAcc.slice(-3000) : thinkAcc;
      html += `<div class="think-box"><div class="think-label">💭 思考过程${acc ? '' : '(进行中…)'}</div><div class="think-text">${escapeHtml(brief)}</div></div>`;
    }
    if (acc) html += renderMarkdown(acc);
    md.innerHTML = html || md.innerHTML;
    scrollBottom();
  }

  streamPort = chrome.runtime.connect({ name: CHAT_PORT_NAME });
  activeStream = { port: streamPort, finalize };
  streamPort.onMessage.addListener((msg) => {
    if (msg.type === 'chunk') {
      if (msg.phase === 'thinking') thinkAcc += msg.text;
      else acc += msg.text;
      if (!raf) raf = requestAnimationFrame(renderLive);
    } else if (msg.type === 'done') {
      finalize();
    } else if (msg.type === 'error') {
      acc = '';
      wrap.className = 'msg error';
      bubble.textContent = msg.message;
      cursor.remove();
      cleanup();
    }
  });
  streamPort.onDisconnect.addListener(() => {
    if (streaming) finalize(true);
  });

  function finalize(interrupted) {
    if (!streaming) return;
    setStreamingUI(false);
    cursor.remove();
    if (interrupted && acc) acc += '\n\n(已停止生成)';
    const finalHtml = (thinkAcc
      ? `<details class="think-box"><summary>💭 思考过程(${thinkAcc.length} 字,点击展开)</summary><div class="think-text">${escapeHtml(thinkAcc)}</div></details>`
      : '') + renderMarkdown(acc || '(无输出)');
    md.innerHTML = finalHtml;
    history.push({ role: 'assistant', content: (acc || '(无输出)') });
    persist();
    cleanup();
    scrollBottom();
  }
  function cleanup() {
    setStreamingUI(false);
    activeStream = null;
    try { streamPort && streamPort.disconnect(); } catch { /* ignore */ }
    streamPort = null;
  }

  streamPort.postMessage({ type: 'chat', messages, settings: effSettings });
}

/** 停止当前生成:主动收尾(自己调 disconnect 不会触发本端 onDisconnect,必须显式 finalize) */
function stopStreaming() {
  if (activeStream && typeof activeStream.finalize === 'function') {
    activeStream.finalize(true); // finalize 内部会复位 UI、断开端口(防重入由 streaming 标志保证)
  } else {
    if (streamPort) {
      try { streamPort.disconnect(); } catch { /* ignore */ }
      streamPort = null;
    }
    setStreamingUI(false);
  }
}

/* ================= 划词唤起处理 ================= */

/** 划词唤起处理;direct 存在时(如「分析本页」按钮)跳过 storage 读取 */
async function handlePendingAsk(direct) {
  let pending = direct || null;
  if (!pending) {
    try {
      const data = await chrome.storage.session.get('pendingAsk');
      pending = data && data.pendingAsk;
    } catch { return; }
    if (!pending || !pending.selection || !pending.selection.text) return;
    if (pending.ts && pending.ts <= pendingAskHandledTs) return;
    pendingAskHandledTs = pending.ts || Date.now();
    chrome.storage.session.remove('pendingAsk').catch(() => {});
  }

  const mode = MODES[pending.mode] ? pending.mode : 'ask';
  const newSel = pending.selection;

  // 已有对话且引用内容不同 → 开新对话,避免两个不相关的上下文混在一起
  const sameCtx = selection && selection.text === newSel.text;
  if (history.length && !sameCtx) {
    newChat(false);
  }
  selection = newSel;
  renderCtxCard();
  persist();

  if (MODES[mode].autoSend) {
    if (mode === 'quick') forceNoThinkOnce = true; // 快判:跳过思考,直接出三行结论
    const prompt = buildModePrompt(mode, selection, settings, getActiveRole(settings));
    if (prompt) { await sendUserText(prompt); return; }
  }
  // ask 模式:聚焦输入框等待用户追问/补充证据
  els.input.focus();
  els.input.placeholder = '已引用告警内容,输入追问或补充证据…';
}

/* ================= 新对话 ================= */

function newChat(clearUi = true) {
  history = [];
  selection = null;
  if (activeStream || streamPort) stopStreaming();
  setStreamingUI(false);
  if (clearUi) {
    els.chatList.innerHTML = '';
    els.ctxCard.hidden = true;
    els.input.placeholder = '输入问题或补充证据,Enter 发送…';
    persist();
    toggleEmpty();
    els.input.focus();
  }
}

/* ================= 角色切换 ================= */

function renderRoleBadge() {
  const role = getActiveRole(settings);
  els.roleBadge.textContent = `${role.icon} ${role.name} ▾`;
  els.roleBadge.title = `${role.name}:${role.desc || ''}(点击切换角色)`;
}

function renderRoleMenu() {
  const roles = Array.isArray(settings.roles) && settings.roles.length ? settings.roles : DEFAULT_ROLES;
  els.roleMenu.innerHTML = '';
  roles.forEach((r) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'role-item' + (r.id === settings.activeRoleId ? ' active' : '');
    const icon = document.createElement('span');
    icon.className = 'role-icon';
    icon.textContent = r.icon || '👤';
    const info = document.createElement('span');
    const name = document.createElement('div');
    name.className = 'role-name';
    name.textContent = r.name;
    const desc = document.createElement('div');
    desc.className = 'role-desc';
    desc.textContent = r.desc || '';
    info.appendChild(name);
    info.appendChild(desc);
    btn.appendChild(icon);
    btn.appendChild(info);
    btn.addEventListener('click', async () => {
      settings.activeRoleId = r.id;
      await chrome.storage.sync.set({ activeRoleId: r.id }).catch(() => {});
      renderRoleBadge();
      els.roleMenu.hidden = true;
    });
    els.roleMenu.appendChild(btn);
  });
  const manage = document.createElement('button');
  manage.type = 'button';
  manage.className = 'role-item role-manage';
  manage.innerHTML = '<span class="role-icon">⚙</span><span class="role-name">管理角色(新建/编辑)</span>';
  manage.addEventListener('click', () => {
    els.roleMenu.hidden = true;
    chrome.runtime.openOptionsPage();
  });
  els.roleMenu.appendChild(manage);
}

els.roleBadge.addEventListener('click', () => {
  const willShow = els.roleMenu.hidden;
  if (willShow) renderRoleMenu();
  els.roleMenu.hidden = !willShow;
});
document.addEventListener('click', (e) => {
  if (!els.roleMenu.hidden && !els.roleMenu.contains(e.target) && e.target !== els.roleBadge) {
    els.roleMenu.hidden = true;
  }
});

/* ================= 模型选择(组合框:聚焦全量列表,键入才过滤) ================= */

/** 点选列表项 → 立即生效 */
const modelCombo = createModelCombo(els.modelInput, document.getElementById('modelMenu'), {
  onSelect: (id) => applyModelChoice(id),
});

function renderModelBadge() {
  els.modelBadge.textContent = settings.model || '未选择模型';
}

function setModelStatus(text, cls) {
  els.modelStatus.className = `model-status ${cls || ''}`;
  els.modelStatus.textContent = text || '';
}

async function applyModelChoice(id) {
  const name = String(id || '').trim();
  if (!name) { setModelStatus('请输入或选择一个模型名', 'err'); return; }
  settings.model = name;
  els.modelInput.value = name;
  renderModelBadge();
  await chrome.storage.sync.set({
    model: name,
    providerState: Object.assign({}, settings.providerState, {
      [settings.provider]: Object.assign({}, getProviderState(settings, settings.provider), { model: name }),
    }),
  }).catch(() => {});
  setModelStatus(`已切换:${name}`, 'ok');
  setTimeout(() => { setModelStatus(''); }, 2000);
}

async function refreshModelList() {
  // 先用缓存立即填充,再拉最新
  const cached = await readModelCache(settings.provider, settings.baseUrl);
  if (cached.length) {
    modelCombo.setItems(cached);
    if (!els.modelInput.value) els.modelInput.value = settings.model || cached[0].id;
    setModelStatus(`(缓存 ${cached.length} 个模型,正在刷新…)`);
  } else {
    setModelStatus('正在获取模型列表…');
  }
  const resp = await chrome.runtime.sendMessage({ type: 'FETCH_MODELS' }).catch(() => null);
  if (!resp) { setModelStatus('获取失败:无法联系后台服务', 'err'); return; }
  if (resp.ok && resp.models.length) {
    modelCombo.setItems(resp.models);
    writeModelCache(settings.provider, settings.baseUrl, resp.models);
    setModelStatus(`发现 ${resp.models.length} 个模型,点击输入框选择`, 'ok');
    if (!els.modelInput.value) {
      els.modelInput.value = settings.model || resp.models[0].id;
    }
  } else {
    setModelStatus((resp.error || '未发现模型') + '。仍可手动输入模型名后点「应用」。', 'err');
  }
}

/* ================= 事件绑定 ================= */

function autoGrow() {
  els.input.style.height = 'auto';
  els.input.style.height = `${Math.min(els.input.scrollHeight, 140)}px`;
}

els.input.addEventListener('input', autoGrow);
els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    const text = els.input.value;
    els.input.value = '';
    autoGrow();
    sendUserText(text);
  }
});
els.btnSend.addEventListener('click', () => {
  const text = els.input.value;
  els.input.value = '';
  autoGrow();
  sendUserText(text);
});
els.btnStop.addEventListener('click', stopStreaming);
els.btnNewChat.addEventListener('click', () => newChat(true));
els.btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());

/* 「分析本页」:提取当前页面正文 → 以页面引用开启研判 */
els.btnAnalyzePage.addEventListener('click', async () => {
  if (streaming) return;
  els.btnAnalyzePage.disabled = true;
  els.btnAnalyzePage.textContent = '⏳';
  const resp = await chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE' }).catch(() => null);
  els.btnAnalyzePage.disabled = false;
  els.btnAnalyzePage.textContent = '📄';
  if (!resp || !resp.ok || !resp.text || !resp.text.trim()) {
    appendMessageEl('error', `无法读取当前页面:${(resp && resp.error) || '未知错误'}\n请确认当前标签页是普通网页且已加载完成。`);
    return;
  }
  // 确定性前置校验:内容过短(如纯导航/空列表页)不发起研判,避免模型在贫信息上编造
  const pageText = resp.text.trim();
  if (pageText.length < 80) {
    appendMessageEl('error', `⚠️ 页面数据不足,无法研判:当前页面仅提取到 ${pageText.length} 个字符。\n建议:① 确认已打开告警列表/详情页且内容已加载;② 或直接划选具体告警内容后点「🔍 研判」。`);
    return;
  }
  handlePendingAsk({
    mode: 'page',
    selection: { text: pageText, title: resp.title || '', url: resp.url || '', kind: 'page' },
    ts: Date.now(),
  });
});

els.ctxToggle.addEventListener('click', () => {
  const collapsed = els.ctxCard.classList.toggle('collapsed');
  els.ctxToggle.textContent = collapsed ? '展开' : '收起';
});
els.ctxClear.addEventListener('click', () => {
  selection = null;
  els.ctxCard.hidden = true;
  persist();
});

els.modelBadge.addEventListener('click', async () => {
  const willShow = els.modelPickerWrap.hidden;
  els.modelPickerWrap.hidden = !willShow;
  if (willShow) {
    els.modelInput.value = settings.model || els.modelInput.value;
    els.modelInput.focus();
    await refreshModelList();
  }
});
els.btnApplyModel.addEventListener('click', () => applyModelChoice(els.modelInput.value));
els.modelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    applyModelChoice(els.modelInput.value);
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  // roles 存 local(sync 单项配额装不下),角色变更走这里
  if (area === 'local') {
    if (changes.roles) {
      settings = await loadSettings();
      renderRoleBadge();
      toggleEmpty(); // 角色变化时刷新欢迎页内容
    }
    return;
  }
  if (area !== 'sync') return;
  const watched = ['model', 'provider', 'baseUrl', 'apiKey', 'systemPrompt', 'temperature', 'disableThink', 'providerState', 'activeRoleId'];
  if (watched.some((k) => changes[k])) {
    settings = await loadSettings();
    renderModelBadge();
    renderRoleBadge();
    toggleEmpty(); // 角色变化时刷新欢迎页内容
  }
});

/* ================= 启动 ================= */

(async function init() {
  settings = await loadSettings();
  renderModelBadge();
  renderRoleBadge();
  renderCtxCard();
  await restore();
  await handlePendingAsk();
  // 面板常驻时监听新的划词请求
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.pendingAsk && changes.pendingAsk.newValue) {
      handlePendingAsk();
    }
  });
  els.input.focus();
})();
