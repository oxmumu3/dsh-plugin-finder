import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { finderCss } from '../src/client-style.js';
import { experienceCss } from '../src/experience-style.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs/design/experience-v2/index.html');
const result = await build({ absWorkingDir: root, entryPoints: ['docs/design/experience-v2/preview-entry.jsx'], bundle: true, write: false, minify: true, format: 'iife', platform: 'browser', target: ['chrome120'], define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'inline', metafile: true });
const bundle = result.outputFiles[0].text.replace(/<\/script/giu, '<\\/script');
const scriptHash = createHash('sha256').update(bundle).digest('base64');
const extraCss = `
html,body{margin:0;min-height:100%;background:#f4f7fa}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}.pf_root.pf_v2{min-height:100vh}.demo_header_actions{display:flex;align-items:center;gap:12px}.demo_mode{font-size:12px;color:var(--pfv_muted);border:1px solid var(--pfv_line);border-radius:6px;padding:3px 7px}.demo_boundary{font-size:12px;line-height:1.7;color:var(--pfv_muted);margin:-13px 0 24px}.demo_footer{display:flex;justify-content:space-between;gap:20px;border-top:1px solid var(--pfv_line);margin-top:30px;padding-top:17px;font-size:12px;color:var(--pfv_muted)}.demo_footer a{color:var(--pfv_muted)}.demo_checks{margin-top:12px;font-size:13px;color:var(--pfv_muted)}.demo_checks summary{cursor:pointer;min-height:44px;padding:10px 0}.demo_checks .pf_actions{flex-wrap:wrap}.demo_results{margin-top:18px;padding-top:16px;border-top:1px solid var(--pfv_line)}.demo_results h4{font-size:14px;margin:0}.demo_results dl{margin:12px 0 0}.demo_results dl>div+div{margin-top:12px}.demo_results dt{font-size:14px;font-weight:600}.demo_results dd{font-size:13px;margin:3px 0 0;line-height:1.8;color:var(--pfv_muted);overflow-wrap:anywhere}.demo_history_title{font-size:26px;margin:17px 0 20px}.demo_history_item{padding:18px 0;border-bottom:1px solid var(--pfv_line);display:flex;gap:15px;align-items:center;flex-wrap:wrap}.demo_history_item p{flex:1 1 300px;margin:0;overflow-wrap:anywhere}.demo_featured_detail>.pfv_outcome_document{margin-top:14px}.demo_featured_detail h1{font-size:28px;line-height:1.5}.demo_featured_detail .pfv_prose{margin-top:15px}a:focus-visible{outline:3px solid var(--pfv_accent);outline-offset:3px}@media(max-width:760px){.demo_boundary{margin-top:-8px;font-size:12px}.demo_footer{flex-direction:column;gap:8px}.demo_header_actions{gap:5px}.demo_mode{font-size:11px}.demo_featured_detail h1{font-size:23px}}
`;
const css = `${finderCss}\n${experienceCss}\n${extraCss}`;
const html = `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="theme-color" content="#f4f7fa">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'">\n<title>Finder · 在当前工作区使用或创建</title>\n<style>${css}</style>\n</head>\n<body>\n<div id="app"></div>\n<noscript>此离线演示需要 JavaScript。没有连接模型或真实服务。</noscript>\n<script>${bundle}</script>\n</body>\n</html>\n`;
await fs.writeFile(output, html);
const productionInputs = Object.keys(result.metafile.inputs).filter(name => name.startsWith('src/')).sort();
const sources = ['scripts/build-experience-preview.mjs', 'docs/design/experience-v2/preview-entry.jsx', 'docs/design/experience-v2/preview-controller.mjs', 'src/client-style.js', 'src/experience-style.js', ...productionInputs];
const hashes = [];
for (const relative of [...new Set(sources)].sort()) { const bytes = await fs.readFile(path.join(root, relative)); hashes.push({ file: relative, sha256: createHash('sha256').update(bytes).digest('hex') }); }
const receipt = { mode: 'bounded-offline-demo', sharedProductionComponents: productionInputs, bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), inlineScriptSha256: scriptHash, sourceHashes: hashes, network: 'blocked-by-CSP', storageKey: 'dsh.plugin-finder.current-workspace-demo.v1', browserTested: false };
await fs.writeFile(path.join(path.dirname(output), 'build-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ output, bytes: receipt.bytes, sha256: receipt.sha256, sharedProductionComponents: productionInputs }, null, 2));
