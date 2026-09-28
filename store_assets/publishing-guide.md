# Chrome Web Store 上架操作指南

从零到上架的完整步骤,材料内容都在 [store-listing.md](store-listing.md) 和 [privacy-policy.md](privacy-policy.md)。

## 1. 注册开发者账号(一次性,$5)

1. 准备一个 Google 账号(建议用工作/专用账号,发布者身份与它绑定)
2. 打开 https://chrome.google.com/webstore/devconsole/register
3. 支付一次性注册费 **$5.00**(需要 Visa/Master 信用卡或对应地区的支付方式)
4. 填写开发者信息(个人或组织;用组织名义需验证域名,可选)

## 2. 选择发布模式

| 模式 | 适用 | 说明 |
|---|---|---|
| **未列出 Unlisted**(推荐先用这个) | 团队/公司内部使用 | 通过直链访问才能安装,搜索不到;同样过审核;以后可随时切换为公开 |
| 公开 Public | 面向所有安全从业者 | 正常搜索可见 |

首次发布建议选 Unlisted:审核关注点一致,但暴露面小;内部跑稳后再转公开。

## 3. 上传包

- 安装包:`/Users/wooluo/DEV/AlertTriage-v1.7.3.zip`(manifest.json 已在压缩包根目录,已验证)
- 上传路径:开发者控制台 → 新建项目 → 上传 zip

## 4. 填写商店信息

逐项从 [store-listing.md](store-listing.md) 复制:

1. 名称、摘要、详细描述(中文版;想覆盖国际用户就同时贴英文版)
2. 类别:生产力工具;语言:中文(简体)
3. 图形资产:上传 `icons/icon128.png` 作为商店图标;按截图清单截 1280×800 的图(至少 1 张,建议 5 张)
4. **隐私政策 URL**:先把 [privacy-policy.md](privacy-policy.md) 发布成一个网页。最快方式:
   - 在 GitHub 建一个 `yourname.github.io` 仓库(或现有仓库的 docs/),把 privacy-policy.md 内容放进去,开启 GitHub Pages
   - 把得到的 URL(形如 `https://yourname.github.io/alerttriage/privacy/`)填入表单,并替换文内 `[您的联系邮箱]` 占位
5. 单一用途、权限理由、数据使用表单:按 store-listing.md 中"单一用途声明 / 权限用途声明 / 数据使用表单"逐条粘贴

## 5. 提交审核

- 提交后状态变为"审核中"。因含 `<all_urls>` + 新账号,预期走**人工深度审核,约 1~7 天**(偶尔更久)
- 若被驳回,最常见原因及应对:
  - "权限用途不清晰" → 用 store-listing.md 里的英文权限理由重写,强调"仅在用户划选并点击时读取"
  - "隐私政策不完整" → 确认政策明确写了"数据仅发往用户自配端点、无收集"
  - "描述与功能不符" → 确保截图与描述一致
- 驳回修改后可重新提交,不用重新付费

## 6. 过审后

- Unlisted 模式:把直链分发给同事,安装即用,后续更新自动推送
- 版本更新:改 manifest 的 `version`(必须递增)→ 重新打 zip(命令见下)→ 开发者控制台同一项目上传新包 → 再过一次轻量审核

## 重新打包命令(manifest 必须在 zip 根目录)

```bash
cd /Users/wooluo/DEV/EFF-AI-Assistant
zip -rq ../AlertTriage-v1.7.3.zip manifest.json background.js content.js content.css \
  sidepanel.html sidepanel.js sidepanel.css options.html options.js options.css \
  popup.html popup.js popup.css shared icons
```

注意:**不要**把 `tools/`、`README.md`、`store_assets/` 打进商店包(测试脚本与上架无关,包越干净审核越顺)。

## 上架前自查清单

- [ ] 隐私政策已发布,URL 可公开访问,联系邮箱已替换占位符
- [ ] 截图 1280×800 已截好,无真实生产 IP/口令
- [ ] 商店图标 128×128(已备:icons/icon128.png)
- [ ] manifest 版本号已递增
- [ ] zip 内 manifest.json 位于根目录(`unzip -l` 检查第一个文件)
- [ ] 在本地 chrome://extensions 完整回归一遍:划词→研判/快判/解释/处置/提问→停止→新对话
