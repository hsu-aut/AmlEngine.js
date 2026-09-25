// Coverage work package "values": typed attribute values (AttributeTypeType, CaexValue,
// XmlTypeCodeExtensions, the name encoders, constraints, RefSemantic), compared case by case with
// oracle/ValuesOracle.cs. Cases: scripts/gen-values.mjs. Keep both runners in sync: every case
// yields the same list of strings in the same order.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { XElement } from '../../src/xml/index.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { DateTime, DateTimeKind, Decimal, Guid, TimeSpan, Uri, XmlDateTimeSerializationMode } from '../../src/system/index.js';
import { XmlTypeCode } from '../../src/system/XmlTypeCode.js';
import { ClrType, ClrValue, doubleToString, singleToString } from '../../src/engine/caex/extensions/ClrValue.js';
import { AttributeTypeTypeExtensions as Ext } from '../../src/engine/caex/extensions/AttributeTypeTypeExtensions.js';
import { XmlTypeCodeExtensions } from '../../src/engine/schema/XmlTypeCodeExtensions.js';
import { CaexValue } from '../../src/engine/caex/extensions/CaexValue.js';
import { AttributeValueComparer } from '../../src/engine/caex/AttributeValueComparer.js';
import { TokenEncoder } from '../../src/engine/caex/extensions/TokenEncoder.js';
import { NameEncoder } from '../../src/engine/caex/extensions/NameEncoder.js';
import { NCNameEncoder } from '../../src/engine/caex/extensions/NCNameEncoder.js';
import { NMTokenEncoder } from '../../src/engine/caex/extensions/NMTokenEncoder.js';
import { NormalizedStringEncoder } from '../../src/engine/caex/extensions/NormalizedStringEncoder.js';
import { LocalNameEncoder } from '../../src/engine/caex/extensions/LocalNameEncoder.js';

const root = join(__dirname, '..');
const casesFile = join(root, 'values', 'cases.json');
const expectedFile = join(root, 'oracle-out', 'values.json');
const corpusDir = join(root, 'corpus');

// ------------------------------------------------------------------ "now"

const TIME_RX = /(\d{2}):(\d{2}):(\d{2})(\.\d{1,7})?/g;

/** Times of day between t0 and t1 (whole seconds, one second of slack) become NOW. */
function canon(s: string, t0: DateTime, t1: DateTime): string {
  const secs = (d: DateTime) => d.hour * 3600 + d.minute * 60 + d.second;
  const a = secs(t0) - 1;
  const b = secs(t1) + 1;
  return s.replace(TIME_RX, (m, h, mi, se) => {
    const sec = Number(h) * 3600 + Number(mi) * 60 + Number(se);
    return sec >= a && sec <= b ? 'NOW' : m;
  });
}

let caseStart: DateTime = DateTime.now;

/** A DateTime.Now default of a failed decoding (taken while the current case runs). */
const isNow = (v: unknown): boolean =>
  v instanceof DateTime && v.kind === DateTimeKind.Local && v.ticks >= caseStart.ticks && v.ticks <= DateTime.now.ticks;

/** Comparisons of two "now" values depend on the clock resolution; both runners record "now". */
const nowOr = (bothNow: boolean, f: () => string): string => (bothNow ? 'now' : f());

// ------------------------------------------------------------------ formatting

const N = (s: string | null | undefined): string => s ?? '~';
const B = (b: boolean): string => (b ? '1' : '0');
const Bool = (b: boolean): string => (b ? 'True' : 'False');

function tryS(f: () => string | null | undefined): string {
  try {
    return f() ?? 'null';
  } catch (e) {
    return '!' + dotNetExceptionName(e);
  }
}

function tryM(f: () => string | null | undefined): string {
  try {
    return f() ?? 'null';
  } catch (e) {
    const name = dotNetExceptionName(e);
    return name === 'NullReferenceException' ? '!' + name : '!' + name + ':' + (e as Error).message;
  }
}

