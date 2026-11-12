// Oracle parity of the misc services of Aml.Engine.Services: UniqueNameService (direct calls,
// appends on every sequence type, engine operations with the service registered),
// CAEXFileStatisticService, RepairTypeEnumConverter, the equality of ValidationKey, and two System
// helpers of the port compared with their .NET types: Dictionary of src/system/linq.ts
// (Dictionary<string,int>, Dictionary<int,int>) and AsyncLock (SemaphoreSlim). The JS counterpart of
// oracle/ServicesMiscOracle.cs (svc-misc); cases from scripts/gen-services-misc.mjs. Keep the
// three files in sync.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { NamedElementSequence } from '../../src/engine/caex/NamedElementSequence.js';
import { ObjectWithAttributes } from '../../src/engine/caex/extensions/ObjectWithAttributes.js';
import { ObjectWithExternalInterface } from '../../src/engine/caex/extensions/ObjectWithExternalInterface.js';
import { InterfaceFamilyTypeExtensions } from '../../src/engine/caex/extensions/InterfaceFamilyTypeExtensions.js';
import { implementsInterface } from '../../src/engine/interfaces.js';
import { ServiceLocator } from '../../src/engine/services/ServiceLocator.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { CAEXFileStatisticService } from '../../src/services/CAEXFileStatisticService.js';
import { RepairTypeEnumConverter } from '../../src/services/RepairTypeEnumConverter.js';
import { UniqueNameService } from '../../src/services/UniqueNameService.js';
import { ValidationKey } from '../../src/services/ValidationKey.js';
import { ValidationTypeEnum } from '../../src/services/ValidationTypeEnum.js';
import { AsyncLock } from '../../src/system/AsyncLock.js';
import { InvalidOperationException, dotNetExceptionName } from '../../src/system/exceptions.js';
import { Dictionary, HashSet, List, from } from '../../src/system/linq.js';
import { XElement, type XNode } from '../../src/xml/index.js';
import { apply, Canonicalizer, hash, pick, readAllText, save } from '../engine/ops-apply.js';
import { oracleOut } from '../setup/oracle-out.js';

const root = join(__dirname, '..');
const casesDir = join(__dirname, 'misc');
const expectedFile = join(oracleOut, 'services', 'misc.json');
const cases = (name: string): any => JSON.parse(readFileSync(join(casesDir, name), 'utf8'));

// ------------------------------------------------------------------------------- helpers

const docs: Record<string, string> = cases('docs.json');

function load(start: string): any {
  if (start === 'new30') return CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0);
  if (start === 'new215') return CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15);
  if (start.startsWith('doc:')) return CAEXDocument.loadFromString(docs[start.substring(4)]);
  return CAEXDocument.loadFromString(readAllText(join(root, 'corpus', start)));
}

/** "!" + .NET exception class; the AggregateException of UniqueCAEXName with its inner exception. */
function ex(e: unknown): string {
  if (e instanceof Error && e.name === 'AggregateException') {
    const inner = (e as any).innerException;
    return `!AggregateException:${e.message}:${dotNetExceptionName(inner)}:${(inner as Error).message}`;
  }
  return '!' + dotNetExceptionName(e);
}

/** "!" + .NET exception class + ":" + message. */
function exMsg(e: unknown): string {
  return `!${dotNetExceptionName(e)}:${(e as Error).message}`;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return String(v);
}

function tryStr(f: () => unknown): string {
  try {
    return str(f());
  } catch (e) {
    return ex(e);
  }
}

function count(it: Iterable<unknown>): number {
  let n = 0;
  for (const _ of it) n++;
  return n;
}

/** tag|Name|ID|parent tag#position among the parent's elements. */
function where(e: XElement | null | undefined): string {
  if (e === null || e === undefined) return 'null';
  return `${e.name.localName}|${e.attribute('Name')?.value ?? 'null'}|${e.attribute('ID')?.value ?? 'null'}|${e.parent?.name.localName ?? 'null'}#${count(e.elementsBeforeSelf())}`;
}

