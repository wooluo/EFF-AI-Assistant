/**
 * EFF AI 助手 - 设置页逻辑
 * 模型配置:可输入可选(datalist)、每个服务商独立记忆地址与模型、切换时自动恢复并拉取。
 */

const $ = (id) => document.getElementById(id);

const els = {
  provider: $('provider'),
  baseUrl: $('baseUrl'),
  apiKeyField: $('apiKeyField'),
  apiKeyLabel: $('apiKeyLabel'),
  apiKey: $('apiKey'),
  model: $('model'),
  modelHint: $('modelHint'),
  btnFetchModels: $('btnFetchModels'),
  btnTest: $('btnTest'),
  testResult: $('testResult'),
  temperature: $('temperature'),
  tempVal: $('tempVal'),
  disableThink: $('disableThink'),
  roleList: $('roleList'),
  btnAddRole: $('btnAddRole'),
  btnResetRoles: $('btnResetRoles'),
  enableFloatingBar: $('enableFloatingBar'),
  maxSelectionChars: $('maxSelectionChars'),
  btnSave: $('btnSave'),
  saveStatus: $('saveStatus'),
  providerHint: $('providerHint'),
  cloudWarn: $('cloudWarn'),
};

/** 模型组合框:聚焦显示全部候选项,键入时才过滤(规避 datalist 按现有文本过滤的问题) */
const modelCombo = createModelCombo(els.model, $('modelMenu'), {});

/** 内存中的服务商记忆(切换前写入,保存时落盘) */
let providerState = {};
let savedSettings = Object.assign({}, DEFAULT_SETTINGS);

function setModelOptions(models, selected) {
  modelCombo.setItems(models);
  if (selected != null) els.model.value = selected;
}

function currentForm() {
  return {
    provider: els.provider.value,
    baseUrl: els.baseUrl.value.trim() || PROVIDERS[els.provider.value].defaultBaseUrl,
    apiKey: els.apiKey.value.trim(),
    model: els.model.value.trim(),
    temperature: parseFloat(els.temperature.value),
    disableThink: els.disableThink.checked,
    enableFloatingBar: els.enableFloatingBar.checked,
    maxSelectionChars: Math.max(500, Math.min(60000, parseInt(els.maxSelectionChars.value, 10) || 8000)),
    providerState,
  };
}

/** 追踪离开前的服务商:change 事件触发时下拉框值已变为新服务商,不能用它做记忆键 */
let previousProviderId = null;

/** 把表单中属于指定服务商的字段记入 providerState */
function rememberCurrentProvider(providerId) {
  const id = providerId || els.provider.value;
  if (!id || !PROVIDERS[id]) return;
  providerState[id] = {
    baseUrl: els.baseUrl.value.trim() || PROVIDERS[id].defaultBaseUrl,
    model: els.model.value.trim(),
    apiKey: els.apiKey.value.trim(),
  };
}

function updateProviderUi() {
  const meta = PROVIDERS[els.provider.value];
  els.providerHint.textContent = meta.hint;
  els.baseUrl.placeholder = meta.defaultBaseUrl;
  const local = els.provider.value === 'ollama';
  els.apiKeyField.hidden = local;
  els.apiKeyLabel.textContent = meta.cloud ? 'API Key(云端服务必填)' : 'API Key(本地服务可留空)';
  els.apiKey.placeholder = meta.cloud ? '填写服务商 API Key' : 'sk-…';
  els.cloudWarn.hidden = !meta.cloud;
}

function applySettings(s) {
  savedSettings = s;
  providerState = Object.assign({}, s.providerState || {});
  els.provider.value = s.provider;
  previousProviderId = s.provider;
  els.baseUrl.value = s.baseUrl;
  els.apiKey.value = s.apiKey || '';
  els.temperature.value = s.temperature;
  els.tempVal.textContent = s.temperature.toFixed(2);
  els.disableThink.checked = s.disableThink === true;
  els.enableFloatingBar.checked = s.enableFloatingBar !== false;
  els.maxSelectionChars.value = s.maxSelectionChars;
  setModelOptions([{ id: s.model || '' }], s.model || '');
  updateProviderUi();
}

els.provider.addEventListener('change', async () => {
  rememberCurrentProvider(previousProviderId);     // 记住刚离开的服务商配置(用旧 id)
  previousProviderId = els.provider.value;
  const next = getProviderState({ providerState }, els.provider.value);
  els.baseUrl.value = next.baseUrl;
  els.apiKey.value = next.apiKey;
  els.model.value = next.model;
  setModelOptions([{ id: next.model || '' }], next.model || '');
  updateProviderUi();
  // 已有模型 → 先用缓存填充下拉;无论如何都尝试拉一次最新列表
  const cached = await readModelCache(els.provider.value, next.baseUrl);
  if (cached.length) setModelOptions(cached, els.model.value || cached[0].id);
  fetchModels(false);
});

els.temperature.addEventListener('input', () => {
  els.tempVal.textContent = parseFloat(els.temperature.value).toFixed(2);
});