const uriS = (u: Uri): string => u.originalString + '|' + tryS(() => u.toString()) + '|' + B(u.isAbsoluteUri);

interface Typed {
  value: unknown;
  type: ClrType | null;
}

/** A decoded value with its CLR type (the port keeps it internally, see CaexValue.decodeTyped). */
function ty(t: Typed): string {
  const v = t.value;
  if (v === null || v === undefined) return 'null';
  switch (t.type) {
    case ClrType.String:
      return 'String:' + (v as string);
    case ClrType.Boolean:
      return 'Boolean:' + Bool(v as boolean);
    case ClrType.DateTime:
      return 'DateTime:' + (v as DateTime).toString('o');
    case ClrType.TimeSpan:
      return 'TimeSpan:' + (v as TimeSpan).toString('c');
    case ClrType.Uri:
      return 'Uri:' + uriS(v as Uri);
    case ClrType.Single:
      return 'Single:' + singleToString(v as number);
    case ClrType.Decimal:
      return 'Decimal:' + (v as Decimal).toString();
    default:
      return t.type!.name + ':' + (typeof v === 'bigint' ? v.toString() : typeof v === 'number' ? doubleToString(v) : String(v));
  }
}

/** A plain JS value by its category (the CLR type of plain numbers is not kept). */
function lo(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return 's:' + v;
  if (typeof v === 'boolean') return 'b:' + Bool(v);
  if (typeof v === 'number') return 'n:' + doubleToString(v);
  if (typeof v === 'bigint') return 'i:' + v.toString();
  if (v instanceof Decimal) return 'd:' + v.toString();
  if (v instanceof DateTime) return 'dt:' + v.toString('o');
  if (v instanceof TimeSpan) return 'ts:' + v.toString('c');
  if (v instanceof Uri) return 'u:' + uriS(v);
  return 'o:?' + String(v);
}

const dbl = (d: number): string => doubleToString(d);

/** The typed decoded value of a CaexValue. */
const dec = (cv: any): Typed => cv.decodeTyped();

// ------------------------------------------------------------------ inputs

const TYPES: Record<string, ClrType | null> = {
  String: ClrType.String, Boolean: ClrType.Boolean, SByte: ClrType.SByte, Byte: ClrType.Byte, Int16: ClrType.Int16, UInt16: ClrType.UInt16,
  Int32: ClrType.Int32, UInt32: ClrType.UInt32, Int64: ClrType.Int64, UInt64: ClrType.UInt64, Single: ClrType.Single, Double: ClrType.Double,
  Decimal: ClrType.Decimal, DateTime: ClrType.DateTime, TimeSpan: ClrType.TimeSpan, Uri: ClrType.Uri, ByteArray: ClrType.ByteArray,
  StringArray: ClrType.StringArray, ObjectArray: ClrType.ObjectArray, Guid: ClrType.Guid, Object: ClrType.Object,
  XmlQualifiedName: ClrType.XmlQualifiedName, Null: null,
};

/** A JS value standing for the CLR value of the JSON description (see CLR in scripts/gen-values.mjs). */
function clr(o: any): unknown {
  const v: string = o.v;
  switch (o.t) {
    case 'Null':
      return null;
    case 'String':
      return v;
    case 'Boolean':
      return v === 'true';
    case 'SByte':
      return ClrValue.sbyte(Number(v));
    case 'Byte':
      return ClrValue.byte(Number(v));
    case 'Int16':
      return ClrValue.short(Number(v));
    case 'UInt16':
      return ClrValue.ushort(Number(v));
    case 'Int32':
      return Number(v);
    case 'UInt32':
      return ClrValue.uint(Number(v));
    case 'Int64':
      return BigInt(v);
    case 'UInt64':
      return ClrValue.ulong(BigInt(v));
    case 'Single':
      return ClrValue.float(Number(v));
    case 'Double':
      return ClrValue.double(Number(v));
    case 'Decimal':
      return Decimal.parse(v);
    case 'DateTime':
      return new DateTime(BigInt(v), o.k);
    case 'TimeSpan':
      return new TimeSpan(BigInt(v));
    case 'Uri':
      return new Uri(v, o.k);
    case 'ByteArray':
      return Uint8Array.from((v.match(/../g) ?? []).map((x) => parseInt(x, 16)));
    case 'StringArray':
      return [...o.a];
    case 'Guid':
      return Guid.parse(v);
    default:
      throw new Error(o.t);
  }
}

