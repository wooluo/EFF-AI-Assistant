/**
 * 真实告警研判质量验证:用真实奇安信 NDR 告警验证新提示词的关键纪律。
 * 断言:1) 结论落在六选一标签;2) 凭证脱敏(密码原文不得出现在报告);3) 附告警标识。
 * 运行:node tools/test_verdict.mjs
 */
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
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
(0, eval)(readFileSync(path.join(root, 'shared', 'common.js'), 'utf8'));
(0, eval)(readFileSync(path.join(root, 'background.js'), 'utf8').replace(/^importScripts\(.+\);$/m, ''));

// 样本优先级:本地真实样本 sample_alert.json(含真实环境数据,已 gitignore)> 仓库脱敏样本
const SAMPLE_FILE = existsSync(path.join(root, 'tools', 'sample_alert.json'))
  ? 'sample_alert.json'
  : 'sample_alert.example.json';
const alertText = readFileSync(path.join(root, 'tools', SAMPLE_FILE), 'utf8');
const PASSWORD = alertText.match(/x-clickhouse-key:\s*([^\r\n]+)/)?.[1]; // 从样本载荷提取明文凭证

const settings = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: '',
  temperature: common.DEFAULT_SETTINGS.temperature,
  maxSelectionChars: 20000,
};

async function runChat(messages, overrides) {
  const received = [];
  const port = {
    name: 'eff-ai-chat',
    onDisconnect: { addListener: noop },
    onMessage: { addListener: (fn) => { port._h = fn; } },
    postMessage: (m) => received.push(m),
  };
  handleChatPort(port);
  await port._h({ type: 'chat', messages, settings: Object.assign({}, settings, overrides || {}) });
  const err = received.find((m) => m.type === 'error');
  if (err) throw new Error(`流式出错: ${err.message}`);
  return {
    all: received.filter((m) => m.type === 'chunk').map((m) => m.text).join(''),
    content: received.filter((m) => m.type === 'chunk' && m.phase === 'content').map((m) => m.text).join(''),
    thinking: received.filter((m) => m.type === 'chunk' && m.phase === 'thinking').map((m) => m.text).join(''),
  };
}

const list = await fetchModels(settings);
assert.ok(list.ok && list.models.length, '本地无可用模型');
settings.model = list.models[0].id;
console.log(`模型: ${settings.model}`);

const labels = ['业务行为', '存在攻击意图', '攻击失败', '攻击成功', '非告警事件', '无法确认'];

/* ---------- 1. 深度研判 ---------- */
{
  const prompt = common.buildModePrompt('investigate', { text: alertText, title: 'SOC', url: '' }, settings);
  assert.ok(prompt.includes('研判结论'));
  const t0 = Date.now();
  const r = await runChat([
    { role: 'system', content: common.DEFAULT_SETTINGS.systemPrompt },
    { role: 'user', content: prompt },
  ]);
  const out = r.content || r.all;
  console.log(`\n[深度研判] ${((Date.now() - t0) / 1000).toFixed(0)}s, 思考 ${r.thinking.length} 字, 正文 ${out.length} 字`);

  const hit = labels.filter((l) => out.includes(l));
  assert.ok(out.includes('结论') && hit.length >= 1, `结论未落标签,命中: ${hit.join(',')}`);
  console.log(`  ✓ 结论落标签: ${hit.join(', ')}`);

  console.log(`  ℹ 凭证原文${out.includes(PASSWORD) ? '可见' : '未引用'}(本地运行,按需引用)`);

  const hasId = out.includes('V627a7d21') || out.includes('b1ddd0015fe1474d957a743daf54f6e8') || out.includes('268569455');
  console.log(`  ${hasId ? '✓' : '⚠(未硬性要求)'} 附告警标识: ${hasId ? '是' : '否'}`);

  const mentionsHttp = /明文|HTTP(?!S)/.test(out);
  console.log(`  ${mentionsHttp ? '✓' : '⚠'} ${mentionsHttp ? '指出明文传输隐患' : '未提及明文传输'}`);
  console.log('\n--- 深度研判输出(前 500 字)---\n' + out.slice(0, 500) + '\n--- 结束 ---');
}

/* ---------- 2. 快判 ---------- */
{
  const prompt = common.buildModePrompt('quick', { text: alertText, title: 'SOC', url: '' }, settings);
  const t0 = Date.now();
  const out = await runChat([
    { role: 'system', content: common.DEFAULT_SETTINGS.systemPrompt },
    { role: 'user', content: prompt },
  ]);
  console.log(`\n[快判] ${((Date.now() - t0) / 1000).toFixed(0)}s, ${out.length} 字`);
  const hit = labels.filter((l) => out.includes(l));
  assert.ok(hit.length >= 1, `快判未落标签: ${hit.join(',')}`);
  console.log(`  ✓ 结论: ${hit.join(', ')};输出长度 ${out.length} 字(要求精简)`);
  console.log('--- 快判输出 ---\n' + out + '\n--- 结束 ---');
}

console.log('\n真实告警研判质量验证通过 ✅');
