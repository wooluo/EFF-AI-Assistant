/**
 * 核心网关逻辑单元测试(Node 环境,无需浏览器)。
 * 运行:node tools/test_gateway.mjs
 * 覆盖:URL 适配(ai_gateway.py 移植行为)、双协议流式解析、端到端模拟流式对话。
 */
import { createRequire } from 'node:module';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

/* ---------- 1. common.js 纯函数 ---------- */
const common = require(path.join(root, 'shared', 'common.js'));
const { DEFAULT_SETTINGS, DEFAULT_ROLES, buildMessages, buildModePrompt, ollamaRoot, openaiChatUrl, isLocalUrl, buildSelectionBlock, modelCacheKey, getProviderState, getActiveRole } = common;

// Ollama 根路径:误填 /v1 后缀要剥离(与 ai_gateway.py 一致)
assert.equal(ollamaRoot('http://localhost:11434'), 'http://localhost:11434');
assert.equal(ollamaRoot('http://localhost:11434/v1/'), 'http://localhost:11434');
assert.equal(ollamaRoot(''), 'http://localhost:11434');

// OpenAI 兼容地址:自动补全 /v1/chat/completions;完整地址不重复拼接
assert.equal(openaiChatUrl('http://localhost:1234', 'lmstudio'), 'http://localhost:1234/v1/chat/completions');
assert.equal(openaiChatUrl('http://localhost:1234/v1', 'lmstudio'), 'http://localhost:1234/v1/chat/completions');
assert.equal(openaiChatUrl('http://localhost:1234/v1/chat/completions', 'openai'), 'http://localhost:1234/v1/chat/completions');
assert.equal(openaiChatUrl('', 'lmstudio'), 'http://localhost:1234/v1/chat/completions');

assert.equal(isLocalUrl('http://127.0.0.1:1234'), true);
assert.equal(isLocalUrl('http://192.168.1.5:1234'), false);

// 选取内容截断
const longText = 'x'.repeat(10000);
const clipped = buildSelectionBlock({ text: longText, title: '', url: '' }, 8000);
assert.ok(clipped.includes('已截断'));
assert.ok(clipped.length < 9000);

// 凭证自动脱敏:键值对、Authorization 头;保留前3字符;非凭证字段不受影响

// 全链路本地运行:凭证保留原文(不做脱敏)
assert.ok(buildSelectionBlock({ text: 'x-clickhouse-key: example-key-123', title: '', url: '' }, 8000).includes('example-key-123'));

// 快捷模式提示词(告警研判场景)
const sel = { text: 'hello world', title: 'T', url: 'http://a' };
assert.equal(buildModePrompt('ask', sel, DEFAULT_SETTINGS), null);
const inv = buildModePrompt('investigate', sel, DEFAULT_SETTINGS);
assert.ok(inv.includes('研判结论') && inv.includes('置信度') && inv.includes('攻击成功'), '研判模板应包含结论与标签');
assert.ok(inv.indexOf('研判结论') < inv.indexOf('关键证据分析'), '结论应置顶(在证据分析之前)');
assert.ok(inv.includes('一句话总结'), '模板应以一句话总结收尾');
assert.ok(inv.includes('仅引用告警中实际存在的值'), '告警标识应有防幻觉约束');
assert.ok(inv.includes('回查审计日志'), '应含溯源建议');
assert.ok(buildModePrompt('explain', sel, DEFAULT_SETTINGS).includes('解释'));
assert.ok(buildModePrompt('respond', sel, DEFAULT_SETTINGS).includes('处置'));
const pageP = buildModePrompt('page', sel, DEFAULT_SETTINGS);
assert.ok(pageP.includes('逐条研判') && pageP.includes('整体研判结论') && pageP.includes('页面无告警类内容'), '页面分析模板');
assert.ok(pageP.includes('页面数据不足,无法研判') && pageP.includes('严禁输出研判结构'), '页面模式必须有数据不足的明确出口');
assert.ok(buildModePrompt('quick', sel, DEFAULT_SETTINGS).includes('严禁编造'), '快判要有不足即无法确认的约束');
assert.ok(common.MODES.page.sidepanelOnly === true, 'page 模式应为侧边栏专属');

