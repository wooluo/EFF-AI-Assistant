# AlertTriage 告警研判助手 · 划词分析浏览器插件

**网络告警研判 AI 助手**:在告警/日志页面选中内容,一键输出**明确研判结论**(攻击成功 / 攻击失败 / 存在攻击意图 / 业务行为 / 非告警事件 / 无法确认,附置信度)、证据链分析与处置建议。默认由本地 AI 驱动(Ollama / LM Studio),数据不出本机;也可接入**智谱 GLM 云端模型**(Coding Plan),云端模式下数据将发送至服务商。

研判口径移植自开源项目 EFF-Monitoring(致谢):LLM 网关(Ollama 原生 + OpenAI 兼容双协议、流式输出、模型列表探测)移植自 `backend/app/services/ai_gateway.py`;**互斥研判标签体系**(业务行为 / 存在攻击意图 / 攻击失败 / 攻击成功 / 非告警事件 / 无法确认)与输出结构(标签、结论、关键证据、风险判断、处置建议、不确定性)对齐 `backend/app/services/ai_service.py` 的平台研判规范,插件可独立使用。

## 本仓库是什么

「AlertTriage 告警研判助手」的源码仓库,包含:

- **扩展全部源码** — MV3,无需构建,clone 下来即可加载运行
- **安装包** — 每个版本的 zip 发布在 [Releases](../../releases),普通用户下载解压即用
- **商店上架材料**(`store_assets/`)— Chrome / Edge 商店文案、隐私政策、上架操作指南
- **开发与测试工具**(`tools/`)— 单元测试、真实联调、图标生成脚本

## 功能

- 📄 **一键分析本页** — 侧边栏输入框旁「📄」按钮,无需划选,直接提取当前页面正文(优先正文容器)整体研判:页面概览 → 逐条研判 → 整体结论 → 优先处置
- 🔍 **一键研判** — 划选告警/日志内容,浮出「研判 / 解释 / 处置 / 提问」工具条;「研判」自动输出**结论置顶**的七段式报告:**研判结论(六选一标签 + 置信度 + 告警标识)** → 告警概述 → 关键证据分析(标注证据层级)→ 误报与定性分析 → 风险与影响 → 处置建议(含审计溯源)→ 待确认项 + 一句话总结
- 💡 **解释** — 面向一线值班:告警类型、触发行为、关键字段含义,通俗易懂
- 🛡 **处置** — 立即处置(按优先级)、取证留存、后续加固;倾向误报时给验证方法
- ✨ **追问** — 多轮对话补充证据,上下文自动携带
- 🖱️ **右键菜单** — 选中内容后右键 → 「EFF 告警研判」
- 💬 **侧边栏** — 流式输出、Markdown 渲染(代码块/表格/列表)、停止生成、一键复制;**思考型模型**(qwen3.5 系列等)的思考过程实时显示在回答上方(完成后可折叠展开),不会出现"长时间空白卡住";设置中可禁用思考模式加快出结论
- 🎭 **多角色切换** — 侧边栏顶栏一键切换:🛡 告警研判员 / 📋 值班总结报告员 / 🚨 应急响应员 / 🎯 攻击链还原员 / 👩‍🏫 安全教练 / 📄 合规上报撰写员 / 🎓 答题小能手,支持自定义角色(设置页新建/编辑/删除)
- 🔀 **多服务商** — Ollama(原生)/ LM Studio / 任意 OpenAI 兼容接口 / 智谱云端 GLM(Coding Plan),每个服务商独立记忆配置;模型可点选也可手动输入
- 🌗 自动深浅色主题,支持 Edge(Chromium 内核)

## 安装

> 要求 Chrome / Edge 116+(侧边栏 API);扩展需要本地模型服务或云端 API Key 才能出结论,见下方「模型配置」。

### 方式一:下载安装包(推荐)

1. 到 [Releases](../../releases) 下载最新的 `AlertTriage-v*.zip` 并解压
2. 打开 `chrome://extensions`(Edge 为 `edge://extensions`)
3. 右上角打开 **开发者模式**
4. 点击 **加载已解压的扩展程序**,选择解压出的目录(选含 `manifest.json` 的那一层)
5. (建议)点击工具栏插件图标 → **⚙ 设置**,点「刷新模型」拉取本地模型

### 方式二:直接加载源码(开发者)

```bash
git clone https://github.com/wooluo/EFF-AI-Assistant.git
```

clone 后同样在扩展页「加载已解压的扩展程序」,选择仓库根目录;修改代码后在扩展页点 ⟳ 重新加载即生效。

## 模型配置

### Ollama(默认 `http://localhost:11434`)

```bash
# 拉取一个对话模型(示例)
ollama pull qwen2.5:7b

# 关键:允许浏览器扩展访问(默认会拒绝 chrome-extension 来源)
# macOS(桌面版):
launchctl setenv OLLAMA_ORIGINS "*" &&   # 设置后退出 Ollama 菜单栏应用并重新打开
# Linux / 手动启动:
OLLAMA_ORIGINS="*" ollama serve
```

### LM Studio(默认 `http://localhost:1234/v1`)