/** Documents of the current case, unloaded after it (keeps the document table small). */
const docs: any[] = [];

function newDoc(s: string): any {
  const doc = CAEXDocument.new_CAEXDocument(s === '30' ? CAEXDocument.CAEXSchema.CAEX3_0 : CAEXDocument.CAEXSchema.CAEX2_15);
  docs.push(doc);
  return doc;
}

const newIE = (doc: any): any => doc.caexFile.instanceHierarchy.append('IH').internalElement.append('IE');

function host(doc: any, h: string | undefined): any {
  switch (h) {
    case 'at':
      return doc.caexFile.attributeTypeLib.append('L').attributeType.append('A');
    case 'nested':
      return newIE(doc).attribute.append('A').attribute.append('B');
    default:
      return newIE(doc).attribute.append('A');
  }
}

const nodeText = (a: any): string => a.node.toString(true);

const MODES = [XmlDateTimeSerializationMode.Local, XmlDateTimeSerializationMode.Utc, XmlDateTimeSerializationMode.Unspecified, XmlDateTimeSerializationMode.RoundtripKind];

const preds = (cv: any): string =>
  B(cv.isBinaryValue()) + B(cv.isDateTimeType()) + B(cv.isNumericOrBooleanValue()) + B(cv.isNumericValue()) + B(cv.isPartOfDateValue()) + B(cv.isStringValue());

// ------------------------------------------------------------------ cases

function raw(c: any): string[] {
  const a = host(newDoc(c.s), c.h);
  const dt: string | null = c.dt;
  const v: string | null = c.v;
  const r: string[] = [];
  if (dt !== null) r.push(tryS(() => ((a.attributeDataType = dt), 'ok')));
  r.push(tryS(() => ((a.value = v), 'ok')));
  r.push(tryS(() => ((a.defaultValue = c.dv), 'ok')));
  r.push('dt=' + N(a.attributeDataType));
  r.push(N(a.value));
  r.push(N(a.defaultValue));
  r.push(tryS(() => ty(dec(a.getCaexValue('Value')))));
  r.push(tryS(() => lo(a.attributeValue)));
  r.push(tryS(() => ty(dec(a.getCaexValue('DefaultValue')))));
  r.push(tryS(() => ty(dec(a.getCaexValue('Value')))));
  r.push(tryS(() => ty(dec(a.getCaexValue('DefaultValue')))));
  r.push(tryS(() => lo(a.item('Other'))));
  r.push(a.getCaexValue('Other') === null ? 'nocv' : 'cv');
  const cv = a.getCaexValue('Value');
  const dcv = a.getCaexValue('DefaultValue');
  r.push(XmlTypeCode[cv.typeCodeOfAttribute]);
  r.push(N(cv.typeAttribute?.value));
  r.push(tryS(() => cv.friendlyValueString));
  r.push(tryS(() => dcv.friendlyValueString));
  r.push(preds(cv));
  r.push(tryM(() => cv.isValidStringValue(v)));
  r.push(tryM(() => cv.isValidStringValue(c.dv)));
  r.push(tryS(() => lo(cv.defaultValue)));
  r.push(N(cv.valueElement?.value));
  r.push(N(dcv.valueElement?.value));
  const vNow = isNow(cv.value);
  const both = vNow && isNow(dcv.value);
  r.push(nowOr(both, () => tryS(() => B(cv.equals(dcv)))));
  r.push(nowOr(both, () => tryS(() => B(dcv.equals(cv)))));
  r.push(nowOr(both, () => tryS(() => String(cv.compareTo(dcv)))));
  r.push(nowOr(both, () => tryS(() => String(dcv.compareTo(cv)))));
  r.push(tryS(() => String(cv.compareTo(null))));
  r.push(tryS(() => String(cv.compareTo('x'))));
  r.push(tryS(() => B(cv.equals(null))));
  r.push(nowOr(vNow, () => tryS(() => B(cv.equals(cv)))));
  r.push(tryS(() => dbl(a.getDouble())));
  r.push(tryS(() => {
    const t = a.tryGetDouble();
    return Bool(t.result) + '|' + dbl(t.doubleValue);
  }));
  for (const mode of MODES) {
    r.push(tryS(() => a.getDateTime(mode).toString('o')));
    r.push(tryS(() => {
      const t = a.tryGetDateTime(mode);
      return Bool(t.result) + '|' + t.dateTimeValue.toString('o');
    }));
  }
  r.push(XmlTypeCode[Ext.typeCodeOfAttribute(a)]);
  r.push(B(Ext.isPartOfDateValue(a)) + B(Ext.isNumericDataType(a)) + B(Ext.isBooleanDataType(a)) + B(Ext.isStringDataType(a)) + B(Ext.isDateTimeType(a)));
  r.push(XmlTypeCode[CaexValue.typeCode(dt)]);
  r.push(tryS(() => XmlTypeCode[XmlTypeCodeExtensions.xmlTypeCodeFromSchemaType(dt as string)]));
  r.push(tryS(() => T.AttributeTypeType.xmlTypeToClrType(dt).fullName));
  r.push(String(a.valueAttributes.length));
  r.push(B(a.valueAttributes === a.valueAttributes));
  r.push(B(a.attributeTypeDefiningAttribute === a));
  r.push(nodeText(a));
  return r;
}