// 系统提示词应包含互斥研判标签体系(与 EFF-Monitoring ai_service.py 口径一致)
assert.ok(DEFAULT_SETTINGS.systemPrompt.includes('业务行为 / 存在攻击意图 / 攻击失败 / 攻击成功 / 非告警事件 / 无法确认'));
assert.ok(DEFAULT_SETTINGS.systemPrompt.includes('严禁编造'), '应有防幻觉条款');
assert.ok(DEFAULT_SETTINGS.systemPrompt.includes('结论必须落在【无法确认】'), '信息不足时应强制无法确认而非编造');
assert.ok(DEFAULT_SETTINGS.systemPrompt.includes('明文传输 > 账户权限'), '凭证立论应有优先级');

// 消息组装:selection 只注入首条用户消息,system 在最前
const msgs = buildMessages(
  [
    { role: 'user', content: '它是什么意思?' },
    { role: 'assistant', content: '答…' },
    { role: 'user', content: '再举个例子' },
  ],
  'SYS',
  sel,
  8000,
);
assert.equal(msgs[0].role, 'system');
assert.equal(msgs[0].content, 'SYS');
assert.ok(msgs[1].content.includes('【告警/日志内容】'));
assert.ok(msgs[1].content.includes('hello world'));
assert.ok(msgs[1].content.includes('【我的问题】'));
assert.ok(!msgs[3].content.includes('【告警/日志内容】'), '追问不应重复携带资料块');

// 角色体系:默认六角色、getActiveRole 解析与回退
assert.equal(DEFAULT_ROLES.length, 7, '应内置 7 个角色');
assert.ok(DEFAULT_ROLES.some((r) => r.id === 'report' && r.prompt.includes('交班')), '值班总结报告员应存在');
assert.ok(DEFAULT_ROLES.every((r) => r.id !== 'compliance' || r.prompt.includes('脱敏')), '合规上报角色应要求脱敏');
assert.ok(DEFAULT_ROLES.every((r) => r.prompt === null || /严禁编造|不要编造/.test(r.prompt)), '所有角色共享防编造纪律');
const activeSoc = getActiveRole({ roles: null, activeRoleId: 'soc' });
assert.equal(activeSoc.id, 'soc');
assert.equal(activeSoc.prompt, DEFAULT_SETTINGS.systemPrompt, '研判员默认用系统提示词');
const activeReport = getActiveRole({ roles: null, activeRoleId: 'report' });
assert.ok(activeReport.prompt.includes('交接'), '报告员提示词应生效');
const fallback = getActiveRole({ roles: null, activeRoleId: '不存在的' });
assert.equal(fallback.id, 'soc', '无效角色回退默认');

// 旧版通用助手提示词 → 自动迁移为研判版
globalThis.chrome = {
  storage: {
    sync: {
      async get() { return { systemPrompt: '你是一个运行在浏览器侧边栏中的智能助手,由用户本地的 AI 模型驱动。\n要求:\n1. …' }; },
      async set() {},
    },
    local: { async get() { return {}; }, async set() {} },
  },
};
const migrated = await common.loadSettings();
assert.ok(migrated.systemPrompt.includes('研判'), '旧提示词应被迁移为研判专家版');

// 老用户自定义过 systemPrompt(非旧默认)→ 物化角色并保留进 soc 角色
globalThis.chrome = {
  storage: {
    sync: {
      async get() { return { systemPrompt: '我的自定义研判提示词', maxSelectionChars: 12000 }; },
      async set() {},
    },
    local: { async get() { return {}; }, async set() {} },
  },
};
const migrated2 = await common.loadSettings();
assert.ok(Array.isArray(migrated2.roles) && migrated2.roles.length === 7, '角色应被物化');
assert.equal(migrated2.roles[0].prompt, '我的自定义研判提示词', '用户自定义提示词应保留进 soc 角色');

