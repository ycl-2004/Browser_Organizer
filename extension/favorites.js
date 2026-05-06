/* ----------------------------------------------------------------
   LONG-TERM FAVORITES — local source of truth

   Stored under the "favorites" key. Permanent bookmarks the user
   wants one-click access to.

   Schema:
   [
     {
       id:      "1712345678901",
       url:     "https://example.com",
       title:   "Example",
       addedAt: "2026-05-01T10:00:00.000Z",
     },
     ...
   ]
   ---------------------------------------------------------------- */

/* Favorite shape: { id, url, title, addedAt, slot, customLogo? }

   `slot` is an explicit grid index. New favorites are placed at the
   first empty slot. Deleting a card leaves a gap so the rest don't
   shift around. The visible column count can change with screen width;
   cards just reflow into different (row, col) positions while keeping
   their slot index. */

async function getFavorites() {
  return TabHomeStorage.getFavorites();
}

async function setFavorites(favorites, options) {
  return TabHomeStorage.setFavorites(favorites, options);
}

async function getFavoriteSections() {
  return TabHomeStorage.getFavoriteSections();
}

async function setFavoriteSections(sections, options) {
  return TabHomeStorage.setFavoriteSections(sections, options);
}

function makeId(prefix) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function addFavorite(
  url,
  title,
  customLogo = null,
  sectionId = "default",
) {
  if (!url) return false;
  if (/^(javascript|data|vbscript):/i.test(url.trim())) return false;
  await ensureFavoriteSections();
  const favorites = await getFavorites();
  if (favorites.some((f) => f.url === url)) return false;

  // Auto-derive a clean brand-style title (e.g. "Binance" from www.binance.com)
  // when no explicit title was passed.
  const cleanTitle = (title || "").trim();
  let finalTitle;
  if (cleanTitle) {
    finalTitle = cleanTitle;
  } else {
    try {
      finalTitle = friendlyDomain(new URL(url).hostname) || url;
    } catch {
      finalTitle = url;
    }
  }

  const finalSectionId = sectionId || "default";

  // Place at the first empty global slot for backward compatibility and at
  // the first empty section slot for the new horizontal section rows.
  const taken = new Set(favorites.map((f) => f.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;

  const sectionTaken = new Set(
    favorites
      .filter((f) => (f.sectionId || "default") === finalSectionId)
      .map((f) =>
        typeof f.sectionSlot === "number" ? f.sectionSlot : f.slot || 0,
      ),
  );
  let sectionSlot = 0;
  while (sectionTaken.has(sectionSlot)) sectionSlot++;

  const fav = {
    id: Date.now().toString(),
    url,
    title: finalTitle,
    addedAt: new Date().toISOString(),
    slot,
    sectionId: finalSectionId,
    sectionSlot,
  };
  if (customLogo) fav.customLogo = customLogo;
  favorites.push(fav);
  await setFavorites(favorites);
  return true;
}

/**
 * Set a favorite's slot. If another favorite already owns that slot,
 * swap their slots — gives users predictable "click-and-place" behaviour
 * during drag-and-drop reordering.
 */
async function setFavoriteSlot(id, newSlot, sectionId = "default") {
  if (!id || typeof newSlot !== "number") return;
  if (newSlot < 0 || newSlot >= SLOT_UPPER_BOUND) return;
  const favorites = await getFavorites();
  const dragged = favorites.find((f) => f.id === id);
  if (!dragged) return;
  const nextSectionId = sectionId || "default";
  const oldSectionId = dragged.sectionId || "default";
  const oldSectionSlot =
    typeof dragged.sectionSlot === "number"
      ? dragged.sectionSlot
      : dragged.slot || 0;
  if (oldSectionId === nextSectionId && oldSectionSlot === newSlot) return;
  const occupant = favorites.find(
    (f) =>
      f.id !== id &&
      (f.sectionId || "default") === nextSectionId &&
      (typeof f.sectionSlot === "number" ? f.sectionSlot : f.slot || 0) ===
        newSlot,
  );
  if (occupant) {
    occupant.sectionId = oldSectionId;
    occupant.sectionSlot = oldSectionSlot;
    occupant.slot = oldSectionSlot;
  }
  dragged.sectionId = nextSectionId;
  dragged.sectionSlot = newSlot;
  dragged.slot = newSlot;
  await setFavorites(favorites);
}

async function updateFavoriteSection(id, sectionId) {
  const favorites = await getFavorites();
  const fav = favorites.find((f) => f.id === id);
  if (!fav) return;
  const nextSectionId = sectionId || "default";
  if ((fav.sectionId || "default") === nextSectionId) return;
  const taken = new Set(
    favorites
      .filter(
        (f) => f.id !== id && (f.sectionId || "default") === nextSectionId,
      )
      .map((f) =>
        typeof f.sectionSlot === "number" ? f.sectionSlot : f.slot || 0,
      ),
  );
  let sectionSlot = 0;
  while (taken.has(sectionSlot)) sectionSlot++;
  fav.sectionId = nextSectionId;
  fav.sectionSlot = sectionSlot;
  fav.slot = sectionSlot;
  await setFavorites(favorites);
}

async function ensureFavoriteSections() {
  const sections = await getFavoriteSections();
  if (sections.length > 0) return sections;
  const defaults = [
    { id: "default", name: "Favorites", order: 0, collapsed: false },
  ];
  await setFavoriteSections(defaults);
  return defaults;
}

async function addFavoriteSection(name) {
  const cleanName = (name || "").trim();
  if (!cleanName) return null;
  const sections = await getFavoriteSections();
  const next = [
    ...sections,
    {
      id: makeId("section"),
      name: cleanName,
      order: sections.length,
      collapsed: false,
    },
  ];
  await setFavoriteSections(next);
  return next[next.length - 1];
}

async function renameFavoriteSection(id, name) {
  const cleanName = (name || "").trim();
  if (!id || !cleanName) return;
  const sections = await getFavoriteSections();
  const section = sections.find((s) => s.id === id);
  if (!section) return;
  section.name = cleanName;
  await setFavoriteSections(sections);
}

async function toggleFavoriteSection(id) {
  const sections = await getFavoriteSections();
  const section = sections.find((s) => s.id === id);
  if (!section) return;
  section.collapsed = !section.collapsed;
  await setFavoriteSections(sections);
}

async function deleteFavoriteSection(id) {
  if (!id || id === "default") return;
  const sections = await getFavoriteSections();
  if (!sections.find((s) => s.id === id)) return;
  const favorites = await getFavorites();
  for (const fav of favorites) {
    if (fav.sectionId === id) {
      fav.sectionId = "default";
    }
  }
  await setFavorites(favorites);
  await setFavoriteSections(sections.filter((s) => s.id !== id));
}

async function moveFavoriteSection(id, dir) {
  const sections = (await getFavoriteSections()).sort(
    (a, b) => a.order - b.order,
  );
  const index = sections.findIndex((s) => s.id === id);
  const nextIndex = index + dir;
  if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) return;
  [sections[index], sections[nextIndex]] = [
    sections[nextIndex],
    sections[index],
  ];
  sections.forEach((section, order) => {
    section.order = order;
  });
  await setFavoriteSections(sections);
}

/**
 * One-time migration:
 *  - Strip legacy folder entries / parentId / type fields.
 *  - Ensure every favorite has a non-negative slot. Slots that collide
 *    are reassigned to the first free slot. No upper bound — favorites
 *    are unlimited.
 * Idempotent.
 */
async function migrateAwayFromFolders() {
  const { favorites: raw = [] } = await chrome.storage.local.get("favorites");
  if (!raw.length) return;

  const before = JSON.stringify(raw);

  const cleaned = raw
    .filter((f) => f && f.type !== "folder" && f.url)
    .map(({ type, parentId, ...rest }) => rest);

  // Keep entries with valid non-conflicting slots; everything else gets a fresh one.
  const taken = new Set();
  const needSlot = [];
  for (const f of cleaned) {
    const valid =
      typeof f.slot === "number" && f.slot >= 0 && !taken.has(f.slot);
    if (valid) taken.add(f.slot);
    else needSlot.push(f);
  }

  // Place the rest into vacant slots, in their original order.
  let next = 0;
  for (const f of needSlot) {
    while (taken.has(next)) next++;
    f.slot = next;
    taken.add(next);
  }

  const final = cleaned;

  if (JSON.stringify(final) !== before) {
    await setFavorites(final);
  }
}

async function migrateFavoritesToSections() {
  const { favorites: raw = [], favoriteSections: rawSections } =
    await chrome.storage.local.get(["favorites", "favoriteSections"]);

  const hasSections = Array.isArray(rawSections) && rawSections.length > 0;
  const sections = hasSections
    ? await getFavoriteSections()
    : [{ id: "default", name: "Favorites", order: 0, collapsed: false }];

  const sectionIds = new Set(sections.map((section) => section.id));
  let changed = !hasSections;

  const migratedFavorites = (raw || []).map((fav, index) => {
    if (!fav || !fav.url) return fav;
    const next = { ...fav };
    if (!next.sectionId || !sectionIds.has(next.sectionId)) {
      next.sectionId = "default";
      changed = true;
    }
    if (typeof next.sectionSlot !== "number" || next.sectionSlot < 0) {
      next.sectionSlot =
        typeof next.slot === "number" && next.slot >= 0 ? next.slot : index;
      changed = true;
    }
    return next;
  });

  if (!hasSections) await setFavoriteSections(sections);
  if (changed) await setFavorites(migratedFavorites);
}

/**
 * updateFavorite(id, fields)
 *
 * Patches a favorite by id. Pass `customLogo: null` to delete the
 * custom logo and revert to the auto-fetched favicon.
 */
async function updateFavorite(id, fields) {
  const favorites = await getFavorites();
  const fav = favorites.find((f) => f.id === id);
  if (!fav) return;
  for (const [k, v] of Object.entries(fields)) {
    if (k === "customLogo" && v === null) delete fav.customLogo;
    else fav[k] = v;
  }
  await setFavorites(favorites);
}

async function removeFavorite(id) {
  const favorites = await getFavorites();
  const next = favorites.filter((f) => f.id !== id);
  await setFavorites(next);
}

async function isFavorited(url) {
  const favorites = await getFavorites();
  return favorites.some((f) => f.url === url);
}
