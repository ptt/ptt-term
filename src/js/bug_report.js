/**
 * Bug report helper functions to detect user environment, OS, browser,
 * target site, client mode, and terminal settings, and assemble prefilled
 * GitHub issue URLs.
 */

export function detectSite(app, win = typeof window !== "undefined" ? window : undefined) {
  const webHost = (win?.location?.hostname || "").toLowerCase();
  const connHost = (app?.connectedUrl?.hostname || "").toLowerCase();
  const siteName = (app?.site?.name || "").toLowerCase();

  if (
    webHost === "localhost" ||
    webHost === "127.0.0.1" ||
    webHost === "0.0.0.0" ||
    webHost === "::1" ||
    webHost.endsWith(".googlers.com") ||
    webHost.endsWith(".local") ||
    connHost === "localhost" ||
    connHost === "127.0.0.1"
  ) {
    return "本機開發測試 (localhost / 自架)";
  }
  if (
    webHost.includes("ptt2.cc") ||
    connHost.includes("ptt2") ||
    siteName.includes("ptt2")
  ) {
    return "term.ptt2.cc (PTT2)";
  }
  if (
    webHost.includes("ptt.cc") ||
    connHost.includes("ptt.cc") ||
    connHost.includes("ptt") ||
    siteName.includes("ptt")
  ) {
    return "term.ptt.cc (PTT)";
  }
  return "其他（請在補充資訊說明）";
}

export function detectClientType(win = typeof window !== "undefined" ? window : undefined) {
  const isPWA = Boolean(
    win?.matchMedia?.("(display-mode: standalone)")?.matches ||
    win?.navigator?.standalone === true
  );
  return isPWA
    ? "PWA（已安裝成獨立 App 或桌面/手機「加入主畫面」）"
    : "Web（一般瀏覽器分頁內使用）";
}

export function detectClientMode(app, isTouch) {
  const isMobile = Boolean(
    isTouch ||
    app?.isMobileLayout?.() ||
    app?.isMobileDevice?.()
  );
  return isMobile
    ? "Mobile mode（行動版模式 / 觸控介面）"
    : "Desktop mode（電腦版模式）";
}

export function detectOS(nav = typeof navigator !== "undefined" ? navigator : undefined) {
  if (!nav) return "其他";
  const ua = nav.userAgent || "";
  const platform = nav.userAgentData?.platform || nav.platform || "";

  if (/Android/i.test(ua)) return "Android";
  if (
    /iPad/i.test(ua) ||
    (/Macintosh/i.test(ua) && Boolean(nav.maxTouchPoints && nav.maxTouchPoints > 1))
  ) {
    return "iPadOS";
  }
  if (/iPhone|iPod/i.test(ua)) return "iOS";
  if (/CrOS/i.test(ua) || platform === "Chrome OS") return "ChromeOS";
  if (/Windows|Win32|Win64/i.test(ua) || /Win/i.test(platform)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua) || /Mac/i.test(platform)) return "macOS";
  if (/Linux/i.test(ua) || /Linux/i.test(platform)) return "Linux";
  return "其他";
}

export function detectOSVersion(nav = typeof navigator !== "undefined" ? navigator : undefined) {
  if (!nav) return "";
  const ua = nav.userAgent || "";
  const isIPad =
    /iPad/i.test(ua) ||
    (/Macintosh/i.test(ua) && Boolean(nav.maxTouchPoints && nav.maxTouchPoints > 1));
  const iosMatch = ua.match(/OS (\d+[._]\d+([._]\d+)?)/);
  if (iosMatch && (/iPhone|iPad|iPod/i.test(ua) || isIPad)) {
    return `${isIPad ? "iPadOS" : "iOS"} ${iosMatch[1].replace(/_/g, ".")}`;
  }
  const macMatch = ua.match(/Mac OS X (\d+[._]\d+([._]\d+)?)/);
  if (macMatch && !isIPad) {
    return `macOS ${macMatch[1].replace(/_/g, ".")}`;
  }
  const androidMatch = ua.match(/Android (\d+(\.\d+)*)/);
  if (androidMatch) {
    return `Android ${androidMatch[1]}`;
  }
  const crosMatch = ua.match(/CrOS [^\s]+ (\d+(\.\d+)*)/);
  if (crosMatch) {
    return `ChromeOS ${crosMatch[1]}`;
  }
  const winMatch = ua.match(/Windows NT (\d+\.\d+)/);
  if (winMatch) {
    const ver = winMatch[1];
    if (ver === "10.0") return "Windows 10 / 11 (NT 10.0)";
    if (ver === "6.3") return "Windows 8.1 (NT 6.3)";
    if (ver === "6.1") return "Windows 7 (NT 6.1)";
    return `Windows NT ${ver}`;
  }
  if (nav.userAgentData?.platform) {
    return nav.userAgentData.platform;
  }
  return "";
}

