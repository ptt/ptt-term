import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DISCONNECT_CHECK_INTERVAL_MS,
  CONNECT_CHECK_INTERVAL_MS,
  VERSION_RELOAD_INTERVAL_MS,
  STORAGE_KEY_LAST_CHECK,
  STORAGE_KEY_LAST_RELOAD,
  STORAGE_KEY_LOADED_COMMIT,
  initVersionChecker,
  canCheckVersion,
  canReloadVersion,
  triggerSafeReload,
  checkVersionAndReloadIfNeeded,
} from '../src/js/version_checker.js';

function createMockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    clear: () => map.clear(),
  };
}

test('initVersionChecker initializes last check timestamp on first load and updates when commit changes', () => {
  const storage = createMockStorage();
  const t0 = 1_700_000_000_000;

  initVersionChecker({ now: t0, currentCommit: 'commit_a', storage });
  assert.equal(storage.getItem(STORAGE_KEY_LAST_CHECK), String(t0));
  assert.equal(storage.getItem(STORAGE_KEY_LOADED_COMMIT), 'commit_a');

  // Calling again with same commit preserves original lastCheck
  const t1 = t0 + 3600_000;
  initVersionChecker({ now: t1, currentCommit: 'commit_a', storage });
  assert.equal(storage.getItem(STORAGE_KEY_LAST_CHECK), String(t0));

  // Calling with a newly loaded commit resets lastCheck to now
  const t2 = t0 + 7200_000;
  initVersionChecker({ now: t2, currentCommit: 'commit_b', storage });
  assert.equal(storage.getItem(STORAGE_KEY_LAST_CHECK), String(t2));
  assert.equal(storage.getItem(STORAGE_KEY_LOADED_COMMIT), 'commit_b');
});

test('canCheckVersion supports 12h disconnect interval and 6h connect interval', () => {
  const storage = createMockStorage();
  const t0 = 1_700_000_000_000;

  storage.setItem(STORAGE_KEY_LAST_CHECK, String(t0));

  // At 5 hours: neither connect (6h) nor disconnect (12h) should check
  const t5h = t0 + 5 * 3600_000;
  assert.equal(canCheckVersion({ now: t5h, intervalMs: CONNECT_CHECK_INTERVAL_MS, storage }), false);
  assert.equal(canCheckVersion({ now: t5h, intervalMs: DISCONNECT_CHECK_INTERVAL_MS, storage }), false);

  // At 6 hours: connect (6h) CAN check, but disconnect (12h) still CANNOT
  const t6h = t0 + CONNECT_CHECK_INTERVAL_MS;
  assert.equal(canCheckVersion({ now: t6h, intervalMs: CONNECT_CHECK_INTERVAL_MS, storage }), true);
  assert.equal(canCheckVersion({ now: t6h, intervalMs: DISCONNECT_CHECK_INTERVAL_MS, storage }), false);

  // At 12 hours: both connect (6h) and disconnect (12h) CAN check
  const t12h = t0 + DISCONNECT_CHECK_INTERVAL_MS;
  assert.equal(canCheckVersion({ now: t12h, intervalMs: CONNECT_CHECK_INTERVAL_MS, storage }), true);
  assert.equal(canCheckVersion({ now: t12h, intervalMs: DISCONNECT_CHECK_INTERVAL_MS, storage }), true);
});