function allElements(doc: any): XElement[] {
  return [...doc.xDocument.root.descendantsAndSelf()];
}

function elem(doc: any, a: number): XElement | null {
  if (a < 0) return null;
  const all = allElements(doc);
  return all[a % all.length];
}

function resetUniqueName(): void {
  UniqueNameService.unRegister();
  NamedElementSequence.uniqueName = false;
}

/** Lower camel case by the naming rule of the port (docs/PORTING.md, "Names"). */
function camel(name: string): string {
  const m = /^[A-Z]+/.exec(name);
  if (!m) return name;
  let run = m[0].length;
  if (run > 1 && run < name.length && /[a-z]/.test(name[run])) run--;
  return name.substring(0, run).toLowerCase() + name.substring(run);
}

/** The first index where two lists differ, with both values, or null. */
function firstDiff(actual: unknown[], expected: unknown[], context: (i: number) => unknown = () => undefined): unknown {
  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(actual[i]) !== JSON.stringify(expected[i])) return { index: i, context: context(i), actual: actual[i], expected: expected[i] };
  }
  return null;
}

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

// ------------------------------------------------------- UniqueNameService, direct calls

function uniqueOp(doc: any, svc: any, op: any): string {
  switch (op.op) {
    case 'add': {
      const e = elem(doc, op.a)!;
      const c = new XElement(e.name.namespace.getName(op.tag));
      if (op.name !== null) c.setAttributeValue('Name', op.name);
      e.add(c);
      return 'ok';
    }
    case 'setName':
      elem(doc, op.a)!.setAttributeValue('Name', op.name);
      return 'ok';
    case 'u2':
      return str(svc.uniqueCAEXName(elem(doc, op.a), op.tag));
    case 'u3':
      return str(svc.uniqueCAEXName(elem(doc, op.a), op.tag, op.def));
    case 'ue': {
      const e = elem(doc, op.a)!;
      let seq: Iterable<XElement | null>;
      switch (op.src) {
        case 'children':
          seq = e.elements();
          break;
        case 'named':
          seq = (function* () {
            for (const x of e.elements()) if (x.name.localName === op.tag) yield x;
          })();
          break;
        case 'desc':
          seq = e.descendants();
          break;
        case 'empty':
          seq = [];
          break;
        case 'withNull':
          seq = (function* () {
            yield null;
            yield* e.elements();
          })();
          break;
        default:
          seq = e.parent?.elements() ?? [];
      }
      return str(svc.uniqueCAEXName(seq, op.tag, op.def));
    }
    case 'is':
      return str(svc.isUniqueCAEXName(elem(doc, op.a)));
    case 'def':
      svc.registerDefault(op.tag, op.name);
      return 'ok';
    case 'suspend':
      svc.suspend();
      return 'ok';
    case 'resume':
      svc.resume();
      return 'ok';
    default:
      throw new Error('unknown op ' + op.op);
  }
}

// --------------------------------------------- the operations of this package on the engine

function describeW(w: any): string {
  return w === null || w === undefined ? 'null' : where(w.node);
}

const isA = (x: any, ...types: string[]) => types.some((t) => x instanceof (T as any)[t]);

