# Browser Organizer

**让你的新标签页有意义。**

Browser Organizer 是一个 Chrome 浏览器扩展，把默认的「新标签页」替换成一个干净的个人仪表板：顶部是时间与快速搜索，左侧是长期收藏，中间是专注工作区，右侧是当前打开的所有标签（按域名分组）。

完全本地运行——无服务器、无账号、不联网上传任何数据。需要迁移或备份时，可在右上角直接 Export / Import 本地 JSON 文件。Fork 自 [tab-out](https://github.com/zarazhangrui/tab-out) by [Zara](https://x.com/zarazhangrui)。

---

## 主要功能

### 收藏区（左侧）
- **无限收藏**，以横向滚动的 section 呈现；section 可新增、重命名、排序、折叠
- 旧版收藏会自动迁移到 `default` section，并保留原来的 `favorites` storage key
- 鼠标悬停 → 右上角出现 ⋯ 菜单，可编辑或删除
- 自动抓取网站 logo（优先 `apple-touch-icon.png`，兜底 Chrome 缓存的 favicon）
- **二进制缓存**：图标加载成功后转 base64 存进 `chrome.storage.local`，之后刷新页面零网络请求
- **自定义 logo**：编辑收藏时可上传图片或直接 `Cmd+V` 粘贴剪贴板里的图片，自动压缩到 256×256
- **智能命名**：留空标题自动从 URL 提取品牌名（`www.binance.com` → `Binance`，`accounts.binance.com` → `Binance`）

### 中间专注区
- Hero 区显示当前时段问候和专注文案
- Hero 问候会根据本地时间自动显示 Good morning / Good afternoon / Good night
- Hero 描述文案可双击编辑，保存到本地并跟随 JSON Export / Import
- Workspaces 会从当前打开标签里取最近的域名分组，点击可直接切回对应标签
- To-do List 存在本地 `todos` key，新增任务后显示在列表里，完成后直接删除
- Profile avatar 支持本地图片上传，图片压缩后存在 `chrome.storage.local`
- 天气仍是 UI 占位，不请求定位、不调用外部天气 API

### 当前标签区（右侧）
- 按域名自动分组成卡片
- 每个 domain group 可展开 / 收合
- **固定标签**单独置顶显示，与未固定的明确分开
- 每个标签卡片有四个操作：
  - ⭐ 加入收藏 / 取消收藏（取消时弹自定义确认框）
  - 📌 固定 / 取消固定
  - ✕ 关闭这个标签
  - 重复标签会显示 `重复 x N` 徽章，悬停变成「关闭重复」按钮
- **按最近活跃排序**：你刚切过去的网站组所在卡片排在最顶上
- 实时同步：在浏览器其他位置开/关/切换标签，这里跟着自动刷新

### 右键菜单
- 在任意网页右键 → 「Add page to Browser Organizer favorites」直接收藏当前页
- 右键链接 → 「Add link to Browser Organizer favorites」收藏该链接

### 其他
- 顶部 command bar 可输入网址或搜索词，直接在当前新标签页打开
- 顶部 New Tab 按钮可直接打开新的 Chrome 标签页
- 右侧 Chrome Profile 面板会读取当前 Chrome profile 原生 Bookmarks 和 Reading List，避免新标签页替换后看起来像把浏览器自带书签隐藏了
- 顶部 Export / Import 可把收藏、分组、待办、Hero 文案、头像、主题和已缓存的收藏图标导出为 JSON，并导入到另一台电脑或另一个 Chrome profile
- Import 会先确认再替换当前本机保存的数据；打开中的 tabs 和可重新生成的 favicon cache 不会写进备份
- 🌙 / ☀️ **深色 / 浅色模式切换**（右上角，自动记忆）
- 直接点收藏 → 打开新的 Chrome 标签页，不替换当前 Browser Organizer 页面；右键收藏 → 弹出 Chrome 标准的链接菜单

---

## 安装方式

### 方法 1：让 Coding Agent 帮你装

把这个本地项目文件夹发给 Claude Code / Codex / Cursor 等 agent，告诉它「install this」：

```
/Users/yichenlin/Desktop/App/Browser_Organizer
```

它会一步步带你装好。约 1 分钟搞定。

### 方法 2：手动安装

**1. 打开本地项目**

当前项目路径是 `/Users/yichenlin/Desktop/App/Browser_Organizer`。

**2. 加载到 Chrome**

1. 打开 Chrome，访问 `chrome://extensions`
2. 右上角打开 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择这个项目里的 `extension/` 文件夹

**3. 打开新标签页**

你会看到 Browser Organizer 出现。

---

## 工作原理

```
你打开新标签页
  → Browser Organizer 显示顶部搜索、左侧收藏、中间专注区、右侧当前标签
  → 固定标签独立置顶
  → Workspaces 根据当前标签自动生成快速切换入口
  → 点击任意标签即可切过去
  → 关掉一组（X 按钮 + 撒花动画 + 音效）
```

所有运行都在 Chrome 扩展内部完成。无外部服务器、无 API 调用、无数据上传。`favorites / favoriteSections / todos / heroCopy / theme / profileImageDataUrl` 都保存在 `chrome.storage.local`；Chrome 的不同 profile 会拥有彼此独立的本地存储。跨 profile / 跨设备迁移使用 JSON Export / Import，导出的文件由你自己保存和管理。导出会包含收藏卡片已缓存的 `data:image` 图标快照；可重新抓取但还没缓存成功的 favicon 会在新 profile 里重新解析。

---

## 技术栈

| 用途 | 实现 |
|------|------|
| 扩展 | Chrome Manifest V3 |
| 数据存储 | chrome.storage.local + JSON Export / Import |
| Chrome profile 数据 | chrome.bookmarks + chrome.readingList，只读展示当前 profile 的原生书签与阅读列表 |
| 图标缓存 | base64 二进制 + 全局图片错误回退链 |
| 音效 | Web Audio API（合成，无音频文件）|
| 动效 | CSS transitions + JS 撒花粒子 |
| 字体 | DM Sans |
| 多语言 | 自研 i18n 字符串表 |

零依赖，零 npm，零构建。clone 完直接 load。

---

## 自定义

`extension/config.local.js`（gitignored）可以放个性化配置。比如自定义某些域名的「主页」分组规则——参考代码里的 `LOCAL_LANDING_PAGE_PATTERNS` 和 `LOCAL_CUSTOM_GROUPS` 默认值。

---

## License

MIT

---

Browser Organizer · forked from [tab-out](https://github.com/zarazhangrui/tab-out) by [Zara](https://x.com/zarazhangrui)
