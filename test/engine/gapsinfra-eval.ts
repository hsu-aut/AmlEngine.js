// Evaluation of the gapsinfra cases (test/gapsinfra/cases.json) by the port, without Node or
// test framework APIs: used by gapsinfra.oracle.test.ts (against .NET) and by the browser check
// (test/browser/checks.ts, the same results in every browser as in Node).
import { dotNetExceptionName, ArgumentException, ArgumentNullException, FormatException, InvalidCastException, DivideByZeroException } from '../../src/system/exceptions.js';
import {
  XAttribute,
  XCData,
  XComment,
  XContainer,
  XDeclaration,
  XDocument,
  XDocumentType,
  XElement,
  XName,
  XNamespace,
  XNode,
  XObject,
  XProcessingInstruction,
  XText,
  XmlNodeType,
  getEncoding,
  isName,
  loadXDocument,
  parseXDocument,
  saveXDocument,
} from '../../src/xml/index.js';
import { isXmlWhitespace } from '../../src/xml/XmlChars.js';
import { XmlCharType } from '../../src/system/XmlCharType.js';
import { Enumerable, HashSet, type IEqualityComparer, ordinalCompare, type OrderedEnumerable } from '../../src/system/linq.js';
import { Guid } from '../../src/system/Guid.js';
import { TimeSpan } from '../../src/system/TimeSpan.js';
import { Decimal } from '../../src/system/Decimal.js';
import { NumberStyles, formatDouble } from '../../src/system/Number.js';
import { Uri, UriKind } from '../../src/system/Uri.js';
import { DateTime, DateTimeKind } from '../../src/system/DateTime.js';
import { xsdDateTimeToDateTime } from '../../src/system/XsdDateTime.js';
import { compareOrdinalIgnoreCase, equalsOrdinalIgnoreCase, toLowerInvariant, toLowerInvariantCode, toUpperInvariant, toUpperOrdinal, upperFirst } from '../../src/system/strings.js';
import { trimWhiteSpace } from '../../src/system/Char.js';
import { CAEXDocument } from '../../src/index.js';
import { changeModeToString } from '../../src/engine/caex/ChangeMode.js';
import { EventArgs, EventSource, PropertyChangedEventArgs } from '../../src/system/events.js';

type J = unknown;
export type Case = { area: string; fn: string; args: J[] };
export type Result = { ok: string } | { err: string };

const B = (b: boolean): string => (b ? 'True' : 'False');
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string): Uint8Array => new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));
const R = (v: number): string => formatDouble(v, 'R');
const NA = 'n/a';

// ============================================================================ XLinq script

function desc(o: XObject | null): string {
  if (o === null) return 'null';
  if (o instanceof XDocument) return 'D';
  if (o instanceof XElement) return 'E' + o.name.toString();
  if (o instanceof XCData) return 'C' + o.value;
  if (o instanceof XText) return 'T' + o.value;
  if (o instanceof XComment) return 'M' + o.value;
  if (o instanceof XProcessingInstruction) return 'P' + o.target + ' ' + o.data;
  if (o instanceof XDocumentType) return `Y${o.name},${o.publicId ?? '~'},${o.systemId ?? '~'},${o.internalSubset ?? '~'}`;
  if (o instanceof XAttribute) return 'A' + o.name.toString() + '=' + o.value;
  return '?';
}

const list = (items: Iterable<XObject>): string => '[' + [...items].map(desc).join(';') + ']';

function resolve(doc: XDocument, t: string, regs: (XObject | null)[]): XObject | null {
  switch (t[0]) {
    case 'd':
      return doc;
    case 'r':
      return doc.root;
    case '$':
      return regs[Number(t[1])];
    case 'e': {
      const l = [...doc.descendants()];
      return l.length === 0 ? null : l[Number(t.substring(1)) % l.length];
    }
    case 'n': {
      const l = [...doc.descendantNodes()];
      return l.length === 0 ? null : l[Number(t.substring(1)) % l.length];
    }
    case 'a': {
      const p = t.substring(1).split('.');
      const l = [...doc.descendants()];
      if (l.length === 0) return null;
      const attrs = [...l[Number(p[0]) % l.length].attributes()];
      return attrs.length === 0 ? null : attrs[Number(p[1]) % attrs.length];
    }
  }
  throw new Error(t);
}