/** The operations of this package; null for the operations of test/engine/ops-apply.ts. */
function miscOp(doc: any, svc: any, op: any): string | null {
  switch (op.op) {
    case 'svcSuspend':
      svc.suspend();
      return 'ok';
    case 'svcResume':
      svc.resume();
      return 'ok';
    case 'svcDefault':
      svc.registerDefault(op.tag, op.name);
      return 'ok';
    case 'uniqueFlag':
      NamedElementSequence.uniqueName = op.value;
      return 'ok';
    case 'appendNoName': {
      let r: any;
      switch (op.kind) {
        case 'ih':
          r = doc.caexFile.instanceHierarchy.append();
          break;
        case 'ie': {
          const t = pick(doc, op, 'a', (x) => isA(x, 'InstanceHierarchyType', 'SystemUnitClassType'));
          r = t ? t.internalElement.append() : null;
          break;
        }
        case 'attr': {
          const t = pick(doc, op, 'a', (x) => implementsInterface(x, 'IObjectWithAttributes'));
          r = t ? t.attribute.append() : null;
          break;
        }
        case 'ei': {
          const t = pick(doc, op, 'a', (x) => implementsInterface(x, 'IObjectWithExternalInterface'));
          r = t ? t.externalInterface.append() : null;
          break;
        }
        case 'suc': {
          const t = pick(doc, op, 'a', (x) => isA(x, 'SystemUnitClassLibType', 'SystemUnitFamilyType'));
          r = t ? t.systemUnitClass.append() : null;
          break;
        }
        case 'rc': {
          const t = pick(doc, op, 'a', (x) => isA(x, 'RoleClassLibType', 'RoleFamilyType'));
          r = t ? t.roleClass.append() : null;
          break;
        }
        case 'ic': {
          const t = pick(doc, op, 'a', (x) => isA(x, 'InterfaceClassLibType', 'InterfaceFamilyType'));
          r = t ? t.interfaceClass.append() : null;
          break;
        }
        case 'at': {
          const t = pick(doc, op, 'a', (x) => isA(x, 'AttributeTypeLibType', 'AttributeFamilyType'));
          r = t ? t.attributeType.append() : null;
          break;
        }
        default: {
          const t = pick(doc, op, 'a', (x) => isA(x, 'SystemUnitClassType'));
          r = t ? t.internalLink.append() : null;
        }
      }
      return describeW(r);
    }
    case 'prepend': {
      let t: any;
      let r: any = null;
      switch (op.kind) {
        case 'ie':
          t = pick(doc, op, 'a', (x) => isA(x, 'InstanceHierarchyType', 'SystemUnitClassType'));
          if (t) r = t.internalElement.prepend(op.name);
          break;
        case 'attr':
          t = pick(doc, op, 'a', (x) => implementsInterface(x, 'IObjectWithAttributes'));
          if (t) r = t.attribute.prepend(op.name);
          break;
        case 'ei':
          t = pick(doc, op, 'a', (x) => implementsInterface(x, 'IObjectWithExternalInterface'));
          if (t) r = t.externalInterface.prepend(op.name);
          break;
        default:
          t = pick(doc, op, 'a', (x) => isA(x, 'SystemUnitClassLibType', 'SystemUnitFamilyType'));
          if (t) r = t.systemUnitClass.prepend(op.name);
      }
      return describeW(r);
    }
    case 'addAttrRef': {
      const o = pick(doc, op, 'a', (x) => implementsInterface(x, 'IObjectWithAttributes'));
      const at = pick(doc, op, 'b', (x) => isA(x, 'AttributeFamilyType'));
      if (!o || !at) return 'none';
      const a = ObjectWithAttributes.addAttributeTypeReference(o, op.byPath ? at.caexPath() : at, op.addUnique, op.addInstance, op.name);
      return describeW(a) + '|' + str((a as any)?.refAttributeType);
    }
    case 'addIfaceRef': {
      const o = pick(doc, op, 'a', (x) => implementsInterface(x, 'IObjectWithExternalInterface'));
      const ic = pick(doc, op, 'b', (x) => isA(x, 'InterfaceFamilyType'));
      if (!o || !ic) return 'none';
      const ei = ObjectWithExternalInterface.addInterfaceClassReference(o, op.byPath ? ic.caexPath() : ic, op.addUnique, op.addInstance, op.name);
      return describeW(ei) + '|' + str((ei as any)?.refBaseClassPath);
    }
    case 'addMirror': {
      const ie = pick(doc, op, 'a', (x) => isA(x, 'InternalElementType'));
      const t = pick(doc, op, 'b', (x) => isA(x, 'InstanceHierarchyType', 'InternalElementType'));
      if (!ie || !t) return 'none';
      const m = t.internalElement.addNewMirror(ie);
      return describeW(m) + '|' + str(m?.refBaseSystemUnitPath);
    }
    case 'createAT': {
      const attr = pick(doc, op, 'a', (x) => isA(x, 'AttributeType'));
      const t = pick(doc, op, 'b', (x) => isA(x, 'AttributeTypeLibType', 'AttributeFamilyType'));
      if (!attr || !t) return 'none';
      const at = attr.createAttributeType();
      return describeW(t.attributeType.insert(at));
    }
    case 'createIFC': {
      const ic = pick(doc, op, 'a', (x) => isA(x, 'InterfaceClassType'));
      const t = pick(doc, op, 'b', (x) => isA(x, 'InterfaceClassLibType', 'InterfaceFamilyType'));
      if (!ic || !t) return 'none';
      const f = InterfaceFamilyTypeExtensions.createInterfaceFamilyClass(ic);
      return describeW(t.interfaceClass.insert(f));
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------ CAEXFileStatisticService

/** The conditions of the overloads with Predicate<XNode> (the same in the oracle). */
const conditions: (((n: XNode) => boolean) | null)[] = [
  () => true,
  () => false,
  (n) => (n as XElement).attribute('Name')?.value.startsWith('A') === true,
  (n) => (n as XElement).hasElements,
  (n) => (n as XElement).parent?.name === (n as XElement).name,
  (n) => count((n as XElement).ancestors()) % 2 === 0,
  (n) => {
    if ((n as XElement).attribute('Name')?.value.includes('e') === true) throw new InvalidOperationException('stop');
    return true;
  },
  null,
];

function statLines(s: CAEXFileStatisticService, f: any): string[] {
  const lines = [
    tryStr(() => s.numberOfAllObjects(f)),
    tryStr(() => s.numberOfAttributes(f)),
    tryStr(() => s.numberOfAttributeTypeReferences(f)),
    tryStr(() => s.numberOfAttributeTypes(f)),
    tryStr(() => s.numberOfInterfaceClasses(f)),
    tryStr(() => s.numberOfInterfaceInstances(f)),
    tryStr(() => s.numberOfInternalElements(f)),
    tryStr(() => s.numberOfLinks(f)),
    tryStr(() => s.numberOfRoleClasses(f)),
    tryStr(() => s.numberOfRoleClassReferences(f)),
    tryStr(() => s.numberOfSystemUnitClasses(f)),
    tryStr(() => s.numberOfSystemUnitClassReferences(f)),
  ];
  for (const c of conditions) {
    lines.push(tryStr(() => s.numberOfAttributeTypes(f, c)));
    lines.push(tryStr(() => s.numberOfInterfaceClasses(f, c)));
    lines.push(tryStr(() => s.numberOfRoleClasses(f, c)));
    lines.push(tryStr(() => s.numberOfSystemUnitClasses(f, c)));
  }
  return lines;
}

// ------------------------------------------------------------------------------- tests

describe.skipIf(!existsSync(expectedFile))('misc services parity with Aml.Engine.Services', () => {
  // The suite body runs even when skipped (vitest collects the tests): read only what exists.
  const expected: any = existsSync(expectedFile) ? JSON.parse(readFileSync(expectedFile, 'utf8')) : {};

  afterAll(() => {
    resetUniqueName();
    CAEXFileStatisticService.unRegister();
  });

  describe('UniqueNameService: direct calls', () => {
    const scripts = cases('unique.json') as Array<{ start: string; ops: any[] }>;
    scripts.forEach((script, i) => {
      it(`script ${i} (${script.start})`, () => {
        resetUniqueName();
        const doc = load(script.start);
        const svc = UniqueNameService.register();
        const lines: string[] = [];
        for (const op of script.ops) {
          let r: string;
          try {
            r = uniqueOp(doc, svc, op);
          } catch (e) {
            r = ex(e);
          }
          lines.push(r);
        }
        resetUniqueName();
        doc.unload();
        expect(firstDiff(lines, expected.unique[i], (k) => script.ops[k])).toBeNull();
      });
    });
  });

  describe('UniqueNameService: Append and Prepend on every sequence type', () => {
    // The cases come from the input; the oracle output provides the calls (found by reflection) and results.
    const runs = (cases('appends.json') as Array<{ start: string; modes: string[] }>).flatMap((c) => c.modes.map((mode) => ({ start: c.start, mode })));
    runs.forEach(({ start, mode }) => {
      it(`${start} (${mode})`, () => {
        const entry = ((expected.appends ?? []) as Array<{ start: string; mode: string; records: any[][]; final: string }>).find(
          (e) => e.start === start && e.mode === mode,
        );
        expect(entry, 'oracle output for this case').toBeDefined();
        if (entry === undefined) return;
        resetUniqueName();
        if (entry.mode !== 'off') {
          const svc = UniqueNameService.register();
          if (entry.mode === 'suspended') svc.suspend();
        }
        if (entry.mode === 'unique') NamedElementSequence.uniqueName = true;
        const doc = load(entry.start);
        const canon = new Canonicalizer();
        const owners = new Map<string, any>();
        for (const e of allElements(doc)) {
          const w = XmlOperation.createCAEXWrapper(e);
          if (w !== null && !owners.has(e.name.localName)) owners.set(e.name.localName, w);
        }
        const actual: any[][] = [];
        let lastKey = '';
        let seq: any = null;
        for (const [ownerName, prop, call, arg] of entry.records) {
          const rec = (result: string) => actual.push([ownerName, prop, call, arg, canon.apply(result)]);
          const key = `${ownerName}.${prop}`;
          if (key !== lastKey) {
            lastKey = key;
            const owner = owners.get(ownerName);
            try {
              seq = owner === undefined ? undefined : owner[camel(prop)];
            } catch (e) {
              seq = undefined;
              if (call === 'get') {
                rec(ex(e));
                continue;
              }
            }
            if (seq === undefined) {
              rec(`!missing ${camel(prop)} on ${owner?.constructor.name}`);
              continue;
            }
          }
          if (call === 'get') {
            rec(str(seq));
            continue;
          }
          let r: string;
          try {
            const w =
              call === 'append' ? seq.append() : call === 'appendName' ? seq.append(arg) : call === 'appendNull' ? seq.append(null) : call === 'prependName' ? seq.prepend(arg) : seq.prepend();
            r = where(w?.node);
          } catch (e) {
            r = ex(e);
          }
          rec(r);
        }
        let final: string;
        try {
          final = canon.apply(save(doc));
        } catch (e) {
          final = ex(e);
        }
        resetUniqueName();
        doc.unload();
        expect(firstDiff(actual, entry.records)).toBeNull();
        expect(hash(final)).toBe(entry.final);
      });
    });
  });

  describe('UniqueNameService: engine operations with the service registered', () => {
    const scripts = cases('engineops.json') as Array<{ start: string; ops: any[] }>;
    scripts.forEach((script, i) => {
      it(`script ${i} (${script.start})`, () => {
        resetUniqueName();
        const svc = UniqueNameService.register();
        const doc = load(script.start);
        const canon = new Canonicalizer();
        const exp = expected.engineops[i] as { steps: Array<[string, string]>; final: string };
        let text = '';
        for (let j = 0; j < script.ops.length; j++) {
          const op = script.ops[j];
          let result: string;
          try {
            result = miscOp(doc, svc, op) ?? apply(doc, op);
          } catch (e) {
            result = ex(e);
          }
          try {
            text = canon.apply(save(doc));
          } catch (e) {
            text = ex(e);
          }
          const [expResult, expHash] = exp.steps[j];
          const actual = { step: j, op, result: canon.apply(result), hash: hash(text) };
          if (actual.result !== expResult || actual.hash !== expHash) {
            resetUniqueName();
            // the document is shown by the comparison of the final text when the step is the last one
            expect(actual).toEqual({ step: j, op, result: expResult, hash: expHash });
          }
        }
        resetUniqueName();
        doc.unload();
        expect(text).toBe(exp.final);
      });
    });
  });

  describe('CAEXFileStatisticService', () => {
    it('Register and UnRegister', () => {
      CAEXFileStatisticService.unRegister();
      const svc = CAEXFileStatisticService.register();
      expect(str(ServiceLocator.getService('IStatistic') === svc)).toBe(expected.stat.registered);
      CAEXFileStatisticService.unRegister();
      expect(str(ServiceLocator.getService('IStatistic') === null)).toBe(expected.stat.unregistered);
    });
    const names = [...(cases('stat.json').docs as string[]), 'null'];
    names.forEach((name) => {
      it(name, () => {
        const entry = ((expected.stat?.docs ?? []) as Array<{ doc: string; lines: string[] }>).find((e) => e.doc === name);
        expect(entry, 'oracle output for this case').toBeDefined();
        if (entry === undefined) return;
        const svc = new CAEXFileStatisticService();
        if (entry.doc === 'null') {
          expect(statLines(svc, null)).toEqual(entry.lines);
          return;
        }
        const doc = load(entry.doc);
        const lines = statLines(svc, doc.caexFile);
        doc.unload();
        expect(lines).toEqual(entry.lines);
      });
    });
  });

  describe('RepairTypeEnumConverter.RepairTypeDescription', () => {
    it('listed values and every enum member', () => {
      const listed = expected.repair.listed as Array<[number, string]>;
      const actual = listed.map(([v]) => [v, tryStr(() => RepairTypeEnumConverter.repairTypeDescription(v))]);
      expect(firstDiff(actual, listed)).toBeNull();
    });
    it('every value 0 .. 2^22 - 1', () => {
      const c = cases('repair.json');
      const chunks: string[] = [];
      const counts = new Map<string, number>();
      let sb: string[] = [];
      for (let v = 0; v < 1 << c.all; v++) {
        const d = RepairTypeEnumConverter.repairTypeDescription(v);
        counts.set(d, (counts.get(d) ?? 0) + 1);
        sb.push(d, '\n');
        if (((v + 1) & ((1 << c.chunkBits) - 1)) === 0) {
          chunks.push(hash(sb.join('')));
          sb = [];
        }
      }
      expect(Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))).toEqual(expected.repair.counts);
      expect(firstDiff(chunks, expected.repair.chunks)).toBeNull();
    });
  });

  describe('ValidationKey equality', () => {
    it('members, Equals, hash containers', () => {
      const keys = (cases('vkey.json').keys as Array<[string | null, number]>).map(([k, t]) => new ValidationKey(k, t as ValidationTypeEnum));
      const single = keys.map((k) => {
        const twin = new ValidationKey(k.key, k.validationType);
        return [
          tryStr(() => k.toString()),
          str(k.key),
          str(ValidationTypeEnum[k.validationType] ?? k.validationType),
          str(k.item1),
          str(k.item2),
          str(k.equals(null)),
          str(k.equals('a')),
          str(k.equals(k)),
          str(k.equals(twin)),
          str(k.equalityKey() === twin.equalityKey()),
        ];
      });
      expect(firstDiff(single, expected.vkey.single)).toBeNull();
      expect(keys.map((a) => keys.map((b) => (a.equals(b) ? '1' : '0')).join(''))).toEqual(expected.vkey.equals);
      expect([...new HashSet(keys)].map((k) => k.toString()).join(';')).toBe(expected.vkey.hashSet);
      const dict = new Dictionary<ValidationKey, number>();
      keys.forEach((k, i) => dict.setItem(k, i));
      expect([...dict].map(([k, v]) => `${k.toString()}=${v}`).join(';')).toBe(expected.vkey.dictionary);
      expect(
        keys
          .map((k) => {
            const r = dict.tryGetValue(new ValidationKey(k.key, k.validationType));
            return r.result ? String(r.value) : '-';
          })
          .join(','),
      ).toBe(expected.vkey.lookup);
    });
  });

  describe('Dictionary of src/system/linq.ts (Dictionary<string,int>, Dictionary<int,int>)', () => {
    const seqs = cases('dict.json') as Array<{ keyType: string; ops: any[][] }>;
    seqs.forEach((s, i) => {
      it(`sequence ${i} (${s.keyType})`, () => {
        const d = new Dictionary<any, number>();
        const lines: string[] = [];
        for (const op of s.ops) {
          let r: string;
          try {
            switch (op[0]) {
              case 'add':
                d.add(op[1], op[2]);
                r = 'ok';
                break;
              case 'set':
                d.setItem(op[1], op[2]);
                r = 'ok';
                break;
              case 'remove':
                r = str(d.remove(op[1]));
                break;
              case 'clear':
                d.clear();
                r = 'ok';
                break;
              case 'tryGet': {
                const t = d.tryGetValue(op[1]);
                r = `${str(t.result)}:${t.value ?? 0}`;
                break;
              }
              case 'get':
                r = String(d.item(op[1]));
                break;
              case 'contains':
                r = str(d.containsKey(op[1]));
                break;
              case 'keys':
                r = [...d.keys()].join(',');
                break;
              default:
                r = [...d.values()].join(',');
            }
          } catch (e) {
            r = exMsg(e);
          }
          lines.push(`${r}|${d.count}|${[...d].map(([k, v]) => `${k}=${v}`).join(',')}`);
        }
        expect(firstDiff(lines, expected.dict[i], (k) => s.ops[k])).toBeNull();
      });
    });
  });

  describe('List, Dictionary, HashSet of src/system/linq.ts: changes while enumerating', () => {
    const seqs = cases('coll.json') as Array<{ kind: string; ops: any[][] }>;
    const fmt = (v: unknown) => (Array.isArray(v) ? `${v[0]}=${v[1]}` : str(v));
    /** begin (opens an enumerator) and next (one step of an open one, index modulo their number). */
    function enumeration(op: any[], enums: Iterator<unknown>[], begin: () => Iterator<unknown>): string {
      if (op[0] === 'begin') {
        enums.push(begin());
        return 'e' + (enums.length - 1);
      }
      if (enums.length === 0) return 'none';
      const r = enums[op[1] % enums.length].next();
      return r.done ? 'False' : 'True:' + fmt(r.value);
    }
    function addRangeSource(list: List<number>, src: string, v: number): Iterable<number> {
      switch (src) {
        case 'self':
          return list;
        case 'selfWhere':
          return from(list).where((x) => x % 2 === 1);
        case 'selfWhereNone':
          return from(list).where((x) => x < 0);
        case 'selfSelect':
          return from(list).select((x) => x + 100);
        case 'selfOrderBy':
          return from(list).orderBy((x) => x);
        case 'selfToList':
          return from(list).toList();
        case 'array':
          return [v, v + 1];
        case 'emptyArray':
          return [];
        case 'copy':
          return new List([v]);
        case 'set':
          return new HashSet([v, v + 1]);
        default:
          return (function* () {
            yield v;
            yield v + 1;
          })();
      }
    }
    function runList(ops: any[][]): string[] {
      const list = new List<number>();
      const enums: Iterator<unknown>[] = [];
      const lines: string[] = [];
      for (const op of ops) {
        let r: string;
        try {
          switch (op[0]) {
            case 'add':
              list.add(op[1]);
              r = 'ok';
              break;
            case 'addRange':
              list.addRange(addRangeSource(list, op[1], op[2]));
              r = 'ok';
              break;
            case 'insert':
              list.insert(op[1], op[2]);
              r = 'ok';
              break;
            case 'removeAt':
              list.removeAt(op[1]);
              r = 'ok';
              break;
            case 'remove':
              r = str(list.remove(op[1]));
              break;
            case 'set':
              list.setItem(op[1], op[2]);
              r = 'ok';
              break;
            case 'clear':
              list.clear();
              r = 'ok';
              break;
            case 'removeAll':
              r = String(list.removeAll((x) => x % op[1] === 0));
              break;
            case 'forEach': {
              const seen: number[] = [];
              try {
                list.forEach((x) => {
                  seen.push(x);
                  if (op[1] === 'add' && seen.length === 1) list.add(99);
                  if (op[1] === 'set' && seen.length === 1) list.setItem(0, list.item(0));
                });
                r = seen.join(',');
              } catch (e) {
                r = seen.join(',') + exMsg(e);
              }
              break;
            }
            case 'get':
              r = String(list.item(op[1]));
              break;
            case 'indexOf':
              r = String(list.indexOf(op[1]));
              break;
            case 'contains':
              r = str(list.contains(op[1]));
              break;
            default:
              r = enumeration(op, enums, () => list[Symbol.iterator]());
          }
        } catch (e) {
          r = exMsg(e);
        }
        lines.push(`${r}|${list.count}|${list.toArray().join(',')}`);
      }
      return lines;
    }
    function runDictionary(ops: any[][]): string[] {
      const d = new Dictionary<number, number>();
      const enums: Iterator<unknown>[] = [];
      const lines: string[] = [];
      for (const op of ops) {
        let r: string;
        try {
          switch (op[0]) {
            case 'add':
              d.add(op[1], op[2]);
              r = 'ok';
              break;
            case 'set':
              d.setItem(op[1], op[2]);
              r = 'ok';
              break;
            case 'remove':
              r = str(d.remove(op[1]));
              break;
            case 'clear':
              d.clear();
              r = 'ok';
              break;
            case 'tryGet': {
              const t = d.tryGetValue(op[1]);
              r = `${str(t.result)}:${t.value ?? 0}`;
              break;
            }
            default:
              r = enumeration(op, enums, () => (op[1] === 'keys' ? d.keys() : op[1] === 'values' ? d.values() : d[Symbol.iterator]()));
          }
        } catch (e) {
          r = exMsg(e);
        }
        lines.push(`${r}|${d.count}|${[...d].map(([k, v]) => `${k}=${v}`).join(',')}`);
      }
      return lines;
    }
    function runHashSet(ops: any[][]): string[] {
      const set = new HashSet<number>();
      const enums: Iterator<unknown>[] = [];
      const lines: string[] = [];
      for (const op of ops) {
        let r: string;
        try {
          switch (op[0]) {
            case 'add':
              r = str(set.add(op[1]));
              break;
            case 'remove':
              r = str(set.remove(op[1]));
              break;
            case 'clear':
              set.clear();
              r = 'ok';
              break;
            case 'contains':
              r = str(set.contains(op[1]));
              break;
            default:
              r = enumeration(op, enums, () => set[Symbol.iterator]());
          }
        } catch (e) {
          r = exMsg(e);
        }
        lines.push(`${r}|${set.count}|${[...set].join(',')}`);
      }
      return lines;
    }
    seqs.forEach((s, i) => {
      it(`sequence ${i} (${s.kind})`, () => {
        const lines = s.kind === 'list' ? runList(s.ops) : s.kind === 'dict' ? runDictionary(s.ops) : runHashSet(s.ops);
        expect(firstDiff(lines, expected.coll[i], (k) => s.ops[k])).toBeNull();
      });
    });
  });

  describe('AsyncLock (SemaphoreSlim)', () => {
    const seqs = cases('lock.json') as Array<{ initial: number; max: number; ops: string[] }>;
    seqs.forEach((s, i) => {
      it(`sequence ${i} (${s.initial}, ${s.max})`, async () => {
        const lock = new AsyncLock(s.initial, s.max);
        const waiters: Array<{ done: boolean }> = [];
        const lines: string[] = [];
        for (const op of s.ops) {
          let r: string;
          try {
            switch (op) {
              case 'wait': {
                const w = { done: false };
                void lock.waitAsync().then(() => {
                  w.done = true;
                });
                await flush();
                if (w.done) r = 'entered';
                else {
                  waiters.push(w);
                  r = 'queued' + (waiters.length - 1);
                }
                break;
              }
              case 'try':
                r = str(lock.tryWait());
                break;
              case 'release':
                r = String(lock.release());
                break;
              default:
                r = String(lock.currentCount);
            }
          } catch (e) {
            r = exMsg(e);
          }
          await flush();
          const done = waiters.flatMap((w, k) => (w.done ? [k] : [])).join(',');
          lines.push(`${r}|${lock.currentCount}|${done}`);
        }
        expect(firstDiff(lines, expected.lock[i], (k) => s.ops[k])).toBeNull();
      });
    });
  });
});