function apply(a: any, tgt: string, val: unknown): void {
  switch (tgt) {
    case 'av':
      a.attributeValue = val;
      break;
    case 'dav':
      a.defaultAttributeValue = val;
      break;
    case 'iv':
      a.setItem('Value', val);
      break;
    case 'idv':
      a.setItem('DefaultValue', val);
      break;
    case 'iother':
      a.setItem('Other', val);
      break;
    case 'cv':
      a.getCaexValue('Value').value = val;
      break;
    case 'cdv':
      a.getCaexValue('DefaultValue').value = val;
      break;
    default:
      throw new Error(tgt);
  }
}

function set(c: any): string[] {
  const a = host(newDoc(c.s), c.h);
  const r: string[] = [];
  if (c.dt !== null) a.attributeDataType = c.dt;
  for (const op of c.ops) {
    const val = clr(op.val);
    r.push(tryS(() => (apply(a, op.tgt, val), 'ok')));
    r.push('dt=' + N(a.attributeDataType));
    r.push(N(a.value));
    r.push(N(a.defaultValue));
    r.push(tryS(() => ty(dec(a.getCaexValue('Value')))));
    r.push(tryS(() => ty(dec(a.getCaexValue('DefaultValue')))));
    r.push(nodeText(a));
  }
  return r;
}

function cmp(c: any): string[] {
  const ie = newIE(newDoc(c.s));
  const a = ie.attribute.append('A');
  const b = ie.attribute.append('B');
  for (const [x, d] of [[a, c.a], [b, c.b]] as [any, any][]) {
    if (d.dt !== null) x.attributeDataType = d.dt;
    x.value = d.v;
  }
  const ca = a.getCaexValue('Value');
  const cb = b.getCaexValue('Value');
  const both = isNow(ca.value) && isNow(cb.value);
  return [
    tryS(() => ty(dec(ca))) + '|' + tryS(() => ty(dec(cb))),
    nowOr(both, () => tryM(() => String(ca.compareTo(cb)))),
    nowOr(both, () => tryM(() => String(cb.compareTo(ca)))),
    nowOr(both, () => tryS(() => B(ca.equals(cb)))),
    nowOr(both, () => tryS(() => B(cb.equals(ca)))),
    nowOr(both, () => tryS(() => (ca.equals(cb) ? B(ca.equalityKey() === cb.equalityKey()) : '-'))),
  ];
}

