"use strict";
var DGBrowser;
(function (DGBrowser) {
    DGBrowser.VERSION = "1.3.0";
    DGBrowser.KERNEL_NAME = "大狗叫内核";
    DGBrowser.ENGINES = {
        bing: { name: "必应", url: "https://cn.bing.com/search?q=" },
        baidu: { name: "百度", url: "https://www.baidu.com/s?wd=" },
        google: { name: "谷歌", url: "https://www.google.com/search?q=" },
        sogou: { name: "搜狗", url: "https://www.sogou.com/web?query=" },
        so360: { name: "360搜索", url: "https://www.so.com/s?q=" },
        quark: { name: "夸克", url: "https://quark.sm.cn/s?q=" },
    };
    var TRACKERS = [
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
    var MALICIOUS = [];
    function suspiciousUrl(u) {
        var h = u.hostname.toLowerCase();
        var p = u.pathname.toLowerCase();
        var ipRe = /^\d{1,3}(\.\d{1,3}){3}$/;
        if (ipRe.test(h) && /(login|verify|secure|bank|pay|signin|password)/.test(p))
            return true;
        if (/(alipay|wechat|paypal|apple|microsoft|taobao|jd|icbc|ccb|abc|cmb|boc|bocom|psbc|spdb|cmbc|ceb|hxb|gdb|pingan|bankofchina|citicbank)([.-](id|verify|login|secure|update|support))/i.test(h))
            return true;
        if (/(prize|lottery|jackpot|cashback|free-vip|reward)/i.test(p))
            return true;
        return false;
    }
    var DEFAULT_SETTINGS = {
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
    var store = memStore();
    var settings = Object.assign({}, DEFAULT_SETTINGS);
    var history = [];
    var bookmarks = [];
    var downloads = [];
    var navSeq = 0;
    var session = { nav: 0, search: 0, https: 0, incognitoOpens: 0, blocked: [] };
    function memStore() {
        var m = {};
        return {
            get: function (k) { return k in m ? m[k] : null; },
            set: function (k, v) { m[k] = v; },
            remove: function (k) { delete m[k]; },
        };
    }
    function defaultStore() {
        try {
            if (typeof localStorage !== "undefined" && localStorage) {
                return {
                    get: function (k) { return localStorage.getItem("dgb_" + k); },
                    set: function (k, v) { localStorage.setItem("dgb_" + k, v); },
                    remove: function (k) { localStorage.removeItem("dgb_" + k); },
                };
            }
        }
        catch (e) { }
        return memStore();
    }
    function parseJson(s, d) {
        if (!s)
            return d;
        try {
            var v = JSON.parse(s);
            return v === null || v === undefined ? d : v;
        }
        catch (e) {
            return d;
        }
    }
    function save(k, v) {
        try {
            store.set(k, JSON.stringify(v));
        }
        catch (e) { }
    }
    function init(opts) {
        store = opts && opts.store ? opts.store : defaultStore();
        settings = Object.assign({}, DEFAULT_SETTINGS, parseJson(store.get("settings"), {}), opts && opts.seed ? opts.seed : {});
        history = parseJson(store.get("history"), []);
        bookmarks = parseJson(store.get("bookmarks"), []);
        downloads = parseJson(store.get("downloads"), []);
        session = { nav: 0, search: 0, https: 0, incognitoOpens: 0, blocked: [] };
    }
    DGBrowser.init = init;
    function parseInput(input) {
        var t = (input || "").trim();
        if (!t)
            return { type: "url", url: settings.homePage };
        if (/^(https?|file|about|data):/i.test(t))
            return { type: "url", url: t };
        if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(t)
            || /^localhost(:\d+)?(\/.*)?$/i.test(t)
            || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(t)) {
            return { type: "url", url: "https://" + t };
        }
        var e = DGBrowser.ENGINES[settings.searchEngine] || DGBrowser.ENGINES.bing;
        return { type: "search", url: e.url + encodeURIComponent(t) };
    }
    DGBrowser.parseInput = parseInput;
    function checkUrl(url) {
        var u;
        try {
            u = new URL(url);
        }
        catch (e) {
            return { ok: true };
        }
        if (settings.httpsOnly && u.protocol === "http:") {
            u.protocol = "https:";
            return { ok: true, redirect: u.toString() };
        }
        var h = u.hostname.toLowerCase();
        if (MALICIOUS.some(function (t) { return h === t || h.endsWith("." + t); })) {
            return { ok: false, reason: "malicious", host: h };
        }
        if (settings.trackerBlock && TRACKERS.some(function (t) { return h === t || h.endsWith("." + t); })) {
            return { ok: false, reason: "tracker", host: h };
        }
        if (suspiciousUrl(u)) {
            return { ok: true, warn: true, reason: "suspicious", host: h };
        }
        return { ok: true };
    }
    DGBrowser.checkUrl = checkUrl;
    function suspicious(url) {
        try {
            return suspiciousUrl(new URL(url));
        }
        catch (e) {
            return false;
        }
    }
    DGBrowser.suspicious = suspicious;
    function malicious() { return MALICIOUS.slice(); }
    DGBrowser.malicious = malicious;
    function navigate(raw) {
        var p = parseInput(raw);
        if (p.type === "search")
            session.search++;
        var chk = checkUrl(p.url);
        if (chk.redirect) {
            session.nav++;
            try {
                if (new URL(chk.redirect).protocol === "https:")
                    session.https++;
            }
            catch (e) { }
            return chk.redirect;
        }
        if (!chk.ok) {
            var host_1 = chk.host || "";
            if (!session.blocked.some(function (b) { return b.host === host_1; }))
                session.blocked.push({ host: host_1, ts: Date.now() });
            return "about:blocked?host=" + encodeURIComponent(host_1);
        }
        session.nav++;
        try {
            if (new URL(p.url).protocol === "https:")
                session.https++;
        }
        catch (e) { }
        return p.url;
    }
    DGBrowser.navigate = navigate;
    function recordHistory(title, url) {
        if (settings.incognito)
            return;
        if (!/^https?:/i.test(url))
            return;
        if (history.length && history[0].url === url)
            return;
        history.unshift({ title: title || url, url: url, ts: Date.now() });
        if (history.length > 600)
            history.length = 600;
        save("history", history);
    }
    DGBrowser.recordHistory = recordHistory;
    function updateHistoryTitle(url, title) {
        var h = history.find(function (x) { return x.url === url; });
        if (h) {
            h.title = title;
            save("history", history);
        }
    }
    DGBrowser.updateHistoryTitle = updateHistoryTitle;
    function historyAll() { return history.slice(); }
    DGBrowser.historyAll = historyAll;
    function historySearch(q) {
        var s = (q || "").toLowerCase();
        if (!s)
            return history.slice();
        return history.filter(function (x) { return (x.title || "").toLowerCase().indexOf(s) >= 0 || x.url.toLowerCase().indexOf(s) >= 0; });
    }
    DGBrowser.historySearch = historySearch;
    function historyRemove(url) {
        var i = history.findIndex(function (x) { return x.url === url; });
        if (i >= 0) {
            history.splice(i, 1);
            save("history", history);
        }
    }
    DGBrowser.historyRemove = historyRemove;
    function historyClear() { history = []; save("history", history); }
    DGBrowser.historyClear = historyClear;
    function bookmarksAll() { return bookmarks.slice(); }
    DGBrowser.bookmarksAll = bookmarksAll;
    function isBookmarked(url) { return bookmarks.some(function (b) { return b.url === url; }); }
    DGBrowser.isBookmarked = isBookmarked;
    function addBookmark(title, url) {
        if (isBookmarked(url))
            return;
        bookmarks.unshift({ title: title || url, url: url, ts: Date.now() });
        save("bookmarks", bookmarks);
    }
    DGBrowser.addBookmark = addBookmark;
    function removeBookmark(url) {
        var i = bookmarks.findIndex(function (b) { return b.url === url; });
        if (i >= 0) {
            bookmarks.splice(i, 1);
            save("bookmarks", bookmarks);
        }
    }
    DGBrowser.removeBookmark = removeBookmark;
    function bookmarksClear() { bookmarks = []; save("bookmarks", bookmarks); }
    DGBrowser.bookmarksClear = bookmarksClear;
    function addDownload(url, name) {
        var item = { name: name || nameOf(url), url: url, status: "downloading", size: 0, ts: Date.now() };
        downloads.unshift(item);
        if (downloads.length > 200)
            downloads.length = 200;
        save("downloads", downloads);
        return item;
    }
    DGBrowser.addDownload = addDownload;
    function updateDownload(url, patch) {
        var d = downloads.find(function (x) { return x.url === url; });
        if (d) {
            Object.assign(d, patch);
            save("downloads", downloads);
        }
    }
    DGBrowser.updateDownload = updateDownload;
    function downloadRemove(url) {
        var i = downloads.findIndex(function (d) { return d.url === url; });
        if (i >= 0) {
            downloads.splice(i, 1);
            save("downloads", downloads);
        }
    }
    DGBrowser.downloadRemove = downloadRemove;
    function downloadsClear() { downloads = []; save("downloads", downloads); }
    DGBrowser.downloadsClear = downloadsClear;
    function downloadsAll() { return downloads.slice(); }
    DGBrowser.downloadsAll = downloadsAll;
    function getSettings() { return Object.assign({}, settings); }
    DGBrowser.getSettings = getSettings;
    function setSettings(patch) {
        settings = Object.assign({}, settings, patch);
        save("settings", settings);
        return getSettings();
    }
    DGBrowser.setSettings = setSettings;
    function resetSettings() {
        settings = Object.assign({}, DEFAULT_SETTINGS);
        save("settings", settings);
        return getSettings();
    }
    DGBrowser.resetSettings = resetSettings;
    function sessionStats() {
        return {
            nav: session.nav,
            search: session.search,
            https: session.https,
            incognitoOpens: session.incognitoOpens,
            blocked: session.blocked.slice(),
        };
    }
    DGBrowser.sessionStats = sessionStats;
    function countIncognitoOpen() { session.incognitoOpens++; }
    DGBrowser.countIncognitoOpen = countIncognitoOpen;
    function trackers() { return TRACKERS.slice(); }
    DGBrowser.trackers = trackers;
    function nameOf(url) {
        try {
            var u = new URL(url);
            var n = u.pathname.split("/").filter(Boolean).pop();
            return n ? decodeURIComponent(n) : u.hostname;
        }
        catch (e) {
            return url;
        }
    }
})(DGBrowser || (DGBrowser = {}));
