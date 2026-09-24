// Write operation parity: random engine operation scripts (scripts/gen-engine-ops.mjs) run with
// the JS engine, compared step by step with oracle/EngineOpsOracle.cs. Keep both in sync.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { implementsInterface } from '../../src/engine/interfaces.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { CAEXDocumentExtensions } from '../../src/engine/caex/extensions/CAEXDocumentExtensions.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { Decimal } from '../../src/system/index.js';
import { formatDouble } from '../../src/system/Number.js';
import { ClrValue } from '../../src/engine/caex/extensions/ClrValue.js';

const root = join(__dirname, '..');
const scriptFile = join(root, 'engine-ops', 'ops.json');
const expectedFile = join(root, 'oracle-out', 'engineops.json');

class Canonicalizer {
  private readonly map = new Map<string, string>();
  apply(text: string): string {
    // Timestamps of "now" (DateTime.Now defaults) within a day of the run become NOW.
    const recent = (y: number, mo: number, d: number) => Math.abs(new Date(y, mo - 1, d).getTime() - new Date(new Date().toDateString()).getTime()) <= 86_400_000 * 1.05;
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
}

function readAllText(path: string): string {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes.subarray(3));
  return new TextDecoder().decode(bytes);
}

function save(doc: any): string {
  const bytes: Uint8Array = doc.saveToStream(true);
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder().decode(bytes.subarray(start));
}

function hash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').substring(0, 16).toUpperCase();
}

function objects(doc: any): any[] {
  return [...doc.xDocument.root.descendants()].map((e: any) => XmlOperation.createCAEXWrapper(e)).filter((w: any) => w instanceof T.CAEXObject);
}

function pick(doc: any, op: any, key: string, filter?: (x: any) => boolean): any {
  const all = objects(doc).filter((x) => !filter || filter(x));
  if (all.length === 0) return null;
  return all[op[key] % all.length];
}

function tryStr(f: () => unknown): string {
  try {
    const v = f();
    return v === null || v === undefined ? 'null' : String(v);
  } catch (e) {
    return '!' + dotNetExceptionName(e);
  }
}

function describeObj(o: any): string {
  return o === null || o === undefined ? 'null' : `${o.node.name.localName}|${o.name ?? ''}|${o.id ?? ''}|${tryStr(() => o.caexPath())}`;
}

function roleRef(r: any): string {
  if (r === null || r === undefined) return 'null';
  if (r instanceof T.RoleRequirementsType) return 'RR:' + (r.refBaseRoleClassPath ?? '');
  if (r instanceof T.SupportedRoleClassType) return 'SRC:' + (r.refRoleClassPath ?? '');
  return '?' + r.constructor.name;
}

/** .NET ToString() of a decoded attribute value. */
function clrToString(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return formatDouble(v);
  return String(v);
}

function insertInto(t: any, ie: any): any {
  if (t instanceof T.InstanceHierarchyType) return t.internalElement.insert(ie);
  if (t instanceof T.InternalElementType) return t.internalElement.insert(ie);
  return null;
}

