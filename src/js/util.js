const WORKER_TIMER_CODE = `
const timers = new Map();
self.onmessage = function (e) {
  const d = e.data;
  if (!d) return;
  if (d.cmd === 'start') {
    if (timers.has(d.id)) {
      clearInterval(timers.get(d.id));
    }
    const handle = setInterval(function () {
      self.postMessage({ id: d.id });
    }, d.delay);
    timers.set(d.id, handle);
  } else if (d.cmd === 'cancel') {
    if (timers.has(d.id)) {
      clearInterval(timers.get(d.id));
      timers.delete(d.id);
    }
  }
};
`;

let _timerWorker = undefined;
let _nextWorkerTimerId = 1;
const _workerListeners = new Map();

export function _resetTimerWorkerForTest() {
  _workerListeners.clear();
  if (_timerWorker && typeof _timerWorker.terminate === 'function') {
    try {
      _timerWorker.terminate();
    } catch {}
  }
  _timerWorker = undefined;
}

function getTimerWorker() {
  if (_timerWorker !== undefined) {
    return _timerWorker;
  }
  if (
    (!isBrowser() && !globalThis.__FORCE_BROWSER_TIMER_WORKER__) ||
    typeof Worker === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    _timerWorker = null;
    return null;
  }
  try {
    const blob = new Blob([WORKER_TIMER_CODE], {
      type: 'application/javascript',
    });
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);
    URL.revokeObjectURL(blobUrl);
    worker.onmessage = (e) => {
      const id = e?.data?.id;
      const cb = _workerListeners.get(id);
      if (cb) cb();
    };
    worker.onerror = () => {
      // If CSP or browser blocks the blob worker asynchronously, disable it
      // so native setInterval fallback continues handling ticks seamlessly.
      _workerListeners.clear();
      try {
        worker.terminate();
      } catch {}
      _timerWorker = null;
    };
    _timerWorker = worker;
  } catch {
    _timerWorker = null;
  }
  return _timerWorker;
}

export function setTimer(repeat, func, timelimit) {
  if (!repeat) {
    const timer = setTimeout(func, timelimit);
    return {
      timer,
      cancel: () => clearTimeout(timer),
    };
  }

  const worker = getTimerWorker();
  let workerTimerId = null;
  let lastWorkerTickAt = 0;
  let cancelled = false;

  if (worker) {
    workerTimerId = _nextWorkerTimerId++;
    _workerListeners.set(workerTimerId, () => {
      if (cancelled) return;
      lastWorkerTickAt = Date.now();
      func();
    });
    try {
      worker.postMessage({
        cmd: 'start',
        id: workerTimerId,
        delay: timelimit,
      });
    } catch {
      _workerListeners.delete(workerTimerId);
      workerTimerId = null;
    }
  }

  const fallbackCheckMs = Math.max(timelimit * 1.5, timelimit + 200);
  const timer = setInterval(() => {
    if (cancelled) return;
    if (
      lastWorkerTickAt === 0 ||
      Date.now() - lastWorkerTickAt >= fallbackCheckMs
    ) {
      func();
    }
  }, timelimit);

  return {
    timer,
    workerTimerId,
    cancel: () => {
      cancelled = true;
      clearInterval(timer);
      if (workerTimerId !== null) {
        _workerListeners.delete(workerTimerId);
        try {
          _timerWorker?.postMessage({ cmd: 'cancel', id: workerTimerId });
        } catch {}
        workerTimerId = null;
      }
    },
  };
}

export function getQueryVariable(variable) {
  if (typeof window === "undefined" || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  return params.get(variable);
}

export function parseConnectUrl(rawUrl, loc = (typeof window !== 'undefined' ? window.location : null)) {
  if (!rawUrl) return null;

  const baseProto = (loc && loc.protocol === 'https:') ? 'https:' : 'http:';
  const baseHost = (loc && loc.host) ? loc.host : 'localhost';
  const base = `${baseProto}//${baseHost}`;

  let u;
  try {
    u = new URL(rawUrl, base);
  } catch (e) {
    return null;
  }

  let protocol = u.protocol.replace(/:$/, '');
  switch (protocol) {
    case 'http':
    case 'wstelnet':
      protocol = 'ws';
      break;
    case 'https':
    case 'wsstelnet':
      protocol = 'wss';
      break;
  }

  const defaultPorts = { ws: 80, wss: 443, telnet: 23, ssh: 22 };
  const port = u.port ? parseInt(u.port, 10) : (defaultPorts[protocol] || (protocol === 'wss' ? 443 : 80));
  const path = u.pathname + (u.search || '');
  const url = `${protocol}://${u.host}${path}`;

  return {
    url,
    protocol,
    host: u.host,
    hostname: u.hostname,
    port,
    path
  };
}

export function resolveWebSocketUrl(rawUrl, loc = (typeof window !== 'undefined' ? window.location : null)) {
  const parsed = parseConnectUrl(rawUrl, loc);
  return parsed ? parsed.url : '';
}

export function hasProcess() {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

export function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && !hasProcess();
}