function content(doc: XDocument, n: J, regs: (XObject | null)[]): unknown {
  if (n === null || n === undefined) return null;
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map((x) => content(doc, x, regs));
  const o = n as Record<string, J>;
  const s = (k: J) => k as string;
  if ('e' in o) return new XElement(XName.get(s(o.e)), Array.isArray(o.c) ? o.c.map((x) => content(doc, x, regs)) : null);
  if ('a' in o) return new XAttribute(XName.get(s(o.a)), content(doc, o.v, regs));
  if ('tx' in o) return new XText(o.tx as string);
  if ('cd' in o) return new XCData(o.cd as string);
  if ('cm' in o) return new XComment(o.cm as string);
  if ('pi' in o) return new XProcessingInstruction((o.pi as string[])[0], (o.pi as string[])[1]);
  if ('dtd' in o) {
    const d = o.dtd as (string | null)[];
    return new XDocumentType(d[0]!, d[1], d[2], d[3]);
  }
  if ('ref' in o) return resolve(doc, s(o.ref), regs);
  if ('num' in o) return Number(o.num);
  if ('int' in o) return o.int as number;
  if ('bool' in o) return o.bool as boolean;
  if ('dec' in o) return Decimal.parse(o.dec as string);
  if ('doc' in o) return new XDocument();
  throw new Error(JSON.stringify(o));
}

function script(xml: string | null, preserve: boolean, steps: Record<string, J>[]): string {
  const doc = xml === null ? new XDocument() : parseXDocument(xml, { preserveWhitespace: preserve });
  const regs: (XObject | null)[] = [null, null];
  const res: string[] = [];
  for (const s of steps) {
    let r: string;
    try {
      r = step(doc, s, regs);
    } catch (e) {
      r = '!' + dotNetExceptionName(e);
    }
    res.push(r);
  }
  let final: string;
  try {
    final = doc.toString(true);
  } catch (e) {
    final = '!' + dotNetExceptionName(e);
  }
  res.push(final);
  return res.join('\n');
}

