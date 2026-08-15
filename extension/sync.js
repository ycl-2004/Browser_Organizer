/* ================================================================
   sync.js — Cross-profile sync via Chrome Native Messaging

   Keeps multiple Chrome profiles on the same machine in sync by
   reading/writing a shared JSON file through a tiny native host
   (native-host/sync_host.py).

   ▸ PUSH  After any local storage change the current data is pushed
           to the shared file (debounced, 2 s).
   ▸ PULL  Every time a new-tab page opens, sync.js checks whether
           the shared file is newer and imports it if so.

   If the native host is not installed, everything degrades silently
   — the extension works exactly as before (manual Export / Import).

   Install the host:  native-host/install.sh
   ================================================================ */

(function () {
  "use strict";

  const NATIVE_HOST = "com.browser_organizer.sync";

  // Keys that participate in cross-profile sync (matches Export / Import)
  const SYNC_KEYS = [
    "favorites",
    "favoriteSections",
    "dailyTasks",
    "heroTitle",
    "heroCopy",
    "profileImageDataUrl",
    "theme",
    "lang",
  ];

  // Local bookkeeping — never synced
  const LAST_PULL_TS_KEY = "__boSyncLastPulledAt";

  const PUSH_DEBOUNCE_MS = 2000;

  let _available = false;
  let _pulling = false;
  let _pushing = false;
  let _pushTimer = null;
  let _lastNativeError = "";

  // ── native messaging helper ─────────────────────────────────────────────────

  function nativeSend(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
          if (chrome.runtime.lastError) {
            _lastNativeError =
              chrome.runtime.lastError.message || "Unknown native host error";
            resolve(null);
          } else {
            _lastNativeError = "";
            resolve(response);
          }
        });
      } catch (e) {
        _lastNativeError = e && e.message ? e.message : String(e);
        resolve(null);
      }
    });
  }

  // ── PUSH (local → shared file) ─────────────────────────────────────────────

  async function push() {
    if (!_available || _pulling) return;
    _pushing = true;
    try {
      const data = await chrome.storage.local.get(SYNC_KEYS);
      const resp = await nativeSend({ action: "write", data });
      if (resp && resp.ok) {
        await chrome.storage.local.set({ [LAST_PULL_TS_KEY]: resp.syncedAt });
      }
    } catch (e) {
      console.warn("[sync] push error:", e);
    } finally {
      _pushing = false;
    }
  }

  function schedulePush() {
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(push, PUSH_DEBOUNCE_MS);
  }

  // ── PULL (shared file → local) ─────────────────────────────────────────────

  async function pull() {
    if (!_available) return false;
    _pulling = true;
    try {
      // 1. Quick timestamp check
      const checkResp = await nativeSend({ action: "check" });
      if (!checkResp || !checkResp.ok) return false;

      const stored = await chrome.storage.local.get(LAST_PULL_TS_KEY);
      const lastPull = stored[LAST_PULL_TS_KEY] || 0;

      if (checkResp.lastModified <= lastPull) return false; // nothing new

      // 2. Full read
      const readResp = await nativeSend({ action: "read" });
      if (!readResp || !readResp.ok || !readResp.data) return false;

      const remote = readResp.data;
      const payload = {};
      for (const key of SYNC_KEYS) {
        if (remote[key] !== undefined) {
          payload[key] = remote[key];
        }
      }
      if (Object.keys(payload).length === 0) return false;

      // 3. Apply to local storage
      await chrome.storage.local.set(payload);
      await chrome.storage.local.set({
        [LAST_PULL_TS_KEY]: checkResp.lastModified,
      });
      return true; // data was updated
    } catch (e) {
      console.warn("[sync] pull error:", e);
      return false;
    } finally {
      _pulling = false;
    }
  }

  // ── storage change listener — auto-push on local edits ─────────────────────

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || _pulling || _pushing || !_available) return;
      const relevant = Object.keys(changes).some((k) => SYNC_KEYS.includes(k));
      if (relevant) schedulePush();
    });
  }

  // ── boot: probe native host, then pull ─────────────────────────────────────

  let _readyResolve;
  const _readyPromise = new Promise((resolve) => {
    _readyResolve = resolve;
  });

  (async () => {
    try {
      const ping = await nativeSend({ action: "ping" });
      if (ping && ping.ok) {
        _available = true;
        console.info(
          "[sync] Native host connected. Extension ID:",
          chrome.runtime.id,
        );
        const updated = await pull();
        if (updated) {
          console.info("[sync] Pulled newer data from shared file.");
        }
      } else {
        console.info(
          "[sync] Native host not available — sync disabled.",
          _lastNativeError ? `Reason: ${_lastNativeError}` : "",
          "Extension ID:",
          chrome.runtime.id,
        );
      }
    } catch (e) {
      console.info(
        "[sync] Native host not available — sync disabled.",
        e && e.message ? `Reason: ${e.message}` : "",
        "Extension ID:",
        chrome.runtime.id,
      );
    }
    _readyResolve();
  })();

  // ── public API (used by app.js) ────────────────────────────────────────────

  window.__boSyncReady = _readyPromise;
  window.__boSyncPulling = function () {
    return _pulling;
  };
  window.__boSyncAvailable = function () {
    return _available;
  };
  window.__boSyncPush = push;
  window.__boSyncPull = pull;
})();
