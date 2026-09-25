// Read API parity (coverage package "reads"): replays the calls recorded by oracle/ReadsOracle.cs
// (one JSON line per call: [target, kind, member, args, result]) on the same document with the
// JS engine and compares every result. See docs/coverage-notes/reads.md.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { ServiceLocator } from '../../src/engine/services/ServiceLocator.js';
import { NamedElementSequence_1 } from '../../src/engine/caex/NamedElementSequence.js';
import { XAttribute, XDocument, XElement, XName } from '../../src/xml/index.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { formatDouble } from '../../src/system/Number.js';

const repo = resolve(__dirname, '..', '..');
const outDir = process.env.READS_OUT ?? join(repo, 'test', 'oracle-out', 'reads');
const inputs = [join(repo, 'test', 'corpus'), join(repo, 'test', 'reads')];

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// ---------------------------------------------------------------- names and types

/** The naming rule of docs/PORTING.md: lower-case the leading run of capitals. */
function camel(s: string): string {
  let i = 0;
  while (i < s.length && s[i] >= 'A' && s[i] <= 'Z') i++;
  if (i === 0) return s;
  if (i === s.length) return s.toLowerCase();
  if (i > 1 && s[i] >= 'a' && s[i] <= 'z') i--;
  return s.substring(0, i).toLowerCase() + s.substring(i);
}

const typeMap = new Map<string, string>();
const enumNames: string[] = [];
for (const line of readFileSync(join(repo, 'docs', 'type-map.tsv'), 'utf8').split('\n').slice(1)) {
  const c = line.split('\t');
  if (c.length < 6) continue;
  typeMap.set(c[5]!.trim(), c[4]!);
  if (c[3] === 'enum') enumNames.push(c[5]!.trim());
}
const typeCache = new Map<string, any>();

/** .NET types outside the engine that appear in results. */
const systemTypes: Record<string, string> = { XmlTypeCode: 'src/system/XmlTypeCode.ts' };
enumNames.push(...Object.keys(systemTypes));

/** Methods the port renamed because a property of the same name exists. */
const renamed: Record<string, string> = { isInherited: 'isInheritedIn' };

/** A class, static class or enum by its export name (docs/type-map.tsv). */
async function typeByName(name: string): Promise<any> {
  if (typeCache.has(name)) return typeCache.get(name);
  let v = (T as any)[name];
  if (v === undefined) {
    const mod = typeMap.get(name) ?? systemTypes[name];
    if (mod === undefined) throw new Error('unknown type ' + name);
    v = (await import(pathToFileURL(join(repo, mod)).href))[name];
  }
  typeCache.set(name, v);
  return v;
}

function typeName(ctor: any): string {
  let n: string = ctor?.name ?? '?';
  if (n.endsWith('_1')) n = n.substring(0, n.length - 2);
  return n;
}

// ---------------------------------------------------------------- canonicalization (as in the oracle)

class Canonicalizer {
  private map = new Map<string, string>();
  clone(): Canonicalizer {
    const c = new Canonicalizer();
    c.map = new Map(this.map);
    return c;
  }
  apply(text: string): string {
    const recent = (y: number, mo: number, d: number) =>
      Math.abs(new Date(y, mo - 1, d).getTime() - new Date(new Date().toDateString()).getTime()) <= 86_400_000 * 1.05;
    text = text.replace(/(\d{2})\/(\d{2})\/(\d{4}) \d{2}:\d{2}:\d{2}/g, (m, mo, d, y) => (recent(+y, +mo, +d) ? 'NOW' : m));
    text = text.replace(/(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?/g, (m, y, mo, d) => (recent(+y, +mo, +d) ? 'NOW' : m));
    return text.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, (m) => {
      const k = m.toLowerCase();
      let id = this.map.get(k);
      if (!id) {
        id = 'G' + (this.map.size + 1);
        this.map.set(k, id);
      }
      return id;
    });
  }
  walk(n: Json): Json {
    if (n === null) return null;
    if (typeof n === 'string') return this.apply(n);
    if (Array.isArray(n)) return n.map((x) => this.walk(x));
    if (typeof n === 'object') {
      const o: Record<string, Json> = {};
      for (const [k, v] of Object.entries(n)) o[k] = this.walk(v);
      return o;
    }
    return n;
  }
}