function apply(doc: any, op: any): string {
  const file = doc.caexFile;
  switch (op.op) {
    case 'newIH':
      return describeObj(file.instanceHierarchy.append(op.name));
    case 'newLib':
      switch (op.kind) {
        case 'suc':
          return describeObj(file.systemUnitClassLib.append(op.name));
        case 'rc':
          return describeObj(file.roleClassLib.append(op.name));
        case 'ic':
          return describeObj(file.interfaceClassLib.append(op.name));
        default:
          return describeObj(file.attributeTypeLib.append(op.name));
      }
    case 'newClass': {
      const kinds: Record<string, [string, string, string]> = {
        suc: ['SystemUnitClassLibType', 'SystemUnitFamilyType', 'systemUnitClass'],
        rc: ['RoleClassLibType', 'RoleFamilyType', 'roleClass'],
        ic: ['InterfaceClassLibType', 'InterfaceFamilyType', 'interfaceClass'],
        at: ['AttributeTypeLibType', 'AttributeFamilyType', 'attributeType'],
      };
      const [lib, cls, prop] = kinds[op.kind] ?? kinds.at;
      const t = pick(doc, op, 'a', (x) => x instanceof (T as any)[lib] || x instanceof (T as any)[cls]);
      return t ? describeObj(t[prop].append(op.name)) : 'none';
    }
    case 'newIE': {
      const t = pick(doc, op, 'a', (x) => x instanceof T.InstanceHierarchyType || x instanceof T.SystemUnitClassType);
      return t ? describeObj(t.internalElement.append(op.name)) : 'none';
    }
    case 'newAttr': {
      const t = pick(doc, op, 'a', (x) => implementsInterface(x, 'IObjectWithAttributes'));
      return t ? describeObj(t.attribute.append(op.name)) : 'none';
    }
    case 'setAttr': {
      const a = pick(doc, op, 'a', (x) => x instanceof T.AttributeTypeType);
      if (!a) return 'none';
      if (op.dataType !== null && op.dataType !== undefined) a.attributeDataType = op.dataType;
      a.value = op.value ?? null;
      return `${a.value ?? ''}|${a.attributeDataType ?? ''}|${tryStr(() => {
        const v = a.attributeValue;
        return v === null || v === undefined ? null : clrToString(v);
      })}`;
    }
    case 'setAttrTyped': {
      const a = pick(doc, op, 'a', (x) => x instanceof T.AttributeTypeType);
      if (!a) return 'none';
      let v: unknown = op.value;
      if (op.type === 'decimal') v = Decimal.parse(op.value);
      // A JS number counts as Int32 when integral; the C# oracle passes a double here.
      if (op.type === 'double') v = ClrValue.double(op.value);
      a.attributeValue = v;
      return `${a.value ?? ''}|${a.attributeDataType ?? ''}`;
    }
    case 'setUnit': {
      const a = pick(doc, op, 'a', (x) => x instanceof T.AttributeTypeType);
      if (!a) return 'none';
      a.unit = op.value ?? null;
      return a.unit ?? 'null';
    }
    case 'newEI': {
      const t = pick(doc, op, 'a', (x) => implementsInterface(x, 'IObjectWithExternalInterface'));
      if (!t) return 'none';
      const ei = t.externalInterface.append(op.name);
      const ic = pick(doc, op, 'b', (x) => x instanceof T.InterfaceFamilyType);
      if (ic && op.withClass) ei.refBaseClassPath = ic.caexPath();
      return describeObj(ei) + '|' + (ei.refBaseClassPath ?? '');
    }
    case 'setBase': {
      const cls = op.kind === 'suc' ? T.SystemUnitFamilyType : op.kind === 'rc' ? T.RoleFamilyType : T.InterfaceFamilyType;
      const c = pick(doc, op, 'a', (x) => x instanceof cls);
      const b = pick(doc, op, 'b', (x) => x instanceof cls);
      if (!c || !b) return 'none';
      c.baseClass = b;
      return c.refBaseClassPath ?? 'null';
    }
    case 'addRole': {
      const rc = pick(doc, op, 'b', (x) => x instanceof T.RoleFamilyType);
      if (!rc) return 'none';
      const t = pick(doc, op, 'a', (x) => x instanceof T.InternalElementType || x instanceof T.SystemUnitFamilyType);
      if (t instanceof T.InternalElementType) {
        return tryStr(() => roleRef(t.addRoleClassReference(rc))) + '|' + [...(t as any).roleRequirements].map((r: any) => r.refBaseRoleClassPath ?? '').join(',');
      }
      if (t instanceof T.SystemUnitFamilyType) {
        return tryStr(() => roleRef((t as any).addRoleClassReference(rc))) + '|' + [...(t as any).supportedRoleClass].map((r: any) => r.refRoleClassPath ?? '').join(',');
      }
      return 'none';
    }
    case 'instantiate': {
      const suc = pick(doc, op, 'a', (x) => x instanceof T.SystemUnitFamilyType);
      const t = pick(doc, op, 'b', (x) => x instanceof T.InstanceHierarchyType || x instanceof T.InternalElementType);
      if (!suc || !t) return 'none';
      const ie = suc.createClassInstance();
      const inserted = insertInto(t, ie);
      return describeObj(inserted) + '|' + (ie.refBaseSystemUnitPath ?? '');
    }
    case 'link': {
      const a = pick(doc, op, 'a', (x) => x instanceof T.ExternalInterfaceType);
      const b = pick(doc, op, 'b', (x) => x instanceof T.ExternalInterfaceType);
      if (!a || !b) return 'none';
      const il = T.InternalLinkType.new_InternalLink(a, b, op.name);
      return il === null ? 'null' : `${describeObj(il)}|${il.refPartnerSideA ?? ''}|${il.refPartnerSideB ?? ''}|${il.caexParent?.node?.name.localName ?? ''}`;
    }
    case 'remove': {
      const o = pick(doc, op, 'a');
      if (!o) return 'none';
      o.remove(op.relations);
      return 'ok';
    }
    case 'copyIE': {
      const ie = pick(doc, op, 'a', (x) => x instanceof T.InternalElementType);
      const t = pick(doc, op, 'b', (x) => x instanceof T.InstanceHierarchyType || x instanceof T.InternalElementType);
      if (!ie || !t) return 'none';
      return describeObj(insertInto(t, ie.copy()));
    }
    case 'rename': {
      const o = pick(doc, op, 'a');
      if (!o) return 'none';
      o.name = op.name;
      return describeObj(o);
    }
    case 'describe': {
      const o = pick(doc, op, 'a');
      if (!o) return 'none';
      o.description = op.value ?? null;
      o.version = op.version ?? null;
      return `${o.description ?? ''}|${o.version ?? ''}`;
    }
    case 'newGuid': {
      const o = pick(doc, op, 'a');
      if (!o) return 'none';
      o.assignNewGuidAsID(op.updateRefs);
      return describeObj(o);
    }
    case 'mirror': {
      const ie = pick(doc, op, 'a', (x) => x instanceof T.InternalElementType);
      const t = pick(doc, op, 'b', (x) => x instanceof T.InstanceHierarchyType || x instanceof T.InternalElementType);
      if (!ie || !t) return 'none';
      const m = ie.createMirror();
      return describeObj(insertInto(t, m)) + '|' + (m?.refBaseSystemUnitPath ?? '');
    }
    case 'setRefBase': {
      const ie = pick(doc, op, 'a', (x) => x instanceof T.InternalElementType);
      const suc = pick(doc, op, 'b', (x) => x instanceof T.SystemUnitFamilyType);
      if (!ie || !suc) return 'none';
      ie.refBaseSystemUnitPath = suc.caexPath();
      return tryStr(() => ie.systemUnitClass?.caexPath() ?? null);
    }
    case 'move': {
      const ie = pick(doc, op, 'a', (x) => x instanceof T.InternalElementType);
      const t = pick(doc, op, 'b', (x) => x instanceof T.InstanceHierarchyType || x instanceof T.InternalElementType);
      if (!ie || !t) return 'none';
      return describeObj(insertInto(t, ie));
    }
    case 'query': {
      const o = pick(doc, op, 'a');
      if (!o) return 'none';
      let sb = tryStr(() => describeObj(CAEXDocumentExtensions.findByPath(doc, o.caexPath())));
      if (o.id) sb += '|' + tryStr(() => describeObj(CAEXDocumentExtensions.findByID(doc, o.id)));
      if (o instanceof T.SystemUnitFamilyType) {
        sb += '|' + tryStr(() => [...(o as any).attributeAndInherited].map((x: any) => x.name).join(','));
        sb += '|' + tryStr(() => [...(o as any).getReferenceHierarchy()].map((x: any) => x.caexPath()).join(','));
      } else if (o instanceof T.RoleFamilyType) {
        sb += '|' + tryStr(() => [...(o as any).attributeAndInherited].map((x: any) => x.name).join(','));
      } else if (o instanceof T.InternalElementType) {
        sb += '|' + tryStr(() => (o as any).systemUnitClass?.caexPath() ?? null);
        sb += '|' + tryStr(() => [...(o as any).roleReferences].map(roleRef).join(','));
      } else if (o instanceof T.InternalLinkType) {
        sb += '|' + tryStr(() => (o as any).aInterface?.caexPath() ?? null) + '|' + tryStr(() => (o as any).bInterface?.caexPath() ?? null);
      } else if (o instanceof T.AttributeType) {
        sb += '|' + tryStr(() => (o as any).attributePath);
      }
      return sb;
    }
    default:
      throw new Error('unknown op ' + op.op);
  }
}