function step(doc: XDocument, s: Record<string, J>, regs: (XObject | null)[]): string {
  const op = s.op as string;
  const o = resolve(doc, s.t as string, regs);
  if (o === null) return 'none';
  const name = s.name !== undefined && s.name !== null ? XName.get(s.name as string) : null;
  const C = () => content(doc, s.c, regs);
  const V = () => content(doc, s.v, regs);
  const node = o instanceof XNode ? o : null;
  const cont = o instanceof XContainer ? o : null;
  const el = o instanceof XElement ? o : null;
  const at = o instanceof XAttribute ? o : null;
  const dc = o instanceof XDocument ? o : null;
  const nm = name ?? undefined;
  switch (op) {
    case 'desc': return desc(o);
    case 'str': return node ? node.toString() : at!.toString();
    case 'strd': return node ? node.toString(true) : at!.toString();
    case 'nodeType': return XmlNodeType[o.nodeType];
    case 'parent': return desc(o.parent);
    case 'document': return desc(o.document);
    case 'next': return node ? desc(node.nextNode) : NA;
    case 'prev': return node ? desc(node.previousNode) : NA;
    case 'firstNode': return cont ? desc(cont.firstNode) : NA;
    case 'lastNode': return cont ? desc(cont.lastNode) : NA;
    case 'nodesAfter': return node ? list(node.nodesAfterSelf()) : NA;
    case 'nodesBefore': return node ? list(node.nodesBeforeSelf()) : NA;
    case 'elementsAfter': return node ? list(node.elementsAfterSelf(nm)) : NA;
    case 'elementsBefore': return node ? list(node.elementsBeforeSelf(nm)) : NA;
    case 'ancestors': return node ? list(node.ancestors(nm)) : NA;
    case 'ancestorsAndSelf': return el ? list(el.ancestorsAndSelf(nm)) : NA;
    case 'descNodes': return cont ? list(cont.descendantNodes()) : NA;
    case 'descNodesAndSelf': return el ? list(el.descendantNodesAndSelf()) : NA;
    case 'descendants': return cont ? list(cont.descendants(nm)) : NA;
    case 'descendantsAndSelf': return el ? list(el.descendantsAndSelf(nm)) : NA;
    case 'elements': return cont ? list(cont.elements(nm)) : NA;
    case 'element': return cont ? desc(cont.element(name!)) : NA;
    case 'nodes': return cont ? list(cont.nodes()) : NA;
    case 'attributes': return el ? list(el.attributes(nm)) : NA;
    case 'attribute': return el ? desc(el.attribute(name!)) : NA;
    case 'firstAttr': return el ? desc(el.firstAttribute) : NA;
    case 'lastAttr': return el ? desc(el.lastAttribute) : NA;
    case 'nextAttr': return at ? desc(at.nextAttribute) : NA;
    case 'prevAttr': return at ? desc(at.previousAttribute) : NA;
    case 'hasAttrs': return el ? B(el.hasAttributes) : NA;
    case 'hasElems': return el ? B(el.hasElements) : NA;
    case 'isEmpty': return el ? B(el.isEmpty) : NA;
    case 'value':
      if (o instanceof XElement || o instanceof XAttribute || o instanceof XText || o instanceof XComment) return o.value;
      if (o instanceof XProcessingInstruction) return o.data;
      return NA;
    case 'defNs': return el ? el.getDefaultNamespace().namespaceName : NA;
    case 'nsOf': return el ? (el.getNamespaceOfPrefix(s.v as string)?.namespaceName ?? 'null') : NA;
    case 'prefixOf': return el ? (el.getPrefixOfNamespace(XNamespace.get(s.v as string)) ?? 'null') : NA;
    case 'isNsDecl': return at ? B(at.isNamespaceDeclaration) : NA;
    case 'decl': return dc ? (dc.declaration?.toString() ?? 'null') : NA;
    case 'doctype': return dc ? desc(dc.documentType) : NA;
    case 'root': return dc ? desc(dc.root) : NA;
    case 'clone':
      if (el) return new XElement(el).toString(true);
      if (dc) {
        const copy = new XDocument(dc);
        return (copy.declaration?.toString() ?? 'null') + '|' + copy.toString(true);
      }
      return NA;
    case 'nameStr': return el ? `${el.name.toString()}|${el.name.namespace.toString()}|${el.name.localName}|${el.name.namespaceName}` : NA;
    case 'setValue':
      if (el) {
        el.setValue(V());
        return el.value;
      }
      if (at) {
        at.setValue(V());
        return at.value;
      }
      return NA;
    case 'setValueProp': {
      const v = s.v as string;
      if (o instanceof XElement || o instanceof XAttribute || o instanceof XText || o instanceof XComment) o.value = v;
      else if (o instanceof XProcessingInstruction) o.data = v;
      else return NA;
      return 'ok';
    }
    case 'setAttr': if (!el) return NA; el.setAttributeValue(name!, s.v as string | null); return 'ok';
    case 'setElem': if (!el) return NA; el.setElementValue(name!, s.v as string | null); return 'ok';
    case 'add': if (!cont) return NA; cont.add(C()); return 'ok';
    case 'addFirst': if (!cont) return NA; cont.addFirst(C()); return 'ok';
    case 'addBefore': if (!node) return NA; node.addBeforeSelf(C()); return 'ok';
    case 'addAfter': if (!node) return NA; node.addAfterSelf(C()); return 'ok';
    case 'replaceWith': if (!node) return NA; node.replaceWith(C()); return 'ok';
    case 'replaceNodes': if (!cont) return NA; cont.replaceNodes(C()); return 'ok';
    case 'replaceAttributes': if (!el) return NA; el.replaceAttributes(C()); return 'ok';
    case 'replaceAll': if (!el) return NA; el.replaceAll(C()); return 'ok';
    case 'remove':
      if (node) node.remove();
      else if (at) at.remove();
      else return NA;
      return 'ok';
    case 'removeAll': if (!el) return NA; el.removeAll(); return 'ok';
    case 'removeNodes': if (!cont) return NA; cont.removeNodes(); return 'ok';
    case 'removeAttributes': if (!el) return NA; el.removeAttributes(); return 'ok';
    case 'rename': if (!el) return NA; el.name = name!; return 'ok';
    case 'setDecl': {
      if (!dc) return NA;
      const v = s.v as (string | null)[];
      dc.declaration = new XDeclaration(v[0], v[1], v[2]);
      return dc.declaration.toString();
    }
    case 'save': regs[s.k as number] = o; return 'ok';
    case 'setTarget':
      if (!(o instanceof XProcessingInstruction)) return NA;
      o.target = s.v as string;
      return desc(o);
    case 'setDtdName':
      if (!(o instanceof XDocumentType)) return NA;
      o.name = s.v as string;
      return desc(o);
  }
  throw new Error(op);
}

// ============================================================================ System.Linq

function* seq<T>(items: T[], tag: string, log: string[]): Generator<T> {
  for (let i = 0; i < items.length; i++) {
    log.push(tag + i);
    yield items[i];
  }
  log.push(tag + '$');
}

/** Formatting of the oracle's F: ints plain, doubles "R", strings as is. */
function F(x: unknown, dbl = false): string {
  if (x === null || x === undefined) return 'null';
  if (typeof x === 'number') return dbl ? R(x) : String(x);
  if (typeof x === 'boolean') return B(x);
  return String(x);
}