function statics(c: any): string[] {
  const r: string[] = [];
  for (const t of c.types) r.push(tryS(() => T.AttributeTypeType.clrToXmlType(TYPES[t])));
  for (const dt of c.dts) {
    r.push(tryS(() => T.AttributeTypeType.xmlTypeToClrType(dt).fullName));
    r.push(tryS(() => XmlTypeCode[XmlTypeCodeExtensions.xmlTypeCodeFromSchemaType(dt)]));
    r.push(XmlTypeCode[CaexValue.typeCode(dt)]);
  }
  for (let i = 0; i <= 54; i++) {
    const tc = i as XmlTypeCode;
    r.push(
      XmlTypeCode[tc] + '|' + XmlTypeCodeExtensions.attributeType(tc).fullName + '|' + tryS(() => lo(XmlTypeCodeExtensions.defaultDecodedValue(tc))) + '|' +
        tryS(() => XmlTypeCodeExtensions.defaultEncodedValue(tc)) + '|' + tryS(() => lo(XmlTypeCodeExtensions.default(tc))),
    );
  }
  r.push(T.AttributeTypeType.xsdDataTypes.join('|'));
  return r;
}

const ENCODERS: Record<string, new () => TokenEncoder> = {
  TokenEncoder, NameEncoder, NCNameEncoder, NMTokenEncoder, NormalizedStringEncoder, LocalNameEncoder,
};

function enc(c: any): string[] {
  const e = new ENCODERS[c.enc]!();
  const r: string[] = [];
  for (const s of c.strs) {
    r.push(tryS(() => e.encode(s)));
    r.push(tryM(() => {
      const v = e.isValid(s);
      return B(v.result) + '|' + N(v.exception);
    }));
  }
  return r;
}

function readBack(a: any): string[] {
  const r = ['dt=' + N(a.attributeDataType), N(a.value), tryS(() => ty(dec(a.getCaexValue('Value')))), tryS(() => dbl(a.getDouble()))];
  for (const mode of MODES) r.push(tryS(() => a.getDateTime(mode).toString('o')));
  return r;
}

function setDbl(c: any): string[] {
  const a = host(newDoc(c.s), 'attr');
  a.setDouble(Number(c.v));
  return readBack(a);
}

function setDt(c: any): string[] {
  const a = host(newDoc(c.s), 'attr');
  const r = [tryS(() => (a.setDateTime(clr(c.val), c.mode), 'ok'))];
  r.push(...readBack(a));
  return r;
}

function sadt(c: any): string[] {
  const a = host(newDoc(c.s), 'attr');
  if (c.dt !== null) a.attributeDataType = c.dt;
  const r: string[] = [];
  if (c.type !== undefined) r.push(tryS(() => (a.setAttributeDataType(TYPES[c.type]), 'ok')));
  else r.push(tryS(() => (a.setAttributeDataType(clr(c.val)), 'ok')));
  r.push('dt=' + N(a.attributeDataType));
  r.push(nodeText(a));
  return r;
}

function props(c: any): string[] {
  const a = host(newDoc(c.s), c.h);
  const r: string[] = [];
  const changed: string[] = [];
  a.propertyChanged.subscribe((_: unknown, e: any) => changed.push(e.propertyName ?? '~'));
  for (const op of c.ops) {
    const v = op.v;
    r.push(
      op.p +
        ':' +
        tryS(() => {
          switch (op.p) {
            case 'Unit':
              a.unit = v;
              return N(a.unit);
            case 'RefAttributeType':
              a.refAttributeType = v;
              return N(a.refAttributeType);
            case 'AttributeDataType':
              a.attributeDataType = v;
              return N(a.attributeDataType);
            case 'Value':
              a.value = v;
              return N(a.value);
            default:
              a.defaultValue = v;
              return N(a.defaultValue);
          }
        }),
    );
    r.push(changed.join(','));
    changed.length = 0;
    r.push(nodeText(a));
  }
  return r;
}

