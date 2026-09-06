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
