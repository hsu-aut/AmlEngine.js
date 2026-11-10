// UndoRedoService parity: the scripts of scripts/gen-services-undo.mjs (engine operations mixed
// with calls of the service, on a document and an optional related document) run with the port and
// are compared step by step with oracle/ServicesUndoOracle.cs (svc-undo): result, change events,
// PropertyChanged events, state of the service per document, document hashes, then a final phase
// that undoes and redoes everything. Keep both in sync.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { implementsInterface } from '../../src/engine/interfaces.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { CaexCommand } from '../../src/engine/caex/commands/CaexCommand.js';
import { UndoRedoService } from '../../src/services/UndoRedoService.js';
import { DateTime, DateTimeKind, dotNetExceptionName, InvalidOperationException } from '../../src/system/index.js';
import { XDocument } from '../../src/xml/index.js';
import { oracleOut } from '../setup/oracle-out.js';
import { apply, Canonicalizer, describeObj, hash, pick, readAllText, save } from '../engine/ops-apply.js';

const root = join(__dirname, '..');
const scriptFile = join(root, 'services', 'undo', 'scripts.json');
const expectedFile = join(oracleOut, 'services', 'undo.json');

const ENGINE_OPS = new Set([
  'newIH', 'newLib', 'newClass', 'newIE', 'newAttr', 'setAttr', 'setAttrTyped', 'setUnit', 'newEI', 'setBase', 'addRole', 'instantiate',
  'link', 'remove', 'copyIE', 'rename', 'describe', 'newGuid', 'mirror', 'setRefBase', 'move', 'query',
]);

/** Operations of the service: exceptions are recorded with their message. */
const SERVICE_OPS = new Set(['begin', 'end', 'pause', 'resume', 'clear', 'removeCommands', 'lastMod', 'stamps', 'actionsLazy', 'actionsModify', 'push', 'pushNull', 'nullDoc']);

type Step = [string, string, string, string, string, string, string];
interface Expected {
  steps: Step[];
  final: Step[];
  textA: string;
  textR: string | null;
  dispose: string;
}

// ---- per script state ----------------------------------------------------------------------

let A: any = null;
let R: any = null;
let svc: UndoRedoService = null!;
let canon: Canonicalizer = null!;
let scriptStartTicks = 0n;
const events: string[] = [];
const props: string[] = [];

function open(start: string): any {
  if (start === 'new30') return CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0);
  if (start === 'new215') return CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15);
  return CAEXDocument.loadFromString(readAllText(join(root, 'corpus', start)));
}

const bool = (b: boolean): string => (b ? 'True' : 'False');

function ex(e: unknown, withMessage: boolean): string {
  const name = dotNetExceptionName(e);
  return withMessage && name !== 'NullReferenceException' ? `!${name}:${(e as Error).message}` : '!' + name;
}

function tryStr(f: () => string): string {
  try {
    return f();
  } catch (e) {
    return ex(e, false);
  }
}

function step(result: string): Step {
  const res = canon.apply(result);
  const ev = canon.apply(events.join('\n'));
  const pr = props.join(',');
  const stateA = state(A);
  const stateR = state(R);
  const hashA = docHash(A);
  const hashR = docHash(R);
  return [res, ev, pr, stateA, stateR, hashA, hashR];
}

function state(d: any): string {
  if (d === null) return '-';
  try {
    return `${svc.canUndo(d) ? 1 : 0}${svc.canRedo(d) ? 1 : 0}|${acts(svc.undoActions(d))}|${acts(svc.redoActions(d))}`;
  } catch (e) {
    return ex(e, false);
  }
}

function acts(actions: Iterable<string> | null): string {
  return actions === null ? 'null' : [...actions].join(';');
}

function text(d: any): string {
  if (d.xDocument === null) return 'unloaded';
  try {
    return canon.apply(save(d));
  } catch (e) {
    return ex(e, false);
  }
}

function docHash(d: any): string {
  if (d === null) return '-';
  if (d.xDocument === null) return 'unloaded';
  return hash(text(d));
}

function docOf(d: string | null | undefined): any {
  if (d === null || d === undefined) return null;
  if (d === 'a') return A;
  if (d === 'r') return R;
  throw new Error('document ' + d);
}