const vals = (list: any[]): string => list.map((v) => tryS(() => ty(dec(v))) + '/' + N(v.valueElement?.value)).join(';');

function cons(c: any): string[] {
  const a = host(newDoc(c.s), c.h);
  if (c.dt !== null) a.attributeDataType = c.dt;
  const r: string[] = [];
  const c1 = a.constraint.append(['Name', 'C1']);
  r.push(N(c1.name));
  const nom = c1.new_NominalType();
  r.push(nom === null ? 'null' : 'nom');
  for (const raw of c.nominal) nom.requiredValue.append(raw);
  r.push(N(nom.attributeDataType) + '|' + B(nom.attributeTypeDefiningAttribute?.node === a.node));
  r.push([...nom.requiredValue].join(';'));
  r.push(vals(nom.valueAttributes));
  for (const raw of c.nominal) r.push(tryS(() => ty(nomTyped(nom, raw))));
  for (const ns of c.nomSet) {
    const val = clr(ns.val);
    r.push(tryS(() => (nom.setItem(ns.key, val), 'ok')));
    r.push([...nom.requiredValue].join(';'));
  }
  r.push(tryS(() => ty(nomTyped(nom, 'nothing'))));
  r.push(tryM(() => (c1.new_OrdinalType() === null ? 'null' : 'ord')));
  r.push(tryM(() => (c1.new_UnknownType() === null ? 'null' : 'unk')));
  r.push(tryM(() => (c1.new_NominalType() === null ? 'null' : 'nom')));
  r.push(B(c1.nominalScaledType.exists) + B(c1.ordinalScaledType.exists) + B(c1.unknownType.exists));

  const c2 = a.constraint.append(['Name', 'C2']);
  const ord = c2.new_OrdinalType();
  ord.requiredMinValue = c.ord.min;
  ord.requiredMaxValue = c.ord.max;
  ord.requiredValue = c.ord.req;
  r.push(N(ord.requiredMinValue) + '|' + N(ord.requiredMaxValue) + '|' + N(ord.requiredValue) + '|' + N(ord.attributeDataType));
  r.push(vals(ord.valueAttributes));
  for (const name of ['RequiredValue', 'RequiredMinValue', 'RequiredMaxValue', 'Other']) {
    r.push(tryS(() => {
      const cv = ord.getCaexValue(name);
      return cv === null ? 'null' : ty(dec(cv));
    }));
  }
  for (const os of c.ordSet) {
    const val = clr(os.val);
    r.push(tryS(() => (ord.setItem(os.name, val), 'ok')));
    r.push(N(ord.requiredMinValue) + '|' + N(ord.requiredMaxValue) + '|' + N(ord.requiredValue));
    r.push(vals(ord.valueAttributes));
  }

  const c3 = a.constraint.append(['Name', 'C3']);
  const unk = c3.new_UnknownType();
  unk.requirements = c.unknown;
  r.push(N(unk.requirements));
  r.push(tryM(() => ((c.second === 'nominal' ? c3.new_NominalType() : c.second === 'ordinal' ? c3.new_OrdinalType() : c3.new_UnknownType()) === null ? 'null' : 'x')));
  r.push([...a.constraint].map((x: any) => N(x.name)).join(','));
  r.push(nodeText(a));
  return r;
}

/** nominal[key] with the CLR type of the decoded value. */
function nomTyped(nom: any, key: string): Typed {
  const cv = nom.getCaexValue(key);
  if (cv === null) return { value: null, type: null };
  const t = dec(cv);
  // C# returns GetDecodedValue(); check that the public indexer returns the same value.
  const plain = nom.item(key);
  if (lo(plain) !== lo(t.value)) throw new Error('indexer differs from decoded value');
  return t;
}

