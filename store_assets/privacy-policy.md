# AlertTriage 告警研判助手 — 隐私政策 / Privacy Policy

**最后更新 / Last updated: 2026-09-30**

## 中文

### 我们收集哪些数据

**不收集。** 本扩展没有任何账号体系、遥测、统计 SDK、错误上报或第三方追踪代码,开发者的服务器不参与任何数据传输。

### 数据如何处理

1. **划选内容**:仅当您在网页上主动划选文字并点击扩展的浮动按钮/右键菜单时,扩展才会读取所选文字。读取的内容仅在您的浏览器内存中用于构建 AI 提示词,不会发送给开发者或任何第三方。
2. **AI 请求**:提示词将发送到**您自行配置的模型服务端点**。默认为本机的 Ollama 或 LM Studio(`http://localhost`),数据不出本机;若您选择内置的云端服务商(智谱 GLM,Coding Plan / BigModel)或配置其他外部端点,数据将从您的浏览器**直接**发送到该端点——整个过程不经过开发者的任何服务器,开发者无法也无意获取这些数据。云端模式下,划选的告警内容将由该服务商处理,请自行确认其数据处理政策符合您的要求;敏感环境建议使用本地模型。
3. **对话与设置**:全部存储在浏览器本地(`chrome.storage`),其中对话记录仅保存在当前浏览器会话(`storage.session`)中,关闭浏览器即清除;卸载扩展会清除全部本地数据。

### 权限用途

| 权限 | 用途 |
|---|---|
| 访问所有网站数据(`<all_urls>` 内容脚本) | 在任意网页上提供"划选文字 → 浮动研判按钮"功能;仅在您划选并点击时读取所选内容 |
| 存储(`storage`) | 保存您的模型服务配置与对话 |
| 侧边栏(`sidePanel`) | 展示研判对话界面 |
| 右键菜单(`contextMenus`) | 提供划词后的右键快捷研判入口 |
| 活动标签页(`activeTab`)/脚本注入(`scripting`) | 在当前页面显示划词工具条 |
| 可选主机权限(按需申请) | 仅当您配置非本机模型端点(如局域网 LM Studio)时,用于访问该地址 |

### 儿童隐私

本扩展面向安全从业者,不面向 13 岁以下儿童,也不收集任何儿童信息。

### 政策变更

若本政策有实质变更,将在扩展更新说明中披露。

### 联系方式

邮箱:[您的联系邮箱]

---

## English (Summary)

**AlertTriage collects no data.** There are no accounts, telemetry, analytics SDKs, crash reporting, or third-party trackers. The developer operates no servers involved in any data flow.

- **Selected text** is read only when you actively select text on a page and click the extension's floating button or context-menu item. It is used solely to build an AI prompt in your browser's memory.
- **AI requests** go **directly to the model endpoint you configure yourself** (default: your local Ollama or LM Studio at `http://localhost`, keeping data on your machine). If you select the built-in cloud provider (Zhipu GLM, Coding Plan / BigModel) or configure any other external endpoint, your browser sends data straight to it — never through any developer-controlled server. In cloud mode the selected alert content is processed by that provider; please review the provider's own data policy before enabling it, and prefer local models for sensitive environments.
- **Conversations and settings** are stored locally in your browser. Chat history lives in session storage and is cleared when the browser closes; uninstalling removes all local data.

**Permissions**: `<all_urls>` enables the select-to-triage button on any page (content is read only on user action); `storage` saves your model configuration; `sidePanel`, `contextMenus`, `activeTab`, and `scripting` power the UI; optional host permissions are requested only if you configure a non-localhost model endpoint.

**Contact**: [your-email@example.com]
