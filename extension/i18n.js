/* ----------------------------------------------------------------
   I18N — String table with simple t() lookup

   Values can be strings or functions (for pluralization / interpolation).
   Add a key once in both languages. Missing keys fall back to English.
   ---------------------------------------------------------------- */
const STRINGS = {
  en: {
    favorites: "Favorites",
    add: "Add",
    save: "Save",
    cancel: "Cancel",
    confirmOk: "Confirm",
    uploadLogo: "Upload logo (or paste image)",
    reset: "Reset",
    auto: "Auto",
    urlLabel: "URL",
    titleLabel: "Title",
    titlePlaceholder: "Title (optional)",
    favoritesEmpty:
      "No favorites yet. Hit + to pin a site, or star any tab on the right.",
    addAFavorite: "Add a favorite",
    addSection: "Section",
    sectionLabel: "Section",
    addSectionPrompt: "New section name",
    renameSectionPrompt: "Rename section",
    sectionAdded: "Section added",
    sectionRenamed: "Section renamed",
    edit: "Edit",
    remove: "Remove",
    moreActions: "More",
    rightNow: "Right now",
    openTabs: "Open tabs",
    pinned: "Pinned",
    nTabsCount: (n) => `${n} tab${n !== 1 ? "s" : ""}`,
    homepages: "Homepages",
    nDomains: (n) => `${n} domain${n !== 1 ? "s" : ""}`,
    nTabsOpen: (n) => `${n} tab${n !== 1 ? "s" : ""} open`,
    dupeBadge: (n) => `duplicate x ${n}`,
    closeAllN: (n) => `Close all ${n} tab${n !== 1 ? "s" : ""}`,
    closeDupes: "Close duplicates",
    plusN: (n) => `+${n} more`,
    statTabs: "Open tabs",
    addToFav: "Add to favorites",
    removeFromFav: "Remove from favorites",
    pinTip: "Pin tab",
    unpinTip: "Unpin tab",
    closeThisTab: "Close this tab",
    nWolfyTabsOpen: "Browser Organizer tabs open",
    keepOne: "Keep one",
    addedToFavorites: "Added to favorites",
    removedFromFavorites: "Removed from favorites",
    confirmRemoveFav: "Remove this from favorites?",
    alreadyAdded: "Already in favorites",
    saveFailed: "Save failed (storage may be full)",
    favoriteUpdated: "Favorite updated",
    tabClosed: "Tab closed",
    allTabsClosed: "All tabs closed. Fresh start.",
    closedExtras: "Closed duplicate Browser Organizer tabs",
    closedDupes: "Closed duplicate tabs",
    noDupes: "All clean — no duplicates",
    reviewDupes: "Review Duplicates",
    nDuplicateTabsFound: (n) => `${n} duplicate tab${n !== 1 ? "s" : ""} found`,
    cleanupHint: "You're running lean",
    todoPlaceholder: "Add a new task...",
    todoEmpty: "Nothing here yet. What's your next move?",
    todoAdded: "Task added",
    todoDone: "Task completed",
    plannerEyebrow: "Daily planner",
    plannerToday: "Today",
    plannerSelectedDay: "Selected day",
    plannerDayTasks: (n) => `${n} task${n !== 1 ? "s" : ""}`,
    plannerNoTasks: "A blank canvas. Plan something great.",
    plannerAddForDay: "Add task for selected day...",
    plannerRangeError: "You can only plan within the next 365 days.",
    profileUpdated: "Profile image updated",
    exportData: "Export",
    importData: "Import",
    exportDone: "Backup exported",
    importDone: "Backup imported",
    importFailed:
      "Import failed. Please choose a valid Browser Organizer JSON backup.",
    confirmImport:
      "Importing this backup will replace your saved favorites, sections, daily planner tasks, hero note, profile image, theme, and language setting on this browser. Continue?",
    heroTitleUpdated: "Hero title updated",
    heroCopyUpdated: "Hero note updated",
    heroCopyEditHint: "Double-click to edit",
    newTab: "New Tab",
    profileLibraryEyebrow: "Chrome profile",
    profileLibraryTitle: "Bookmarks & Lists",
    profileBookmarks: "Bookmarks",
    profileReadingList: "Reading List",
    profileCollapseAll: "Collapse all",
    profileExpandAll: "Expand all",
    profileLibraryManagerTitle: "Open Chrome Bookmark Manager",
    profileBookmarksEmpty: "No bookmarks in this profile yet.",
    profileReadingEmpty: "Reading list is empty — find something inspiring.",
    profileBookmarksUnavailable: "Allow the bookmarks permission, then reload.",
    profileReadingUnavailable:
      "Reading List is not available in this Chrome version.",
    profileMoreItems: (n) => `${n} more in Chrome`,
    profileViewAll: (n) => `View all ${n}`,
    profileRead: "Read",
    profileUnread: "Unread",
    bookmarkManagerUnavailable: "Open chrome://bookmarks from the address bar.",
    closedNFromX: (n, name) =>
      `Closed ${n} tab${n !== 1 ? "s" : ""} from ${name}`,
    tabs: "tabs",
    langToggle: "中",
    emptyStateTitle: "Zero tabs. Total clarity.",
    emptyStateSubtitle: "Nothing open, nothing pending.",
    unsafeUrl: "URL not allowed (unsafe scheme).",
    importTooBig: "File is too large to import.",
  },
  zh: {
    favorites: "收藏",
    add: "添加",
    save: "保存",
    cancel: "取消",
    confirmOk: "确定",
    uploadLogo: "上传图标（或粘贴图片）",
    reset: "重置",
    auto: "自动",
    urlLabel: "网址",
    titleLabel: "标题",
    titlePlaceholder: "标题（可选）",
    favoritesEmpty: "还没有收藏。点击 + 添加链接，或在右侧给标签页标星。",
    addAFavorite: "添加收藏",
    addSection: "分组",
    sectionLabel: "分组",
    addSectionPrompt: "新分组名称",
    renameSectionPrompt: "重命名分组",
    sectionAdded: "已添加分组",
    sectionRenamed: "分组已重命名",
    edit: "编辑",
    remove: "删除",
    moreActions: "更多",
    rightNow: "正在打开",
    openTabs: "当前标签",
    pinned: "已固定",
    nTabsCount: (n) => `${n} 个标签`,
    homepages: "主页",
    nDomains: (n) => `${n} 个域名`,
    nTabsOpen: (n) => `已打开 ${n} 个`,
    dupeBadge: (n) => `重复 x ${n}`,
    closeAllN: (n) => `关闭全部 ${n} 个`,
    closeDupes: "关闭重复",
    plusN: (n) => `还有 ${n} 个`,
    statTabs: "已打开",
    addToFav: "加入收藏",
    removeFromFav: "移除收藏",
    pinTip: "固定此标签",
    unpinTip: "取消固定",
    closeThisTab: "关闭此标签",
    nWolfyTabsOpen: "个 Browser Organizer 标签页",
    keepOne: "只保留一个",
    addedToFavorites: "已加入收藏",
    removedFromFavorites: "已从收藏移除",
    confirmRemoveFav: "确定要取消收藏此网址吗？",
    alreadyAdded: "已经收藏过了",
    saveFailed: "保存失败（存储可能已满）",
    favoriteUpdated: "收藏已更新",
    tabClosed: "标签已关闭",
    allTabsClosed: "所有标签已关闭。重新开始。",
    closedExtras: "已关闭重复的 Browser Organizer",
    closedDupes: "已关闭重复的标签页",
    noDupes: "干干净净，没有重复",
    reviewDupes: "查看重复",
    nDuplicateTabsFound: (n) => `发现 ${n} 个重复标签`,
    cleanupHint: "轻装上阵",
    todoPlaceholder: "添加一个新任务...",
    todoEmpty: "还没有任务。先写下一件小事。",
    todoAdded: "任务已添加",
    todoDone: "任务已完成",
    plannerEyebrow: "每日规划",
    plannerToday: "今天",
    plannerSelectedDay: "已选日期",
    plannerDayTasks: (n) => `${n} 个任务`,
    plannerNoTasks: "空白画布，计划点什么吧。",
    plannerAddForDay: "为选中日期添加任务...",
    plannerRangeError: "只能计划从今天起 365 天内的任务。",
    profileUpdated: "头像已更新",
    exportData: "导出",
    importData: "导入",
    exportDone: "备份已导出",
    importDone: "备份已导入",
    importFailed: "导入失败。请选择有效的 Browser Organizer JSON 备份。",
    confirmImport:
      "导入这个备份会替换此浏览器当前保存的收藏、分组、Daily Planner 任务、Hero 文案、头像、主题和语言设置。继续吗？",
    heroTitleUpdated: "Hero 标题已更新",
    heroCopyUpdated: "Hero 文案已更新",
    heroCopyEditHint: "双击编辑",
    newTab: "新标签",
    profileLibraryEyebrow: "Chrome 资料",
    profileLibraryTitle: "书签与列表",
    profileBookmarks: "书签",
    profileReadingList: "阅读清单",
    profileCollapseAll: "全部收起",
    profileExpandAll: "全部展开",
    profileLibraryManagerTitle: "打开 Chrome 书签管理器",
    profileBookmarksEmpty: "这个 Profile 还没有书签。",
    profileReadingEmpty: "阅读清单为空 — 去发现有趣的内容。",
    profileBookmarksUnavailable: "允许 bookmarks 权限后重新加载。",
    profileReadingUnavailable: "这个 Chrome 版本没有开放 Reading List。",
    profileMoreItems: (n) => `Chrome 里还有 ${n} 项`,
    profileViewAll: (n) => `查看全部 ${n} 项`,
    profileRead: "已读",
    profileUnread: "未读",
    bookmarkManagerUnavailable: "请从地址栏打开 chrome://bookmarks。",
    closedNFromX: (n, name) => `已从 ${name} 关闭 ${n} 个标签`,
    tabs: "个",
    langToggle: "EN",
    emptyStateTitle: "标签清零，清爽开始。",
    emptyStateSubtitle: "你自由了。",
    unsafeUrl: "不允许此类 URL（不安全的协议）。",
    importTooBig: "文件过大，无法导入。",
  },
};

let currentLang = "en";

function t(key, ...args) {
  const v =
    (STRINGS[currentLang] && STRINGS[currentLang][key]) ??
    STRINGS.en[key] ??
    key;
  return typeof v === "function" ? v(...args) : v;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadLang() {
  try {
    const lang = await TabHomeStorage.getLang();
    if (lang === "zh" || lang === "en") currentLang = lang;
  } catch {}
}

async function saveLang(lang) {
  if (lang !== "zh" && lang !== "en") return;
  currentLang = lang;
  try {
    await TabHomeStorage.setLang(lang);
  } catch {}
}