const dblOf = (n: J): number => (typeof n === 'number' ? n : Number(n));

function mat<T>(q: Iterable<T>, log: string[], dbl = false): string {
  log.push('q');
  return '[' + [...q].map((x) => F(x, dbl)).join(',') + ']';
}

const modCmp = (n: number): IEqualityComparer<number> => ({ equals: (x, y) => x % n === y % n, key: (x) => x % n });
const ciCmp: IEqualityComparer<string | null> = {
  equals: (x, y) => equalsOrdinalIgnoreCase(x, y),
  key: (x) => (x === null ? null : [...x].map((c) => c.toUpperCase()).join('')),
};

/** char-wise ToLowerInvariant (simple case mapping; .NET keeps U+0130). */
const lowerInvariant = (s: string): string =>
  Array.from(s, (c) => {
    if (c === 'İ') return c;
    const l = c.toLowerCase();
    return l.length === c.length ? l : c;
  }).join('');

function linq(a: J[]): string {
  const op = a[0] as string;
  const kind = a[1] as string;
  const log: string[] = [];
  const src = a[2] as J[];
  let res: string;
  try {
    if (op === 'range' || op === 'repeat' || op === 'empty') {
      const q = op === 'range' ? Enumerable.range(a[3] as number, a[4] as number) : op === 'repeat' ? Enumerable.repeat(a[3] as number, a[4] as number) : Enumerable.empty<number>();
      return mat(q.take(20), log) + ' #' + log.join(',');
    }
    if (kind === 'i') res = runner(op, true, src, a, log);
    else if (kind === 's') res = runner(op, false, src, a, log);
    else if (kind === 'd') res = linqD(op, Enumerable.from(seq(src.map(dblOf), 's', log)), a, log);
    else res = linqNI(op, Enumerable.from(seq(src as (number | null)[], 's', log)), log);
  } catch (e) {
    res = '!' + dotNetExceptionName(e);
  }
  return res + ' #' + log.join(',');
}

function linqD(op: string, s: Enumerable<number>, a: J[], log: string[]): string {
  switch (op) {
    case 'sum': return R(s.sum());
    case 'max': return R(s.max());
    case 'min': return R(s.min());
    case 'distinct': return mat(s.distinct(), log, true);
    case 'contains': return B(s.contains(dblOf(a[3])));
    case 'order': return mat(s.orderBy((x) => x), log, true);
    case 'orderd': return mat(s.orderByDescending((x) => x), log, true);
  }
  throw new Error(op);
}

function linqNI(op: string, s: Enumerable<number | null>, log: string[]): string {
  switch (op) {
    case 'sum': return F(s.sum((x) => x as number));
    case 'max': return F(s.max());
    case 'min': return F(s.min());
    case 'order': return mat(s.orderBy((x) => x), log);
    case 'orderd': return mat(s.orderByDescending((x) => x), log);
  }
  throw new Error(op);
}

