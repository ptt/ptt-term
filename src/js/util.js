export function setTimer(repeat, func, timelimit) {
  const timer = repeat ? setInterval(func, timelimit) : setTimeout(func, timelimit);
  return {
    timer: timer,
    cancel: () => {
      if (repeat) {
        clearInterval(timer);
      } else {
        clearTimeout(timer);
      }
    }
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