function applyOp(op: any): string {
  if (ENGINE_OPS.has(op.op)) return apply(docOf(op.d) ?? A, op);
  const d = docOf(op.d);
  switch (op.op) {
    case 'undo':
      svc.undo(d);
      return 'ok';
    case 'redo':
      svc.redo(d);
      return 'ok';
    case 'begin':
      return bool(svc.beginTransaction(d, op.name ?? null, docOf(op.rel)));
    case 'end':
      return bool(svc.endTransaction(d));
    case 'pause':
      svc.pause(d);
      return 'ok';
    case 'resume':
      svc.resume(d);
      return 'ok';
    case 'clear':
      svc.clearStacks(d);
      return 'ok';
    case 'removeCommands':
      svc.removeCommands();
      return 'ok';
    case 'lastMod':
      return lastMod(svc.lastModificationDate(d, op.undo));
    case 'stamps':
      return stamps(d);
    case 'actionsLazy': {
      // The result is lazy: a change after the call shows in the enumeration.
      const a = op.redo ? svc.redoActions(d) : svc.undoActions(d);
      if (a === null) return 'null';
      d.caexFile.instanceHierarchy.append('Lazy');
      return acts(a);
    }
    case 'actionsModify': {
      // A change of the stack while the result is enumerated.
      const a = op.redo ? svc.redoActions(d) : svc.undoActions(d);
      if (a === null) return 'null';
      const en = a[Symbol.iterator]();
      const r1 = en.next();
      const first = r1.done ? '<end>' : r1.value;
      d.caexFile.instanceHierarchy.append('Modify');
      let second: string;
      try {
        const r2 = en.next();
        second = r2.done ? '<end>' : r2.value;
      } catch (e) {
        if (dotNetExceptionName(e) !== 'InvalidOperationException') throw e;
        second = ex(e, true);
      }
      return first + '|' + second;
    }
    case 'push':
      svc.pushCommand(new RecCmd(d, op.name ?? null, op.fail));
      return 'ok';
    case 'pushNull':
      svc.pushCommand(new RecCmd(null, 'N', 'none'));
      return 'ok';
    case 'nullDoc':
      return nullDoc(op.m);
    case 'unload':
      d.unload();
      return 'ok';
    default:
      return applyExtra(d ?? A, op);
  }
}

/** The service methods with a null document. */
function nullDoc(m: string): string {
  const s: any = svc;
  switch (m) {
    case 'canUndo':
      return bool(s.canUndo(null));
    case 'canRedo':
      return bool(s.canRedo(null));
    case 'undo':
      s.undo(null);
      return 'ok';
    case 'redo':
      s.redo(null);
      return 'ok';
    case 'begin':
      return bool(s.beginTransaction(null, 'x'));
    case 'beginRel':
      return bool(s.beginTransaction(null, 'x', A));
    case 'end':
      return bool(s.endTransaction(null));
    case 'clear':
      s.clearStacks(null);
      return 'ok';
    case 'lastMod':
      return lastMod(s.lastModificationDate(null));
    case 'undoActions':
      return acts(s.undoActions(null));
    case 'redoActions':
      return acts(s.redoActions(null));
    case 'pause':
      s.pause(null);
      return 'ok';
    case 'resume':
      s.resume(null);
      return 'ok';
    case 'push':
      s.pushCommand(null);
      return 'ok';
    default:
      throw new Error(m);
  }
}

/** LastModificationDate as the oracle records it (see LastMod in oracle/ServicesUndoOracle.cs). */
function lastMod(d: DateTime): string {
  if (d.ticks === 0n) return 'min';
  const inRange = d.ticks >= scriptStartTicks && d.ticks <= DateTime.now.ticks;
  return `${d.date.ticks === DateTime.today.ticks ? 'today' : 'other'}|${DateTimeKind[d.kind]}|${inRange ? 'recent' : 'out'}|${d.millisecond}`;
}

/** The time stamps of the three stacks of the document (see Stamps in the oracle). */
function stamps(d: any): string {
  const dict = (svc as any)._documentStacks;
  if (d.xDocument === null) return 'none';
  const r = dict.tryGetValue(d.xDocument);
  if (!r.result) return 'none';
  return (r.value as Iterable<{ timeStamp: string }>[]).map((s) => [...s].map((e) => stamp(e.timeStamp)).join(',')).join('/');
}

function stamp(ts: string): string {
  const p = DateTime.tryParse(ts);
  return ts.replace(/[0-9]/g, '9') + (p !== null ? (p.date.ticks === DateTime.today.ticks ? '+' : '~') : '!');
}

// ---- extra engine operations (command types the shared operations do not reach) ---------------

const ieOwner = (x: any) => x instanceof T.InstanceHierarchyType || x instanceof T.SystemUnitClassType;