// 角色存储分区:roles 写入 local(实测 10KB 超 sync 单项 8KB 配额),不得写 sync
{
  const syncWritten = {};
  const localStore = {};
  globalThis.chrome = {
    storage: {
      sync: {
        async get() { return {}; },
        async set(obj) { Object.assign(syncWritten, obj); },
      },
      local: {
        async get() { return Object.keys(localStore).length ? localStore : {}; },
        async set(obj) { Object.assign(localStore, obj); },
      },
    },
  };
  const s3 = await common.loadSettings();
  assert.ok(Array.isArray(s3.roles) && s3.roles.length === 7, '角色应被物化');
  assert.ok(Buffer.byteLength(JSON.stringify(s3.roles), 'utf8') > 8192, '前提:默认角色确实超 sync 配额');
  assert.ok(localStore.roles && localStore.roles.length === 7, 'roles 应写入 local');
  assert.ok(!('roles' in syncWritten), 'roles 不应写入 sync(会静默失败)');
  // 已存在 local roles 时直接读取
  const s4 = await common.loadSettings();
  assert.equal(s4.roles, localStore.roles, '后续读取应来自 local');
}

// 答题小能手的模式模板覆盖:研判→作答、快判→只给答案;soc 无覆盖走默认研判模板
{
  const quizRole = common.DEFAULT_ROLES.find((r) => r.id === 'quiz');
  const socRole = common.DEFAULT_ROLES.find((r) => r.id === 'soc');
  const inv = common.buildModePrompt('investigate', sel, {}, quizRole);
  assert.ok(inv.includes('作答') && !inv.includes('研判结论'), 'quiz 的「研判」应变为「作答」');
  assert.ok(common.buildModePrompt('quick', sel, {}, quizRole).includes('只输出答案'), 'quiz 快判只给答案');
  assert.ok(common.buildModePrompt('explain', sel, {}, quizRole).includes('解析'), 'quiz 解释为题目解析');
  assert.ok(common.buildModePrompt('respond', sel, {}, quizRole).includes('同类练习题'), 'quiz 处置变刷题');
  assert.ok(common.buildModePrompt('page', sel, {}, quizRole).includes('逐题作答'), 'quiz 页面模式逐题作答');
  const socInv = common.buildModePrompt('investigate', sel, common.DEFAULT_SETTINGS, socRole);
  assert.ok(socInv.includes('研判结论'), 'soc 无覆盖,走默认研判模板');
  // 各角色 page 模板:report 交接报告 / ir 应急评估 / soc 默认逐条研判
  const reportRole = common.DEFAULT_ROLES.find((r) => r.id === 'report');
  assert.ok(common.buildModePrompt('page', sel, {}, reportRole).includes('交接') || common.buildModePrompt('page', sel, {}, reportRole).includes('值班总结'), 'report 的页面模式应为总结报告');
  const irRole = common.DEFAULT_ROLES.find((r) => r.id === 'ir');
  assert.ok(common.buildModePrompt('page', sel, {}, irRole).includes('应急响应'), 'ir 的页面模式应为应急评估');
  assert.ok(common.buildModePrompt('page', sel, {}, socRole).includes('逐条研判'), 'soc 页面模式保持默认研判');
  assert.equal(common.buildModePrompt('ask', sel, {}, quizRole), null, 'ask 模式仍由用户输入');
}

// 老用户(旧版 6 角色)升级 → 自动补入新增内置角色,已有角色不被覆盖
{
  const localStore2 = { roles: common.DEFAULT_ROLES.slice(0, 6).map((r) => Object.assign({}, r)) };
  localStore2.roles[0].prompt = '用户改过的研判提示词';
  globalThis.chrome = {
    storage: {
      sync: { async get() { return {}; }, async set() {} },
      local: { async get() { return localStore2; }, async set(obj) { Object.assign(localStore2, obj); } },
    },
  };
  const s5 = await common.loadSettings();
  assert.equal(s5.roles.length, 7, '应补入第 7 个内置角色');
  assert.ok(s5.roles.some((r) => r.id === 'quiz' && r.name === '答题小能手'), 'quiz 角色应在列');
  assert.equal(s5.roles.find((r) => r.id === 'soc').prompt, '用户改过的研判提示词', '用户已编辑内容不被覆盖');

// quiz 定义升级(_v 机制):旧版本地 quiz(无 _v、无 modePrompts)→ 替换为带模式覆盖的新版;soc 编辑仍保留
{
  const localStore3 = { roles: common.DEFAULT_ROLES.map((r) => Object.assign({}, r, r.id === 'quiz' ? { _v: undefined, modePrompts: undefined } : {})) };
  delete localStore3.roles[6]._v;
  delete localStore3.roles[6].modePrompts;
  localStore3.roles[0].prompt = '用户改过的研判提示词';
  globalThis.chrome = {
    storage: {
      sync: { async get() { return {}; }, async set() {} },
      local: { async get() { return localStore3; }, async set(obj) { Object.assign(localStore3, obj); } },
    },
  };
  const s6 = await common.loadSettings();
  const quiz = s6.roles.find((r) => r.id === 'quiz');
  assert.ok(quiz.modePrompts && quiz.modePrompts.investigate, '旧版 quiz 应升级为带模式模板的新版');
  assert.equal(s6.roles.find((r) => r.id === 'soc').prompt, '用户改过的研判提示词', '其他角色编辑仍保留');
}
}

