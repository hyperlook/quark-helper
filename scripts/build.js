import { watch } from 'node:fs';
import { resolve } from 'node:path';
import pkg from '../package.json';

const OUT_FILE = 'quark-download-helper.user.js';

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         夸克网盘极速直下助手 (Quark Download Helper)
// @namespace    ${pkg.homepage}
// @version      ${pkg.version}
// @description  ${pkg.description}
// @author       ${pkg.author}
// @match        https://pan.quark.cn/*
// @match        http://pan.quark.cn/*
// @icon         https://pan.quark.cn/favicon.ico
// @updateURL    ${pkg.homepage}/releases/latest/download/${OUT_FILE}
// @downloadURL  ${pkg.homepage}/releases/latest/download/${OUT_FILE}
// @grant        unsafeWindow
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-start
// @connect      drive.quark.cn
// @connect      drive-pc.quark.cn
// @connect      pan.quark.cn
// @connect      *
// @license      ${pkg.license}
// ==/UserScript==
`;

async function build() {
  const start = performance.now();
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, '../src/index.js')],
    format: 'iife',
    target: 'browser',
    minify: false,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  });

  if (!result.success) {
    console.error('❌ Build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    return false;
  }

  const outputCode = await result.outputs[0].text();
  const finalContent = `${USERSCRIPT_HEADER}\n${outputCode}`;
  await Bun.write(resolve(import.meta.dir, '..', OUT_FILE), finalContent);

  const duration = (performance.now() - start).toFixed(1);
  console.log(`✅ [${new Date().toLocaleTimeString()}] Built ${OUT_FILE} in ${duration}ms`);
  return true;
}

await build();

if (process.argv.includes('--watch') || process.argv.includes('-w')) {
  console.log('👀 Watching src/ for changes...');
  const srcDir = resolve(import.meta.dir, '../src');
  let timer = null;

  watch(srcDir, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`🔄 Detected change in ${filename}, rebuilding...`);
      build();
    }, 100);
  });
}
