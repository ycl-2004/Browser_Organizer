/* ----------------------------------------------------------------
   HERO NOTE — editable local copy
   ---------------------------------------------------------------- */

const HERO_TITLE_KEY = "heroTitle";
const HERO_COPY_KEY = "heroCopy";

function getDefaultHeroTitle() {
  return currentLang === "zh"
    ? "保持专注，把更好的东西做出来。"
    : "Stay focused, ship better things.";
}

async function getStoredHeroTitle() {
  const data = await chrome.storage.local.get(HERO_TITLE_KEY);
  return typeof data[HERO_TITLE_KEY] === "string" ? data[HERO_TITLE_KEY] : "";
}

async function setHeroTitle(value) {
  const clean = String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  await chrome.storage.local.set({ [HERO_TITLE_KEY]: clean });
  return clean;
}

async function paintHeroTitle() {
  const el = document.getElementById("heroTitle");
  if (!el) return;
  const stored = (await getStoredHeroTitle()).trim();
  el.textContent = stored || getDefaultHeroTitle();
  el.dataset.customHeroTitle = stored ? "true" : "false";
  el.setAttribute("title", t("heroCopyEditHint"));
}

function getDefaultHeroCopy() {
  return currentLang === "zh"
    ? "你的标签、收藏与待办，尽在掌握。"
    : "Your tabs, favorites, and tasks — all in one place.";
}

async function getStoredHeroCopy() {
  const data = await chrome.storage.local.get(HERO_COPY_KEY);
  return typeof data[HERO_COPY_KEY] === "string" ? data[HERO_COPY_KEY] : "";
}

async function getHeroCopy() {
  const stored = (await getStoredHeroCopy()).trim();
  return stored || getDefaultHeroCopy();
}

async function setHeroCopy(value) {
  const clean = String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  await chrome.storage.local.set({ [HERO_COPY_KEY]: clean });
  return clean;
}

async function paintHeroCopy() {
  const el = document.getElementById("heroCopy");
  if (!el) return;
  const stored = (await getStoredHeroCopy()).trim();
  el.textContent = stored || getDefaultHeroCopy();
  el.dataset.customHeroCopy = stored ? "true" : "false";
  el.setAttribute("title", t("heroCopyEditHint"));
}

function selectElementText(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function beginHeroCopyEdit() {
  const el = document.getElementById("heroCopy");
  if (!el || el.isContentEditable) return;
  el.dataset.beforeEdit = el.textContent || "";
  el.contentEditable = "true";
  el.classList.add("is-editing");
  el.focus();
  selectElementText(el);
}

function beginHeroTitleEdit() {
  const el = document.getElementById("heroTitle");
  if (!el || el.isContentEditable) return;
  el.dataset.beforeEdit = el.textContent || "";
  el.contentEditable = "true";
  el.classList.add("is-editing");
  el.focus();
  selectElementText(el);
}

async function saveHeroCopyEdit(el) {
  if (!el || !el.isContentEditable) return;
  const clean = await setHeroCopy(el.innerText || el.textContent || "");
  el.contentEditable = "false";
  el.classList.remove("is-editing");
  el.textContent = clean || getDefaultHeroCopy();
  el.dataset.customHeroCopy = clean ? "true" : "false";
  showToast(t("heroCopyUpdated"));
}

async function saveHeroTitleEdit(el) {
  if (!el || !el.isContentEditable) return;
  const clean = await setHeroTitle(el.innerText || el.textContent || "");
  el.contentEditable = "false";
  el.classList.remove("is-editing");
  el.textContent = clean || getDefaultHeroTitle();
  el.dataset.customHeroTitle = clean ? "true" : "false";
  showToast(t("heroTitleUpdated"));
}

function cancelHeroCopyEdit(el) {
  if (!el || !el.isContentEditable) return;
  el.contentEditable = "false";
  el.classList.remove("is-editing");
  el.textContent = el.dataset.beforeEdit || getDefaultHeroCopy();
}

function cancelHeroTitleEdit(el) {
  if (!el || !el.isContentEditable) return;
  el.contentEditable = "false";
  el.classList.remove("is-editing");
  el.textContent = el.dataset.beforeEdit || getDefaultHeroTitle();
}