function runner(op: string, isInt: boolean, srcJ: J[], a: J[], log: string[]): string {
  type T = number | string | null;
  const src = Enumerable.from(seq(srcJ as T[], 's', log));
  const other = (i: number) => Enumerable.from(seq(a[i] as T[], 'o', log));
  const arg = (i: number): J => (i < a.length ? a[i] : null);
  const argS = (i: number) => arg(i) as string | null;
  const pred = (p: string | null): ((x: T) => boolean) | undefined => {
    if (p === null) return undefined;
    const parts = p.split(':');
    if (isInt) {
      switch (parts[0]) {
        case 'gt': return (x) => (x as number) > Number(parts[1]);
        case 'even': return (x) => (x as number) % 2 === 0;
        case 'throw': return (x) => { if (x === Number(parts[1])) throw new FormatException(); return true; };
        case 'all': return () => true;
        case 'none': return () => false;
      }
    } else {
      switch (parts[0]) {
        case 'gt': return (x) => (x as string).length > Number(parts[1]);
        case 'throw': return (x) => { if (x === parts[1]) throw new FormatException(); return true; };
        case 'isnull': return (x) => x === null;
        case 'all': return () => true;
        case 'none': return () => false;
      }
    }
    throw new Error(p);
  };
  const intSel = (s: string) => isInt || s === 'len';
  const selI = (s: string): ((x: T) => number) => {
    const parts = s.split(':');
    switch (parts[0]) {
      case 'id': return (x) => x as number;
      case 'mod': return (x) => ((x as number) % Number(parts[1])) | 0;
      case 'neg': return (x) => -(x as number) | 0;
      case 'len': return (x) => (x as string).length;
    }
    throw new Error(s);
  };
  const selS = (s: string): ((x: T) => string | null) => {
    switch (s) {
      case 'id': return (x) => x as string | null;
      case 'lower': return (x) => lowerInvariant((x as string).toString());
      case 'first': return (x) => ((x as string).length > 0 ? (x as string).substring(0, 1) : '');
    }
    throw new Error(s);
  };
  const sel = (s: string): ((x: T) => unknown) => (intSel(s) ? selI(s) : selS(s));
  const cmp = (c: string | null): IEqualityComparer<T> | null => {
    if (c === null) return null;
    if (c === 'ci') return isInt ? null : (ciCmp as IEqualityComparer<T>);
    if (c.startsWith('mod:')) return isInt ? (modCmp(Number(c.substring(4))) as IEqualityComparer<T>) : null;
    throw new Error(c);
  };
  const keyCmp = (s: string, c: string | null): IEqualityComparer<unknown> | null => {
    if (intSel(s)) return c !== null && c.startsWith('mod:') ? (modCmp(Number(c.substring(4))) as IEqualityComparer<unknown>) : null;
    return c === 'ci' ? (ciCmp as IEqualityComparer<unknown>) : null;
  };
  const val = (i: number) => arg(i) as T;
  const p = ['where', 'first', 'firstOrDefault', 'last', 'lastOrDefault', 'single', 'singleOrDefault', 'any', 'count', 'all', 'skipWhile', 'takeWhile', 'deferred'].includes(op)
    ? pred(argS(3))
    : undefined;
  switch (op) {
    case 'where': return mat(src.where(p!), log);
    case 'select': return mat(src.select(sel(argS(3)!)), log);
    case 'first': return F(src.first(p));
    case 'firstOrDefault': return F(src.firstOrDefault(p));
    case 'last': return F(src.last(p));
    case 'lastOrDefault': return F(src.lastOrDefault(p));
    case 'single': return F(src.single(p));
    case 'singleOrDefault': return F(src.singleOrDefault(p));
    case 'any': return B(src.any(p));
    case 'count': return F(src.count(p));
    case 'all': return B(src.all(p!));
    case 'elementAt': return F(src.elementAt(arg(3) as number));
    case 'elementAtOrDefault': return F(src.elementAtOrDefault(arg(3) as number));
    case 'defaultIfEmpty': return arg(3) === null ? mat(src.defaultIfEmpty(), log) : mat(src.defaultIfEmpty(val(3)), log);
    case 'contains': return B(src.contains(val(3), cmp(argS(4))));
    case 'sum': {
      const s = argS(3);
      if (s === null) return isInt ? F(src.sum()) : NA;
      return intSel(s) ? F(src.sum(selI(s))) : NA;
    }
    case 'max':
    case 'min': {
      const s = argS(3);
      const f = s === null ? undefined : sel(s);
      return F(op === 'max' ? src.max(f) : src.min(f));
    }
    case 'aggregate':
      if (isInt) return F(src.aggregate(7, (acc, x) => (Math.imul(acc, 31) + (x as number)) | 0));
      return F(src.aggregate('', (acc, x) => acc + (x ?? '~')));
    case 'sequenceEqual': return B(src.sequenceEqual(other(3), cmp(argS(4))));
    case 'distinct': return mat(src.distinct(cmp(argS(4))), log);
    case 'except': return mat(src.except(other(3), cmp(argS(4))), log);
    case 'intersect': return mat(src.intersect(other(3), cmp(argS(4))), log);
    case 'union': return mat(src.union(other(3), cmp(argS(4))), log);
    case 'toHashSet': return mat(src.toHashSet(cmp(argS(4))), log);
    case 'concat': return mat(src.concat(other(3)), log);
    case 'append': return mat(src.append(val(3)), log);
    case 'prepend': return mat(src.prepend(val(3)), log);
    case 'skip': return mat(src.skip(arg(3) as number), log);
    case 'take': return mat(src.take(arg(3) as number), log);
    case 'skipWhile': return mat(src.skipWhile(p!), log);
    case 'takeWhile': return mat(src.takeWhile(p!), log);
    case 'reverse': return mat(src.reverse(), log);
    case 'order': {
      let q: OrderedEnumerable<T> | null = null;
      for (const k of arg(3) as [string, string, string | null][]) {
        const [dir, s, c] = k;
        const desc = dir === 'desc';
        const f = sel(s) as (x: T) => unknown;
        const compare = !intSel(s) && c === 'ord' ? (ordinalCompare as (x: unknown, y: unknown) => number) : undefined;
        q = q === null ? (desc ? src.orderByDescending(f, compare) : src.orderBy(f, compare)) : desc ? q.thenByDescending(f, compare) : q.thenBy(f, compare);
      }
      return mat(q!, log);
    }
    case 'groupBy': {
      const s = argS(3)!;
      return mat(
        src.groupBy(sel(s) as (x: T) => unknown, keyCmp(s, argS(4))).select((g) => F(g.key) + ':[' + [...g].map((x) => F(x)).join(',') + ']'),
        log,
      );
    }
    case 'toDictionary': {
      const s = argS(3)!;
      return [...src.toDictionary(sel(s) as (x: T) => unknown)].map(([k, v]) => F(k) + '=' + F(v)).join(',');
    }
    case 'zip': return mat(src.zip(other(3), (x, y) => F(x) + '/' + F(y)), log);
    case 'deferred': return mat(src.where(p!).select((x) => x), log);
    case 'forEach': {
      const seen: string[] = [];
      src.forEach((x, i) => {
        if (F(x) === argS(3)) throw new FormatException();
        seen.push(F(x) + '@' + i);
      });
      return seen.join(',');
    }
  }
  throw new Error(op);
}

