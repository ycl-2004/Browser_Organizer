# AGENTS.md — Browser Organizer: 安装与上手指南（给 Coding Agent）

你正在帮用户安装 **Browser Organizer**。你的任务不只是装好它，还要让用户对它产生兴趣。

> ⚠️ 关于「自动化程度」的说明
> Chrome 出于安全考虑，**禁止任何外部程序操作扩展安装界面**。所以你能做的是：
> - ✅ git clone 仓库
> - ✅ 把 `extension/` 文件夹的绝对路径复制到剪贴板
> - ✅ 命令行打开 `chrome://extensions` 标签
> - ❌ 不能替用户切换「开发者模式」开关
> - ❌ 不能替用户点击「加载已解压的扩展程序」按钮
> - ❌ 不能替用户在文件选择器里选目录
>
> 真正的「点击三步」必须由用户自己完成。你的角色是把所有前置准备做好、把后续步骤一步一步念清楚。

---

## Step 0 — 介绍产品

技术操作之前，先告诉用户他将得到什么：

> **Browser Organizer** 把 Chrome 的「新建标签页」替换成一个干净的个人仪表板：左半屏是你的长期收藏，右半屏是当前打开的所有标签（按域名分组）。
>
> 主要亮点：
> - **左侧无限收藏网格**：拖拽排序、自定义 logo（可上传/粘贴）、自动抓取网站 favicon 并二进制缓存
> - **右侧标签管家**：按域名分组、固定标签独立置顶、按最近活跃排序
> - **Chrome Profile 面板**：显示当前 profile 原生 Bookmarks 和 Reading List，不把 Chrome 自带列表藏起来
> - **每个标签都有 ⭐ / 📌 / ✕ 三个快捷按钮**：一键收藏、固定、关闭
> - **重复标签提示**：同 URL 多开会显示徽章，点一下批量关掉重复
> - **🌙 / ☀️ 深浅模式**（右上角）
> - **Export / Import**：把收藏、分组、待办、Hero 文案、头像和主题导出为 JSON，迁移到其他 Chrome profile 时再导入
> - **右键任意网页**就能加进收藏
> - **完全本地运行**：无服务器、无账号、不上传数据
>
> 是个纯 Chrome 扩展，安装大概 1 分钟。

---

## Step 1 — 打开本地项目

```bash
cd /Users/yichenlin/Desktop/App/Browser_Organizer
```

---

## Step 2 — 安装到 Chrome（用户手动那部分尽量简化）

**第 1 步**：打印 `extension/` 文件夹的绝对路径

```bash
echo "Extension folder: $(cd extension && pwd)"
```

**第 2 步**：把路径复制到剪贴板

- macOS：`cd extension && pwd | pbcopy && echo "✓ Path copied to clipboard"`
- Linux：`cd extension && pwd | xclip -selection clipboard 2>/dev/null || echo "Path: $(pwd)"`
- Windows：`cd extension && echo %CD% | clip`

**第 3 步**：打开 Chrome 扩展页

```bash
open "chrome://extensions"
```

**第 4 步**：把剩下的步骤念给用户：

> 路径已经复制到你的剪贴板了。接下来你需要手动操作：
>
> 1. Chrome 扩展页面**右上角**有个「**开发者模式**」开关，打开它。
> 2. 开发者模式打开后，左上角会出现「**加载已解压的扩展程序**」按钮，点它。
> 3. 系统弹出文件选择器。**Mac 按 Cmd+Shift+G**（Windows/Linux 按 Ctrl+L）打开「前往文件夹」输入框，**粘贴**剪贴板里的路径（Cmd+V / Ctrl+V），回车。
> 4. 点「**选择**」或「**打开**」即可装好。
>
> 装完应该能在扩展列表里看到「Browser Organizer」。

**第 5 步（兜底）**：用文件管理器直接打开 extension 文件夹，方便用户自己拖拽

- macOS：`open extension/`
- Linux：`xdg-open extension/`
- Windows：`explorer extension\\`

---

## Step 3 — 带用户简单转一圈

装好后：

> 全部搞定！打开一个新标签页，就会看到 Browser Organizer。
>
> 简单逛一下：
> 1. **左半屏：长期收藏**——可以点 + 加新链接，拖拽改位置，悬停 ⋯ 菜单可编辑/删除
> 2. **右半屏：当前打开的标签**——按域名自动分组
>    - 顶部「Pinned」是你 Chrome 里固定的标签
>    - 下方「Open tabs」是其他普通标签
> 3. **每张 chip 上的小按钮**：⭐ 加收藏、📌 固定、✕ 关闭
> 4. **重复标签的「重复 x N」徽章**：悬停变「关闭重复」按钮
> 5. **右上角**：🌙/☀️ 切换主题、Export / Import 备份迁移
> 6. **右侧 Chrome Profile**：查看这个 profile 原本的 Bookmarks 和 Reading List
> 7. **右键任意网页**：菜单里有「Add page to Browser Organizer favorites」
>
> 没有需要配的东西，开箱即用。

---

## Key Facts（给 agent 自己参考）

- 纯 Chrome 扩展（Manifest V3），无服务器、无 Node.js、无 npm、无构建
- 所有用户数据保存在 `chrome.storage.local`，不使用 Chrome 账号、OAuth、`chrome.identity` 或 `chrome.storage.sync` 做同步；新版启动时只会清理旧版本留下的 sync mirror keys
- Chrome 的不同 profile 拥有彼此独立的 `chrome.storage.local`；跨 profile / 跨设备迁移走右上角 JSON Export / Import：`favorites / favoriteSections / todos / heroCopy / profileImageDataUrl / theme`
- 收藏卡片里已经缓存成 `data:image` 的 favicon 快照会跟随 Export / Import；还没缓存成功的 favicon 会在新 profile 里重新抓取/解析
- 权限：`tabs / activeTab / storage / contextMenus / favicon / bookmarks / readingList` + `<all_urls>` host 权限（用于二进制 favicon 缓存和显示 profile 原生书签/阅读列表）
- 收藏数量无上限，列超出视口高度自动出现细滚动条
- 更新方式：本地修改后，到 `chrome://extensions` 找到 Browser Organizer 点重新加载
- 当前项目按本地独立项目使用，git 不配置远端；历史来源是 [zarazhangrui/tab-out](https://github.com/zarazhangrui/tab-out)（致谢 Zara）