function seqOf(doc: any, op: any): any {
  switch (op.kind) {
    case 'ie':
      return pick(doc, op, 'a', ieOwner)?.internalElement ?? null;
    case 'attr':
      return pick(doc, op, 'a', (x) => implementsInterface(x, 'IObjectWithAttributes'))?.attribute ?? null;
    default:
      return pick(doc, op, 'a', (x) => implementsInterface(x, 'IObjectWithExternalInterface'))?.externalInterface ?? null;
  }
}

function applyExtra(doc: any, op: any): string {
  switch (op.op) {
    case 'seqMove': {
      const seq = seqOf(doc, op);
      if (seq === null) return 'none';
      const n = seq.count;
      if (n === 0) return 'empty';
      seq.move(op.i % n, op.j % n);
      return [...seq].map((x: any) => x.node.attribute('Name')?.value ?? '').join(',');
    }
    case 'prependIE': {
      const t = pick(doc, op, 'a', ieOwner);
      return t ? describeObj(t.internalElement.prepend(op.name)) : 'none';
    }
    case 'seqRemoveAll': {
      const seq = seqOf(doc, op);
      if (seq === null) return 'none';
      seq.remove();
      return String(seq.count);
    }
    case 'recreate': {
      const a = pick(doc, op, 'a', (x) => x instanceof T.AttributeType);
      const b = pick(doc, op, 'b', (x) => x instanceof T.AttributeFamilyType);
      if (!a || !b) return 'none';
      a.recreateAttributeInstance(b);
      return describeObj(a) + '|' + (a.refAttributeType ?? '');
    }
    case 'constraint': {
      const a = pick(doc, op, 'a', (x) => x instanceof T.AttributeTypeType);
      if (!a) return 'none';
      const c = a.constraint.append();
      c.name = op.name;
      const value: string = op.value;
      let r: string;
      switch (op.kind) {
        case 'nominal': {
          const n = c.new_NominalType();
          if (n === null) return 'null';
          n.requiredValue.append(value);
          n.requiredValue.append(value + '2');
          n.requiredValue.setItem(0, value + '0');
          r = [...n.requiredValue].join(',');
          break;
        }
        case 'ordinal': {
          const o = c.new_OrdinalType();
          if (o === null) return 'null';
          o.requiredMaxValue = value;
          o.requiredMinValue = '0';
          o.requiredValue = value;
          r = `${o.requiredMinValue ?? ''}|${o.requiredMaxValue ?? ''}|${o.requiredValue ?? ''}`;
          break;
        }
        default:
          r = c.new_UnknownType() === null ? 'null' : 'unknown';
      }
      return `${c.node.name.localName}|${c.name ?? ''}|${r}`;
    }
    case 'meta': {
      const f = new T.AMLFile(doc.caexFile.node);
      f.setMetaInformation(op.name, op.id, 'Vendor', 'http://vendor', '1.0', '1.0.0', op.date ?? null, 'Project', 'P1');
      return 'ok';
    }
    case 'delMeta':
      return bool(new T.AMLFile(doc.caexFile.node).deleteMetaInformation(op.id));
    case 'superior': {
      const seq = doc.caexFile.superiorStandardVersion;
      seq.append(op.value);
      seq.setItem(op.i % seq.count, op.value + '!');
      return [...seq].join(',');
    }
    default:
      throw new Error('unknown op ' + op.op);
  }
}

// ---- events --------------------------------------------------------------------------------

function docTag(d: any): string {
  return d == null ? '-' : d === A?.xDocument ? 'A' : R !== null && d === R.xDocument ? 'R' : 'X';
}

function cdocTag(d: any): string {
  return d == null ? 'null' : docTag(d.xDocument);
}

function senderTag(s: any): string {
  if (s == null) return 'null';
  if (s instanceof XDocument) return 'x' + docTag(s);
  if (s instanceof T.CAEXDocument) return 'c' + cdocTag(s);
  return '?';
}

function X(e: any): string {
  return e == null ? 'null' : `${e.name.localName}[${e.attribute('Name')?.value ?? ''}|${e.attribute('ID')?.value ?? ''}]${docTag(e.document)}`;
}

function V(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return '"' + v + '"';
  return 'obj';
}

function record(src: string, sender: unknown, e: any): void {
  events.push(
    `${src}${e.changeMode}|${X(e.caexElement)}|${X(e.caexParent)}|${e.caexAttributeName ?? 'null'}|${V(e.oldValue)}|${V(e.newValue)}|${e.caexAttribute?.value ?? 'null'}|${cdocTag(e.caexDocument)}|${senderTag(sender)}`,
  );
}
const changing = (s: unknown, e: any) => record('S-', s, e);
const changed = (s: unknown, e: any) => record('S+', s, e);

