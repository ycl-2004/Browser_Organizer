# Browser Organizer

> A calm, local-first Chrome new tab page that replaces the default blank tab with a personal dashboard.

**Browser Organizer** turns every new tab into a clean workspace: long-term favorites on the left, a focus area with daily planner in the center, and a live view of all your open tabs on the right. Everything runs locally inside Chrome — no server, no account, no data leaves your machine.

Forked from [tab-out](https://github.com/zarazhangrui/tab-out) by [Zara](https://x.com/zarazhangrui).

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Usage Guide](#usage-guide)
- [Default Configuration](#default-configuration)
- [Architecture](#architecture)
- [Data Schema](#data-schema)
- [Customization](#customization)
- [Updating](#updating)
- [License](#license)

---

## Features

### Favorites (Left Column)

| Feature                 | Description                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unlimited bookmarks** | Organize into named sections; sections can be created, renamed, reordered, deleted, and collapsed                                                                            |
| **Auto favicon**        | Fetches `apple-touch-icon.png` first, falls back to Chrome's cached favicon, then binary-caches the icon as base64 in local storage — zero network requests after first load |
| **Custom logo**         | Upload an image or paste from clipboard (`Cmd+V`); auto-compressed to 256×256                                                                                                |
| **Smart naming**        | Leave title blank → auto-extracts brand name from URL (`www.notion.so` → `Notion`)                                                                                           |
| **Drag & drop**         | Reorder cards within a section by dragging                                                                                                                                   |
| **Hover menu**          | `⋯` button appears on hover → edit or delete                                                                                                                                 |
| **Right-click to add**  | Right-click any page or link → "Add to Browser Organizer favorites"                                                                                                          |

### Focus Area (Center Column)

| Feature                            | Description                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Time-of-day greeting**           | Auto-switches between Good morning / Good afternoon / Good evening / Good night                                               |
| **Editable hero title & subtitle** | Double-click to edit; persists locally and exports with JSON backup                                                           |
| **Today Task**                     | Quick-add tasks for today; check off or delete; drag to reorder; tag with Work / Projects / Personal / Design                 |
| **Daily Planner**                  | Month calendar view; click any date to view/add tasks; badge shows task count per day; supports planning up to 365 days ahead |
| **Recurring tasks**                | When adding a task, choose Once / Daily / Weekdays / Weekly; recurring tasks are generated for all matching dates             |
| **Overdue carry-forward**          | Undone past tasks auto-move to today with an "OVERDUE" badge; completed past tasks are silently cleaned up                    |
| **Profile avatar**                 | Upload a local image; compressed and stored in `chrome.storage.local`                                                         |
| **Weather & location**             | Shows local weather via Open-Meteo (free, no API key); auto-detects city via IP geolocation                                   |

### Open Tabs (Right Column)

| Feature                 | Description                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| **Domain grouping**     | Tabs auto-grouped into cards by domain; each card is collapsible                                    |
| **Status grouping**     | Toggle to "Status" view to see tabs grouped as Important / Later / Active                           |
| **Pinned tabs**         | Displayed in a separate section above regular tabs                                                  |
| **Tab status tags**     | Mark any tab as **Later** (clock icon) or **Important** (flag icon); pills shown inline on the chip |
| **Per-tab actions**     | Each chip has: ⭐ favorite, 📌 pin/unpin, 📋 add to daily tasks, ✕ close                            |
| **Tab → Task**          | One-click button on each tab chip creates a Daily Planner task with that tab's title                |
| **Duplicate detection** | Badge shows `Dupe ×N`; click to close all extras                                                    |
| **Active sorting**      | Most recently visited domain group floats to top                                                    |
| **Live sync**           | Tab open/close/switch in other windows auto-refreshes here (debounced 150ms)                        |
| **Toolbar badge**       | Extension icon shows real tab count; color changes green → amber → red                              |
| **Smart cleanup**       | Panel at bottom shows duplicate count and status; hidden when no tabs are open                      |
| **Empty state**         | When all tabs are closed, shows a friendly "All clean" message instead of empty lists               |
| **Self-filtering**      | Browser Organizer's own tab is automatically hidden from the open tabs display                      |

### Batch Operations

| Feature                 | Description                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **Select mode**         | Click "Select" to enter batch mode; checkboxes appear on every tab chip                        |
| **Click to toggle**     | Click any chip or its checkbox to select/deselect                                              |
| **Floating action bar** | Shows count of selected tabs + action buttons                                                  |
| **Batch actions**       | Mark selected as Later / Important, add all to Daily Planner tasks, or close all selected tabs |
| **Context-aware save**  | "+ Save All" button changes to "+ Save N tabs" when tabs are selected                          |

### Saved Sessions

| Feature             | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| **Save session**    | Save all open tabs (or only batch-selected tabs) as a named session       |
| **Rename**          | Click any session name to rename inline (Enter to confirm, Esc to cancel) |
| **Preview**         | Click a session row to expand and see all tabs with favicons              |
| **Restore**         | "Open" button restores all session tabs in background                     |
| **Delete**          | Permanent local deletion (no undo)                                        |
| **Scrollable list** | Auto-scrolls when you have many saved sessions                            |

### Top Bar

| Feature                 | Description                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| **Command bar**         | Type a URL to navigate, or search terms to Google search; supports `localhost:3000` auto-protocol |
| **Google Suggest**      | Autocomplete suggestions from Google as you type (proxied through service worker to bypass CSP)   |
| **+ New Tab**           | Opens a new Chrome tab                                                                            |
| **Export / Import**     | Full JSON backup of favorites, sections, tasks, hero text, avatar, theme, language                |
| **Duplicate tab alert** | Banner appears when multiple Browser Organizer tabs are open; one-click to close extras           |
| **Theme toggle**        | 6 themes: Light, Dark, Pink, Lavender, Sky, Sand                                                  |
| **Language toggle**     | English ↔ 中文                                                                                    |

---

## Installation

### Prerequisites

- **Google Chrome** (or any Chromium-based browser like Edge, Brave, Arc)
- No Node.js, npm, or build step required

### Option A: Automated (via coding agent)

If you use a coding agent (Claude Code, Cursor, Codex, etc.), point it at this repo and say "install this". It will:

1. Copy the `extension/` path to your clipboard
2. Open `chrome://extensions`
3. Walk you through the 3 manual clicks

### Option B: Manual Install

**Step 1** — Clone or download this repo

```bash
git clone https://github.com/user/Browser_Organizer.git
```

**Step 2** — Open Chrome Extensions page

Navigate to `chrome://extensions` in your browser.

**Step 3** — Enable Developer Mode

Toggle the **Developer mode** switch in the top-right corner.

**Step 4** — Load the extension

1. Click **"Load unpacked"** (top-left)
2. In the file picker, navigate to the `extension/` folder inside this project
   - **Mac**: Press `Cmd+Shift+G` to type a path directly
   - **Windows/Linux**: Press `Ctrl+L` in the file picker
3. Click **"Select"** / **"Open"**

**Step 5** — Done!

Open a new tab (`Cmd+T` / `Ctrl+T`). You'll see Browser Organizer.

---

## Getting Started

When you first open Browser Organizer, you'll see a clean dashboard with three columns:

```
┌──────────────┬────────────────────────┬──────────────────┐
│  FAVORITES   │     FOCUS AREA         │   OPEN TABS      │
│              │                        │                  │
│  (empty —    │  ✨ Good evening       │  Grouped by      │
│   add your   │                        │  domain          │
│   first!)    │  "Stay focused,        │                  │
│              │   ship better things." │  [Domain] [Status]│
│  [ + Add ]   │                        │  [Select]        │
│              │  ┌─ Today Task ──────┐ │                  │
│              │  │  (empty)          │ │  ┌─ GITHUB ────┐ │
│              │  └───────────────────┘ │  │  repo-name   │ │
│              │                        │  └──────────────┘ │
│              │  ┌─ Daily Planner ──┐  │                  │
│              │  │  May 2026        │  │  SAVED SESSIONS  │
│              │  │  [calendar grid] │  │  [+ Save All]    │
│              │  └───────────────────┘ │                  │
└──────────────┴────────────────────────┴──────────────────┘
```

### Quick Tour

1. **Add your first favorite** — Click the `+` button in the left column, paste a URL, and hit save. The favicon is fetched automatically.

2. **Organize with sections** — Click "Section" to create groups like "Work", "Social", "Dev Tools". Drag favorites to reorder.

3. **Manage open tabs** — The right column shows all your open tabs grouped by domain. Hover any tab to see action buttons.

4. **Mark tabs for later** — Hover a tab chip → click the clock icon (Later) or flag icon (Important). Tags persist across refreshes.

5. **Batch operations** — Click "Select" in the tab header, check multiple tabs, then use the floating bar to close, mark, or save them.

6. **Save a session** — Click "+ Save All" to snapshot your current tabs. Click a saved session to preview its contents.

7. **Plan your day** — Add tasks in the Today Task panel. Use the calendar to plan ahead up to a year.

8. **Add tabs as tasks** — Click the 📋 button on any tab chip to instantly create a planner task from that tab.

9. **Customize your motto** — Double-click the hero title or subtitle to write your own.

10. **Switch themes** — Click the theme dot (top-right) to cycle through 6 color schemes.

---

## Usage Guide

### Favorites

- **Add**: Click `+` → enter URL → save (title auto-fills from URL)
- **Edit**: Hover a favorite → click `⋯` → Edit
- **Delete**: Hover → `⋯` → Delete
- **Custom icon**: In the edit dialog, upload or `Cmd+V` paste an image
- **Reorder**: Drag cards within a section
- **Sections**: "Section" button to create; click section name to rename; arrows to reorder; collapse/expand; delete (favorites move to default section)

### Tab Status Tags

- **Later** (clock icon): Marks a tab you want to come back to — visual reminder
- **Important** (flag icon): Marks a high-priority tab
- Tags appear as colored pills (blue for Later, red for Important)
- Tags persist in `chrome.storage.local` even across browser restarts

### View Toggles

- **Domain view** (default): Tabs grouped by website domain
- **Status view**: Tabs grouped by Important → Later → Active
- Toggle between views using the `[Domain] [Status]` buttons

### Batch Mode

1. Click **"Select"** to enter batch mode
2. Click tabs or checkboxes to select them
3. The floating bar shows: `N selected` + `Later` / `Important` / `+ Tasks` / `Close`
4. The "+ Save All" button in Saved Sessions updates to "+ Save N tabs"
5. Click **"Done"** to exit batch mode

### Saved Sessions

- **Save**: Click "+ Save All" (saves all open tabs) or select specific tabs first
- **Preview**: Click the session row → expands to show all tabs with favicons
- **Rename**: Click the session name → type new name → Enter
- **Restore**: Click "Open" → all session tabs open in background
- **Delete**: Click `✕` → permanently deleted (no undo, no trash)

### Daily Planner

- **Add task**: Type in the input field at the bottom, choose a tag and repeat frequency, press Enter or click `+`
- **Repeat**: Choose Once (default), Daily, Weekdays, or Weekly — recurring tasks are auto-generated for all matching dates
- **Tags**: Work, Projects, Personal, Design (auto-assigned when adding from tab)
- **Reorder**: Drag tasks by the handle (⠿) to rearrange; order persists
- **Complete**: Click the checkbox to mark done
- **Delete**: Click the `✕` next to a task
- **Overdue**: Past undone tasks automatically move to today with an "OVERDUE" badge; completed past tasks are cleaned up
- **Calendar**: Click any date to view/add tasks for that day; dates with tasks show a count badge

### Command Bar

- Type a URL (e.g., `github.com`) → navigates directly (auto-adds `https://`)
- Type a search query → Google search
- Supports `localhost:3000`, IP addresses, etc.
- Google Suggest autocomplete as you type

### Export / Import

- **Export**: Click "Export" → downloads a `.json` file containing:
  - Favorites + cached icons
  - Sections
  - Daily tasks
  - Hero title & subtitle
  - Profile avatar
  - Theme & language
- **Import**: Click "Import" → select a JSON file → confirms before overwriting

### Right-Click Menu

On any webpage:

- **Right-click the page** → "Add page to Browser Organizer favorites"
- **Right-click a link** → "Add link to Browser Organizer favorites"

---

## Default Configuration

When a new user installs Browser Organizer, these are the defaults:

| Setting            | Default (EN)                                                                                        | Default (ZH)                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Hero title**     | "Stay focused, ship better things."                                                                 | "保持专注，把更好的东西做出来。"                                         |
| **Hero subtitle**  | "A calm command center for the tabs you need, the links you trust, and the next thing worth doing." | "一个安静的控制台，放下你需要的标签、信任的链接，以及下一件值得做的事。" |
| **Theme**          | `light` (warm off-white)                                                                            |                                                                          |
| **Language**       | `en` (English)                                                                                      |                                                                          |
| **Tab view**       | Domain (grouped by website)                                                                         |                                                                          |
| **Favorites**      | Empty                                                                                               |                                                                          |
| **Tasks**          | Empty                                                                                               |                                                                          |
| **Saved sessions** | Empty                                                                                               |                                                                          |

All data starts empty. The extension is ready to use immediately — no setup, no sign-in.

---

## Architecture

```
extension/
├── manifest.json      # Chrome MV3 manifest
├── index.html         # New tab page (single HTML file)
├── app.js             # All application logic (~5500 lines)
├── style.css          # All styles (~4000 lines)
├── storage.js         # Storage abstraction layer (chrome.storage.local)
├── background.js      # Service worker: badge count, right-click menu, Google Suggest proxy
├── config.local.js    # Optional local overrides (gitignored)
└── icons/             # Extension icons
```

### How It Works

```
Open new tab
  → index.html loads
  → app.js initializes:
      1. Load theme, language, user data from chrome.storage.local
      2. Render favorites column (left)
      3. Render hero + today task + daily planner (center)
      4. Query chrome.tabs API → render open tabs (right)
      5. Render saved sessions
  → Live listeners:
      - chrome.tabs.onCreated / onRemoved / onUpdated → re-render tabs (debounced 150ms)
      - chrome.storage.onChanged → re-render affected sections
```

### Tech Stack

| Layer            | Technology                                                  |
| ---------------- | ----------------------------------------------------------- |
| Extension format | Chrome Manifest V3                                          |
| Data storage     | `chrome.storage.local` + JSON Export/Import                 |
| Tab management   | `chrome.tabs` API (direct, no abstraction)                  |
| Favicon caching  | `apple-touch-icon` fallback chain → base64 `data:image`     |
| Sound effects    | Web Audio API (synthesized, no audio files)                 |
| Animations       | CSS transitions + `requestAnimationFrame` particles         |
| Font             | DM Sans (Google Fonts CDN)                                  |
| Localization     | Built-in i18n string table (EN / ZH)                        |
| Background tasks | Service worker maintains toolbar badge + context menus      |
| Weather          | Open-Meteo API (free, no key) + IP geolocation              |
| Search suggest   | Google Suggest API (proxied through service worker for CSP) |

**Zero npm. Zero build step. Zero external dependencies** (except Google Fonts CDN for the typeface). Clone → load `extension/` → done.

---

## Data Schema

All data is stored in `chrome.storage.local`. Each Chrome profile has its own independent storage.

| Key                   | Type     | Description                                                                                  |
| --------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `favorites`           | `Array`  | Bookmarks. Each: `{ id, url, title, slot, sectionId, sectionSlot, iconUrl?, customLogo? }`   |
| `favoriteSections`    | `Array`  | Sections. Each: `{ id, name, order, collapsed }`                                             |
| `dailyTasks`          | `Array`  | Tasks. Each: `{ id, title, tag, date, done, createdAt, updatedAt, overdue?, originalDate? }` |
| `tabStatuses`         | `Object` | Map of `{ [url]: "later" \| "important" }` — persists tab status tags                        |
| `savedSessions`       | `Array`  | Sessions. Each: `{ id, name, createdAt, tabs: [{ url, title }] }`                            |
| `heroTitle`           | `String` | Custom hero title (empty = use default)                                                      |
| `heroCopy`            | `String` | Custom hero subtitle (empty = use default)                                                   |
| `theme`               | `String` | `"light"` / `"dark"` / `"pink"` / `"lavender"` / `"sky"` / `"sand"`                          |
| `lang`                | `String` | `"en"` or `"zh"`                                                                             |
| `profileImageDataUrl` | `String` | Avatar as base64 data URL                                                                    |

### Privacy

- **No server** — all data stays in `chrome.storage.local`
- **No account** — no sign-in, no OAuth, no `chrome.identity`
- **No sync** — data does not use `chrome.storage.sync`; cross-profile migration uses manual JSON Export/Import
- **No tracking** — no analytics, no telemetry
- Weather uses free Open-Meteo API (no API key); IP geolocation uses ipapi.co / geojs.io for city detection only

---

## Customization

### Themes

6 built-in themes, toggled from the dot icon in the top-right corner:

- **Light** — Warm off-white (default)
- **Dark** — Deep charcoal
- **Pink** — Soft rose
- **Lavender** — Muted purple
- **Sky** — Clean blue
- **Sand** — Warm tan

### Language

Click the language button (`中` / `EN`) in the top bar to toggle between English and Chinese.

### Local Config

`extension/config.local.js` (gitignored) can hold personal overrides, for example custom URL grouping rules. See `LOCAL_LANDING_PAGE_PATTERNS` and `LOCAL_CUSTOM_GROUPS` in the source code.

---

## Updating

After making local code changes:

1. Go to `chrome://extensions`
2. Find **Browser Organizer**
3. Click the **reload** icon (↻)

Your data is preserved — only the code is reloaded.

---

## License

MIT

---

Browser Organizer · forked from [tab-out](https://github.com/zarazhangrui/tab-out) by [Zara](https://x.com/zarazhangrui)