async function fetchModels(showToast) {
  const form = currentForm();
  els.btnFetchModels.disabled = true;
  els.btnFetchModels.textContent = '获取中…';
  const resp = await chrome.runtime.sendMessage({
    type: 'FETCH_MODELS',
    settingsOverride: {
      provider: form.provider,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
    },
  }).catch(() => null);
  els.btnFetchModels.disabled = false;
  els.btnFetchModels.textContent = '刷新模型';

  if (resp && resp.ok && resp.models.length) {
    setModelOptions(resp.models, form.model && resp.models.some((m) => m.id === form.model) ? form.model : resp.models[0].id);
    els.modelHint.textContent = `发现 ${resp.models.length} 个模型,来自 ${resp.models[0].owned_by}。${resp.note || ''}`;
    writeModelCache(form.provider, form.baseUrl, resp.models);
    if (showToast) setTestResult(true, `✓ 连接成功,发现 ${resp.models.length} 个模型`);
    return true;
  }
  const err = (resp && resp.error) || '未发现模型,请先安装(ollama pull …)或加载模型;也可直接手动输入模型名。';
  els.modelHint.textContent = err;
  if (showToast) setTestResult(false, err);
  return false;
}

els.btnFetchModels.addEventListener('click', () => fetchModels(false));
els.btnTest.addEventListener('click', () => fetchModels(true));

function setTestResult(ok, text) {
  els.testResult.className = `test-result ${ok ? 'ok' : 'err'}`;
  els.testResult.textContent = text;
}

els.btnSave.addEventListener('click', async () => {
  rememberCurrentProvider(els.provider.value);
  const form = currentForm();
  const meta = PROVIDERS[form.provider] || {};
  if (meta.cloud && !form.apiKey) {
    setTestResult(false, '云端服务商需要填写 API Key(智谱:bigmodel.cn → 右上角「API Keys」创建)。');
    els.saveStatus.className = 'test-result err';
    els.saveStatus.textContent = '未保存:缺少 API Key';
    return;
  }
  if (!form.model) {
    setTestResult(false, '请先选择或填写模型名称(也可点「刷新模型」自动拉取)。');
    els.saveStatus.className = 'test-result err';
    els.saveStatus.textContent = '未保存:缺少模型';
    return;
  }
  await chrome.storage.sync.set(form);
  savedSettings = await loadSettings();
  els.saveStatus.className = 'test-result ok';
  els.saveStatus.textContent = '已保存 ✓';
  setTimeout(() => { els.saveStatus.textContent = ''; }, 2000);
});

/* ================= 角色管理 ================= */

let rolesCache = [];
let activeRoleIdCache = 'soc';
let expandedRoleId = null;

function resolveRolePrompt(role) {
  return role.prompt || (role.id === 'soc' ? DEFAULT_SETTINGS.systemPrompt : '') || DEFAULT_SETTINGS.systemPrompt;
}

/** 角色写入 chrome.storage.local(sync 单项 8KB 配额装不下提示词);失败时显式提示 */
async function saveRolesToStorage() {
  await new Promise((resolve) => {
    chrome.storage.local.set({ roles: rolesCache }, () => {
      if (chrome.runtime.lastError) {
        setTestResult(false, `角色保存失败:${chrome.runtime.lastError.message}`);
      }
      resolve();
    });
  });
}