// 服务商状态记忆与模型缓存键
assert.equal(modelCacheKey('ollama', 'http://localhost:11434/'), 'models::ollama::http://localhost:11434');
assert.equal(modelCacheKey('lmstudio', ''), 'models::lmstudio::http://localhost:1234/v1');

const ps = getProviderState({
  providerState: {
    ollama: { baseUrl: 'http://nas:11434', model: 'qwen2.5:14b' },
  },
}, 'ollama');
assert.equal(ps.baseUrl, 'http://nas:11434');
assert.equal(ps.model, 'qwen2.5:14b');
const psDefault = getProviderState({ providerState: {} }, 'lmstudio');
assert.equal(psDefault.baseUrl, 'http://localhost:1234/v1');
assert.equal(psDefault.model, '');

// 串位记忆自愈:LM Studio 记住了 Ollama 的默认地址 → 回退自己的默认值
const healed = getProviderState({
  providerState: { lmstudio: { baseUrl: 'http://localhost:11434', model: 'x' } },
}, 'lmstudio');
assert.equal(healed.baseUrl, 'http://localhost:1234/v1', '串位记忆应被丢弃');
// 正常自定义地址不受影响
const kept = getProviderState({ providerState: { lmstudio: { baseUrl: 'http://nas:1234/v1' } } }, 'lmstudio');
assert.equal(kept.baseUrl, 'http://nas:1234/v1');

console.log('✓ common.js 纯函数(含研判模式、提示词迁移、服务商状态)通过');

/* ---------- 2. 加载 background.js(chrome 桩) ---------- */
const noop = () => {};
globalThis.importScripts = noop;
globalThis.chrome = {
  runtime: {
    onInstalled: { addListener: noop },
    onMessage: { addListener: noop },
    onConnect: { addListener: noop },
    getPlatformInfo: noop,
  },
  sidePanel: { setPanelBehavior: async () => {}, open: async () => {} },
  contextMenus: { create: noop, onClicked: { addListener: noop } },
  tabs: { get: async () => ({ windowId: 1 }) },
};

// 先把 common.js 的常量/函数注入全局词法环境,再求值 background.js
const commonSource = readFileSync(path.join(root, 'shared', 'common.js'), 'utf8');
(0, eval)(commonSource);
const bgSource = readFileSync(path.join(root, 'background.js'), 'utf8');
(0, eval)(bgSource.replace(/^importScripts\(.+\);$/m, ''));

/* ---------- 3. buildChatRequest ---------- */
let req = buildChatRequest(
  [{ role: 'user', content: 'hi' }],
  { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'qwen2.5:7b', temperature: 0.2 },
  null,
);
assert.equal(req.protocol, 'ollama');
assert.equal(req.url, 'http://localhost:11434/api/chat');
assert.equal(JSON.parse(req.init.body).model, 'qwen2.5:7b');
assert.equal(JSON.parse(req.init.body).stream, true);

