/**
 * EFF AI 助手 - 弹窗逻辑:连接状态检测 + 快捷入口
 */

const $ = (id) => document.getElementById(id);

async function init() {
  const s = await loadSettings();
  const meta = PROVIDERS[s.provider];
  $('providerLabel').textContent = meta ? meta.label : s.provider;
  $('modelLabel').textContent = s.model || '未选择模型';
  $('modelLabel').title = s.model || '';
  $('tip').textContent = s.enableFloatingBar !== false
    ? (meta && meta.cloud ? '划选告警内容即可一键研判 · 云端模型驱动' : '划选告警内容即可一键研判 · 本地模型驱动')
    : '浮动按钮已关闭,可用右键菜单研判';

  const dot = $('statusDot');
  const resp = await chrome.runtime.sendMessage({ type: 'FETCH_MODELS' }).catch(() => null);
  if (resp && resp.ok) {
    dot.classList.add('ok');
    dot.title = `服务正常,发现 ${resp.models.length} 个模型`;
  } else {
    dot.classList.add('err');
    dot.title = (resp && resp.error) || '无法连接模型服务,请检查设置';
  }
}

$('btnPanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    if (tab && tab.windowId != null) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
    window.close();
  } catch {
    $('tip').textContent = '打开失败:请确认浏览器支持侧边栏(Chrome 116+)';
  }
});

$('btnOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

init();
