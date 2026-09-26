// Runs test/perf/bench.ts in Node and in Chromium, Firefox and WebKit (Playwright) and, if the
// oracle is built, oracle/BenchOracle.cs with Aml.Engine; prints one table per document and writes
// test/perf/out/results.json. The first document only warms up the JIT compilers and is not reported.
//   node test/perf/run.mjs [dotnet,node,chromium,firefox,webkit] [file...]
// Default files: test/corpus/MPS500_Integrated.aml (warm-up), then test/large/*.aml.
import { execFileSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, extname, join, resolve } from 'node:path';

const out = resolve('test/perf/out');
mkdirSync(out, { recursive: true });
const wanted = new Set((process.argv[2] ?? 'dotnet,node,chromium,firefox,webkit').split(','));
let files = process.argv.slice(3);
if (files.length === 0) {
  const large = existsSync('test/large') ? readdirSync('test/large').filter((f) => f.endsWith('.aml')).sort().map((f) => join('test/large', f)) : [];
  files = ['test/corpus/MPS500_Integrated.aml', ...large];
}
files = files.map((f) => resolve(f));

buildSync({ entryPoints: ['test/perf/bench.ts'], bundle: true, logLevel: 'error', format: 'esm', platform: 'node', outfile: join(out, 'bench.node.mjs') });
buildSync({ entryPoints: ['test/perf/bench.ts'], bundle: true, logLevel: 'error', minify: true, format: 'iife', globalName: 'AmlBench', platform: 'browser', outfile: join(out, 'bench.browser.js') });
writeFileSync(join(out, 'page.html'), '<!doctype html><html><head><meta charset="utf-8"><title>AmlEngine.js benchmark</title></head><body></body></html>');
writeFileSync(
  join(out, 'node-runner.mjs'),
  `import { readFileSync } from 'node:fs';
import { bench } from './bench.node.mjs';
const read = (f) => { const b = readFileSync(f); return new TextDecoder().decode(b[0] === 0xef ? b.subarray(3) : b); };
const heap = () => { globalThis.gc(); return process.memoryUsage().heapUsed; };
for (const f of process.argv.slice(2)) console.log(JSON.stringify(bench(f.split(/[\\\\/]/).pop(), read(f), () => performance.now(), heap)));
`,
);

const results = {};
const lines = (text) => text.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));

if (wanted.has('dotnet')) {
  const dll = process.env.ORACLE_DLL ?? 'oracle/bin/Release/net8.0/Oracle.dll';
  if (existsSync(dll)) results.dotnet = lines(execFileSync('dotnet', [dll, 'bench', ...files], { encoding: 'utf8', maxBuffer: 1 << 26 }));
  else console.log('dotnet: oracle not built, skipped');
}
if (wanted.has('node')) {
  results.node = lines(execFileSync(process.execPath, ['--expose-gc', '--max-old-space-size=8192', join(out, 'node-runner.mjs'), ...files], { encoding: 'utf8', maxBuffer: 1 << 26 }));
}
for (const name of ['chromium', 'firefox', 'webkit']) {
  if (wanted.has(name)) results[name] = await runBrowser(name);
}

writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 1));
for (const f of files.slice(1)) {
  const file = basename(f);
  console.log(`\n${file} (${(readFileSync(f).length / 1048576).toFixed(1)} MB)`);
  console.log('env        load ms   walk ms   find ms   save ms  valid. ms  heap MB  loadIdx ms  findIdx ms  walkSum / valid');
  for (const [env, rows] of Object.entries(results)) {
    const r = rows.find((x) => x.file === file);
    if (!r) continue;
    const c = (k, w = 9) => String(r[k] ?? '-').padStart(w);
    console.log(`${env.padEnd(9)}${c('load')} ${c('walk')} ${c('find')} ${c('save')} ${c('validate', 10)} ${c('heapMB', 8)} ${c('loadIndexed', 11)} ${c('findIndexed', 11)}  ${r.walkSum} / ${r.valid}`);
  }
}

/** Runs the benchmark in a Playwright browser, the files served over HTTP. */
async function runBrowser(name) {
  const { chromium, firefox, webkit } = await import('playwright');
  const type = { chromium, firefox, webkit }[name];
  const byName = new Map(files.map((f) => [basename(f), f]));
  const server = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(1);
    const file = p.startsWith('doc/') ? byName.get(p.slice(4)) : join(out, p);
    if (!file || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const types = { '.html': 'text/html', '.js': 'text/javascript' };
    res.writeHead(200, { 'content-type': (types[extname(file)] ?? 'text/plain') + '; charset=utf-8' }).end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await type.launch(name === 'chromium' ? { args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] } : {});
  const rows = [];
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/page.html`);
    await page.addScriptTag({ url: 'bench.browser.js' });
    for (const f of files) {
      const row = await page.evaluate(async (file) => {
        const text = await (await fetch('doc/' + encodeURIComponent(file))).text();
        const heap = () => {
          if (typeof gc === 'function') gc();
          return performance.memory ? performance.memory.usedJSHeapSize : null;
        };
        try {
          return AmlBench.bench(file, text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, () => performance.now(), heap);
        } catch (e) {
          return { file, error: `${e.name}: ${e.message}` };
        }
      }, basename(f));
      if (row.error) console.log(`${name} ${row.file}: ${row.error}`);
      rows.push(row);
    }
  } finally {
    await browser.close();
    server.close();
  }
  return rows;
}