// ============================================================================ evaluators

const TYPE_METHODS: Record<string, (c: number) => boolean> = {
  IsWhiteSpace: XmlCharType.isWhiteSpace,
  IsLetter: XmlCharType.isLetter,
  IsNCNameSingleChar: XmlCharType.isNCNameSingleChar,
  IsStartNCNameSingleChar: XmlCharType.isStartNCNameSingleChar,
  IsNameSingleChar: XmlCharType.isNameSingleChar,
  IsNCNameCharXml4e: XmlCharType.isNCNameCharXml4e,
  IsStartNCNameCharXml4e: XmlCharType.isStartNCNameCharXml4e,
  IsNameCharXml4e: XmlCharType.isNameCharXml4e,
  IsHighSurrogate: XmlCharType.isHighSurrogate,
  IsLowSurrogate: XmlCharType.isLowSurrogate,
};

const REL_PROPS: Record<string, (u: Uri) => string> = {
  absolutePath: (u) => u.absolutePath,
  absoluteUri: (u) => u.absoluteUri,
  localPath: (u) => u.localPath,
  authority: (u) => u.authority,
  host: (u) => u.host,
  port: (u) => String(u.port),
  query: (u) => u.query,
  fragment: (u) => u.fragment,
  scheme: (u) => u.scheme,
  pathAndQuery: (u) => u.pathAndQuery,
  isDefaultPort: (u) => B(u.isDefaultPort),
  isFile: (u) => B(u.isFile),
  isUnc: (u) => B(u.isUnc),
  userInfo: (u) => u.userInfo,
};

