// Browser check: bundles test/browser/scenario.ts for Node and for the browser, runs it in Node
// and in headless Microsoft Edge (Windows) and requires identical reports.
//   node test/browser/run.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const out = resolve('test/browser/out');
mkdirSync(out, { recursive: true });
const esbuild = (args) => execFileSync(process.execPath, ['node_modules/esbuild/bin/esbuild', 'test/browser/scenario.ts', '--bundle', '--log-level=error', ...args], { stdio: 'inherit' });
esbuild(['--format=esm', '--platform=node', `--outfile=${join(out, 'scenario.node.mjs')}`]);
esbuild(['--minify', '--format=iife', '--global-name=AmlScenario', '--platform=browser', `--outfile=${join(out, 'scenario.browser.js')}`]);

const read = (f) => {
  const b = readFileSync(f);
  return new TextDecoder().decode(b[0] === 0xef ? b.subarray(3) : b);
};
const inputs = { big: read('test/corpus/MPS500_Integrated.aml'), plant: read('test/corpus/plant.aml'), lib: read('test/corpus/6_RCL.aml') };
writeFileSync(join(out, 'inputs.js'), 'window.INPUTS=' + JSON.stringify(inputs) + ';');
writeFileSync(
  join(out, 'page.html'),
  `<!doctype html><html><head><meta charset="utf-8"><title>AmlEngine.js browser check</title></head><body><pre id="out">not run</pre>
<script src="inputs.js"></script><script src="scenario.browser.js"></script>
<script>try { document.getElementById('out').textContent = JSON.stringify(AmlScenario.runScenario(window.INPUTS)); }
catch (e) { document.getElementById('out').textContent = 'ERROR ' + e.name + ': ' + e.message + ' | ' + e.stack; }</script></body></html>`,
);

const { runScenario } = await import(pathToFileURL(join(out, 'scenario.node.mjs')).href);
const node = runScenario(inputs);

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!edge) throw new Error('Microsoft Edge not found');
// Edge writes the DOM only when started through PowerShell's Start-Process with the output
// redirected to a file; spawning it directly from Node returns nothing.
const dumpFile = join(out, 'browser.html');
const profile = mkdtempSync(join(tmpdir(), 'amlengine-edge-'));
const ps = (v) => `'${v.replace(/'/g, "''")}'`;
const args = ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--virtual-time-budget=60000', '--dump-dom', pathToFileURL(join(out, 'page.html')).href];
spawnSync('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath ${ps(edge)} -ArgumentList @(${args.map(ps).join(',')}) -RedirectStandardOutput ${ps(dumpFile)} -RedirectStandardError ${ps(join(out, 'browser.err'))} -Wait -NoNewWindow`], { stdio: 'inherit' });
const dumped = readFileSync(dumpFile, 'utf8');
const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dumped);
if (!m) throw new Error('no output from Edge');
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
if (!text.startsWith('[')) throw new Error('browser run failed: ' + text.slice(0, 2000));
const browser = JSON.parse(text);
const diffs = node.map((x, i) => (x === browser[i] ? null : i)).filter((i) => i !== null);
if (diffs.length || node.length !== browser.length) {
  for (const i of diffs.slice(0, 5)) console.log(`line ${i}\n  node:    ${node[i].slice(0, 300)}\n  browser: ${(browser[i] ?? '').slice(0, 300)}`);
  console.log(`FAILED: ${diffs.length} of ${node.length} lines differ`);
  process.exit(1);
}
console.log(`browser check passed: ${node.length} results identical in Node and Edge`);
