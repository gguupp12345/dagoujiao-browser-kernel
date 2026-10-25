import { readFileSync } from "fs";
import vm from "vm";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(__dirname, "../dist/kernel.js"), "utf8");
const mem = {};
const store = {
  get: (k) => (k in mem ? mem[k] : null),
  set: (k, v) => { mem[k] = v; },
  remove: (k) => { delete mem[k]; },
};
const ctx = { console, URL, encodeURIComponent, decodeURIComponent, JSON };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const K = ctx.DGBrowser;

let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name); }
}

K.init({ store });

assert("版本号", K.VERSION === "1.3.0");
assert("解析纯网址", K.parseInput("baidu.com").type === "url" && K.parseInput("baidu.com").url === "https://baidu.com");
assert("解析 https", K.parseInput("https://example.com/a").url === "https://example.com/a");
assert("解析搜索词", K.parseInput("大狗叫浏览器").type === "search");
assert("导航统计", K.navigate("https://www.example.com") === "https://www.example.com" && K.sessionStats().nav === 1);
assert("跟踪器拦截", K.navigate("https://doubleclick.net/x").indexOf("about:blocked") === 0);
assert("拦截记录", K.sessionStats().blocked.length === 1);
assert("广告域名拦截", K.navigate("https://tanx.com/x").indexOf("about:blocked") === 0);
assert("启发式不误判正常搜索", K.suspicious("https://www.baidu.com/s?wd=prize") === false);
assert("启发式命中仿冒", K.suspicious("https://alipay-verify.example.com/login"));
assert("启发式命中IP登录", K.suspicious("https://203.0.113.9:8443/secure/login") === true && K.suspicious("http://192.168.1.10/login.php") === true);
assert("历史记录", (K.recordHistory("测试页", "https://www.example.com/a"), K.historyAll().length === 1));
assert("无痕不记历史", (K.setSettings({ incognito: true }), K.recordHistory("无痕页", "https://www.example.com/b"), K.historyAll().length === 1));
assert("切回正常", K.setSettings({ incognito: false }).incognito === false);
assert("书签增删", (K.addBookmark("知乎", "https://www.zhihu.com"), K.isBookmarked("https://www.zhihu.com") && K.bookmarksAll().length === 1, K.removeBookmark("https://www.zhihu.com"), K.bookmarksAll().length === 0));
assert("下载记录", (K.addDownload("https://example.com/file.zip"), K.downloadsAll()[0].name === "file.zip", K.updateDownload("https://example.com/file.zip", { status: "done", size: 1024 }), K.downloadsAll()[0].status === "done"));
assert("强制HTTPS", (K.setSettings({ httpsOnly: true }), K.navigate("http://abc.com") === "https://abc.com/", K.setSettings({ httpsOnly: false })));
assert("设置持久化", (K.setSettings({ searchEngine: "baidu" }), K.getSettings().searchEngine === "baidu"));
assert("设置重启恢复", (K.init({ store }), K.getSettings().searchEngine === "baidu"));
assert("重置设置", K.resetSettings().searchEngine === "bing");
assert("存储恢复", (K.init({ store }), K.historyAll().length === 1, K.downloadsAll().length === 1, K.getSettings().searchEngine === "bing"));

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