function sem(c: any): string[] {
  const a = host(newDoc(c.s), c.h);
  const r: string[] = [];
  for (const op of c.ops) {
    const v = op.v;
    r.push(tryM(() => {
      switch (op.op) {
        case 'sem':
          return N(Ext.new_RefSemantic(a, v).correspondingAttributePath);
        case 'amlid':
          return N(Ext.new_AMLID(a, v).correspondingAttributePath);
        case 'has':
          return B(Ext.hasAMLID(a, v));
        default: {
          const rs = [...a.refSemantic][0] ?? a.refSemantic.append();
          rs.correspondingAttributePath = v;
          return N(rs.correspondingAttributePath);
        }
      }
    }));
  }
  r.push(tryM(() => String(Ext.new_RefSemantic(null, 'x'))));
  r.push(tryM(() => String(Ext.new_AMLID(null, 'x'))));
  r.push(tryM(() => B(Ext.hasAMLID(null, 'x'))));
  r.push([...a.refSemantic].map((x: any) => N(x.correspondingAttributePath)).join(','));
  r.push(nodeText(a));
  return r;
}

function cmpr(c: any): string[] {
  const cmpr = new AttributeValueComparer('Name');
  const els: (XElement | null)[] = [null];
  for (const v of c.vals) {
    const e = new XElement('E');
    if (v !== null) e.setAttributeValue('Name', v);
    els.push(e);
  }
  const r: string[] = [];
  for (const x of els) {
    for (const y of els) {
      r.push(tryS(() => {
        const equal = cmpr.equals(x, y);
        return B(equal) + (equal && x !== null && y !== null ? '|' + B(cmpr.key(x) === cmpr.key(y)) : '');
      }));
    }
  }
  r.push(tryS(() => String(cmpr.key(null))));
  return r;
}

function corpus(c: any): string[] {
  const bytes = readFileSync(join(corpusDir, c.file));
  const text = new TextDecoder().decode(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes);
  const doc = CAEXDocument.loadFromString(text) as any;
  const r: string[] = [];
  if (doc === null) return ['nodoc'];
  docs.push(doc);
  const attrs = [...doc.xDocument.root.descendants()].map((e: any) => XmlOperation.createCAEXWrapper(e)).filter((w: any) => w instanceof T.AttributeTypeType) as any[];
  for (const a of attrs) {
    r.push([N(a.name), N(a.attributeDataType), N(a.value), N(a.defaultValue), N(a.unit), N(a.refAttributeType)].join('|'));
    r.push(tryS(() => ty(dec(a.getCaexValue('Value')))) + '|' + tryS(() => ty(dec(a.getCaexValue('DefaultValue')))) + '|' + tryS(() => a.getCaexValue('Value').friendlyValueString));
    r.push(
      tryS(() => B(a.isOverridden)) +
        (a instanceof T.AttributeType ? '|' + tryS(() => B(Ext.isOverridden(a))) + '|' + tryS(() => B(Ext.isOverriddenDeleted(a))) : ''),
    );
    r.push(XmlTypeCode[Ext.typeCodeOfAttribute(a)] + '|' + tryS(() => dbl(a.getDouble())) + '|' + tryS(() => a.getDateTime(XmlDateTimeSerializationMode.RoundtripKind).toString('o')));
    r.push([...a.refSemantic].map((x: any) => N(x.correspondingAttributePath)).join(','));
    for (const cn of a.constraint) {
      let line = N(cn.name) + ':';
      if (cn.nominalScaledType.exists) line += 'N[' + tryS(() => vals(cn.nominalScaledType.valueAttributes)) + ']';
      if (cn.ordinalScaledType.exists) line += 'O[' + tryS(() => vals(cn.ordinalScaledType.valueAttributes)) + ']';
      if (cn.unknownType.exists) line += 'U[' + N(cn.unknownType.requirements) + ']';
      r.push(line);
    }
  }
  return r;
}