/** A test command: records Execute and UnExecute, and fails in one of them on request. */
class RecCmd {
  constructor(
    readonly caexDocument: any,
    readonly displayName: string | null,
    private readonly fail: string,
  ) {}

  execute(): void {
    events.push('cmd+' + (this.displayName ?? 'null') + cdocTag(this.caexDocument));
    if (this.fail === 'redo') throw new InvalidOperationException('redo failed');
  }

  unExecute(): void {
    events.push('cmd-' + (this.displayName ?? 'null') + cdocTag(this.caexDocument));
    if (this.fail === 'undo') throw new InvalidOperationException('undo failed');
  }
}

function runScript(script: any): Expected {
  const now = DateTime.now.ticks;
  scriptStartTicks = now - (now % 10_000_000n);
  canon = new Canonicalizer();
  A = open(script.start);
  R = script.related ? open(script.related) : null;
  svc = UndoRedoService.register();
  svc.propertyChanged.subscribe((s, e) => props.push((e.propertyName ?? '') + (s === svc ? '' : '?')));
  const steps: Step[] = [];
  const final: Step[] = [];
  const result: Partial<Expected> = {};
  try {
    for (const op of script.ops) {
      events.length = 0;
      props.length = 0;
      let r: string;
      try {
        r = applyOp(op);
      } catch (e) {
        r = ex(e, SERVICE_OPS.has(op.op));
      }
      steps.push(step(r));
    }
    // Undo everything, redo everything, per document.
    for (const [tag, d] of [['a', A], ['r', R]] as const) {
      if (d === null) continue;
      for (const undo of [true, false]) {
        for (let n = 0; n < 300; n++) {
          let can: boolean;
          try {
            can = undo ? svc.canUndo(d) : svc.canRedo(d);
          } catch {
            break;
          }
          if (!can) break;
          events.length = 0;
          props.length = 0;
          let label = (undo ? 'u' : 'r') + tag;
          try {
            if (undo) svc.undo(d);
            else svc.redo(d);
          } catch (e) {
            label += ex(e, false);
          }
          final.push(step(label));
        }
      }
    }
    result.steps = steps;
    result.final = final;
    result.textA = text(A);
    result.textR = R === null ? null : text(R);
  } finally {
    // Dispose while the service is registered: the engine calls RemoveDocument of the service.
    result.dispose =
      tryStr(() => {
        A.dispose();
        return 'ok';
      }) +
      '|' +
      (R === null
        ? '-'
        : tryStr(() => {
            R.dispose();
            return 'ok';
          }));
    UndoRedoService.unRegister();
    events.length = 0;
    props.length = 0;
  }
  return result as Expected;
}

describe.skipIf(!existsSync(expectedFile))('UndoRedoService parity with Aml.Engine.Services', () => {
  const scripts = JSON.parse(readFileSync(scriptFile, 'utf8')) as any[];
  // The suite body runs even when skipped (vitest collects the tests): read only what exists.
  const expected = (existsSync(expectedFile) ? JSON.parse(readFileSync(expectedFile, 'utf8')) : []) as Expected[];
  beforeAll(() => {
    CaexCommand.caexElementChangingEvent.subscribe(changing);
    CaexCommand.caexElementChangedEvent.subscribe(changed);
  });
  afterAll(() => {
    CaexCommand.caexElementChangingEvent.unsubscribe(changing);
    CaexCommand.caexElementChangedEvent.unsubscribe(changed);
  });

  scripts.forEach((script, i) => {
    const label = script.name ?? `random ${script.start}${script.related ? ' + ' + script.related : ''}`;
    it(`script ${i} (${label})`, () => {
      const exp = expected[i];
      const act = runScript(script);
      for (let j = 0; j < Math.max(exp.steps.length, act.steps.length); j++) {
        if (JSON.stringify(act.steps[j]) !== JSON.stringify(exp.steps[j])) {
          expect({ step: j, op: script.ops[j], record: act.steps[j] }).toEqual({ step: j, op: script.ops[j], record: exp.steps[j] });
        }
      }
      for (let j = 0; j < Math.max(exp.final.length, act.final.length); j++) {
        if (JSON.stringify(act.final[j]) !== JSON.stringify(exp.final[j])) {
          expect({ final: j, record: act.final[j] }).toEqual({ final: j, record: exp.final[j] });
        }
      }
      expect(act.textA).toBe(exp.textA);
      expect(act.textR).toBe(exp.textR);
      expect(act.dispose).toBe(exp.dispose);
    });
  });
});
