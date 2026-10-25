export interface Host {
  tabs(): { id: number; url: string; title: string; active: boolean }[];
  inject(tabId: number, code: string): void;
  openPopup(html: string, w: number, h: number): void;
  openBackground(scripts: string[], done: (code: string) => void): void;
  injectBg(extId: string, code: string): void;
  broadcast(ch: string, data: unknown): void;
  on(ch: string, cb: (data: any) => void): void;
  storageFile(id: string): string;
  readFile(dir: string, rel: string): string | null;
}

interface Script {
  matches: RegExp[];
  js: string[];
  css: string[];
  runAt: string;
}

export interface Ext {
  id: string;
  dir: string;
  name: string;
  version: string;
  mv: number;
  enabled: boolean;
  manifest: Record<string, unknown>;
  bg: string[];
  scripts: Script[];
  popup: string | null;
  hasAction: boolean;
  storage: Record<string, unknown>;
}

const BRIDGE = `(function(){var _q={},_ls={};
function _call(m,a,cb){window.__dgbExt.send("api",{e:window.__DGB_EXT_ID,m:m,a:a});_q[m+":"+JSON.stringify(a||{})]=cb||function(){};}
window.__dgbExt.on("api.res",function(r){var k=r.m+":"+JSON.stringify(r.a||{});var cb=_q[k];if(cb){cb(r.err?null:r.v);delete _q[k];}});
window.__dgbExt.on("event",function(ev){if(ev.name==="runtime.onMessage"&&_ls.runtime)_ls.runtime(ev.msg,ev.sender,function(){});});
window.chrome={runtime:{id:window.__DGB_EXT_ID,getManifest:function(){return window.__DGB_EXT_MANIFEST;},sendMessage:function(m,cb){_call("runtime.sendMessage",{m:m},cb||function(){});},onMessage:{addListener:function(f){_ls.runtime=f;}}},
storage:{local:{get:function(k,cb){_call("storage.get",{k:k},function(v){if(cb)cb(v||{});});},set:function(o,cb){_call("storage.set",{o:o},function(v){if(cb)cb(v);});},remove:function(k,cb){_call("storage.remove",{k:k},function(v){if(cb)cb(v);});},clear:function(cb){_call("storage.clear",{},function(v){if(cb)cb(v);});}}},
tabs:{query:function(q,cb){_call("tabs.query",{q:q},function(v){if(cb)cb(v||[]);});},sendMessage:function(t,m,cb){_call("tabs.sendMessage",{t:t,m:m},function(v){if(cb)cb(v);});}},
action:{onClicked:{addListener:function(f){_call("action.onClicked",{},function(){});}}}};
window.browser={runtime:{id:window.__DGB_EXT_ID,getManifest:function(){return window.__DGB_EXT_MANIFEST;},sendMessage:function(m){return new Promise(function(res){window.chrome.runtime.sendMessage(m,res);});},onMessage:{addListener:function(f){window.chrome.runtime.onMessage.addListener(f);}}},
storage:{local:{get:function(k){return new Promise(function(res){window.chrome.storage.local.get(k,res);});},set:function(o){return new Promise(function(res){window.chrome.storage.local.set(o,res);});},remove:function(k){return new Promise(function(res){window.chrome.storage.local.remove(k,res);});},clear:function(){return new Promise(function(res){window.chrome.storage.local.clear(res);});}}},
tabs:{query:function(q){return new Promise(function(res){window.chrome.tabs.query(q,res);});},sendMessage:function(t,m){return new Promise(function(res){window.chrome.tabs.sendMessage(t,m,res);});}}};
})();`;

function globRe(p: string): RegExp | null {
  if (!p) return null;
  if (p === "<all_urls>") return /^(https?|file|ftp):\/\//;
  let s = p;
  if (s.indexOf("://") < 0) s = "*://" + s;
  const m = s.match(/^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)?$/);
  if (!m) return null;
  const host = m[2].replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const path = (m[3] || "/").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + (m[1] === "*" ? "(https?|file|ftp)" : m[1]) + "://" + host + path + "$");
}

export class ExtRuntime {
  exts: Ext[] = [];
  constructor(public host: Host, public fs: any, public path: any) {
    host.on("api", (m: any) => this.api(m));
  }

  list() {
    return this.exts.map(e => ({ id: e.id, name: e.name, version: e.version, enabled: e.enabled, hasAction: e.hasAction }));
  }

