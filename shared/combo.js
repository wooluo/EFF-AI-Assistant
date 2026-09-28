/**
 * 通用模型选择组合框(input + 自绘下拉)。
 *
 * 为什么不用原生 <datalist>:datalist 会按输入框已有文本过滤候选项——
 * 当输入框预填了当前模型名时,点开下拉只剩 1 个匹配项,看不到全部模型。
 * 自绘下拉:聚焦/点击时展示全量列表;用户主动键入时才做子串过滤。
 *
 * 依赖:无(仅 DOM);由 options.html / sidepanel.html 加载。
 * 若需在 Node 中加载本文件,所有逻辑都包在工厂函数内,不触碰全局。
 */

function createModelCombo(inputEl, menuEl, opts) {
  opts = opts || {};
  let items = [];
  let filterActive = false;
  let highlighted = -1;

  function visibleList() {
    if (!filterActive) return items;
    const f = inputEl.value.trim().toLowerCase();
    if (!f) return items;
    return items.filter((m) => String(m.id).toLowerCase().includes(f));
  }

  function rows() {
    return Array.from(menuEl.querySelectorAll('.combo-item'));
  }

  function updateHighlight() {
    rows().forEach((el, i) => el.classList.toggle('combo-hl', i === highlighted));
  }

  function close() {
    menuEl.hidden = true;
    highlighted = -1;
  }

  function select(id) {
    inputEl.value = id;
    filterActive = false;
    close();
    if (opts.onSelect) opts.onSelect(id);
  }

  function render() {
    const list = visibleList();
    menuEl.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'combo-empty';
      empty.textContent = items.length
        ? '没有匹配的模型;也可直接回车/保存使用输入的名称'
        : '暂无模型列表;可直接输入模型名,或点「刷新模型」拉取';
      menuEl.appendChild(empty);
    }
    list.forEach((m, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'combo-item' + (m.id === inputEl.value ? ' combo-active' : '');
      const name = document.createElement('span');
      name.className = 'combo-name';
      name.textContent = m.id;
      const owner = document.createElement('span');
      owner.className = 'combo-owner';
      owner.textContent = m.owned_by || '';
      row.appendChild(name);
      row.appendChild(owner);
      row.addEventListener('mousedown', (e) => e.preventDefault()); // 不让输入框失焦
      row.addEventListener('mouseenter', () => { highlighted = i; updateHighlight(); });
      row.addEventListener('click', () => select(m.id));
      menuEl.appendChild(row);
    });
    menuEl.hidden = false;
  }

  inputEl.addEventListener('focus', () => { filterActive = false; render(); });
  inputEl.addEventListener('click', () => { if (menuEl.hidden) { filterActive = false; render(); } });
  inputEl.addEventListener('input', () => { filterActive = true; highlighted = 0; render(); });
  inputEl.addEventListener('blur', () => setTimeout(close, 150));

  inputEl.addEventListener('keydown', (e) => {
    const list = visibleList();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (menuEl.hidden || !list.length) { filterActive = false; render(); return; }
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      highlighted = (highlighted + dir + list.length) % list.length;
      updateHighlight();
      const el = rows()[highlighted];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Enter' && !menuEl.hidden && highlighted >= 0 && list[highlighted]) {
      // 命中高亮项时接管 Enter;菜单关闭时不拦截,交给页面自身的「应用输入值」逻辑
      e.preventDefault();
      e.stopPropagation();
      select(list[highlighted].id);
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target !== inputEl && !menuEl.contains(e.target)) close();
  });

  return {
    setItems(list) {
      items = (Array.isArray(list) ? list : []).filter((m) => m && m.id);
      if (menuEl.hidden === false) render();
    },
    getItems() { return items.slice(); },
  };
}
