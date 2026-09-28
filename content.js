/**
 * EFF AI 助手 - Content Script
 * 划词后浮出工具条(提问 / 解释 / 翻译 / 总结),点击后携带所选内容唤起侧边栏。
 */

(() => {
  if (window.__EFF_AI_ASSISTANT_LOADED__) return;
  window.__EFF_AI_ASSISTANT_LOADED__ = true;

  const BAR_ID = 'effai-floating-bar';
  let bar = null;
  let hideTimer = null;
  let latestSelection = null;
  let enabled = true;

  loadSettings().then((s) => { enabled = s.enableFloatingBar !== false; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.enableFloatingBar) {
      enabled = changes.enableFloatingBar.newValue !== false;
      if (!enabled) hideBar();
    }
  });

  function inOwnUI(node) {
    return !!(node && node.nodeType === 1 && (node.id === BAR_ID || node.closest(`#${BAR_ID}`)));
  }

  function isEditable(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = node.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
  }

  function getSelectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return { text, rect };
  }

  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = BAR_ID;
    Object.values(MODES).forEach((mode) => {
      const btn = document.createElement('button');
      btn.className = 'effai-btn';
      btn.dataset.mode = mode.id;
      btn.type = 'button';
      btn.innerHTML = `<span class="effai-btn-icon">${mode.icon}</span><span class="effai-btn-label">${mode.label}</span>`;
      btn.addEventListener('mousedown', (e) => e.preventDefault()); // 防止点击时清除选区
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerMode(mode.id);
      });
      bar.appendChild(btn);
    });
    document.documentElement.appendChild(bar);
    return bar;
  }

  function positionBar(rect) {
    const b = ensureBar();
    b.classList.add('effai-visible');
    const bw = b.offsetWidth || 280;
    const bh = b.offsetHeight || 40;
    // 优先出现在选区右下角,越界则翻转
    let x = rect.left + rect.width + 8;
    let y = rect.top + rect.height + 6;
    if (x + bw > window.innerWidth - 8) x = Math.max(8, rect.left - bw - 8);
    if (y + bh > window.innerHeight - 8) y = Math.max(8, rect.top - bh - 6);
    b.style.left = `${Math.round(x + window.scrollX)}px`;
    b.style.top = `${Math.round(y + window.scrollY)}px`;
  }

  function showBar() {
    const info = getSelectionInfo();
    if (!info || !enabled) { hideBar(); return; }
    latestSelection = {
      text: info.text,
      title: document.title || '',
      url: location.href || '',
    };
    positionBar(info.rect);
    scheduleHide(6000);
  }

  function hideBar() {
    if (bar) bar.classList.remove('effai-visible');
    cancelHide();
  }

  function scheduleHide(ms) {
    cancelHide();
    hideTimer = setTimeout(hideBar, ms);
  }
  function cancelHide() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  function triggerMode(mode) {
    hideBar();
    if (!latestSelection) return;
    const payload = { mode, selection: latestSelection, ts: Date.now() };
    chrome.storage.session
      .set({ pendingAsk: payload })
      .then(() => chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' }))
      .catch(() => {});
  }

  let debounceTimer = null;
  function debouncedShow() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(showBar, 180);
  }

  document.addEventListener('mouseup', (e) => {
    if (inOwnUI(e.target)) return;
    if (isEditable(e.target)) { hideBar(); return; }
    debouncedShow();
  }, true);

  /* ---------- 页面正文提取(侧边栏「分析本页」按钮) ---------- */

  function extractPageText() {
    const main = document.querySelector('main, [role="main"], article, #content, .content');
    const root = (main && main.innerText && main.innerText.trim().length > 200) ? main : document.body;
    const text = (root.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    return { text: text || '', title: document.title || '', url: location.href || '' };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'EXTRACT_PAGE_TEXT') {
      try {
        sendResponse(Object.assign({ ok: true }, extractPageText()));
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
      return true;
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') debouncedShow();
    if (e.key === 'Escape') hideBar();
  }, true);

  document.addEventListener('mousedown', (e) => {
    if (!inOwnUI(e.target)) hideBar();
  }, true);

  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    if (!bar || !bar.classList.contains('effai-visible')) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(hideBar, 60);
  }, { passive: true, capture: true });

  window.addEventListener('resize', hideBar);
  document.addEventListener('visibilitychange', hideBar);
})();