test('checkVersionAndReloadIfNeeded respects intervals and prevents reload loops', async () => {
  const storage = createMockStorage();
  const t0 = 1_700_000_000_000;
  let fetchCount = 0;
  let reloadCount = 0;
  let remoteCommit = 'commit_v1';

  const mockFetch = async () => {
    fetchCount++;
    return {
      ok: true,
      json: async () => ({ version: '2.0.2', commit: remoteCommit }),
    };
  };
  const mockReload = () => {
    reloadCount++;
  };

  // 1. Initialize on app load at t0
  initVersionChecker({ now: t0, currentCommit: 'commit_v1', storage });

  // 2. Disconnect at 5 hours (< 12h DISCONNECT_CHECK_INTERVAL_MS) -> skips fetch
  const t5h = t0 + 5 * 3600_000;
  const res1 = await checkVersionAndReloadIfNeeded({
    now: t5h,
    intervalMs: DISCONNECT_CHECK_INTERVAL_MS,
    currentCommit: 'commit_v1',
    storage,
    fetchFn: mockFetch,
    reloadFn: mockReload,
    clearCaches: false,
  });
  assert.equal(res1, false);
  assert.equal(fetchCount, 0);

  // 3. Reconnect at 6 hours (>= 6h CONNECT_CHECK_INTERVAL_MS) -> fetches once, updates lastCheck to t6h
  const t6h = t0 + CONNECT_CHECK_INTERVAL_MS;
  const res2 = await checkVersionAndReloadIfNeeded({
    now: t6h,
    intervalMs: CONNECT_CHECK_INTERVAL_MS,
    currentCommit: 'commit_v1',
    storage,
    fetchFn: mockFetch,
    reloadFn: mockReload,
    clearCaches: false,
  });
  assert.equal(res2, false);
  assert.equal(fetchCount, 1);
  assert.equal(storage.getItem(STORAGE_KEY_LAST_CHECK), String(t6h));

  // 4. Disconnect at t6h + 8h (8h since lastCheck < 12h DISCONNECT_CHECK_INTERVAL_MS) -> skips fetch
  const t14h = t6h + 8 * 3600_000;
  const res3 = await checkVersionAndReloadIfNeeded({
    now: t14h,
    intervalMs: DISCONNECT_CHECK_INTERVAL_MS,
    currentCommit: 'commit_v1',
    storage,
    fetchFn: mockFetch,
    reloadFn: mockReload,
    clearCaches: false,
  });
  assert.equal(res3, false);
  assert.equal(fetchCount, 1);

  // 5. Reconnect at t14h + 1h (9h since lastCheck >= 6h CONNECT_CHECK_INTERVAL_MS) -> fetches and reloads!
  remoteCommit = 'commit_v2';
  const t15h = t6h + 9 * 3600_000;
  const res4 = await checkVersionAndReloadIfNeeded({
    now: t15h,
    intervalMs: CONNECT_CHECK_INTERVAL_MS,
    currentCommit: 'commit_v1',
    storage,
    fetchFn: mockFetch,
    reloadFn: mockReload,
    clearCaches: false,
  });
  assert.equal(res4, true);
  assert.equal(fetchCount, 2);
  assert.equal(reloadCount, 1);
  assert.equal(storage.getItem(STORAGE_KEY_LAST_RELOAD), String(t15h));

  // 6. Loop prevention within cooldown
  const loopAttempt = await triggerSafeReload({
    now: t15h + 5000,
    storage,
    reloadFn: mockReload,
    clearCaches: false,
  });
  assert.equal(loopAttempt, false);
  assert.equal(reloadCount, 1);
});

test('App checks version on disconnect (12h) and connect (6h) without visibilitychange check', () => {
  const appSource = fs.readFileSync(path.resolve('src/js/app.js'), 'utf-8');
  const entrySource = fs.readFileSync(path.resolve('src/entry.js'), 'utf-8');

  assert.ok(
    appSource.includes('DISCONNECT_CHECK_INTERVAL_MS') &&
      appSource.includes('CONNECT_CHECK_INTERVAL_MS'),
    'App must use DISCONNECT_CHECK_INTERVAL_MS on disconnect and CONNECT_CHECK_INTERVAL_MS on connect'
  );
  assert.ok(
    !appSource.includes("addEventListener('visibilitychange'"),
    'App must not check version on visibilitychange'
  );
  assert.ok(
    entrySource.includes('controllerchange') &&
      entrySource.includes('triggerSafeReload()'),
    'entry.js must listen for SW controllerchange and trigger safe reload when disconnected'
  );
});
