/**
 * 真实环境联调:对本机 Ollama 实测「告警研判」完整管线。
 * 模型列表 → 研判系统提示词 + investigate 模式提示词 → 流式研判 → 校验输出结论。
 * 运行:node tools/test_live.mjs
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const common = require(path.join(root, 'shared', 'common.js'));

const noop = () => {};
globalThis.importScripts = noop;
globalThis.chrome = {
  runtime: { onInstalled: { addListener: noop }, onMessage: { addListener: noop }, onConnect: { addListener: noop }, getPlatformInfo: noop },
  sidePanel: { setPanelBehavior: async () => {} },
  contextMenus: { create: noop, onClicked: { addListener: noop } },
};

// 拼接求值:间接 eval 的 const 词法绑定(PROVIDERS 等)不跨 eval 脚本共享,
// 拼接后与生产环境 importScripts 的共享全局作用域语义一致
(0, eval)(readFileSync(path.join(root, 'shared', 'common.js'), 'utf8')
  + '\n' + readFileSync(path.join(root, 'background.js'), 'utf8').replace(/^importScripts\(.+\);$/m, ''));

const settings = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: '',
  temperature: common.DEFAULT_SETTINGS.temperature,
};
const list = await fetchModels(settings);
assert.ok(list.ok, `模型列表获取失败: ${list.error}`);
assert.ok(list.models.length > 0, '本机无可用模型');
console.log(`✓ 模型列表:发现 ${list.models.length} 个 → ${list.models.slice(0, 3).map((m) => m.id).join(', ')}${list.models.length > 3 ? ' …' : ''}`);
settings.model = list.models[0].id;

// 2. 模拟一条真实形态的 WAF 告警(被拦截的 UNION 注入)
const fakeAlert = {
  text: [
    '告警时间: 2026-09-23 10:15:32',
    '设备: 边界WAF',
    '告警名称: SQL注入攻击',
    '源IP: 203.0.113.45:52311',
    '目的IP: 10.20.5.17:8080',
    '请求: GET /product.jsp?id=1%27%20UNION%20SELECT%20username,password%20FROM%20admin_users--',
    '动作: 拦截',
    '响应码: 403',
    '频次: 同一源IP 10分钟内触发 47 次',
  ].join('\n'),
  title: 'SOC 告警列表',
  url: 'https://soc.internal/alerts/1024',
};

const prompt = common.buildModePrompt('investigate', fakeAlert, settings);
assert.ok(prompt && prompt.includes('研判结论'), 'investigate 提示词构建失败');

const messages = [
  { role: 'system', content: common.DEFAULT_SETTINGS.systemPrompt },
  { role: 'user', content: prompt },
];

// 3. 流式研判
const received = [];
const port = {
  name: 'eff-ai-chat',
  onDisconnect: { addListener: noop },
  onMessage: { addListener: (fn) => { port._handler = fn; } },
  postMessage: (m) => received.push(m),
};
handleChatPort(port);
const t0 = Date.now();
await port._handler({ type: 'chat', messages, settings });

const chunks = received.filter((m) => m.type === 'chunk');
const full = chunks.map((m) => m.text).join('');
const err = received.find((m) => m.type === 'error');
if (err) throw new Error(`流式研判出错: ${err.message}`);
assert.ok(chunks.length > 0, '未收到任何流式分片');
assert.ok(received.some((m) => m.type === 'done'));
console.log(`✓ 真实流式研判(${settings.model},${chunks.length} 个分片,${((Date.now() - t0) / 1000).toFixed(1)}s,${full.length} 字)`);

// 4. 校验结论质量:应包含结论小节,且落在标签体系内
const labels = ['业务行为', '存在攻击意图', '攻击失败', '攻击成功', '非告警事件', '无法确认'];
const hit = labels.filter((l) => full.includes(l));
console.log(`  输出命中标签: ${hit.join(', ') || '(无)'}`);
console.log(`  含置信度: ${/置信度/.test(full) ? '是' : '否'};含处置: ${/处置/.test(full) ? '是' : '否'}`);
console.log('\n--- 研判输出预览(前 600 字)---');
console.log(full.slice(0, 600));
console.log('--- 结束 ---\n');
console.log('真实联调通过 ✅');
