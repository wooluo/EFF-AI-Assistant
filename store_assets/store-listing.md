# 商店列表材料(填表直接复制)

## 基本信息

| 字段 | 填写内容 |
|---|---|
| 名称 | AlertTriage 告警研判助手 |
| 简短摘要(≤132 字符) | 划词即研判:选中告警/日志,AI 输出明确结论(攻击成功/失败/误报/业务行为)+置信度+处置建议。本地模型优先,云端(智谱 GLM)可选。 |
| 类别 | 生产力工具 / Productivity |
| 语言 | 中文(简体) |
| 图形资产 | 图标 `icons/icon128.png`(已备);小预览图 440×280(可选) |

## 详细描述(中文)

```
AlertTriage 是为安全运营(SOC)值班与告警研判打造的划词 AI 助手。

▍它能做什么
在任意告警平台、SIEM、日志系统的网页上划选告警内容,一键获得专业研判:

• 📄 分析本页 — 输入框旁一键提取当前页面,整页告警逐条研判并汇总结论,列表页效率拉满
• 🔍 研判 — 结论置顶的七段式报告:研判结论(六选一标签 + 置信度 + 告警标识)→ 告警概述 → 关键证据分析(按证明力分层:流量实证/系统状态/规则元数据)→ 误报与定性分析 → 风险与影响 → 处置建议 → 待确认项 + 一句话总结
• ⚡ 快判 —— 三行秒出:结论|置信度|告警标识 / 最强依据 / 最优先处置,适合批量过告警
• 💡 解释 —— 面向一线值班:告警类型、触发行为、关键字段含义
• 🛡 处置 —— 立即处置、取证留存、后续加固;倾向误报时给出验证方法
• ✨ 提问 —— 多轮追问,自动携带告警上下文

▍六种研判角色,顶栏一键切换
🛡 告警研判员(定性)/ 📋 值班总结报告员(交班日报)/ 🚨 应急响应员(命令级处置)/ 🎯 攻击链还原员(ATT&CK 映射与布防)/ 👩‍🏫 安全教练(带新人)/ 📄 合规上报撰写员(报送材料)/ 🎓 答题小能手(页面题目快速作答),另支持自定义角色。

▍诚实研判,不编造
页面或划选内容不足以支撑结论时,明确回答"数据不足,无法研判"并列出缺失的关键信息——绝不推测补全字段、绝不硬凑结论,信息不足时结论强制为【无法确认】。

▍研判标签体系(互斥六选一)
业务行为 / 存在攻击意图 / 攻击失败 / 攻击成功 / 非告警事件 / 无法确认,附置信度(高/中/低)。

▍本地模型优先,云端可选
默认对接本机的 Ollama、LM Studio 或任意 OpenAI 兼容接口(vLLM / llama.cpp / OneAPI),数据不出本机;本地算力不足时可切换智谱云端 GLM(GLM Coding Plan),云端模式下告警内容将直连发送至智谱服务器(不经任何中间服务器),扩展内会明确提示。扩展无账号、无遥测、无上报,对话仅存于浏览器本地。

▍其他特性
• 思考型模型(qwen3.5 系列等)思考过程实时可见,可折叠回看;可一键禁用思考加速出结论
• 流式输出,Markdown 渲染(代码块/表格/列表),一键复制
• 模型列表在线拉取、可手动输入;多服务商配置独立记忆
• 深浅色自适应,支持 Edge 等 Chromium 浏览器(Chrome 116+)

▍使用方法
1. 安装后在 chrome://extensions 打开「扩展程序选项」
2. 选择服务商(Ollama / LM Studio / 智谱云端 / OpenAI 兼容),点「刷新模型」选择模型
3. 在任意告警页面划选内容,点浮动按钮即可研判

注意:Ollama 用户需设置环境变量 OLLAMA_ORIGINS="*" 后重启服务;LM Studio 需在 Server 设置中开启 CORS。详见扩展内说明。
```

## 详细描述(英文,可选用发布双语)