function evaluate(fn: string, a: J[]): string {
  const S = (i: number) => a[i] as string;
  const SN = (i: number) => a[i] as string | null;
  switch (fn) {
    case 'x.script': return script(SN(0), a[1] as boolean, a[2] as Record<string, J>[]);
    case 'x.parse': {
      const doc = parseXDocument(S(0), { preserveWhitespace: a[1] as boolean });
      return (doc.declaration?.toString() ?? 'null') + '|' + doc.toString(true) + '|' + desc(doc.documentType);
    }
    case 'x.isName': return B(isName(S(0)));
    case 'x.isWs': return B(isXmlWhitespace(S(0)));
    case 'x.name': {
      const n = XName.get(S(0));
      return `${n.toString()}|${n.namespaceName}|${n.localName}|${n.namespace.toString()}`;
    }
    case 'x.charType': {
      const m = TYPE_METHODS[S(0)];
      let out = '';
      let start = -1;
      for (let c = 0; c <= 0x10000; c++) {
        const v = c < 0x10000 && m(c);
        if (v && start < 0) start = c;
        if (!v && start >= 0) {
          out += `${start.toString(16)}-${(c - 1).toString(16)},`;
          start = -1;
        }
      }
      return out;
    }
    case 'enc.load': {
      const doc = loadXDocument(fromHex(S(0)));
      return (doc.declaration?.toString() ?? 'null') + '|' + doc.toString(true);
    }
    case 'enc.save':
      return hex(saveXDocument(parseXDocument(S(0), { preserveWhitespace: true }), { disableFormatting: a[1] as boolean }));
    case 'enc.saveDecl': {
      const doc = parseXDocument(S(0), { preserveWhitespace: true });
      doc.declaration = new XDeclaration(SN(1), SN(2), SN(3));
      return hex(saveXDocument(doc, { disableFormatting: a[4] as boolean }));
    }
    case 'enc.get': {
      const e = getEncoding(S(0));
      if (e === null) throw new ArgumentException(`'${S(0)}' is not a supported encoding name.`);
      return e.webName + '|' + hex(e.preamble);
    }
    case 'linq': return linq(a);
    case 'hs': {
      const set = new HashSet<number>();
      const res: string[] = [];
      for (const [op, v] of a[0] as [string, number][]) {
        switch (op) {
          case 'add': res.push(B(set.add(v))); break;
          case 'remove': res.push(B(set.remove(v))); break;
          case 'contains': res.push(B(set.contains(v))); break;
          case 'count': res.push(String(set.count)); break;
          case 'clear': set.clear(); res.push('ok'); break;
          case 'list': res.push('[' + [...set].join(',') + ']'); break;
        }
      }
      return res.join(' ');
    }
    case 'guid.eq': {
      const g = Guid.parse(S(0));
      const other: unknown = a[1] === null ? 'x' : Guid.parse(S(1));
      return B(g.equals(other)) + '|' + B(new HashSet<unknown>([g]).contains(other));
    }
    case 'guid.newShape': {
      // Guid.NewGuid without crypto.randomUUID (the getRandomValues / Math.random fallbacks).
      const shape = (s: string) => `${s.length}|${s[14]}|${B('89ab'.includes(s[19]))}`;
      const rest = globalThis.crypto;
      try {
        stubCrypto({ getRandomValues: (b: Uint8Array) => rest.getRandomValues(b as Uint8Array<ArrayBuffer>) });
        const s1 = shape(Guid.newGuid().toString());
        stubCrypto(undefined);
        const s2 = shape(Guid.newGuid().toString());
        if (s1 !== s2) return s1 + ' vs ' + s2;
        return s1;
      } finally {
        stubCrypto(null);
      }
    }
    case 'ts.cmp': {
      const t = new TimeSpan(BigInt(S(0)));
      if (a[1] === null) return B(t.equals('x'));
      const u = new TimeSpan(BigInt(S(1)));
      return `${t.compareTo(u)}|${B(t.equals(u))}`;
    }
    case 'dec.set': {
      const x = Decimal.parse(S(0), NumberStyles.Float);
      const y = Decimal.parse(S(1), NumberStyles.Float);
      return B(x.equals(y)) + '|' + B(new HashSet<unknown>([x]).contains(y));
    }
    case 'uri.set': {
      const x = new Uri(S(0), UriKind.RelativeOrAbsolute);
      const y = new Uri(S(1), UriKind.RelativeOrAbsolute);
      return B(x.equals(y)) + '|' + B(new HashSet<Uri>([x]).contains(y));
    }
    case 'uri.prop': return REL_PROPS[S(1)](new Uri(S(0), UriKind.RelativeOrAbsolute));
    case 'dt.ambig': {
      const local = new DateTime(BigInt(S(0)), DateTimeKind.Utc).toLocalTime();
      return `${B(local.isAmbiguousDaylightSavingTime)}|${local.ticks}|${local.toUniversalTime().ticks}`;
    }
    case 'xsd.dt': {
      const d = xsdDateTimeToDateTime(S(0), a[1] as number);
      const kind = ['Unspecified', 'Utc', 'Local'][d.kind];
      const year = DateTime.today.year;
      if (d.year === year) return `Y+${d.ticks - new DateTime(year, 1, 1).ticks}|${kind}`;
      return `${d.ticks}|${kind}`;
    }
    case 'ts.parse': return TimeSpan.parse(S(0)).ticks.toString();
    case 'str.upperFirst': return upperFirst(S(0));
    case 'str.eqOic': return B(equalsOrdinalIgnoreCase(SN(0), SN(1)));
    case 'str.upperTable': {
      let out = '';
      for (let c = 0; c < 0x10000; c++) {
        const u = upperFirst(String.fromCharCode(c));
        if (u !== String.fromCharCode(c)) out += `${c.toString(16)}:${u.length === 1 ? u.charCodeAt(0).toString(16) : JSON.stringify(u)},`;
      }
      return out;
    }
    case 'str.oicTable': {
      let out = '';
      for (let c = 0; c < 0x10000; c++) {
        if (c >= 0xd800 && c <= 0xdfff) continue;
        const ch = String.fromCharCode(c);
        const u = upperFirst(ch);
        if (u !== ch && equalsOrdinalIgnoreCase(ch, u)) out += `${c.toString(16)}:${u.charCodeAt(0).toString(16)},`;
      }
      return out;
    }
    case 'str.lowerTable': {
      let out = '';
      for (let c = 0; c < 0x10000; c++) {
        const l = toLowerInvariantCode(c);
        if (l !== c) out += `${c.toString(16)}:${l.toString(16)},`;
      }
      return out;
    }
    case 'str.suppTable': {
      const f = S(0) === 'upper' ? toUpperInvariant : S(0) === 'lower' ? toLowerInvariant : toUpperOrdinal;
      let out = '';
      for (let cp = 0x10000; cp <= 0x10ffff; cp++) {
        const m = f(String.fromCodePoint(cp)).codePointAt(0)!;
        if (m !== cp) out += `${cp.toString(16)}:${m.toString(16)},`;
      }
      return out;
    }
    case 'str.upperInv': return toUpperInvariant(S(0));
    case 'str.lowerInv': return toLowerInvariant(S(0));
    case 'str.cmpOic': return String(compareOrdinalIgnoreCase(S(0), S(1)));
    case 'str.trim': return trimWhiteSpace(S(0));
    case 'cm.parse': {
      const doc = CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0);
      const ih = doc.caexFile!.instanceHierarchy.append('ih');
      ih.node!.setAttributeValue('ChangeMode', S(0));
      return changeModeToString(ih.changeMode);
    }
    case 'exc.msg':
      return S(0) === 'InvalidCastException' ? new InvalidCastException().message : new DivideByZeroException().message;
    case 'ev': {
      const src = new EventSource<EventArgs>();
      const log: string[] = [];
      const handlers: Record<string, (s: unknown, e: EventArgs) => void> = { a: () => log.push('a'), b: () => log.push('b') };
      for (const [op, h] of a[0] as [string, string?][]) {
        switch (op) {
          case 'sub': src.subscribe(handlers[h!]); break;
          case 'unsub': src.unsubscribe(handlers[h!]); break;
          case 'clear': src.clear(); break;
          case 'raise': src.raise(src, EventArgs.empty); log.push('|'); break;
          case 'count': log.push('n' + src.count); break;
        }
      }
      return log.join('');
    }
    case 'ev.pc': return new PropertyChangedEventArgs(SN(0)).propertyName ?? 'null';
  }
  throw new ArgumentNullException('no evaluator for ' + fn);
}