function renderRoles() {
  els.roleList.innerHTML = '';

  // 新建角色编辑行(不用原生 prompt:扩展选项页嵌入 iframe 时模态框被禁止)
  if (expandedRoleId === '__new__') {
    const row = document.createElement('div');
    row.className = 'role-row';
    const editor = document.createElement('div');
    editor.className = 'role-editor';
    const nameLabel = document.createElement('p');
    nameLabel.className = 'hint';
    nameLabel.textContent = '新角色:填写名称与提示词后保存。';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = '角色名称(必填)';
    nameInput.style.cssText = 'width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);font-size:13px;outline:none;margin-bottom:8px;font-family:inherit;';
    const ta = document.createElement('textarea');
    ta.spellcheck = false;
    ta.placeholder = '定义该角色的职责、输出结构与纪律…';
    ta.value = '你是……(在此定义该角色的职责、输出结构与纪律)\n\n输出要求:使用中文,Markdown 排版,结论先行;信息不足时明确说明,严禁编造。';
    const actions = document.createElement('div');
    actions.className = 'row';
    const createBtn = document.createElement('button');
    createBtn.className = 'btn primary';
    createBtn.textContent = '保存新角色';
    createBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.style.borderColor = 'var(--err)'; nameInput.focus(); return; }
      const role = { id: `custom_${Date.now()}`, icon: '👤', name, desc: '自定义角色', prompt: ta.value.trim() };
      rolesCache.push(role);
      expandedRoleId = role.id;
      await saveRolesToStorage();
      setTestResult(true, `已创建角色「${name}」✓`);
      renderRoles();
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn secondary';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => { expandedRoleId = null; renderRoles(); });
    actions.appendChild(createBtn);
    actions.appendChild(cancelBtn);
    editor.appendChild(nameLabel);
    editor.appendChild(nameInput);
    editor.appendChild(ta);
    editor.appendChild(actions);
    row.appendChild(editor);
    els.roleList.appendChild(row);
    return;
  }

  rolesCache.forEach((role) => {
    const row = document.createElement('div');
    row.className = 'role-row';

    const head = document.createElement('div');
    head.className = 'role-row-head';
    head.innerHTML =
      `<span class="role-row-icon">${role.icon || '👤'}</span>` +
      `<span class="role-row-name">${role.name}</span>` +
      `<span class="role-row-desc">${role.desc || ''}</span>` +
      (role.id === activeRoleIdCache ? '<span class="role-active-tag">当前</span>' : '');
    head.addEventListener('click', () => {
      expandedRoleId = expandedRoleId === role.id ? null : role.id;
      renderRoles();
    });
    row.appendChild(head);

    if (expandedRoleId === role.id) {
      const editor = document.createElement('div');
      editor.className = 'role-editor';
      const ta = document.createElement('textarea');
      ta.spellcheck = false;
      ta.value = resolveRolePrompt(role);
      const actions = document.createElement('div');
      actions.className = 'row';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn primary';
      saveBtn.textContent = '保存提示词';
      saveBtn.addEventListener('click', async () => {
        role.prompt = ta.value.trim() || resolveRolePrompt(role);
        await saveRolesToStorage();
        setTestResult(true, `已保存「${role.name}」提示词 ✓`);
        renderRoles();
      });
      const useBtn = document.createElement('button');
      useBtn.className = 'btn secondary';
      useBtn.textContent = '设为当前角色';
      useBtn.addEventListener('click', async () => {
        activeRoleIdCache = role.id;
        await saveRolesToStorage();
        await chrome.storage.sync.set({ activeRoleId: role.id }).catch(() => {});
        renderRoles();
      });
      const delBtn = document.createElement('button');
      delBtn.className = 'btn secondary';
      delBtn.style.color = 'var(--err)';
      delBtn.textContent = '删除角色';
      let delArmed = false;
      delBtn.addEventListener('click', async () => {
        if (!delArmed) {
          // 扩展选项页(尤其嵌入 iframe 时)禁止原生 confirm 模态框,改用两段式点击确认
          delArmed = true;
          delBtn.textContent = '再点一次确认删除';
          setTimeout(() => { if (document.contains(delBtn)) { delArmed = false; delBtn.textContent = '删除角色'; } }, 3000);
          return;
        }
        rolesCache = rolesCache.filter((r) => r.id !== role.id);
        if (activeRoleIdCache === role.id) activeRoleIdCache = rolesCache[0] ? rolesCache[0].id : 'soc';
        await saveRolesToStorage();
        await chrome.storage.sync.set({ activeRoleId: activeRoleIdCache }).catch(() => {});
        renderRoles();
      });
      actions.appendChild(saveBtn);
      actions.appendChild(useBtn);
      actions.appendChild(delBtn);
      editor.appendChild(ta);
      editor.appendChild(actions);
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = '提示词定义该角色的职责、输出结构与纪律。修改后点保存;侧边栏顶栏可随时切换。';
      editor.appendChild(note);
      row.appendChild(editor);
    }
    els.roleList.appendChild(row);
  });
}

els.btnAddRole.addEventListener('click', () => {
  expandedRoleId = '__new__';
  renderRoles();
  const first = els.roleList.querySelector('.role-editor input');
  if (first && first.focus) first.focus();
});

let resetArmed = false;
els.btnResetRoles.addEventListener('click', async () => {
  if (!resetArmed) {
    resetArmed = true;
    els.btnResetRoles.textContent = '再点一次确认恢复(自定义与修改将丢失)';
    setTimeout(() => { resetArmed = false; els.btnResetRoles.textContent = '恢复默认角色'; }, 3000);
    return;
  }
  resetArmed = false;
  els.btnResetRoles.textContent = '恢复默认角色';
  rolesCache = JSON.parse(JSON.stringify(DEFAULT_ROLES));
  activeRoleIdCache = 'soc';
  await saveRolesToStorage();
  await chrome.storage.sync.set({ activeRoleId: 'soc' }).catch(() => {});
  renderRoles();
});

(async function init() {
  const s = await loadSettings();
  applySettings(s);
  rolesCache = Array.isArray(s.roles) && s.roles.length ? s.roles : JSON.parse(JSON.stringify(DEFAULT_ROLES));
  activeRoleIdCache = s.activeRoleId || 'soc';
  renderRoles();
  // 打开设置页时静默刷新当前服务的模型列表(先用缓存填充)
  const cached = await readModelCache(s.provider, s.baseUrl);
  if (cached.length) setModelOptions(cached, s.model || cached[0].id);
  fetchModels(false);
})();