```
AlertTriage is a select-to-analyze AI assistant for SOC alert triage.

Select alert text on any web page (SIEM, NDR, log console) and get a professional verdict in one click:

• 📄 Analyze page — one click extracts the current page and triages every alert on it with a summary verdict
• 🔍 Deep triage — verdict-first report: conclusion (one of six mutually exclusive labels + confidence + alert ID), evidence analysis layered by probative force (traffic evidence / system state / rule metadata), false-positive analysis, risk & impact, recommended actions, open questions, and a one-line summary
• ⚡ Quick triage — three lines in seconds: verdict | confidence | alert ID / strongest evidence / top action
• 💡 Explain — what the alert means, field by field, for on-call analysts
• 🛡 Respond — containment, forensics, hardening; verification steps when it looks like a false positive
• ✨ Ask — multi-turn follow-ups with the alert as context

Honest by design: when page content is insufficient for a verdict, it says so explicitly and lists what's missing — no fabricated fields, no forced conclusions.

Verdict labels: Business behavior / Attack intent / Attack failed / Attack succeeded / Non-alert event / Cannot determine, each with High/Medium/Low confidence.

Local-first by design: Ollama, LM Studio, or any OpenAI-compatible endpoint — configured by you, defaulting to localhost, keeping data on your machine. Optionally switch to the Zhipu GLM cloud (GLM Coding Plan) when local compute falls short; in cloud mode alert content goes directly from your browser to Zhipu's servers (never through developer servers), with an explicit in-extension notice. No accounts, no telemetry, no developer servers. Conversations stay in your browser.

Seven switchable roles (alert triage / shift report / incident response / attack-chain reconstruction / mentor / compliance writer / quiz solver) plus custom roles. Also: live thinking display for reasoning models (collapsible), streaming Markdown output, one-click copy, per-provider model memory, dark/light themes. Requires Chrome/Edge 116+.

Ollama users: set OLLAMA_ORIGINS="*" and restart the service. LM Studio: enable CORS in server settings.
```

## 单一用途声明(审核表 Single Purpose 字段)

```
中文:对用户在网页上划选的网络安全告警/日志内容进行 AI 研判分析,输出研判结论与处置建议。
英文:Analyze user-selected cybersecurity alert/log text on web pages with AI to produce triage verdicts and recommended actions.
```

## 权限用途声明(审核表 Permissions 逐条理由,如实填写)

| 权限 | 理由(英文填表版) |
|---|---|
| `<all_urls>`(内容脚本) | `Read and change your data on all websites` — The content script only detects text selection and shows a floating action bar. Page content is read exclusively when the user selects text and clicks our button; nothing is read or transmitted otherwise. This is the same pattern used by select-to-translate extensions. |
| `storage` | Stores the user's own model endpoint configuration (Ollama/LM Studio/Zhipu URL, model name, optional API key) and the current conversation locally. |
| `sidePanel` | Displays the triage conversation UI. |
| `contextMenus` | Adds a right-click menu entry to analyze the selected alert text. |
| `activeTab` / `scripting` | Shows the selection toolbar on the current page when triggered by user action. |
| 主机权限 `http://*/*`、`https://*/*`、`file:///*` | Enables the content script (selection toolbar) on any page and the page-extraction fallback; also allows requests to the user's own model endpoint (default localhost). Content is read only on user action. |

## 数据使用表单(Data Usage disclosure)

- 收集用户数据?**否 / No**(无遥测、无账号、无上报)
- 出售或传输给第三方?**否 / No**(AI 请求仅发往用户自行配置的端点,默认 localhost;用户主动选择云端服务商时,数据从浏览器直连该服务商,不经开发者服务器)
- 用于与扩展核心功能无关的用途?**否 / No**
- 是否使用凭据/财务信息/个人信息/浏览记录?**否**
- 隐私政策 URL:见 publishing-guide.md 第 4 步

## 截图清单(1280×800,建议 5 张)

1. 告警平台页面 + 划选内容 + 浮动工具条出现(展示"在哪用")
2. 侧边栏完整深度研判报告(结论置顶部分,展示核心价值)
3. 💭 思考过程折叠块 + 流式输出中间态(展示体验细节)
4. ⚡ 快判三行结果(展示速度场景)
5. 设置页(服务商/模型选择,展示本地模型配置)

截图技巧:Chrome 无痕窗口 + 干净告警示例数据(注意截图中不要出现真实生产 IP/口令,可用演示数据);浏览器缩放 100%,窗口调至 1280×800。
