# dagoujiao-browser-kernel
纯 TypeScript 编写的浏览器逻辑内核，零第三方依赖，MIT 协议开源。不是渲染引擎，而是负责浏览器"大脑"逻辑的独立内核层，任何渲染层（Electron、CEF、Tauri、WebView）都可加载它获得完整浏览器核心能力。含自研扩展运行时，兼容 Chrome/Edge（Manifest V2/V3）及火狐 WebExtensions 子集。