export function run(c: Case): Result {
  try {
    // The oracle's JSON writer replaces lone surrogates by U+FFFD; do the same with our output.
    return { ok: evaluate(c.fn, c.args).replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '�') };
  } catch (e) {
    return { err: dotNetExceptionName(e) };
  }
}

/**
 * Known deviations (docs/coverage-notes/gapsinfra.md). The port's Enumerable cannot know the
 * element type T: OrDefault operators return null where .NET returns default(int) = 0; Max/Min of
 * an empty sequence throw (value type behaviour) where .NET returns null for reference and
 * nullable types; Sum does not overflow at Int32 bounds.
 */
export function knownDeviation(c: Case, got: Result, exp: Result): string | null {
  if (c.fn === 'linq' && 'ok' in got && 'ok' in exp) {
    const [op, kind, src] = c.args as [string, string, unknown[]];
    if ((op === 'max' || op === 'min') && (kind === 's' || kind === 'ni') && src.length === 0) {
      if (exp.ok === 'null #s$' && got.ok === '!InvalidOperationException #s$') return 'empty Max/Min of a reference type';
    }
    if (op === 'sum' && kind === 'i' && exp.ok.startsWith('!OverflowException')) return 'Int32 Sum overflow';
  }
  if (c.fn === 'linq' && c.args[1] === 'i' && 'ok' in got && 'ok' in exp) {
    const op = c.args[0] as string;
    if (['firstOrDefault', 'lastOrDefault', 'singleOrDefault', 'elementAtOrDefault', 'defaultIfEmpty'].includes(op)) {
      if (got.ok.replace(/(^|[[,])null(?=[\],]|\s#)/g, '$10') === exp.ok) return 'default(int)';
    }
  }
  return null;
}

/**
 * Replaces globalThis.crypto for one case (null restores it). An own property shadows the one of
 * the global object's prototype, as in browsers; works in Node and in browsers alike.
 */
function stubCrypto(value: unknown): void {
  if (value === null) {
    delete (globalThis as { crypto?: unknown }).crypto;
    // an own property before the stub (Node) is restored; a prototype property (browsers) shows again
    if (savedCrypto) Object.defineProperty(globalThis, 'crypto', savedCrypto);
    savedCrypto = undefined;
    return;
  }
  if (savedCrypto === undefined) savedCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto') ?? null;
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
}
let savedCrypto: PropertyDescriptor | null | undefined;