req = buildChatRequest(
  [{ role: 'user', content: 'hi' }],
  { provider: 'lmstudio', baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5-7b-instruct', temperature: 0.3, apiKey: '' },
  null,
);
assert.equal(req.protocol, 'openai');
assert.equal(req.url, 'http://localhost:1234/v1/chat/completions');

req = buildChatRequest(
  [{ role: 'user', content: 'hi' }],
  { provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: '', temperature: 0.3 },
  null,
);
assert.equal(req.url, 'http://localhost:11434/api/chat', 'Ollama 误填 /v1 时自动纠正');
console.log('✓ buildChatRequest 双协议 URL 适配通过');

/* ---------- 4. parseStreamLine(含思考型模型 thinking 字段) ---------- */
assert.deepEqual(parseStreamLine('ollama', '{"message":{"role":"assistant","content":"你好"},"done":false}'), { text: '你好', phase: 'content' });
assert.deepEqual(parseStreamLine('ollama', '{"message":{"role":"assistant","content":"","thinking":"推理中"},"done":false}'), { text: '推理中', phase: 'thinking' });
assert.equal(parseStreamLine('ollama', '{"done":true}'), null);
assert.equal(parseStreamLine('ollama', 'not json'), null);
assert.deepEqual(parseStreamLine('openai', '{"choices":[{"delta":{"content":"世"}}]}'), { text: '世', phase: 'content' });
assert.deepEqual(parseStreamLine('openai', '{"choices":[{"delta":{"reasoning_content":"想想"}}]}'), { text: '想想', phase: 'thinking' });
assert.deepEqual(parseStreamLine('openai', '{"choices":[{"delta":{"reasoning":"再想"}}]}'), { text: '再想', phase: 'thinking' });
assert.equal(parseStreamLine('openai', '{"choices":[{"delta":{}}]}'), null);
assert.equal(parseStreamLine('openai', '{"error":{"message":"boom"}}'), null);
console.log('✓ parseStreamLine 双协议解析(含 thinking)通过');

/* ---------- 4b. <think> 标签分流(gemma/R1 类模型正文内嵌思考) ---------- */
{
  const out = [];
  const sp = makeThinkTagSplitter((t, ph) => out.push([t, ph]));
  // 标签跨块切碎: '<thi' 'nk>思考' '内容</th' 'ink>结论' 
  sp.feed('<thi');
  sp.feed('nk>思考');
  sp.feed('内容</th');
  sp.feed('ink>结论部分');
  sp.flush();
  const think = out.filter(([, ph]) => ph === 'thinking').map(([t]) => t).join('');
  const content = out.filter(([, ph]) => ph === 'content').map(([t]) => t).join('');
  assert.equal(think, '思考内容', 'think 块应完整路由到 thinking');
  assert.equal(content, '结论部分', '正文应完整');
}
{
  // 正文开始后出现的字面 <think> 不误伤(如报告里讲解标签)
  const out = [];
  const sp = makeThinkTagSplitter((t, ph) => out.push([t, ph]));
  sp.feed('报告正文提到 <think> 标签的用法,不应被分流');
  sp.flush();
  const content = out.filter(([, ph]) => ph === 'content').map(([t]) => t).join('');
  assert.ok(content.includes('<think> 标签'), '正文中的字面标签应保留');
  assert.ok(!out.some(([, ph]) => ph === 'thinking'), '不应误分流');
}
{
  // 无标签直通
  const out = [];
  const sp = makeThinkTagSplitter((t, ph) => out.push([t, ph]));
  sp.feed('普通');
  sp.feed('正文');
  sp.flush();
  assert.equal(out.map(([t]) => t).join(''), '普通正文');
}
// 禁用思考:双协议都追加系统级抑制指令
{
  const req = buildChatRequest([{ role: 'user', content: 'hi' }], { provider: 'ollama', baseUrl: '', model: 'g', temperature: 0.2, disableThink: true }, null);
  const body = JSON.parse(req.init.body);
  assert.equal(body.think, false, 'think:false 仍应发送');
  assert.equal(body.messages[0].role, 'system');
  assert.ok(body.messages[0].content.includes('不要输出思考'), '应追加抑制指令');
  const req2 = buildChatRequest([{ role: 'user', content: 'hi' }], { provider: 'lmstudio', baseUrl: 'http://localhost:1234/v1', model: 'g', temperature: 0.2, apiKey: '', disableThink: true }, null);
  const body2 = JSON.parse(req2.init.body);
  assert.ok(body2.messages[0].content.includes('不要输出思考'), 'OpenAI 兼容协议也应追加抑制指令');
}
console.log('✓ <think> 标签分流与禁用思考抑制指令通过');

/* ---------- 5. 端到端:模拟 SSE 流 → handleChatPort ---------- */
function sseResponse(lines) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

async function runChatFlow(protocol, wireChunks, settings) {
  const realFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    if (protocol === 'openai') {
      return sseResponse([
        ...wireChunks.map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`),
        'data: [DONE]\n\n',
      ]);
    }
    return sseResponse([
      ...wireChunks.map((t, i) => `${JSON.stringify({ message: { role: 'assistant', content: t }, done: i === wireChunks.length - 1 })}\n`),
    ]);
  };

  const received = [];
  const port = {
    name: 'eff-ai-chat',
    onDisconnect: { addListener: noop },
    onMessage: {
      addListener: (fn) => { port._handler = fn; },
    },
    postMessage: (m) => received.push(m),
  };
  handleChatPort(port);
  await port._handler({ type: 'chat', messages: [{ role: 'user', content: 'hi' }], settings });
  globalThis.fetch = realFetch;
  return { received, captured };
}

// OpenAI 兼容(LM Studio)
{
  const { received, captured } = await runChatFlow('openai', ['你好', ',', '我是', '本地模型'], {
    provider: 'lmstudio', baseUrl: 'http://localhost:1234/v1', model: 'qwen', temperature: 0.3, apiKey: '',
  });
  assert.equal(captured.url, 'http://localhost:1234/v1/chat/completions');
  const text = received.filter((m) => m.type === 'chunk').map((m) => m.text).join('');
  assert.equal(text, '你好,我是本地模型');
  assert.ok(received.some((m) => m.type === 'done'));
}
console.log('✓ 端到端 OpenAI 兼容流式对话通过');

// Ollama
{
  const { received, captured } = await runChatFlow('ollama', ['嗯', ', ', '好的'], {
    provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3', temperature: 0.3,
  });
  assert.equal(captured.url, 'http://localhost:11434/api/chat');
  const text = received.filter((m) => m.type === 'chunk').map((m) => m.text).join('');
  assert.equal(text, '嗯, 好的');
  assert.ok(received.some((m) => m.type === 'done'));
}
console.log('✓ 端到端 Ollama 流式对话通过');

// HTTP 错误 → 用户可读提示
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('forbidden', { status: 403 });
  const received = [];
  const port = {
    name: 'eff-ai-chat',
    onDisconnect: { addListener: noop },
    onMessage: { addListener: (fn) => { port._handler = fn; } },
    postMessage: (m) => received.push(m),
  };
  handleChatPort(port);
  await port._handler({ type: 'chat', messages: [], settings: { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'x', temperature: 0.3 } });
  globalThis.fetch = realFetch;
  const err = received.find((m) => m.type === 'error');
  assert.ok(err && err.message.includes('OLLAMA_ORIGINS'), '403 时应提示 OLLAMA_ORIGINS 解决方案');
}
console.log('✓ 错误诊断提示(403 → OLLAMA_ORIGINS)通过');

/* ---------- 6. 页面提取三条路径 ---------- */
async function testExtract(tabsImpl, scriptingImpl) {
  globalThis.chrome = Object.assign({}, globalThis.chrome, tabsImpl, scriptingImpl || {});
  return extractActivePage();
}
// 路径1:content script 响应
let r1 = await testExtract({
  tabs: { query: async () => ([{ id: 7, url: 'https://soc.example/alerts' }]), sendMessage: async () => ({ ok: true, text: '告警A SQL注入', title: 'T', url: 'u' }) },
});
assert.equal(r1.text, '告警A SQL注入');
// 路径2:sendMessage 失败 → executeScript 兜底
let r2 = await testExtract({
  tabs: { query: async () => ([{ id: 8, url: 'https://soc.example/list' }]), sendMessage: async () => { throw new Error('Could not establish connection'); } },
}, {
  scripting: { executeScript: async () => ([{ result: { text: '注入提取的页面文本', title: 'L', url: 'l' } }]) },
});
assert.equal(r2.text, '注入提取的页面文本');
assert.equal(r2.ok, true);
// 路径3:内置页面 → 明确报错
let err3 = null;
try { await testExtract({ tabs: { query: async () => ([{ id: 9, url: 'chrome://extensions' }]), sendMessage: async () => { throw new Error('x'); } } }); }
catch (e) { err3 = e; }
assert.ok(err3 && /内置页面/.test(err3.message), '内置页面应给出明确提示');
console.log('✓ 页面提取三路径(content script / 注入兜底 / 内置页面报错)通过');

console.log('\n全部测试通过 ✅');