describe.skipIf(!existsSync(expectedFile))('engine operations parity with Aml.Engine', () => {
  const scripts = JSON.parse(readFileSync(scriptFile, 'utf8')) as Array<{ start: string; ops: any[] }>;
  const expected = JSON.parse(readFileSync(expectedFile, 'utf8')) as Array<{ steps: Array<[string, string]>; final: string }>;
  scripts.forEach((script, i) => {
    it(`script ${i} (${script.start})`, () => {
      const canon = new Canonicalizer();
      const doc: any =
        script.start === 'new30'
          ? CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0)
          : script.start === 'new215'
            ? CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15)
            : CAEXDocument.loadFromString(readAllText(join(root, 'corpus', script.start)));
      let text = '';
      for (let j = 0; j < script.ops.length; j++) {
        const op = script.ops[j];
        let result: string;
        try {
          result = apply(doc, op);
        } catch (e) {
          result = '!' + dotNetExceptionName(e);
        }
        try {
          text = canon.apply(save(doc));
        } catch (e) {
          text = '!' + dotNetExceptionName(e);
        }
        const [expResult, expHash] = expected[i].steps[j];
        const actual = { step: j, op, result: canon.apply(result), hash: hash(text) };
        if (actual.result !== expResult || actual.hash !== expHash) {
          // Show the document only when the hashes differ at the last step, where the oracle has it.
          expect(actual).toEqual({ step: j, op, result: expResult, hash: expHash });
        }
      }
      expect(text).toBe(expected[i].final);
    });
  });
});