function runCase(c: any): string[] {
  switch (c.k) {
    case 'raw':
      return raw(c);
    case 'set':
      return set(c);
    case 'cmp':
      return cmp(c);
    case 'static':
      return statics(c);
    case 'enc':
      return enc(c);
    case 'setdbl':
      return setDbl(c);
    case 'setdt':
      return setDt(c);
    case 'sadt':
      return sadt(c);
    case 'props':
      return props(c);
    case 'cons':
      return cons(c);
    case 'sem':
      return sem(c);
    case 'cmpr':
      return cmpr(c);
    case 'corpus':
      return corpus(c);
    default:
      throw new Error(c.k);
  }
}

const OLD_LOCAL = /(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2}:\d{2})/g;

/**
 * Known deviation (docs/deviations.md, "Local time before 1996"): the UTC offset of local times
 * before 1996. .NET on Windows applies today's DST rule to every year, the port uses the IANA
 * history (xs:gMonthDay decodes to the year 1904). Only the offset text may differ.
 */
function knownDeviation(got: string, exp: string): boolean {
  const strip = (s: string) => s.replace(OLD_LOCAL, (m, y, mo, d, t) => (Number(y) < 1996 ? `${y}-${mo}-${d}T${t}+OFFSET` : m));
  return strip(got) === strip(exp) && strip(got) !== got;
}

/** The oracle's JSON writer replaces lone surrogates by U+FFFD. */
const wellFormed = (s: string): string => s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');

describe.skipIf(!existsSync(expectedFile))('typed attribute values match Aml.Engine (oracle values)', () => {
  const cases: any[] = existsSync(casesFile) ? JSON.parse(readFileSync(casesFile, 'utf8')) : [];
  const expected: string[][] = existsSync(expectedFile) ? JSON.parse(readFileSync(expectedFile, 'utf8')) : [];

  // Debugging aids: VALUES_KIND=raw,set limits the kinds, VALUES_DUMP=<file> appends every mismatch.
  const only = process.env.VALUES_KIND?.split(',');
  const kinds = [...new Set(cases.map((c) => c.k as string))].filter((k) => !only || only.includes(k));
  for (const kind of kinds) {
    it(`${kind} cases`, () => {
      const mismatches: string[] = [];
      let n = 0;
      let deviations = 0;
      cases.forEach((c, i) => {
        if (c.k !== kind) return;
        n++;
        const t0 = DateTime.now;
        caseStart = t0;
        let r: string[];
        try {
          r = runCase(c);
        } catch (e) {
          r = ['!!' + dotNetExceptionName(e) + ':' + (e as Error).message];
        }
        const t1 = DateTime.now;
        for (const d of docs) d.unload();
        docs.length = 0;
        const got = r.map((s) => wellFormed(canon(s, t0, t1)));
        const exp = expected[i]!;
        const diff: number[] = [];
        for (let k = 0; k < Math.max(got.length, exp.length); k++) {
          if (got[k] === exp[k]) continue;
          if (got[k] !== undefined && exp[k] !== undefined && knownDeviation(got[k]!, exp[k]!)) deviations++;
          else diff.push(k);
        }
        if (diff.length > 0) {
          const j = diff[0]!;
          if (process.env.VALUES_DUMP) for (const k of diff) appendFileSync(process.env.VALUES_DUMP, JSON.stringify({ i, c, j: k, got: got[k], exp: exp[k] }) + '\n');
          mismatches.push(`#${i} ${JSON.stringify(c).substring(0, 300)}\n    at ${j}: got ${JSON.stringify(got[j])}\n          exp ${JSON.stringify(exp[j])}`);
        }
      });
      expect(n).toBeGreaterThan(0);
      if (deviations > 0) console.log(`values ${kind}: ${deviations} results differ only by the UTC offset of a local time before 1996 (known deviation)`);
      expect(mismatches.slice(0, 30).join('\n'), `${mismatches.length} of ${n} ${kind} cases differ`).toBe('');
    });
  }
});
