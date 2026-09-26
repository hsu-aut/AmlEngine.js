// Browser check: bundles test/browser/scenario.ts for Node and for the browser, runs it in Node,
// in headless Microsoft Edge (Windows, if installed) and in Chromium, Firefox and WebKit through
// Playwright, and requires identical reports. In the Playwright browsers it also runs every case of
// test/system/cases.json and test/gapsinfra/cases.json (test/browser/checks.ts) and requires the
// same result as in Node for each, unless explainDifference in checks.ts names a known reason (the
// sign of NaN, a documented deviation from .NET); those are counted per reason.
//   node test/browser/run.mjs [edge,chromium,firefox,webkit]
import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const out = resolve('test/browser/out');
mkdirSync(out, { recursive: true });
const esbuild = (args) => execFileSync(process.execPath, ['node_modules/esbuild/bin/esbuild', 'test/browser/scenario.ts', '--bundle', '--log-level=error', ...args], { stdio: 'inherit' });
esbuild(['--format=esm', '--platform=node', `--outfile=${join(out, 'scenario.node.mjs')}`]);
esbuild(['--minify', '--format=iife', '--global-name=AmlScenario', '--platform=browser', `--outfile=${join(out, 'scenario.browser.js')}`]);
const esbuildChecks = (args) => execFileSync(process.execPath, ['node_modules/esbuild/bin/esbuild', 'test/browser/checks.ts', '--bundle', '--log-level=error', ...args], { stdio: 'inherit' });
esbuildChecks(['--format=esm', '--platform=node', `--outfile=${join(out, 'checks.node.mjs')}`]);
esbuildChecks(['--minify', '--format=iife', '--global-name=AmlChecks', '--platform=browser', `--outfile=${join(out, 'checks.browser.js')}`]);
writeFileSync(join(out, 'sys-cases.json'), readFileSync('test/system/cases.json'));
writeFileSync(join(out, 'gaps-cases.json'), readFileSync('test/gapsinfra/cases.json'));

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
const { runChecks, explainDifference } = await import(pathToFileURL(join(out, 'checks.node.mjs')).href);
const checkCases = { sys: JSON.parse(readFileSync('test/system/cases.json', 'utf8')), gaps: JSON.parse(readFileSync('test/gapsinfra/cases.json', 'utf8')) };
const nodeChecks = runChecks(checkCases.sys, checkCases.gaps);

const wanted = new Set((process.argv[2] ?? 'edge,chromium,firefox,webkit').split(','));
const results = [];

/** Compares a browser report with the Node report; returns false and prints the first differences. */
function compare(name, text) {
  if (!text.startsWith('[')) {
    console.log(`${name}: run failed: ${text.slice(0, 2000)}`);
    return false;
  }
  const browser = JSON.parse(text);
  const diffs = node.map((x, i) => (x === browser[i] ? null : i)).filter((i) => i !== null);
  if (diffs.length || node.length !== browser.length) {
    for (const i of diffs.slice(0, 5)) console.log(`${name} line ${i}\n  node:    ${node[i].slice(0, 300)}\n  browser: ${(browser[i] ?? '').slice(0, 300)}`);
    console.log(`${name}: ${diffs.length} of ${node.length} lines differ`);
    return false;
  }
  return true;
}

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (wanted.has('edge') && edge) results.push(['Edge', runEdge()]);
else if (wanted.has('edge')) console.log('Edge: not installed, skipped');

for (const name of ['chromium', 'firefox', 'webkit']) {
  if (wanted.has(name)) results.push([name, await runPlaywright(name)]);
}

const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
if (failed.length > 0) {
  console.log(`FAILED in ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`browser check passed: ${node.length} results identical in Node and ${results.map(([n]) => n).join(', ')}`);

function runEdge() {
// Edge writes the DOM only when started through PowerShell's Start-Process with the output
// redirected to a file; spawning it directly from Node returns nothing.
const dumpFile = join(out, 'browser.html');
const profile = mkdtempSync(join(tmpdir(), 'amlengine-edge-'));
const ps = (v) => `'${v.replace(/'/g, "''")}'`;
const args = ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--virtual-time-budget=60000', '--dump-dom', pathToFileURL(join(out, 'page.html')).href];
spawnSync('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath ${ps(edge)} -ArgumentList @(${args.map(ps).join(',')}) -RedirectStandardOutput ${ps(dumpFile)} -RedirectStandardError ${ps(join(out, 'browser.err'))} -Wait -NoNewWindow`], { stdio: 'inherit' });
  const dumped = readFileSync(dumpFile, 'utf8');
  const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dumped);
  if (!m) {
    console.log('Edge: no output');
    return false;
  }
  return compare('Edge', m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

/** Runs the page in a Playwright browser, served over HTTP from test/browser/out. */
async function runPlaywright(name) {
  const { chromium, firefox, webkit } = await import('playwright');
  const type = { chromium, firefox, webkit }[name];
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
  const server = createServer((req, res) => {
    const file = join(out, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(out) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': (types[extname(file)] ?? 'application/octet-stream') + '; charset=utf-8' }).end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await type.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/page.html`);
    await page.waitForFunction(() => document.getElementById('out').textContent !== 'not run', null, { timeout: 120000 });
    const scenarioOk = compare(name, await page.evaluate(() => document.getElementById('out').textContent));
    await page.addScriptTag({ url: 'checks.browser.js' });
    const checks = await page.evaluate(async () => {
      const [sys, gaps] = await Promise.all([fetch('sys-cases.json').then((r) => r.json()), fetch('gaps-cases.json').then((r) => r.json())]);
      return AmlChecks.runChecks(sys, gaps);
    });
    writeFileSync(join(out, `${name}-checks.json`), JSON.stringify(checks));
    let checksOk = true;
    const explained = {};
    for (const part of ['sys', 'gaps']) {
      if (checks[part].length !== nodeChecks[part].length) {
        console.log(`${name}: ${checks[part].length} ${part} results instead of ${nodeChecks[part].length}`);
        checksOk = false;
        continue;
      }
      const unexplained = [];
      nodeChecks[part].forEach((x, i) => {
        if (x === checks[part][i]) return;
        const why = explainDifference(checkCases[part][i], part, x, checks[part][i]);
        if (why === null) unexplained.push(i);
        else explained[why] = (explained[why] ?? 0) + 1;
      });
      if (unexplained.length) {
        checksOk = false;
        for (const i of unexplained.slice(0, 5)) console.log(`${name} ${part} case ${i} ${checkCases[part][i].fn}\n  node:    ${nodeChecks[part][i].slice(0, 300)}\n  browser: ${(checks[part][i] ?? '').slice(0, 300)}`);
        console.log(`${name}: ${unexplained.length} of ${nodeChecks[part].length} ${part} cases differ from Node without a known reason`);
      }
    }
    if (checksOk) {
      const known = Object.entries(explained).map(([why, n]) => `${n} (${why})`);
      console.log(`${name}: ${nodeChecks.sys.length} system and ${nodeChecks.gaps.length} infrastructure cases as in Node` + (known.length ? `; differences with a known reason: ${known.join(', ')}` : ', all identical'));
    }
    return scenarioOk && checksOk;
  } finally {
    await browser.close();
    server.close();
  }
}
