# Browser Organizer

**让你的新标签页有意义。**

Browser Organizer 是一个 Chrome 浏览器扩展，把默认的「新标签页」替换成一个干净的个人仪表板：顶部是时钟与快速搜索，左侧是长期收藏，中间是专注工作区与每日规划，右侧是当前打开的所有标签（按域名分组）。

无服务器、无账号，所有数据保存在本地 `chrome.storage.local`，不向任何外部服务上传用户数据。需要跨设备或跨 profile 迁移时，可在右上角直接 Export / Import 本地 JSON 文件。Fork 自 [tab-out](https://github.com/zarazhangrui/tab-out) by [Zara](https://x.com/zarazhangrui)。

---

## 主要功能

### 收藏区（左侧）

- **无限收藏**，以 section 分组呈现；section 可新增、重命名、上下排序、折叠/展开
- 旧版收藏自动迁移到 `default` section，保留原始 `favorites` storage key
- 鼠标悬停 → 右上角出现 ⋯ 菜单，可编辑或删除
- 自动抓取网站 logo（优先 `apple-touch-icon.png`，兜底 Chrome 缓存的 favicon）
- **二进制缓存**：图标加载成功后转 base64 存进 `chrome.storage.local`，之后刷新页面零网络请求
- **自定义 logo**：编辑收藏时可上传图片或直接 `Cmd+V` 粘贴剪贴板里的图片，自动压缩到 256×256
- **智能命名**：留空标题自动从 URL 提取品牌名（`www.binance.com` → `Binance`，`accounts.binance.com` → `Binance`）
- **拖拽排序**：在同一 section 内拖拽收藏卡片即可交换位置，也可拖到空位直接放置

### 中间专注区

- Hero 区显示当前时段问候（根据本地时间自动切换 Good morning / Good afternoon / Good night）
- **Hero 标题与描述文案均可双击编辑**，保存到本地，跟随 JSON Export / Import
- **Today Task 面板**：显示今天的任务列表，可勾选完成或删除
- **Daily Planner 日历**：按月展示，点击日期查看/新增该日任务；每格显示任务数量徽章；支持最多 365 天内的计划
- 每条任务可设置标签（Work / Projects / Personal / Design）
- **Profile avatar**：支持本地图片上传，图片压缩后存入 `chrome.storage.local`
- 位置/天气区域为 UI 占位，不请求定位、不调用外部天气 API

### 当前标签区（右侧）

- 按域名自动分组成卡片
- 每个 domain group 可展开 / 收合
- **固定标签**单独置顶显示，与普通标签明确分开
- 每个标签 chip 有三个操作按钮：
  - ⭐ 加入收藏 / 取消收藏（取消时弹自定义确认框）
  - 📌 固定 / 取消固定
  - ✕ 关闭这个标签（带撒花动画 + 音效）
- 重复标签显示 `重复 x N` 徽章，点击关闭该 URL 的所有多余副本
- **按最近活跃排序**：你刚切过去的网站所在组排在最顶
- **Smart cleanup 面板**：统计当前重复标签数，一键定位
- 实时同步：在浏览器其他位置开/关/切换标签，这里跟着自动刷新（防抖 150ms）
- 工具栏 badge 实时显示真实网页标签数，颜色按多少分绿/琥珀/红三档

### 右键菜单

- 任意网页右键 → 「Add page to Browser Organizer favorites」收藏当前页
- 右键链接 → 「Add link to Browser Organizer favorites」收藏该链接

### 顶栏工具

- **Command bar**：输入网址直接跳转，输入搜索词使用 Google 搜索，支持 `localhost:3000` 等格式自动补全协议
- **New Tab** 按钮：在 Chrome 开一个新标签页
- **Export / Import**：把收藏、分组、每日任务、Hero 标题与文案、头像、主题导出为 JSON；Import 前弹确认框，不影响正在打开的 tabs 和可重新生成的 favicon cache
- **重复 Browser Organizer 标签检测**：多开新标签页时显示横幅，一键保留一个关闭其余
- 🌙 / ☀️ 深色 / 浅色模式切换（右上角，自动记忆）

### Chrome Profile 面板（右侧下方）

- 读取当前 Chrome profile 原生 **Bookmarks**，以树形折叠展示
- 支持全部折叠 / 全部展开，文件夹内超出 5 条的可按需展开
- 右上角 ⋮ 按钮直接打开 `chrome://bookmarks`
- 直接点击收藏 → 在新标签页打开，不替换当前 Browser Organizer 页面

---

## 安装方式

### 方法 1：让 Coding Agent 帮你装

把这个本地项目文件夹发给 Claude Code / Codex / Cursor 等 agent，告诉它「install this」：

```
/Users/yichenlin/Desktop/App/Browser_Organizer
```

它会一步步带你装好。约 1 分钟搞定。

### 方法 2：手动安装

**1. 确认项目路径**

当前项目路径是 `/Users/yichenlin/Desktop/App/Browser_Organizer`。

**2. 加载到 Chrome**

1. 打开 Chrome，访问 `chrome://extensions`
2. 右上角打开 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择这个项目里的 `extension/` 文件夹

**3. 打开新标签页**

你会看到 Browser Organizer 出现。

**更新方式**：本地修改代码后，到 `chrome://extensions` 找到 Browser Organizer 点击「重新加载」图标即可。

---

## 工作原理

```
打开新标签页
  → 顶栏显示时钟、Command bar、Export/Import
  → 左侧：长期收藏（分 section，可拖拽排序）
  → 中间：Hero 问候 + Today Task + Daily Planner 日历
  → 右侧：固定标签置顶 + 当前标签按域名分组
           → 每个 chip 可收藏⭐ / 固定📌 / 关闭✕
           → 点击 chip 直接切到那个标签
           → 关掉一组（X + 撒花动画 + 音效）
           → Chrome Profile 书签树（只读）
```

所有运行都在 Chrome 扩展内部完成。无外部服务器、无 API 调用。`favorites / favoriteSections / dailyTasks / heroTitle / heroCopy / theme / profileImageDataUrl` 均保存在 `chrome.storage.local`；Chrome 的不同 profile 拥有彼此独立的本地存储。

**跨 profile / 跨设备迁移**：使用右上角 Export 导出 JSON，在目标 profile 的 Browser Organizer 里 Import 即可。导出包含已缓存成 `data:image` 的收藏图标快照；尚未缓存的 favicon 会在新 profile 里重新抓取。

**注意**：页面加载时会请求 Google Fonts（DM Sans 字体）。如需完全离线使用，可将字体文件下载到本地并修改 `index.html` 的 `<link>` 指向本地路径。

---

## 技术栈

| 用途                | 实现                                                    |
| ------------------- | ------------------------------------------------------- |
| 扩展框架            | Chrome Manifest V3                                      |
| 数据存储            | `chrome.storage.local` + JSON Export / Import           |
| 标签管理            | `chrome.tabs` API（直接访问，无中间层）                 |
| Chrome profile 数据 | `chrome.bookmarks`（只读展示，不修改）                  |
| 图标缓存            | `apple-touch-icon` fallback chain → `data:image` base64 |
| 音效                | Web Audio API（合成噪音，无音频文件）                   |
| 动效                | CSS transitions + `requestAnimationFrame` 粒子          |
| 字体                | DM Sans（Google Fonts CDN）                             |
| 多语言              | 自研 i18n 字符串表（英文 / 中文）                       |
| 背景任务            | Service Worker（`background.js`）维护 badge 和右键菜单  |

零 npm，零构建，零外部依赖（字体除外）。Clone 后直接 load `extension/` 文件夹即可运行。

---

## 数据结构（`chrome.storage.local`）

| Key                   | 说明                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `favorites`           | 收藏数组，每条含 `id / url / title / slot / sectionId / sectionSlot / iconUrl? / customLogo?` |
| `favoriteSections`    | Section 数组，每条含 `id / name / order / collapsed`                                          |
| `dailyTasks`          | 每日任务数组，每条含 `id / title / tag / date / done / createdAt / updatedAt`                 |
| `heroTitle`           | Hero 标题文案（可双击编辑）                                                                   |
| `heroCopy`            | Hero 描述文案（可双击编辑）                                                                   |
| `theme`               | `'light'` 或 `'dark'`                                                                         |
| `profileImageDataUrl` | 头像 base64 data URL                                                                          |
| `lang`                | `'en'` 或 `'zh'`                                                                              |

---

## 自定义

`extension/config.local.js`（gitignored）可放个性化配置，例如自定义某些 URL 的分组规则。参考代码里的 `LOCAL_LANDING_PAGE_PATTERNS` 和 `LOCAL_CUSTOM_GROUPS`。

---

## License

MIT

---

Browser Organizer · forked from [tab-out](https://github.com/zarazhangrui/tab-out) by [Zara](https://x.com/zarazhangrui)