export function detectBrowser(
  nav = typeof navigator !== "undefined" ? navigator : undefined,
  win = typeof window !== "undefined" ? window : undefined
) {
  if (!nav) return "其他";
  const ua = nav.userAgent || "";
  const brands = nav.userAgentData?.brands?.map((b) => b.brand) || [];

  if (/Kiwi/i.test(ua)) return "Kiwi Browser";
  if (Boolean(nav.brave || win?.navigator?.brave) || /Brave/i.test(ua)) return "Brave";
  if (/EdgA?|EdgiOS|Edge/i.test(ua) || brands.some((b) => /Edge/i.test(b))) {
    return "Microsoft Edge";
  }
  if (/\bwv\b|WebView/i.test(ua)) return "系統內建 WebView";
  if (/Firefox|FxiOS/i.test(ua)) return "Mozilla Firefox";
  if (
    /Chrome|CriOS/i.test(ua) ||
    brands.some((b) => /Google Chrome|Chromium/i.test(b))
  ) {
    return "Google Chrome";
  }
  if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) {
    return "Apple Safari";
  }
  return "其他";
}

export function detectBrowserVersion(
  nav = typeof navigator !== "undefined" ? navigator : undefined,
  win = typeof window !== "undefined" ? window : undefined
) {
  if (!nav) return "";
  const ua = nav.userAgent || "";
  const browser = detectBrowser(nav, win);

  if (browser === "Microsoft Edge") {
    const m = ua.match(/Edg[A-Za-z]*\/(\d+(\.\d+)*)/);
    if (m) return `Edge ${m[1]}`;
  } else if (browser === "Brave") {
    const m = ua.match(/(?:Chrome|CriOS)\/(\d+(\.\d+)*)/);
    if (m) return `Brave (Chromium ${m[1]})`;
  } else if (browser === "Kiwi Browser") {
    const m = ua.match(/Kiwi\/(\d+(\.\d+)*)/) || ua.match(/(?:Chrome|CriOS)\/(\d+(\.\d+)*)/);
    if (m) return `Kiwi ${m[1]}`;
  } else if (browser === "Google Chrome") {
    const m = ua.match(/(?:Chrome|CriOS)\/(\d+(\.\d+)*)/);
    if (m) return `Chrome ${m[1]}`;
  } else if (browser === "Mozilla Firefox") {
    const m = ua.match(/(?:Firefox|FxiOS)\/(\d+(\.\d+)*)/);
    if (m) return `Firefox ${m[1]}`;
  } else if (browser === "Apple Safari") {
    const m = ua.match(/Version\/(\d+(\.\d+)*)/);
    if (m) return `Safari ${m[1]}`;
  }

  if (nav.userAgentData?.brands?.length) {
    const brand = nav.userAgentData.brands.find(
      (b) => !/Not[ _A-Za-z]?A[ _A-Za-z]?Brand/i.test(b.brand)
    );
    if (brand) return `${brand.brand} ${brand.version}`;
  }
  return "";
}

export function detectExtraSettings(values) {
  if (!values) return [];
  const indices = [];
  if (values.termSizeMode === "fixed-term-size") {
    indices.push(0);
  }
  if (Boolean(values.fontFitWindowWidth)) {
    indices.push(1);
  }
  if (values.cursorStyle && values.cursorStyle !== "blink") {
    indices.push(2);
  }
  if (Boolean(values.smoothAnsiArt)) {
    indices.push(3);
  }
  if (values.fontFamily && values.fontFamily.trim() !== "") {
    indices.push(4);
  }
  if (values.colorScheme && values.colorScheme !== "default") {
    indices.push(5);
  }
  if (Boolean(values.enableVirtualKeyboard)) {
    indices.push(6);
  }
  return indices;
}

export function getDefaultAppInfo() {
  try {
    return {
      NAME: APP.NAME,
      VERSION: APP.VERSION,
      COMMIT_HASH: APP.COMMIT_HASH,
      BUILD_DATE: APP.BUILD_DATE,
      GITHUB_REPOSITORY_OWNER: APP.GITHUB_REPOSITORY_OWNER,
      GITHUB_REPOSITORY: APP.GITHUB_REPOSITORY,
    };
  } catch {
    return typeof APP !== "undefined" ? APP : undefined;
  }
}

