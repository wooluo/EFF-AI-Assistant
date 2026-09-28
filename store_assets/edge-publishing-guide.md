# Edge 加载项商店上架操作指南

零成本路线:先上架 Edge 验证需求,再决定是否花 $5 上 Chrome。
商店文案复用 [store-listing.md](store-listing.md),隐私政策复用 [privacy-policy.md](privacy-policy.md)。
安装包与 Chrome 通用:`/Users/wooluo/DEV/AlertTriage-v1.7.3.zip`(MV3 manifest,Edge 116+ 完全兼容,`minimum_chrome_version` 字段 Edge 同样识别)。

## 1. 注册开发者账号(免费)

1. 准备一个 Microsoft 个人账号(outlook.com 等);**避免用公司/组织账号**,社区反馈工作账号注册 Edge 计划常报 "Not authorized"
2. 打开 https://partner.microsoft.com/dashboard/microsoftedge/registration ,登录并加入 Microsoft Edge Add-ons 计划
3. 填写开发者信息:开发者名称、网站、支持邮箱(这些会在商店公开)
4. 无注册费($19/$99 是 Windows 应用商店的收费,Edge Add-ons 计划本身免费)

遇到注册问题联系:ext_dev_support@microsoft.com

## 2. 提交前的材料

| 材料 | 状态 | 说明 |
|---|---|---|
| zip 安装包 | ✅ 已备 | 直接用 Chrome 同款包,manifest 在 zip 根目录 |
| 商店 logo | ✅ 已生成 | `store_assets/icon300.png`(300×300,由 icon128 放大);**Edge 必填** |
| 名称/描述 | ✅ 已备 | 从 store-listing.md 复制中英文版(描述上限 10000 字符,远够) |
| 隐私政策 URL | ⚠️ 待办 | 把 privacy-policy.md 发布成公开网页(建议 GitHub Pages),**先替换文内两处邮箱占位符** |
| 截图 | 可选 | Edge 不强制截图;有时间按 store-listing.md 清单截 1~5 张更好 |
| 搜索词 | 可选 | 最多 7 个词,如:告警研判、SOC、安全运营、alert triage、SIEM |

## 3. Partner Center 提交(6 步表单)

入口:https://partner.microsoft.com/dashboard/microsoftedge → Create new extension

1. **Upload**:上传 zip,系统自动验证 manifest
2. **Availability**:
   - Visibility 选 **Hidden**(不公开列出,直链分发,等同 Chrome 的 Unlisted;内部验证后再转 Public)
   - Markets 默认全选即可
3. **Properties**:
   - Category:Productivity / 生产力
   - "Does your add-in access, collect or transmit personal information?" 建议选 **Yes**(内容脚本会读取划选的页面文本)并填隐私政策 URL——选 Yes 必须提供 URL
   - Website URL:填 GitHub 仓库或隐私政策所在站
   - Support contact email:填公开邮箱(与隐私政策中的一致)
4. **Store listings**:
   - Short description(必填):用 store-listing.md 的摘要
   - Long description:粘贴详细描述
   - Store logo:上传 `icon300.png`
   - Screenshots(可选):1280×800,最多 10 张
5. **Review and publish**:在 Notes for certification(认证备注)粘贴下方模板,然后 Publish
6. **认证**:官方口径最长 7 个工作日,实测常见 1~3 天

## 认证备注模板(直接粘贴,让审核员知道怎么测)

```
This extension requires a local LLM endpoint (Ollama or LM Studio) to produce analysis results.

How to test the UI without a model: open the extension's Options page — provider settings, model list, side panel, right-click menu and the text-selection floating button are all functional. Analysis requests go only to the user-configured endpoint (default http://localhost), which will show a connection error if no local model is running.

Core flow: user selects text on any webpage → floating button appears → click → selected text is sent to the user's own local model endpoint. No content is read without explicit user action. The extension has no accounts, no telemetry, and sends nothing to any developer server.
```

## 4. 常见驳回点(与 Chrome 相同的两类)

- **权限用途不清晰** → 用 store-listing.md 的英文权限理由重写,强调"仅在用户划选并点击时读取"
- **隐私政策缺失/不完整** → 确认 URL 公开可访问、邮箱占位符已替换

被驳回直接在同一提交里修改重发,不收费。

## 5. 过审后

- Hidden 模式:把直链(形如 https://microsoftedge.microsoft.com/addons/detail/xxx)发给同事安装,更新自动推送
- 转公开:同一页面把 Visibility 改 Public 再发布,走一次轻量审核
- 版本更新:manifest `version` 递增 → 重新打 zip(命令见 publishing-guide.md)→ 同一扩展上传新包
- 验证顺利后,再按 [publishing-guide.md](publishing-guide.md) 花 $5 上 Chrome——两个商店共用同一个 zip 和文案

## 上架前自查清单

- [ ] 隐私政策已发布为公开 URL,两处邮箱占位符已替换
- [ ] `store_assets/icon300.png` 已作为商店 logo 上传
- [ ] 认证备注已粘贴(避免审核员因连不上模型误判功能损坏)
- [ ] 在本地 edge://extensions 完整回归:划词→研判/快判/解释/处置/提问→停止→新对话
