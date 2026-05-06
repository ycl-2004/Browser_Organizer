/* ----------------------------------------------------------------
   DAILY PLANNER + PROFILE — local-only planning data
   ---------------------------------------------------------------- */

let collapsedBookmarkFolders = new Set();
let expandedBookmarkFolders = new Set();
let dailyTasks = [];
let selectedPlannerDate; // initialized after toLocalDateKey is defined
let visiblePlannerMonth; // initialized after startOfMonth is defined

function toLocalDateKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateKey(key) {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(String(key || ""));
  if (!match) return new Date();
  const [year, month, day] = String(key).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Now that the helpers are defined, initialize the deferred variables
selectedPlannerDate = toLocalDateKey(new Date());
visiblePlannerMonth = startOfMonth(new Date());

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getPlannerMaxDateKey() {
  return toLocalDateKey(addDays(new Date(), PLANNER_MAX_DAYS_AHEAD));
}

function isDateInPlannerRange(dateKey) {
  const todayKey = toLocalDateKey(new Date());
  const maxKey = getPlannerMaxDateKey();
  return dateKey >= todayKey && dateKey <= maxKey;
}

function compareIsoDesc(a, b) {
  return String(b || "").localeCompare(String(a || ""));
}

function compareDailyTasks(a, b) {
  if (!!a.done !== !!b.done) return a.done ? 1 : -1;
  if (String(a.date || "") !== String(b.date || "")) {
    return String(a.date || "").localeCompare(String(b.date || ""));
  }
  const updatedCompare = compareIsoDesc(a.updatedAt, b.updatedAt);
  if (updatedCompare !== 0) return updatedCompare;
  return compareIsoDesc(a.createdAt, b.createdAt);
}

function sortDailyTasks(tasks) {
  return [...tasks].sort(compareDailyTasks);
}

async function getLegacyTodos() {
  const { todos = [] } = await chrome.storage.local.get("todos");
  return Array.isArray(todos)
    ? todos.filter(
        (todo) =>
          todo &&
          typeof todo === "object" &&
          typeof todo.text === "string" &&
          todo.text.trim(),
      )
    : [];
}

function mapLegacyTodoToDailyTask(todo, dateKey) {
  const createdAt =
    typeof todo.createdAt === "number" && todo.createdAt > 0
      ? new Date(todo.createdAt).toISOString()
      : new Date().toISOString();

  return {
    id: typeof todo.id === "string" && todo.id ? todo.id : makeId("task"),
    title: todo.text.trim(),
    tag:
      typeof todo.tag === "string" && todo.tag.trim()
        ? todo.tag.trim()
        : "Work",
    date: dateKey,
    done: false,
    createdAt,
    updatedAt: createdAt,
  };
}

async function migrateLegacyTodosToDailyTasks() {
  if (dailyTasks.length > 0) return false;

  const legacyTodos = await getLegacyTodos();
  if (!legacyTodos.length) return false;

  const todayKey = toLocalDateKey(new Date());
  dailyTasks = await TabHomeStorage.setDailyTasks(
    legacyTodos.map((todo) => mapLegacyTodoToDailyTask(todo, todayKey)),
  );

  try {
    await chrome.storage.local.remove("todos");
  } catch {}

  return true;
}

function ensurePlannerSelection() {
  const today = new Date();
  const minMonth = startOfMonth(today);
  const maxMonth = startOfMonth(parseLocalDateKey(getPlannerMaxDateKey()));

  if (!isDateInPlannerRange(selectedPlannerDate)) {
    selectedPlannerDate = toLocalDateKey(today);
  }

  if (
    !(visiblePlannerMonth instanceof Date) ||
    Number.isNaN(visiblePlannerMonth.getTime())
  ) {
    visiblePlannerMonth = startOfMonth(parseLocalDateKey(selectedPlannerDate));
  }

  if (visiblePlannerMonth.getTime() < minMonth.getTime()) {
    visiblePlannerMonth = minMonth;
  }
  if (visiblePlannerMonth.getTime() > maxMonth.getTime()) {
    visiblePlannerMonth = maxMonth;
  }
}

async function pruneExpiredDailyTasks() {
  const todayKey = toLocalDateKey(new Date());
  const maxKey = getPlannerMaxDateKey();
  const todayStart = new Date(todayKey + "T00:00:00").toISOString();
  let changed = false;

  const kept = [];
  for (const task of dailyTasks) {
    if (task.date > maxKey) continue; // beyond planner range — drop

    // Done tasks completed before today → delete (隔天就删)
    if (task.done && task.updatedAt && task.updatedAt < todayStart) {
      changed = true;
      continue;
    }

    if (task.date < todayKey) {
      if (task.done) {
        changed = true;
        continue;
      } // done & past — drop
      // undone & past — carry forward to today
      task.originalDate = task.originalDate || task.date;
      task.overdue = true;
      task.date = todayKey;
      changed = true;
    }
    kept.push(task);
  }

  dailyTasks = sortDailyTasks(kept);
  if (changed) {
    dailyTasks = await TabHomeStorage.setDailyTasks(dailyTasks);
  }
}

async function loadDailyTasks() {
  dailyTasks = await TabHomeStorage.getDailyTasks();
  await migrateLegacyTodosToDailyTasks();
  await pruneExpiredDailyTasks();
  dailyTasks = sortDailyTasks(dailyTasks);
  ensurePlannerSelection();
}

async function persistDailyTasks({ skipSort = false } = {}) {
  if (!skipSort) dailyTasks = sortDailyTasks(dailyTasks);
  dailyTasks = await TabHomeStorage.setDailyTasks(dailyTasks);
}

function getTasksForDate(dateKey) {
  return dailyTasks.filter((task) => task.date === dateKey);
}

function getTodayTasks() {
  return getTasksForDate(toLocalDateKey(new Date()));
}

function renderDailyTaskRow(task) {
  const id = escapeHtml(task.id);
  const title = escapeHtml(task.title);
  const tag = escapeHtml(task.tag || "Work");
  const checked = task.done ? "checked" : "";
  const doneClass = task.done ? " is-done" : "";
  const overdueClass = task.overdue && !task.done ? " is-overdue" : "";
  const overdueBadge =
    task.overdue && !task.done
      ? `<span class="todo-overdue-badge">OVERDUE</span>`
      : "";
  const repeatBadge = task.repeatGroupId
    ? `<span class="todo-repeat-badge" title="Recurring task">↻</span>`
    : "";
  const repeatDeleteBtn = task.repeatGroupId
    ? `<button class="todo-delete-series" type="button" data-action="delete-repeat-group" data-task-id="${id}" aria-label="Delete all future in series" title="Delete all future">↻×</button>`
    : "";

  return `
    <div class="todo-item daily-task-row${doneClass}${overdueClass}" data-task-id="${id}" draggable="true">
      <span class="todo-drag-handle" title="Drag to reorder">⠿</span>
      <label class="todo-check-wrap" aria-label="${task.done ? "Done" : "Pending"}">
        <input type="checkbox" data-action="toggle-daily-task" data-task-id="${id}" ${checked}>
      </label>
      <span class="todo-title">${title}${repeatBadge}${overdueBadge}</span>
      <span class="todo-tag">${tag}</span>
      <span class="todo-actions">${repeatDeleteBtn}<button class="todo-delete" type="button" data-action="delete-daily-task" data-task-id="${id}" aria-label="Delete task">×</button></span>
    </div>
  `;
}

function renderTodayTasks() {
  const list = document.getElementById("todoList");
  const count = document.getElementById("todoCount");
  if (!list || !count) return;

  const todayTasks = getTodayTasks();
  const total = todayTasks.length;
  const done = todayTasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  count.innerHTML = `<div class="todo-progress">
    <div class="todo-progress-bar"><div class="todo-progress-fill" style="width:${pct}%"></div></div>
    <span class="todo-progress-text">${done} <span>/ ${total}</span></span>
  </div>`;

  if (!total) {
    count.innerHTML = "";
    list.innerHTML = `<div class="todo-empty">${t("todoEmpty")}</div>`;
    return;
  }

  list.innerHTML = todayTasks.map(renderDailyTaskRow).join("");
}

function renderCalendarGrid() {
  const grid = document.getElementById("calendarGrid");
  const label = document.getElementById("plannerMonthLabel");
  const prevBtn = document.querySelector('[data-action="planner-prev-month"]');
  const nextBtn = document.querySelector('[data-action="planner-next-month"]');
  const todayBtn = document.querySelector('[data-action="planner-today"]');
  if (!grid || !label) return;

  ensurePlannerSelection();

  const locale = currentLang === "zh" ? "zh-CN" : "en-US";
  const month = visiblePlannerMonth;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const todayKey = toLocalDateKey(new Date());

  label.textContent = month.toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  if (todayBtn) todayBtn.textContent = t("plannerToday");

  const minMonth = startOfMonth(new Date());
  const maxMonth = startOfMonth(parseLocalDateKey(getPlannerMaxDateKey()));
  if (prevBtn) prevBtn.disabled = month.getTime() <= minMonth.getTime();
  if (nextBtn) nextBtn.disabled = month.getTime() >= maxMonth.getTime();

  const weekdayLabels =
    currentLang === "zh"
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["M", "T", "W", "T", "F", "S", "S"];

  const taskCountByDate = new Map();
  dailyTasks.forEach((task) => {
    taskCountByDate.set(task.date, (taskCountByDate.get(task.date) || 0) + 1);
  });

  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = weekdayLabels.map(
    (day) => `<div class="calendar-weekday">${day}</div>`,
  );

  for (let i = 0; i < startOffset; i += 1) {
    cells.push('<div class="calendar-day is-empty"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day);
    const dateKey = toLocalDateKey(date);
    const selected = dateKey === selectedPlannerDate ? " is-selected" : "";
    const today = dateKey === todayKey ? " is-today" : "";
    const disabled = !isDateInPlannerRange(dateKey) ? "disabled" : "";
    const taskCount = taskCountByDate.get(dateKey) || 0;

    cells.push(`
      <button
        class="calendar-day${selected}${today}"
        type="button"
        data-action="select-planner-date"
        data-date="${dateKey}"
        ${disabled}
      >
        <span>${day}</span>
        ${taskCount ? `<small>${taskCount}</small>` : ""}
      </button>
    `);
  }

  grid.innerHTML = cells.join("");
}

function renderSelectedDayPanel() {
  const label = document.getElementById("selectedDateLabel");
  const count = document.getElementById("selectedDateCount");
  const list = document.getElementById("selectedDayTasks");
  if (!label || !count || !list) return;

  ensurePlannerSelection();

  const locale = currentLang === "zh" ? "zh-CN" : "en-US";
  const selectedDate = parseLocalDateKey(selectedPlannerDate);
  const tasks = getTasksForDate(selectedPlannerDate);

  label.textContent = selectedDate.toLocaleDateString(locale, {
    weekday: currentLang === "zh" ? "short" : "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  count.textContent = t("plannerDayTasks", tasks.length);

  if (!tasks.length) {
    list.innerHTML = `<div class="selected-day-empty">${t("plannerNoTasks")}</div>`;
    return;
  }

  list.innerHTML = tasks.map(renderDailyTaskRow).join("");
}

function renderDailyPlanner() {
  ensurePlannerSelection();
  renderTodayTasks();
  renderCalendarGrid();
  renderSelectedDayPanel();
}

async function addDailyTask(
  title,
  tag,
  dateKey,
  { repeatGroupId, skipRender } = {},
) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) return false;
  if (!isDateInPlannerRange(dateKey)) {
    showToast(t("plannerRangeError"));
    return false;
  }

  const now = new Date().toISOString();
  const task = {
    id: makeId("task"),
    title: cleanTitle,
    tag: tag || "Work",
    date: dateKey,
    done: false,
    createdAt: now,
    updatedAt: now,
  };
  if (repeatGroupId) task.repeatGroupId = repeatGroupId;
  dailyTasks.push(task);

  if (!skipRender) {
    await persistDailyTasks();
    renderDailyPlanner();
  }
  return true;
}

async function deleteRepeatGroupFuture(taskId) {
  const task = dailyTasks.find((t) => t.id === taskId);
  if (!task || !task.repeatGroupId) return false;
  const groupId = task.repeatGroupId;
  const todayKey = toLocalDateKey(new Date());
  const before = dailyTasks.length;
  dailyTasks = dailyTasks.filter(
    (t) => !(t.repeatGroupId === groupId && t.date >= todayKey),
  );
  if (dailyTasks.length === before) return false;
  await persistDailyTasks();
  renderDailyPlanner();
  return true;
}

async function toggleDailyTask(id) {
  const task = dailyTasks.find((item) => item.id === id);
  if (!task) return false;

  task.done = !task.done;
  task.updatedAt = new Date().toISOString();
  await persistDailyTasks();
  renderDailyPlanner();
  return task.done;
}

async function deleteDailyTask(id) {
  const next = dailyTasks.filter((task) => task.id !== id);
  if (next.length === dailyTasks.length) return false;
  dailyTasks = next;
  await persistDailyTasks();
  renderDailyPlanner();
  return true;
}

/* ---- Task drag-to-reorder ---- */
let _taskDragReorder = false;

function initTaskDragListeners(listEl) {
  if (!listEl) return;
  let dragId = null;

  listEl.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".daily-task-row");
    if (!row) return;
    dragId = row.dataset.taskId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
    requestAnimationFrame(() => row.classList.add("is-dragging"));
  });

  listEl.addEventListener("dragend", (e) => {
    const row = e.target.closest(".daily-task-row");
    if (row) row.classList.remove("is-dragging");
    listEl
      .querySelectorAll(".drag-over")
      .forEach((el) => el.classList.remove("drag-over"));
    dragId = null;
  });

  listEl.addEventListener("dragenter", (e) => {
    e.preventDefault();
  });

  listEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const row = e.target.closest(".daily-task-row");
    if (row && row.dataset.taskId !== dragId) {
      listEl
        .querySelectorAll(".drag-over")
        .forEach((el) => el.classList.remove("drag-over"));
      row.classList.add("drag-over");
    }
  });

  listEl.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".daily-task-row");
    if (row) row.classList.remove("drag-over");
  });

  listEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    const targetRow = e.target.closest(".daily-task-row");
    if (!targetRow || !dragId) return;
    const targetId = targetRow.dataset.taskId;
    if (targetId === dragId) return;

    const fromIdx = dailyTasks.findIndex((t) => t.id === dragId);
    const toIdx = dailyTasks.findIndex((t) => t.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    const [moved] = dailyTasks.splice(fromIdx, 1);
    dailyTasks.splice(toIdx, 0, moved);
    _taskDragReorder = true;
    await persistDailyTasks({ skipSort: true });
    renderDailyPlanner();
  });
}

// Initialize drag listeners once DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  initTaskDragListeners(document.getElementById("todoList"));
  initTaskDragListeners(document.getElementById("selectedDayTasks"));
});

async function getProfileImageDataUrl() {
  const { profileImageDataUrl = "" } = await chrome.storage.local.get(
    "profileImageDataUrl",
  );
  return typeof profileImageDataUrl === "string" ? profileImageDataUrl : "";
}

async function setProfileImageDataUrl(dataUrl) {
  await chrome.storage.local.set({ profileImageDataUrl: dataUrl || "" });
}

async function paintProfileImage() {
  const img = document.getElementById("profileImage");
  const initials = document.getElementById("profileInitials");
  if (!img || !initials) return;
  const dataUrl = await getProfileImageDataUrl();
  if (dataUrl) {
    img.src = dataUrl;
    img.style.display = "block";
    initials.style.display = "none";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
    initials.style.display = "inline";
  }
}