function hash(text: string | Uint8Array): string {
  return createHash('sha256').update(text).digest('hex').substring(0, 16).toUpperCase();
}

function decode(bytes: Uint8Array): string {
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder().decode(bytes.subarray(start));
}

/** File.ReadAllText(path, Encoding.UTF8). */
function readAllText(path: string): string {
  return decode(readFileSync(path));
}

function save(doc: any, pretty: boolean): string {
  return decode(doc.saveToStream(pretty));
}

/** SaveToFile writes the file name into the document: the same name as in the oracle. */
function tmpFile(): string {
  const dir = join(tmpdir(), `reads-oracle-js-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'reads-save.aml');
}

function exName(e: unknown): string {
  return '!' + dotNetExceptionName(e);
}

// ---------------------------------------------------------------- replay

class Replay {
  doc: any = null;
  snap: XElement[] = [];
  readonly canon = new Canonicalizer();
  readonly mismatches: string[] = [];
  count = 0;
  skipped = 0;

  constructor(readonly file: string) {}

  pos(e: XElement): string {
    if (e.document !== this.doc.xDocument) {
      const w = XmlOperation.createCAEXWrapper(e);
      let desc: string | null;
      if (w instanceof T.CAEXObject) {
        try {
          desc = (w as any).caexPath();
        } catch {
          desc = null;
        }
      } else desc = e.attribute('Name')?.value ?? null;
      return '?' + (e.document === null ? 'detached' : 'other') + ':' + e.name.localName + ':' + (desc ?? '');
    }
    const parts: number[] = [];
    for (let x: XElement = e; x.parent !== null; x = x.parent) {
      let k = 0;
      for (const s of x.parent.elements()) {
        if (s === x) break;
        k++;
      }
      parts.push(k);
    }
    parts.reverse();
    return '/' + parts.join('/');
  }

  /** Mirrors Ctx.Enc of the oracle; `hint` (the expected value) only selects the representation of numbers. */
  enc(v: any, hint: Json): Json {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') {
      if (typeof hint === 'string' && hint.startsWith('c:') && v.length === 1) return 'c:' + v;
      return v;
    }
    if (typeof v === 'boolean') return v;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'number') {
      if (typeof hint === 'string' && hint.startsWith('d:')) return 'd:' + formatDouble(v);
      if (typeof hint === 'string' && hint.startsWith('e:')) {
        const t = hint.substring(2, hint.lastIndexOf('.'));
        const e = typeCache.get(t) ?? (T as any)[t];
        const name = e?.[v];
        if (typeof name === 'string') return 'e:' + t + '.' + name;
      }
      if (typeof hint === 'string' && hint.startsWith('c:')) return 'c:' + String.fromCharCode(v);
      return v;
    }
    if (typeof v === 'function') return 't:' + typeName(v);
    if (v instanceof XName) return 'xn:' + v.toString();
    if (v instanceof XElement) return 'x:' + this.pos(v);
    if (v instanceof XAttribute) return 'xa:' + v.name.toString() + '@' + (v.parent === null ? '?' : this.pos(v.parent));
    if (v instanceof XDocument) return 'xdoc:' + (v === this.doc.xDocument ? 'self' : 'other');
    if (v instanceof T.CAEXDocument) return 'doc:' + (v === this.doc ? 'self' : 'other');
    const ctorName: string = v.constructor?.name ?? '';
    if (v instanceof T.CAEXWrapper && !(v instanceof NamedElementSequence_1)) {
      return 'w:' + typeName(v.constructor) + '@' + (v.node === null ? 'null' : this.pos(v.node));
    }
    if (ctorName === 'CAEXReference' || ('referenceAttributeName' in v && 'referenceAttributeValue' in v)) {
      const re = v.element ?? v.caexObject?.node ?? null;
      return 'ref:' + (v.referenceAttributeName ?? '') + '@' + (re === null ? 'null' : this.pos(re)) + '=' + (v.referenceAttributeValue ?? '');
    }
    if (v instanceof T.AMLSchemaManager) return 'o:' + typeName(v.constructor);
    if (ctorName === 'SemanticVersion') return 'sv:' + v.toString();
    if (ctorName === 'DateTime') return 'dt:' + v.toString('o');
    if (ctorName === 'Guid') return v.toString();
    if (ctorName === 'Decimal') return 'm:' + v.toString();
    if (ctorName === 'InternalLinkType_LinkedObjects' || ctorName === 'LinkedObjects') {
      const o: Record<string, Json> = { $: typeName(v.constructor) };
      const h = hint !== null && typeof hint === 'object' && !Array.isArray(hint) ? hint : {};
      for (const k of Object.keys(h)) {
        if (k === '$') continue;
        try {
          o[k] = this.enc(v[camel(k)], h[k] ?? null);
        } catch (e) {
          o[k] = exName(e);
        }
      }
      return o;
    }
    if ('key' in v && typeof v[Symbol.iterator] === 'function') {
      const h = hint !== null && typeof hint === 'object' && !Array.isArray(hint) ? (hint as any) : {};
      const items: Json[] = [];
      let k = 0;
      for (const x of v) items.push(this.enc(x, h.v?.[k++] ?? null));
      return { k: this.enc(v.key, h.k ?? null), v: items };
    }
    if (typeof v[Symbol.iterator] === 'function') {
      const isSeq = v instanceof NamedElementSequence_1 || ctorName === 'ValueSequence';
      const h = isSeq ? ((hint as any)?.items ?? null) : hint;
      const a: Json[] = [];
      let n = 0;
      for (const x of v) {
        if (++n > 1000) {
          a.push('…');
          break;
        }
        a.push(this.enc(x, Array.isArray(h) ? (h[n - 1] ?? null) : null));
      }
      if (isSeq) return { seq: typeName(v.constructor), items: a };
      return a;
    }
    return 'o:' + typeName(v.constructor);
  }

  async arg(a: any): Promise<any> {
    if (a === null || typeof a !== 'object') return a;
    if ('s' in a) return a.s;
    if ('o' in a) return XmlOperation.createCAEXWrapper(this.snap[a.o]!);
    if ('x' in a) return this.snap[a.x];
    if ('doc' in a) return this.doc;
    if ('xn' in a) return XName.get(a.xn);
    if ('t' in a) return typeByName(a.t);
    if ('e' in a) return (await typeByName(a.e))[a.v];
    if ('sa' in a) return a.sa;
    if ('oa' in a) return a.oa.map((k: number) => XmlOperation.createCAEXWrapper(this.snap[k]!));
    if ('xa' in a) return a.xa.map((k: number) => this.snap[k]);
    if ('tup' in a) return { name: a.tup[0], value: a.tup[1] };
    if ('file' in a) return resolve(repo, a.file);
    if ('bytes' in a) return new Uint8Array(readFileSync(resolve(repo, a.bytes)));
    if ('pred' in a) return (n: string) => n === a.pred;
    if ('out' in a) return undefined;
    throw new Error('unknown arg ' + JSON.stringify(a));
  }

  target(t: Json): any {
    if (t === 'doc') return this.doc;
    if (t === 'qs') return ServiceLocator.queryService;
    if (typeof t === 'number') return XmlOperation.createCAEXWrapper(this.snap[t]!);
    if (Array.isArray(t)) {
      const w: any = XmlOperation.createCAEXWrapper(this.snap[t[0] as number]!);
      return w[camel(t[1] as string)];
    }
    return null;
  }

  readonly dump: string[] = [];

  check(line: number, entry: Json[], actual: Json): void {
    this.count++;
    if (process.env.READS_DUMP) this.dump.push(JSON.stringify([...entry.slice(0, 4), actual]));
    const expected = entry[4] ?? null;
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e && this.mismatches.length < 40) {
      const cut = (s: string) => (s.length > 600 ? s.substring(0, 600) + '…' : s);
      this.mismatches.push(`line ${line}: ${cut(JSON.stringify(entry.slice(0, 4)))}\n    expected ${cut(e)}\n    actual   ${cut(a)}`);
    }
  }

  async call(entry: any[]): Promise<Json> {
    const [t, k, n, rawArgs, expected] = entry;
    const args: any[] = [];
    const outs: string[] = [];
    for (const a of rawArgs as any[]) {
      if (a !== null && typeof a === 'object' && 'g' in a) continue;
      if (a !== null && typeof a === 'object' && 'out' in a) {
        outs.push(a.out);
        continue;
      }
      args.push(await this.arg(a));
    }
    const g = (rawArgs as any[]).find((a) => a !== null && typeof a === 'object' && 'g' in a);
    if (g) args.push(await typeByName(g.g));
    try {
      let result: any;
      if (k === 'p') {
        const target = this.target(t);
        const name = camel(n);
        if (!(name in target)) return '!missing:' + name;
        result = target[name];
      } else if (k === 'i') {
        result = this.target(t).item(...args);
      } else if (k === 'm' || k === 'q') {
        const target = this.target(t);
        let name = camel(n);
        if (typeof target?.[name] !== 'function' && renamed[name] !== undefined) name = renamed[name];
        if (typeof target?.[name] !== 'function') return '!missing:' + name;
        result = target[name](...args);
      } else if (k.startsWith('s:')) {
        const cls = await typeByName(k.substring(2));
        let name = camel(n);
        if (name === 'name' && typeof cls.name !== 'function') name = 'name_';
        if (typeof cls?.[name] !== 'function') return '!missing:' + k.substring(2) + '.' + name;
        result = cls[name](...args);
        if (k === 's:DocumentStreaming') return this.streamList(result);
      } else {
        throw new Error('unknown kind ' + k);
      }
      if (outs.length > 0) {
        const o: Record<string, Json> = { result: this.enc(result?.result, (expected as any)?.result ?? null) };
        for (const name of outs) o[name] = this.enc(result?.[name], (expected as any)?.[name] ?? null);
        return o;
      }
      return this.enc(result, expected);
    } catch (e) {
      return exName(e);
    }
  }

  streamList(seq: Iterable<any>): Json {
    const a: Json[] = [];
    for (const x of seq) {
      if (x === null || x === undefined) a.push(null);
      else if (x instanceof T.CAEXWrapper) a.push('w:' + typeName(x.constructor) + ':' + ((x as any).node?.toString(true) ?? ''));
      else if (typeof x === 'string') a.push(x);
      else a.push('o:' + typeName(x.constructor));
    }
    return a;
  }

  async load(name: string, text: string): Promise<Json> {
    const bytes = new Uint8Array(readFileSync(this.file));
    const rel = relative(repo, this.file).replace(/\\/g, '/');
    let d: any;
    try {
      switch (name) {
        case 'LoadFromString':
          d = CAEXDocument.loadFromString(text);
          break;
        case 'LoadFromFile':
          d = CAEXDocument.loadFromFile(rel);
          break;
        case 'LoadFromBinary':
          d = CAEXDocument.loadFromBinary(bytes);
          break;
        case 'LoadFromStream':
          d = CAEXDocument.loadFromStream(bytes);
          break;
        case 'LoadFromStringAsync':
          d = await CAEXDocument.loadFromStringAsync(text);
          break;
        case 'LoadFromFileAsync':
          d = await CAEXDocument.loadFromFileAsync(rel);
          break;
        case 'LoadFromBinaryAsync':
          d = await CAEXDocument.loadFromBinaryAsync(bytes);
          break;
        case 'LoadFromStreamAsync':
          d = await CAEXDocument.loadFromStreamAsync(bytes);
          break;
        default:
          throw new Error(name);
      }
    } catch (e) {
      return exName(e);
    }
    if (d === null || d === undefined) return null;
    const tryH = async (f: () => Promise<string> | string): Promise<Json> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await f();
        } catch (e) {
          // file system errors of the test machine (EBUSY, EPERM) are retried
          if ((e as { code?: unknown }).code !== undefined && attempt < 5) continue;
          return exName(e);
        }
      }
    };
    const full = resolve(this.file);
    const tmp = tmpFile();
    const r: Json = {
      filePath: d.filePath === null || d.filePath === undefined ? null : d.filePath === full ? '<file>' : '<other>',
      pretty: await tryH(() => hash(save(d, true))),
      plain: await tryH(() => hash(save(d, false))),
      file: await tryH(() => {
        d.saveToFile(tmp, true);
        const h = hash(readFileSync(tmp));
        unlinkSync(tmp);
        return h;
      }),
      filePlain: await tryH(() => {
        d.saveToFile(tmp, false);
        const h = hash(readFileSync(tmp));
        unlinkSync(tmp);
        return h;
      }),
      async: await tryH(async () => hash(await d.saveToStreamAsync(true))),
    };
    // as in the oracle: only the walked document stays registered
    d.unload();
    return r;
  }

  async run(lines: string[]): Promise<void> {
    // as in the oracle: new IDs from a counter, restarted per document
    let n = 0;
    let li = 0;
    ServiceLocator.register(
      {
        generateNewID: () => {
          ++n;
          if (process.env.READS_TRACE_IDS) console.log(`id ${n} at line ${li + 1}`);
          return '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
        },
      } as any,
      'ICaexIDService',
    );
    for (const e of enumNames) await typeByName(e);
    const text = readAllText(this.file);
    for (li = 0; li < lines.length; li++) {
      if (lines[li]!.length === 0) continue;
      const entry = JSON.parse(lines[li]!) as any[];
      const [, k, n] = entry;
      // members that overflowed the stack or did not return in the oracle (cyclic inheritance)
      if (entry[4] === '!skip' || entry[4] === '!hang') {
        this.skipped++;
        continue;
      }
      let actual: Json;
      switch (k) {
        case 'load':
          if (n === 'null') {
            this.doc = CAEXDocument.loadFromString(text);
            actual = this.doc === null ? null : 'loaded';
          } else actual = await this.load(n, text);
          break;
        case 'snap':
          this.doc = CAEXDocument.loadFromString(text);
          this.snap = [...this.doc.xDocument.root.descendantsAndSelf()].filter((e: XElement) => XmlOperation.createCAEXWrapper(e) !== null);
          actual = this.snap.length;
          break;
        case '#':
          actual = hash(this.canon.apply(save(this.doc, true)));
          break;
        case 'final':
          actual = this.canon.apply(save(this.doc, true));
          break;
        case 'val':
          try {
            const r = this.doc.validate();
            actual = { result: r.result, log: r.violationLog };
          } catch (e) {
            actual = exName(e);
          }
          break;
        default:
          actual = await this.call(entry);
          if (k === 's:DocumentStreaming') {
            // the async variants of the port must give the same result
            const asyncName = camel(n) + 'Async';
            const cls = await typeByName('DocumentStreaming');
            if (typeof cls[asyncName] === 'function' && entry[3][0] !== null && 'file' in entry[3][0]) {
              const args = [];
              for (const a of entry[3]) args.push(await this.arg(a));
              let r2: Json;
              try {
                r2 = this.streamList(await cls[asyncName](...args));
              } catch (e) {
                r2 = exName(e);
              }
              // a separate copy of the GUID numbering: the oracle has no async call here
              this.check(li + 1, [...entry.slice(0, 2), n + 'Async', entry[3], entry[4]], this.canon.clone().walk(r2));
            }
          }
      }
      this.check(li + 1, entry, this.canon.walk(actual));
    }
    this.doc?.unload();
  }
}

// ---------------------------------------------------------------- tests

const files = inputs
  .filter((d) => existsSync(d))
  .flatMap((d) =>
    readdirSync(d)
      .filter((f) => f.endsWith('.aml'))
      .sort()
      .map((f) => join(d, f)),
  );

describe.skipIf(!existsSync(outDir))('read API parity with Aml.Engine (oracle reads)', () => {
  for (const file of files) {
    const name = basename(file).replace(/\.aml$/, '');
    const expectedFile = join(outDir, name + '.jsonl');
    it.skipIf(!existsSync(expectedFile))(name, { timeout: 3_600_000 }, async () => {
      const lines = readFileSync(expectedFile, 'utf8').split('\n');
      const r = new Replay(file);
      await r.run(lines);
      // debugging aid: READS_DUMP=<dir> writes the recorded calls with the JS results
      if (process.env.READS_DUMP) writeFileSync(join(process.env.READS_DUMP, name + '.jsonl'), r.dump.join('\n') + '\n');
      expect(r.mismatches.join('\n')).toBe('');
    });
  }
});