export function buildBugReportUrl({
  app,
  isTouch,
  values,
  win = typeof window !== "undefined" ? window : undefined,
  nav = typeof navigator !== "undefined" ? navigator : undefined,
  appInfo = getDefaultAppInfo(),
} = {}) {
  const defaultAppInfo = getDefaultAppInfo();
  const today = new Date().toISOString().slice(0, 10);
  const commitHash = appInfo?.COMMIT_HASH || defaultAppInfo?.COMMIT_HASH || "";
  const buildDate = appInfo?.BUILD_DATE || defaultAppInfo?.BUILD_DATE || "";
  const buildDetails = [commitHash, buildDate].filter(Boolean).join(" ");
  const buildText = buildDetails ? `Build: ${buildDetails}` : "";
  const params = new URLSearchParams({
    template: "bug_report.yml",
    "occurrence-date": today,
  });
  if (buildText) {
    params.set("build-info", buildText);
  }

  // GitHub Issue Forms only support prefilling `input` and `textarea` fields via
  // URL query parameters. Dropdown and checkbox elements cannot be preselected by
  // GitHub's web interface, so those diagnostics are consolidated into `env-info` below.
  const osVersion = detectOSVersion(nav);
  if (osVersion) {
    params.set("os-version", osVersion);
  }

  const browserVersion = detectBrowserVersion(nav, win);
  if (browserVersion) {
    params.set("browser-version", browserVersion);
  }

  const useCanvas = values?.useCanvasEngine !== false;
  const termSizeMode = values?.termSizeMode || "max-font-size";

  const envLines = [];
  if (buildText) {
    envLines.push(buildText);
  }
  if (win) {
    const siteUrl = win.location?.origin || win.location?.href || "";
    if (siteUrl) {
      envLines.push(`Site: ${siteUrl}`);
    }
    const isPWA = Boolean(
      win.matchMedia?.("(display-mode: standalone)")?.matches ||
      win.navigator?.standalone === true
    );
    envLines.push(`Client: ${isPWA ? "PWA" : "Web"}`);

    const isMobile = Boolean(
      isTouch ||
      app?.isMobileLayout?.() ||
      app?.isMobileDevice?.()
    );
    envLines.push(`Mode: ${isMobile ? "Mobile (Touch)" : "Desktop"}`);

    envLines.push(
      `Render Engine Type: ${useCanvas ? "Canvas Engine" : "DOM Engine"}`
    );

    const dpr = win.devicePixelRatio || 1;
    const screenInfo = win.screen
      ? `${win.screen.width}x${win.screen.height}`
      : "unknown";
    envLines.push(
      `Viewport: ${win.innerWidth ?? "unknown"}x${win.innerHeight ?? "unknown"} (Screen: ${screenInfo}, DPR: ${dpr})`
    );
  }

  if (values) {
    let termSizeDetail = termSizeMode;
    if (termSizeMode === "fixed-term-size") {
      const cols = values.termSize?.cols ?? 80;
      const rows = values.termSize?.rows ?? 24;
      const fitWidth = Boolean(values.fontFitWindowWidth);
      termSizeDetail = `fixed-term-size (${cols}x${rows}, fontFitWindowWidth=${fitWidth})`;
    } else if (termSizeMode === "fixed-font-size") {
      termSizeDetail = `fixed-font-size (fontSize=${values.fontSize || 24})`;
    } else if (termSizeMode === "max-font-size") {
      termSizeDetail = `max-font-size (maxFontSize=${values.maxFontSize || 40})`;
    }
    envLines.push(`Terminal Size: ${termSizeDetail}`);
  }

  if (nav) {
    if (nav.userAgent) {
      envLines.push(`User Agent: ${nav.userAgent}`);
    }
    if (nav.userAgentData?.platform) {
      const brands = nav.userAgentData.brands
        ?.map((b) => `${b.brand} ${b.version}`)
        .join(", ");
      envLines.push(
        `Platform: ${nav.userAgentData.platform} (Mobile: ${Boolean(
          nav.userAgentData.mobile
        )}, Brands: ${brands || "none"})`
      );
    }
  }

  if (values) {
    const extra = [];
    if (values.smoothAnsiArt) extra.push("smoothAnsiArt");
    if (values.fontFamily) extra.push(`font=${values.fontFamily}`);
    if (values.colorScheme && values.colorScheme !== "default") {
      extra.push(`colorScheme=${values.colorScheme}`);
    }
    if (values.cursorStyle && values.cursorStyle !== "blink") {
      extra.push(`cursorStyle=${values.cursorStyle}`);
    }
    if (values.enableVirtualKeyboard) extra.push("virtualKeyboard");
    if (extra.length > 0) {
      envLines.push(`Settings: ${extra.join(", ")}`);
    }
  }

  if (envLines.length > 0) {
    params.set("env-info", envLines.join("\n"));
  }

  const repo =
    appInfo?.GITHUB_REPOSITORY ||
    defaultAppInfo?.GITHUB_REPOSITORY ||
    "ptt/ptt-term";
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}
