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
  const query = window.location.search.substring(1);
  const vars = query.split("&");
  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split("=");
    if (pair[0] === variable) {
      return pair.length > 1 && pair[1] ? decodeURIComponent(pair[1]) : null;
    }
  }
  return null;
}
