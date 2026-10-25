namespace DGBrowser {
  export const VERSION = "1.3.0";
  export const KERNEL_NAME = "大狗叫内核";

  export const ENGINES: Record<string, { name: string; url: string }> = {
    bing: { name: "必应", url: "https://cn.bing.com/search?q=" },
    baidu: { name: "百度", url: "https://www.baidu.com/s?wd=" },
    google: { name: "谷歌", url: "https://www.google.com/search?q=" },
    sogou: { name: "搜狗", url: "https://www.sogou.com/web?query=" },
    so360: { name: "360搜索", url: "https://www.so.com/s?q=" },
    quark: { name: "夸克", url: "https://quark.sm.cn/s?q=" },
  };

  const TRACKERS: string[] = [
    "google-analytics.com", "googletagmanager.com", "doubleclick.net",
    "googlesyndication.com", "googleadservices.com", "2mdn.net",
    "facebook.net", "connect.facebook.net", "fbcdn.net",
    "scorecardresearch.com", "criteo.com", "criteo.net", "taboola.com",
    "outbrain.com", "adnxs.com", "adsrvr.org", "rubiconproject.com",
    "openx.net", "pubmatic.com", "casalemedia.com", "moatads.com",
    "quantserve.com", "bidswitch.net", "adform.net", "amazon-adsystem.com",
    "adsafeprotected.com", "media.net", "contextweb.com", "inmobi.com",
    "teads.tv", "smartadserver.com", "sascdn.com", "serving-sys.com",
    "bluekai.com", "demdex.net", "everesttech.net", "mathtag.com",
    "rlcdn.com", "tapad.com", "agkn.com",

    "tanx.com", "miaozhen.com", "cnzz.com", "51.la", "appsflyer.com",
    "adjust.com", "branch.io", "segment.io", "mparticle.com", "chartbeat.com",
    "parsely.com", "mixpanel.com", "kochava.com", "singular.net", "talkingdata.com",
  ];

  const MALICIOUS: string[] = [

  ];

  function suspiciousUrl(u: URL): boolean {
    const h = u.hostname.toLowerCase();
    const p = u.pathname.toLowerCase();
    const ipRe = /^\d{1,3}(\.\d{1,3}){3}$/;
    if (ipRe.test(h) && /(login|verify|secure|bank|pay|signin|password)/.test(p)) return true;
    if (/(alipay|wechat|paypal|apple|microsoft|taobao|jd|icbc|ccb|abc|cmb|boc|bocom|psbc|spdb|cmbc|ceb|hxb|gdb|pingan|bankofchina|citicbank)([.-](id|verify|login|secure|update|support))/i.test(h)) return true;
    if (/(prize|lottery|jackpot|cashback|free-vip|reward)/i.test(p)) return true;
    return false;
  }

  interface KV {
    get(k: string): string | null;
    set(k: string, v: string): void;
    remove(k: string): void;
  }

  export interface Settings {
    theme: string;
    accent: string;
    fontSize: number;
    density: string;
    searchEngine: string;
    homePage: string;
    trackerBlock: boolean;
    httpsOnly: boolean;
    incognito: boolean;
    downloadDir: string;
    maxParallel: number;
  }

  export interface Item {
    title: string;
    url: string;
    ts: number;
  }

  export interface DownloadItem {
    name: string;
    url: string;
    status: string;
    size: number;
    ts: number;
  }

  export interface BlockedItem {
    host: string;
    ts: number;
  }

  export interface SessionStats {
    nav: number;
    search: number;
    https: number;
    incognitoOpens: number;
    blocked: BlockedItem[];
  }

  const DEFAULT_SETTINGS: Settings = {
    theme: "light",
    accent: "#2563eb",
    fontSize: 14,
    density: "comfort",
    searchEngine: "bing",
    homePage: "https://www.baidu.com",
    trackerBlock: true,
    httpsOnly: false,
    incognito: false,
    downloadDir: "",
    maxParallel: 3,
  };

  let store: KV = memStore();
  let settings: Settings = Object.assign({}, DEFAULT_SETTINGS);
  let history: Item[] = [];
  let bookmarks: Item[] = [];
  let downloads: DownloadItem[] = [];
  let navSeq = 0;
  let session: SessionStats = { nav: 0, search: 0, https: 0, incognitoOpens: 0, blocked: [] };

  function memStore(): KV {
    const m: Record<string, string> = {};
    return {
      get(k: string): string | null { return k in m ? m[k] : null; },
      set(k: string, v: string): void { m[k] = v; },
      remove(k: string): void { delete m[k]; },
    };
  }

  function defaultStore(): KV {
    try {
      if (typeof localStorage !== "undefined" && localStorage) {
        return {
          get(k: string): string | null { return localStorage.getItem("dgb_" + k); },
          set(k: string, v: string): void { localStorage.setItem("dgb_" + k, v); },
          remove(k: string): void { localStorage.removeItem("dgb_" + k); },
        };
      }
    } catch (e) { }
    return memStore();
  }

  function parseJson<T>(s: string | null, d: T): T {
    if (!s) return d;
    try { const v = JSON.parse(s); return v === null || v === undefined ? d : v; } catch (e) { return d; }
  }

  function save(k: string, v: unknown): void {
    try { store.set(k, JSON.stringify(v)); } catch (e) { }
  }

  export function init(opts?: { store?: KV; seed?: Partial<Settings> }): void {
    store = opts && opts.store ? opts.store : defaultStore();
    settings = Object.assign({}, DEFAULT_SETTINGS, parseJson<Partial<Settings>>(store.get("settings"), {}), opts && opts.seed ? opts.seed : {});
    history = parseJson<Item[]>(store.get("history"), []);
    bookmarks = parseJson<Item[]>(store.get("bookmarks"), []);
    downloads = parseJson<DownloadItem[]>(store.get("downloads"), []);
    session = { nav: 0, search: 0, https: 0, incognitoOpens: 0, blocked: [] };
  }

  export function parseInput(input: string): { type: string; url: string } {
    const t = (input || "").trim();
    if (!t) return { type: "url", url: settings.homePage };
    if (/^(https?|file|about|data):/i.test(t)) return { type: "url", url: t };
    if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(t)
      || /^localhost(:\d+)?(\/.*)?$/i.test(t)
      || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(t)) {
      return { type: "url", url: "https://" + t };
    }
    const e = ENGINES[settings.searchEngine] || ENGINES.bing;
    return { type: "search", url: e.url + encodeURIComponent(t) };
  }

  export function checkUrl(url: string): { ok: boolean; reason?: string; redirect?: string; host?: string; warn?: boolean } {
    let u: URL;
    try { u = new URL(url); } catch (e) { return { ok: true }; }
    if (settings.httpsOnly && u.protocol === "http:") {
      u.protocol = "https:";
      return { ok: true, redirect: u.toString() };
    }
    const h = u.hostname.toLowerCase();
    if (MALICIOUS.some(t => h === t || h.endsWith("." + t))) {
      return { ok: false, reason: "malicious", host: h };
    }
    if (settings.trackerBlock && TRACKERS.some(t => h === t || h.endsWith("." + t))) {
      return { ok: false, reason: "tracker", host: h };
    }
    if (suspiciousUrl(u)) {
      return { ok: true, warn: true, reason: "suspicious", host: h };
    }
    return { ok: true };
  }

  export function suspicious(url: string): boolean {
    try { return suspiciousUrl(new URL(url)); } catch (e) { return false; }
  }

  export function malicious(): string[] { return MALICIOUS.slice(); }

  export function navigate(raw: string): string {
    const p = parseInput(raw);
    if (p.type === "search") session.search++;
    const chk = checkUrl(p.url);
    if (chk.redirect) {
      session.nav++;
      try { if (new URL(chk.redirect).protocol === "https:") session.https++; } catch (e) { }
      return chk.redirect;
    }
    if (!chk.ok) {
      const host = chk.host || "";
      if (!session.blocked.some(b => b.host === host)) session.blocked.push({ host: host, ts: Date.now() });
      return "about:blocked?host=" + encodeURIComponent(host);
    }
    session.nav++;
    try { if (new URL(p.url).protocol === "https:") session.https++; } catch (e) { }
    return p.url;
  }

  export function recordHistory(title: string, url: string): void {
    if (settings.incognito) return;
    if (!/^https?:/i.test(url)) return;
    if (history.length && history[0].url === url) return;
    history.unshift({ title: title || url, url: url, ts: Date.now() });
    if (history.length > 600) history.length = 600;
    save("history", history);
  }

  export function updateHistoryTitle(url: string, title: string): void {
    const h = history.find(x => x.url === url);
    if (h) { h.title = title; save("history", history); }
  }

  export function historyAll(): Item[] { return history.slice(); }
  export function historySearch(q: string): Item[] {
    const s = (q || "").toLowerCase();
    if (!s) return history.slice();
    return history.filter(x => (x.title || "").toLowerCase().indexOf(s) >= 0 || x.url.toLowerCase().indexOf(s) >= 0);
  }
  export function historyRemove(url: string): void {
    const i = history.findIndex(x => x.url === url);
    if (i >= 0) { history.splice(i, 1); save("history", history); }
  }
  export function historyClear(): void { history = []; save("history", history); }

  export function bookmarksAll(): Item[] { return bookmarks.slice(); }
  export function isBookmarked(url: string): boolean { return bookmarks.some(b => b.url === url); }
  export function addBookmark(title: string, url: string): void {
    if (isBookmarked(url)) return;
    bookmarks.unshift({ title: title || url, url: url, ts: Date.now() });
    save("bookmarks", bookmarks);
  }
  export function removeBookmark(url: string): void {
    const i = bookmarks.findIndex(b => b.url === url);
    if (i >= 0) { bookmarks.splice(i, 1); save("bookmarks", bookmarks); }
  }
  export function bookmarksClear(): void { bookmarks = []; save("bookmarks", bookmarks); }

  export function addDownload(url: string, name?: string): DownloadItem {
    const item: DownloadItem = { name: name || nameOf(url), url: url, status: "downloading", size: 0, ts: Date.now() };
    downloads.unshift(item);
    if (downloads.length > 200) downloads.length = 200;
    save("downloads", downloads);
    return item;
  }
  export function updateDownload(url: string, patch: Partial<DownloadItem>): void {
    const d = downloads.find(x => x.url === url);
    if (d) { Object.assign(d, patch); save("downloads", downloads); }
  }
  export function downloadRemove(url: string): void {
    const i = downloads.findIndex(d => d.url === url);
    if (i >= 0) { downloads.splice(i, 1); save("downloads", downloads); }
  }
  export function downloadsClear(): void { downloads = []; save("downloads", downloads); }
  export function downloadsAll(): DownloadItem[] { return downloads.slice(); }

  export function getSettings(): Settings { return Object.assign({}, settings); }
  export function setSettings(patch: Partial<Settings>): Settings {
    settings = Object.assign({}, settings, patch);
    save("settings", settings);
    return getSettings();
  }
  export function resetSettings(): Settings {
    settings = Object.assign({}, DEFAULT_SETTINGS);
    save("settings", settings);
    return getSettings();
  }

  export function sessionStats(): SessionStats {
    return {
      nav: session.nav,
      search: session.search,
      https: session.https,
      incognitoOpens: session.incognitoOpens,
      blocked: session.blocked.slice(),
    };
  }

  export function countIncognitoOpen(): void { session.incognitoOpens++; }

  export function trackers(): string[] { return TRACKERS.slice(); }

  function nameOf(url: string): string {
    try {
      const u = new URL(url);
      const n = u.pathname.split("/").filter(Boolean).pop();
      return n ? decodeURIComponent(n) : u.hostname;
    } catch (e) { return url; }
  }
}
