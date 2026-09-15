export const DISCONNECT_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
export const CONNECT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const VERSION_RELOAD_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const STORAGE_KEY_LAST_CHECK = 'app_version_last_check';
export const STORAGE_KEY_LAST_RELOAD = 'app_version_last_reload';
export const STORAGE_KEY_LOADED_COMMIT = 'app_loaded_commit';

const memoryStorage = new Map();

export const defaultStorage = {
  getItem(key) {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch {
      // Fallback to memory storage
    }
    return memoryStorage.has(key) ? memoryStorage.get(key) : null;
  },
  setItem(key, value) {
    const strVal = String(value);
    memoryStorage.set(key, strVal);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, strVal);
      }
    } catch {
      // Ignore quota or access errors
    }
  },
};

export function getCurrentCommit(customCommit) {
  if (customCommit !== undefined) return customCommit;
  try {
    return APP.COMMIT_HASH || '';
  } catch {
    if (typeof globalThis !== 'undefined' && globalThis.APP?.COMMIT_HASH) {
      return globalThis.APP.COMMIT_HASH;
    }
    return '';
  }
}

export function initVersionChecker({
  now = Date.now(),
  currentCommit = getCurrentCommit(),
  storage = defaultStorage,
} = {}) {
  const loadedCommit = storage.getItem(STORAGE_KEY_LOADED_COMMIT);
  const lastCheck = Number(storage.getItem(STORAGE_KEY_LAST_CHECK) || 0);

  if (!lastCheck || (currentCommit && loadedCommit !== currentCommit)) {
    storage.setItem(STORAGE_KEY_LAST_CHECK, String(now));
    if (currentCommit) {
      storage.setItem(STORAGE_KEY_LOADED_COMMIT, currentCommit);
    }
  }
}

export function canCheckVersion({
  now = Date.now(),
  intervalMs = CONNECT_CHECK_INTERVAL_MS,
  storage = defaultStorage,
} = {}) {
  const lastCheck = Number(storage.getItem(STORAGE_KEY_LAST_CHECK) || 0);
  if (!lastCheck) return true;
  return now - lastCheck >= intervalMs;
}

export function canReloadVersion({
  now = Date.now(),
  intervalMs = VERSION_RELOAD_INTERVAL_MS,
  storage = defaultStorage,
} = {}) {
  const lastReload = Number(storage.getItem(STORAGE_KEY_LAST_RELOAD) || 0);
  if (!lastReload) return true;
  return now - lastReload >= intervalMs;
}

export async function triggerSafeReload({
  now = Date.now(),
  storage = defaultStorage,
  reloadFn,
  clearCaches = true,
} = {}) {
  if (!canReloadVersion({ now, storage })) {
    return false;
  }

  storage.setItem(STORAGE_KEY_LAST_RELOAD, String(now));
  storage.setItem(STORAGE_KEY_LAST_CHECK, String(now));

  if (clearCaches) {
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // Ignore cache deletion errors
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
        }
      }
    } catch {
      // Ignore service worker update errors
    }
  }

  const doReload =
    reloadFn ||
    (() => {
      if (typeof window !== 'undefined' && window.location?.reload) {
        window.location.reload();
      }
    });

  doReload();
  return true;
}

export async function checkVersionAndReloadIfNeeded({
  now = Date.now(),
  intervalMs = CONNECT_CHECK_INTERVAL_MS,
  currentCommit = getCurrentCommit(),
  storage = defaultStorage,
  fetchFn = typeof fetch !== 'undefined' ? fetch : null,
  reloadFn,
  clearCaches = true,
} = {}) {
  if (!canCheckVersion({ now, intervalMs, storage })) {
    return false;
  }

  // Record check timestamp immediately so we respect the rate limit interval
  storage.setItem(STORAGE_KEY_LAST_CHECK, String(now));

  if (!fetchFn || !currentCommit) {
    return false;
  }

  try {
    const res = await fetchFn(`./version.json?t=${now}`, {
      cache: 'no-store',
    });
    if (!res || !res.ok) {
      return false;
    }
    const data = await res.json();
    const remoteCommit = data?.commit;
    if (remoteCommit && remoteCommit !== currentCommit) {
      return await triggerSafeReload({
        now,
        storage,
        reloadFn,
        clearCaches,
      });
    }
  } catch {
    // Ignore network / parse errors during version check
  }

  return false;
}