1. 打开 LM Studio → **Developer** 标签 → 启动 **Local Server**,加载一个模型
2. Server **Settings** 中开启 **Enable CORS**(必须,否则浏览器扩展无法访问)

### 智谱云端 GLM(Coding Plan,默认 `https://open.bigmodel.cn/api/coding/paas/v4`)

本地算力不足时,可接入智谱 GLM 云端模型:

1. 到 [bigmodel.cn](https://bigmodel.cn/) 注册,订阅 **GLM Coding Plan**(Lite / Pro / Max 套餐)或开通按量付费
2. 在「API Keys」页面创建密钥
3. 扩展设置页 → 服务商选「**智谱云端 · GLM**」→ 粘贴 API Key → 「刷新模型」→ 选择模型(当前套餐支持 `glm-5.3`、`glm-5.3-flash`)→ 保存

说明:

- **Coding Plan 订阅密钥**使用默认专属端点 `/api/coding/paas/v4`;**按量付费密钥**请把 Base URL 改为 `https://open.bigmodel.cn/api/paas/v4` —— 密钥与端点必须匹配,否则会 401
- 走 OpenAI 兼容协议,流式输出、思考内容(`reasoning_content`)自动归入折叠的思考块
- **禁用思考**:GLM-5.3 系列(含 flash)官方强制思考(`thinking.type` 仅支持 `enabled`),无法真正关闭,开启「禁用思考模式」后会自动改用最低推理强度 `reasoning_effort: "low"` 尽快出结论;更早的模型(glm-4.5 / 4.6 / 5.2)可真正关闭思考
- ⚠️ **云端模式下,划选/页面的告警内容会发送至智谱服务器**,请确认符合单位的数据安全要求;敏感环境请继续使用本地模型

### 其他 OpenAI 兼容服务

设置页选择「其他 OpenAI 兼容接口」,填写 Base URL(如 `http://192.168.1.5:8000/v1`);非本机地址保存时会请求额外主机权限。`vLLM`、`llama.cpp server`、`OneAPI` 等均可直接使用。

## 使用

| 操作 | 效果 |
|---|---|
| 划选告警/日志文字 | 浮动条出现:🔍 研判(六段式报告+明确结论)/ 💡 解释 / 🛡 处置 / ✨ 提问 |
| 划选后右键 → EFF 告警研判 | 与浮动条等价 |
| ✨ 提问 | 侧边栏打开并引用所选内容,输入追问或补充证据 |
| 侧边栏顶部模型徽标 | 拉取本地模型列表,**点选或手动输入**切换 |
| 设置页 → 服务商 | 切换 Ollama / LM Studio / 智谱云端 / OpenAI 兼容,自动恢复各自记忆的地址与模型 |
| 对话中继续输入 | 多轮追问,自动携带上下文 |
| 生成中点 ■ | 停止生成 |
| ＋ | 新对话 |

## 常见问题

| 现象 | 解决 |
|---|---|
| 403 / Ollama 拒绝访问 | 设置 `OLLAMA_ORIGINS="*"` 后重启 Ollama(见上文) |
| 401 / 鉴权失败 | 智谱:Coding Plan 密钥配 `…/api/coding/paas/v4`,按量付费密钥配 `…/api/paas/v4`,密钥与端点必须匹配 |
| 429 / 请求受限 | 触发限流或云端套餐额度用尽:稍后重试,或在服务商控制台查看用量 |
| 无法连接 | 确认服务已启动、端口正确;LM Studio 检查 CORS;局域网地址需在保存时授予权限;云端服务检查网络与代理 |
| 模型列表为空 | `ollama pull` 安装模型,或 LM Studio 加载模型后点「刷新模型」;智谱会自动填入常用模型,也可手动输入 |
| 404 | Base URL 填错:Ollama 填 `http://localhost:11434`,LM Studio 填 `http://localhost:1234/v1`(填错 `/v1` 通常会自动纠正) |
| 输出很慢 | 本地:首次加载模型到显存/内存较慢,之后正常,可换更小的量化模型;云端:可换 `glm-5.3-flash` 等更快的模型 |

## 目录结构

```
EFF-AI-Assistant/
├── manifest.json          # MV3 清单
├── background.js          # LLM 网关(移植自 ai_gateway.py)+ 右键菜单 + 侧边栏管理
├── content.js / .css      # 划词浮动工具条
├── sidepanel.html/.js/.css# 侧边栏聊天(流式 + Markdown)
├── options.html/.js/.css  # 设置页
├── popup.html/.js/.css    # 工具栏弹窗(状态检测 + 快捷入口)
├── shared/common.js       # 共享常量/提示词/URL 适配纯函数
├── icons/                 # 图标(tools/make_icons.py 生成)
├── store_assets/          # 商店上架材料(文案/隐私政策/上架指南,Chrome+Edge)
└── tools/                 # 图标生成脚本 + 测试(见下)
```

## 开发与测试

```bash
node tools/test_gateway.mjs   # 单元测试:双协议 URL 适配、流式解析、模拟端到端、错误诊断
node tools/test_live.mjs      # 真实联调:对本机 Ollama 实测模型列表 + 流式对话
python3 tools/make_icons.py   # 重新生成图标
```