  load(dir: string, enabled: boolean): Ext | null {
    let mf: any;
    try { mf = JSON.parse(this.fs.readFileSync(this.path.join(dir, "manifest.json"), "utf8")); } catch (e) { return null; }
    if (!mf || !mf.name || !mf.version) return null;
    if (mf.manifest_version !== 2 && mf.manifest_version !== 3) return null;
    const id = "ext-" + String(mf.name).replace(/[^a-z0-9\u4e00-\u9fa5]/gi, "-").toLowerCase() + "-" + String(mf.version).replace(/[^0-9a-z]/gi, "");
    const scripts: Script[] = [];
    if (Array.isArray(mf.content_scripts)) {
      mf.content_scripts.forEach((c: any) => {
        if (!c || !Array.isArray(c.matches)) return;
        if (!(c.js && c.js.length) && !(c.css && c.css.length)) return;
        scripts.push({ matches: c.matches.map((x: string) => globRe(x)).filter(Boolean) as RegExp[], js: c.js || [], css: c.css || [], runAt: c.run_at || "document_idle" });
      });
    }
    const bg: any = mf.background;
    const ba = mf.action || mf.browser_action || {};
    const e: Ext = {
      id, dir, name: String(mf.name), version: String(mf.version), mv: mf.manifest_version,
      enabled, manifest: mf, bg: bg ? (Array.isArray(bg.scripts) ? bg.scripts : bg.service_worker ? [bg.service_worker] : []) : [],
      scripts, popup: ba.default_popup || null, hasAction: !!(mf.action || mf.browser_action), storage: {},
    };
    try { e.storage = JSON.parse(this.fs.readFileSync(this.host.storageFile(id), "utf8")); } catch (err) { e.storage = {}; }
    this.exts.push(e);
    if (enabled && e.bg.length) {
      const self = this;
      this.host.openBackground(e.bg, code => self.host.injectBg(e.id, code));
    }
    return e;
  }

  remove(id: string) {
    this.exts = this.exts.filter(e => e.id !== id);
  }

  toggle(id: string, on: boolean) {
    const e = this.exts.find(x => x.id === id);
    if (!e) return;
    e.enabled = on;
  }

  inject(tabId: number, url: string) {
    for (const e of this.exts) {
      if (!e.enabled) continue;
      if (!e.scripts.some(s => s.matches.some(r => r.test(url)))) continue;
      const pre = "var __DGB_EXT_ID=\"" + e.id + "\",__DGB_EXT_MANIFEST=" + JSON.stringify(e.manifest) + ";";
      for (const s of e.scripts) {
        for (const j of s.js) {
          const code = this.host.readFile(e.dir, j);
          if (code) this.host.inject(tabId, pre + BRIDGE + ";" + code);
        }
        for (const c of s.css) {
          const code = this.host.readFile(e.dir, c);
          if (code) this.host.inject(tabId, pre + "var s=document.createElement('style');s.textContent=" + JSON.stringify(code) + ";document.documentElement.appendChild(s);");
        }
      }
    }
  }

  popup(id: string) {
    const e = this.exts.find(x => x.id === id);
    if (!e || !e.popup) return;
    const p = this.path.join(e.dir, e.popup);
    if (this.fs.existsSync(p)) this.host.openPopup(p, 340, 420);
  }

  private api(m: any) {
    const e = this.exts.find(x => x.id === m.e);
    if (!e) { this.host.broadcast("api.res", { m: m.m, a: m.a, err: true }); return; }
    const out = (v: unknown, err?: boolean) => this.host.broadcast("api.res", { m: m.m, a: m.a, v, err });
    switch (m.m) {
      case "storage.get": {
        const k = m.a.k, r: Record<string, unknown> = {};
        if (k === null || k === undefined) Object.assign(r, e.storage);
        else if (typeof k === "string") r[k] = e.storage[k];
        else if (Array.isArray(k)) k.forEach((x: string) => r[x] = e.storage[x]);
        out(r);
        break;
      }
      case "storage.set": Object.assign(e.storage, m.a.o || {}); this.save(e); out({}); break;
      case "storage.remove": (m.a.k || []).forEach((x: string) => delete e.storage[x]); this.save(e); out({}); break;
      case "storage.clear": e.storage = {}; this.save(e); out({}); break;
      case "runtime.sendMessage":
        this.host.broadcast("event", { name: "runtime.onMessage", msg: m.a.m, sender: { id: e.id } });
        out({});
        break;
      case "tabs.query": out(this.host.tabs()); break;
      case "tabs.sendMessage":
        this.host.broadcast("event", { name: "runtime.onMessage", msg: m.a.m, sender: { id: e.id }, tabId: m.a.t });
        out({});
        break;
      default: out({});
    }
  }

  private save(e: Ext) {
    try { this.fs.writeFileSync(this.host.storageFile(e.id), JSON.stringify(e.storage)); } catch (err) { /* ignore */ }
  }
}

export default ExtRuntime;
