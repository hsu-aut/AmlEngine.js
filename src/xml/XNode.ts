// Port of the System.Xml.Linq node tree. Semantics follow .NET closely, in particular:
// - element content is null (empty tag), a string (text only) or a node list;
// - adding a node or attribute that already has a parent adds a clone;
// - adjacent strings merge into the preceding XText.

import { XName, XNamespace, type XNameLike, toXName } from './XName.js';
import { isWhitespaceOnly } from './XmlChars.js';

export enum XmlNodeType {
  Element = 1,
  Attribute = 2,
  Text = 3,
  CDATA = 4,
  ProcessingInstruction = 7,
  Comment = 8,
  Document = 9,
  DocumentType = 10,
}

export abstract class XObject {
  /** @internal */ _parent: XContainer | null = null;

  abstract get nodeType(): XmlNodeType;

  get parent(): XElement | null {
    return this._parent instanceof XElement ? this._parent : null;
  }

  get document(): XDocument | null {
    let n: XObject | null = this;
    while (n._parent) n = n._parent;
    return n instanceof XDocument ? n : null;
  }
}

export abstract class XNode extends XObject {
  get nextNode(): XNode | null {
    const p = this._parent;
    if (!p) return null;
    const nodes = p._nodeList();
    const i = nodes.indexOf(this);
    return i >= 0 && i + 1 < nodes.length ? nodes[i + 1] : null;
  }

  get previousNode(): XNode | null {
    const p = this._parent;
    if (!p) return null;
    const nodes = p._nodeList();
    const i = nodes.indexOf(this);
    return i > 0 ? nodes[i - 1] : null;
  }

  *ancestors(name?: XNameLike): Generator<XElement> {
    const n = name === undefined ? undefined : toXName(name);
    let e = this.parent;
    while (e) {
      if (!n || e.name === n) yield e;
      e = e.parent;
    }
  }

  *elementsAfterSelf(name?: XNameLike): Generator<XElement> {
    const n = name === undefined ? undefined : toXName(name);
    for (let s = this.nextNode; s; s = s.nextNode) if (s instanceof XElement && (!n || s.name === n)) yield s;
  }

  *elementsBeforeSelf(name?: XNameLike): Generator<XElement> {
    const p = this._parent;
    if (!p) return;
    const n = name === undefined ? undefined : toXName(name);
    for (const s of p._nodeList()) {
      if (s === this) return;
      if (s instanceof XElement && (!n || s.name === n)) yield s;
    }
  }

  *nodesAfterSelf(): Generator<XNode> {
    for (let s = this.nextNode; s; s = s.nextNode) yield s;
  }

  *nodesBeforeSelf(): Generator<XNode> {
    const p = this._parent;
    if (!p) return;
    for (const s of p._nodeList()) {
      if (s === this) return;
      yield s;
    }
  }

  addAfterSelf(...content: unknown[]): void {
    const p = this._requireParent();
    p._insertAt(p._nodeList().indexOf(this) + 1, content);
  }

  addBeforeSelf(...content: unknown[]): void {
    const p = this._requireParent();
    p._insertAt(p._nodeList().indexOf(this), content);
  }

  remove(): void {
    const p = this._requireParent();
    p._removeNode(this);
  }

  replaceWith(...content: unknown[]): void {
    const p = this._requireParent();
    const i = p._nodeList().indexOf(this);
    p._removeNode(this);
    p._insertAt(i, content);
  }

  /** @internal */
  _requireParent(): XContainer {
    if (!this._parent) throw new Error('The parent is missing.');
    return this._parent;
  }

  /** @internal */
  abstract _clone(): XNode;

  override toString(disableFormatting = false): string {
    return nodeToString(this, disableFormatting);
  }
}

export class XText extends XNode {
  constructor(public value: string) {
    super();
  }

  get nodeType(): XmlNodeType {
    return XmlNodeType.Text;
  }

  /** @internal */
  _clone(): XNode {
    return new XText(this.value);
  }
}

export class XCData extends XText {
  override get nodeType(): XmlNodeType {
    return XmlNodeType.CDATA;
  }

  /** @internal */
  override _clone(): XNode {
    return new XCData(this.value);
  }
}

export class XComment extends XNode {
  constructor(public value: string) {
    super();
  }

  get nodeType(): XmlNodeType {
    return XmlNodeType.Comment;
  }

  /** @internal */
  _clone(): XNode {
    return new XComment(this.value);
  }
}

export class XProcessingInstruction extends XNode {
  constructor(
    public target: string,
    public data: string,
  ) {
    super();
  }

  get nodeType(): XmlNodeType {
    return XmlNodeType.ProcessingInstruction;
  }

  /** @internal */
  _clone(): XNode {
    return new XProcessingInstruction(this.target, this.data);
  }
}

export class XDocumentType extends XNode {
  constructor(
    public name: string,
    public publicId: string | null,
    public systemId: string | null,
    public internalSubset: string | null,
  ) {
    super();
  }

  get nodeType(): XmlNodeType {
    return XmlNodeType.DocumentType;
  }

  /** @internal */
  _clone(): XNode {
    return new XDocumentType(this.name, this.publicId, this.systemId, this.internalSubset);
  }
}

export class XAttribute extends XObject {
  readonly name: XName;
  private _value: string;

  constructor(name: XNameLike, value: unknown) {
    super();
    this.name = toXName(name);
    if (value === null || value === undefined) throw new Error('Value cannot be null. (Parameter \'value\')');
    this._value = stringValue(value);
  }

  get nodeType(): XmlNodeType {
    return XmlNodeType.Attribute;
  }

  get value(): string {
    return this._value;
  }

  set value(v: string) {
    this._value = v;
  }

  get isNamespaceDeclaration(): boolean {
    return this.name.namespace === XNamespace.Xmlns || (this.name.namespace === XNamespace.None && this.name.localName === 'xmlns');
  }

  get nextAttribute(): XAttribute | null {
    const e = this.parent;
    if (!e) return null;
    const i = e._attrs.indexOf(this);
    return i + 1 < e._attrs.length ? e._attrs[i + 1] : null;
  }

  get previousAttribute(): XAttribute | null {
    const e = this.parent;
    if (!e) return null;
    const i = e._attrs.indexOf(this);
    return i > 0 ? e._attrs[i - 1] : null;
  }

  remove(): void {
    const e = this.parent;
    if (!e) throw new Error('The parent is missing.');
    e._attrs.splice(e._attrs.indexOf(this), 1);
    this._parent = null;
  }

  setValue(value: unknown): void {
    if (value === null || value === undefined) throw new Error('Value cannot be null. (Parameter \'value\')');
    this._value = stringValue(value);
  }

  override toString(): string {
    return `${this.name.localName}="${this._value}"`;
  }
}

export abstract class XContainer extends XNode {
  /**
   * null for an element written as empty tag, a string for text-only content (as .NET stores it),
   * otherwise a node list.
   * @internal
   */
  _content: null | string | XNode[] = null;

  /** @internal Returns the child node list, converting string content into an XText node. */
  _nodeList(): XNode[] {
    const c = this._content;
    if (c === null) return EMPTY_NODES;
    if (typeof c === 'string') {
      if (c.length === 0) return EMPTY_NODES;
      const t = new XText(c);
      t._parent = this;
      this._content = [t];
      return this._content;
    }
    return c;
  }

  get firstNode(): XNode | null {
    const n = this._nodeList();
    return n.length ? n[0] : null;
  }

  get lastNode(): XNode | null {
    const n = this._nodeList();
    return n.length ? n[n.length - 1] : null;
  }

  *nodes(): Generator<XNode> {
    yield* [...this._nodeList()];
  }

  *elements(name?: XNameLike): Generator<XElement> {
    const c = this._content;
    if (c === null || typeof c === 'string') return;
    const n = name === undefined ? undefined : toXName(name);
    for (const node of [...c]) if (node instanceof XElement && (!n || node.name === n)) yield node;
  }

  element(name: XNameLike): XElement | null {
    const c = this._content;
    if (c === null || typeof c === 'string') return null;
    const n = toXName(name);
    for (const node of c) if (node instanceof XElement && node.name === n) return node;
    return null;
  }

  *descendants(name?: XNameLike): Generator<XElement> {
    const n = name === undefined ? undefined : toXName(name);
    for (const e of descendantElements(this)) if (!n || e.name === n) yield e;
  }

  *descendantNodes(): Generator<XNode> {
    for (const node of [...this._nodeList()]) {
      yield node;
      if (node instanceof XContainer) yield* node.descendantNodes();
    }
  }

  add(...content: unknown[]): void {
    for (const c of content) this._addContent(c);
  }

  addFirst(...content: unknown[]): void {
    this._insertAt(0, content);
  }

  removeNodes(): void {
    const c = this._content;
    if (Array.isArray(c)) for (const n of c) n._parent = null;
    this._content = null;
  }

  replaceNodes(...content: unknown[]): void {
    const collected = collect(content);
    this.removeNodes();
    this.add(collected);
  }

  /** @internal When the last node goes, content becomes null (XContainer.RemoveNode). */
  _removeNode(node: XNode): void {
    const list = this._nodeList();
    const i = list.indexOf(node);
    if (i < 0) return;
    list.splice(i, 1);
    node._parent = null;
    if (list.length === 0) this._content = null;
  }

  /** @internal Inserts content before the node at the given index (AddFirst, AddBeforeSelf, AddAfterSelf). */
  _insertAt(index: number, content: unknown[]): void {
    const nodes: XNode[] = [];
    for (const c of collect(content)) {
      if (c instanceof XAttribute) {
        if (!(this instanceof XElement)) throw new Error('An attribute cannot be added to content.');
        this._addAttribute(c);
        continue;
      }
      let n: XNode;
      if (c instanceof XNode) n = this._prepareNode(c);
      else {
        const s = stringValue(c);
        this._validateString(s);
        if (s.length === 0) continue;
        n = new XText(s);
      }
      nodes.push(n);
    }
    if (nodes.length === 0) return;
    const list = this._nodeList() === EMPTY_NODES ? (this._content = []) : (this._content as XNode[]);
    for (const n of nodes) n._parent = this;
    list.splice(index, 0, ...nodes);
  }

  /** @internal Add semantics of XContainer.Add for a single content item. */
  _addContent(content: unknown): void {
    if (content === null || content === undefined) return;
    if (content instanceof XNode) {
      this._addNode(content);
      return;
    }
    if (content instanceof XAttribute) {
      if (!(this instanceof XElement)) throw new Error('An attribute cannot be added to content.');
      this._addAttribute(content);
      return;
    }
    if (typeof content === 'string') {
      this._addString(content);
      return;
    }
    if (typeof content === 'object' && Symbol.iterator in (content as object)) {
      for (const c of collect([content])) this._addContent(c);
      return;
    }
    this._addString(stringValue(content));
  }

  /** @internal XContainer.AddString: "" on an empty element sets empty content, text merges into a trailing XText. */
  _addString(s: string): void {
    this._validateString(s);
    const c = this._content;
    if (c === null) {
      if (s.length > 0) this._appendNode(new XText(s));
      else if (this instanceof XElement) this._content = s;
      return;
    }
    if (s.length === 0) return;
    const list = this._nodeList() === EMPTY_NODES ? (this._content = []) : (this._content as XNode[]);
    const last = list.length ? list[list.length - 1] : null;
    if (last instanceof XText && !(last instanceof XCData)) last.value += s;
    else this._appendNode(new XText(s));
  }

  /** @internal */
  _addNode(node: XNode): void {
    this._appendNode(this._prepareNode(node));
  }

  /** @internal A node that already has a parent, or is the root of this container, is cloned. */
  _prepareNode(node: XNode): XNode {
    this._validateNode(node);
    if (node._parent) return node._clone();
    let top: XContainer = this;
    while (top._parent) top = top._parent;
    return node === top ? node._clone() : node;
  }

  /** @internal */
  _appendNode(node: XNode): void {
    const list = this._nodeList() === EMPTY_NODES ? (this._content = []) : (this._content as XNode[]);
    node._parent = this;
    list.push(node);
  }

  /** @internal */
  _validateString(_s: string): void {}

  /** @internal */
  _validateNode(_node: XNode): void {}
}

const EMPTY_NODES: XNode[] = Object.freeze([]) as unknown as XNode[];

function* descendantElements(c: XContainer): Generator<XElement> {
  const content = c._content;
  if (content === null || typeof content === 'string') return;
  for (const n of [...content]) {
    if (n instanceof XElement) {
      yield n;
      yield* descendantElements(n);
    }
  }
}

export class XElement extends XContainer {
  private _name: XName;
  /** @internal */ _attrs: XAttribute[] = [];

  constructor(name: XNameLike, ...content: unknown[]);
  constructor(other: XElement);
  constructor(nameOrOther: XNameLike | XElement, ...content: unknown[]) {
    super();
    if (nameOrOther instanceof XElement) {
      const o = nameOrOther;
      this._name = o._name;
      for (const a of o._attrs) {
        const na = new XAttribute(a.name, a.value);
        na._parent = this;
        this._attrs.push(na);
      }
      const c = o._content;
      if (c === null || typeof c === 'string') this._content = c;
      else {
        this._content = c.map((n) => {
          const k = n._clone();
          k._parent = this;
          return k;
        });
      }
      return;
    }
    this._name = toXName(nameOrOther);
    for (const c of content) this._addContent(c);
  }

  get nodeType(): XmlNodeType {
    return XmlNodeType.Element;
  }

  get name(): XName {
    return this._name;
  }

  set name(v: XNameLike) {
    this._name = toXName(v);
  }

  get isEmpty(): boolean {
    return this._content === null;
  }

  get hasElements(): boolean {
    const c = this._content;
    return Array.isArray(c) && c.some((n) => n instanceof XElement);
  }

  get hasAttributes(): boolean {
    return this._attrs.length > 0;
  }

  get firstAttribute(): XAttribute | null {
    return this._attrs.length ? this._attrs[0] : null;
  }

  get lastAttribute(): XAttribute | null {
    return this._attrs.length ? this._attrs[this._attrs.length - 1] : null;
  }

  /** Concatenated text of all descendant text nodes. */
  get value(): string {
    const c = this._content;
    if (c === null) return '';
    if (typeof c === 'string') return c;
    let s = '';
    const walk = (list: XNode[]) => {
      for (const n of list) {
        if (n instanceof XText) s += n.value;
        else if (n instanceof XElement) {
          const cc = n._content;
          if (typeof cc === 'string') s += cc;
          else if (cc) walk(cc);
        }
      }
    };
    walk(c);
    return s;
  }

  set value(v: string) {
    this.setValue(v);
  }

  setValue(value: unknown): void {
    if (value === null || value === undefined) throw new Error('Value cannot be null. (Parameter \'value\')');
    this.removeNodes();
    this._addString(stringValue(value));
  }

  attribute(name: XNameLike): XAttribute | null {
    const n = toXName(name);
    for (const a of this._attrs) if (a.name === n) return a;
    return null;
  }

  *attributes(name?: XNameLike): Generator<XAttribute> {
    const n = name === undefined ? undefined : toXName(name);
    for (const a of [...this._attrs]) if (!n || a.name === n) yield a;
  }

  setAttributeValue(name: XNameLike, value: unknown): void {
    const n = toXName(name);
    const a = this.attribute(n);
    if (value === null || value === undefined) {
      if (a) a.remove();
      return;
    }
    if (a) a.value = stringValue(value);
    else this._addAttribute(new XAttribute(n, value));
  }

  setElementValue(name: XNameLike, value: unknown): void {
    const n = toXName(name);
    const e = this.element(n);
    if (value === null || value === undefined) {
      if (e) e.remove();
      return;
    }
    if (e) e.setValue(value);
    else this.add(new XElement(n, stringValue(value)));
  }

  removeAttributes(): void {
    for (const a of this._attrs) a._parent = null;
    this._attrs = [];
  }

  removeAll(): void {
    this.removeAttributes();
    this.removeNodes();
  }

  replaceAll(...content: unknown[]): void {
    const collected = collect(content);
    this.removeAll();
    this.add(collected);
  }

  replaceAttributes(...content: unknown[]): void {
    const collected = collect(content);
    this.removeAttributes();
    this.add(collected);
  }

  *ancestorsAndSelf(name?: XNameLike): Generator<XElement> {
    const n = name === undefined ? undefined : toXName(name);
    if (!n || this._name === n) yield this;
    yield* this.ancestors(n);
  }

  *descendantsAndSelf(name?: XNameLike): Generator<XElement> {
    const n = name === undefined ? undefined : toXName(name);
    if (!n || this._name === n) yield this;
    yield* this.descendants(n);
  }

  getDefaultNamespace(): XNamespace {
    return this.getNamespaceOfPrefix('') ?? XNamespace.None;
  }

  getNamespaceOfPrefix(prefix: string): XNamespace | null {
    if (prefix === 'xml') return XNamespace.Xml;
    if (prefix === 'xmlns') return XNamespace.Xmlns;
    for (let e: XElement | null = this; e; e = e.parent) {
      for (const a of e._attrs) {
        if (prefix === '' ? a.name.namespace === XNamespace.None && a.name.localName === 'xmlns' : a.name.namespace === XNamespace.Xmlns && a.name.localName === prefix) {
          return XNamespace.get(a.value);
        }
      }
    }
    return null;
  }

  getPrefixOfNamespace(ns: XNamespace): string | null {
    if (ns === XNamespace.Xml) return 'xml';
    if (ns === XNamespace.Xmlns) return 'xmlns';
    for (let e: XElement | null = this; e; e = e.parent) {
      for (const a of e._attrs) {
        if (a.name.namespace === XNamespace.Xmlns && a.value === ns.namespaceName) return a.name.localName;
      }
    }
    return null;
  }

  /** @internal */
  _addAttribute(a: XAttribute): void {
    if (a._parent) a = new XAttribute(a.name, a.value);
    if (this.attribute(a.name)) throw new Error('Duplicate attribute.');
    a._parent = this;
    this._attrs.push(a);
  }

  /** @internal */
  _clone(): XNode {
    return new XElement(this);
  }
}

export class XDeclaration {
  constructor(
    public version: string | null,
    public encoding: string | null,
    public standalone: string | null,
  ) {}

  toString(): string {
    let s = '<?xml';
    if (this.version != null) s += ` version="${this.version}"`;
    if (this.encoding != null) s += ` encoding="${this.encoding}"`;
    if (this.standalone != null) s += ` standalone="${this.standalone}"`;
    return s + '?>';
  }
}

export class XDocument extends XContainer {
  declaration: XDeclaration | null = null;

  constructor(...content: unknown[]) {
    super();
    for (const c of content) this._addContent(c);
  }

  get nodeType(): XmlNodeType {
    return XmlNodeType.Document;
  }

  get root(): XElement | null {
    for (const n of this._nodeList()) if (n instanceof XElement) return n;
    return null;
  }

  /** @internal */
  override _validateString(s: string): void {
    if (!isWhitespaceOnly(s)) throw new Error('Non-whitespace characters cannot be added to content.');
  }

  /** @internal */
  override _validateNode(node: XNode): void {
    if (node instanceof XElement && this.root && this.root !== node) throw new Error('This operation would create an incorrectly structured document.');
    if (node instanceof XText && !isWhitespaceOnly(node.value)) throw new Error('Non-whitespace characters cannot be added to content.');
  }

  /** @internal */
  _clone(): XNode {
    const d = new XDocument();
    d.declaration = this.declaration ? new XDeclaration(this.declaration.version, this.declaration.encoding, this.declaration.standalone) : null;
    const c = this._content;
    if (c === null || typeof c === 'string') d._content = c;
    else
      d._content = c.map((n) => {
        const k = n._clone();
        k._parent = d;
        return k;
      });
    return d;
  }
}

function collect(content: unknown[]): unknown[] {
  const out: unknown[] = [];
  const walk = (c: unknown) => {
    if (c === null || c === undefined) return;
    if (typeof c === 'string' || c instanceof XObject) out.push(c);
    else if (typeof c === 'object' && Symbol.iterator in (c as object)) for (const x of c as Iterable<unknown>) walk(x);
    else out.push(c);
  };
  for (const c of content) walk(c);
  return out;
}

/**
 * String conversion of content values as XLinq's GetStringValue does it: booleans in lower case,
 * numbers in the XML schema lexical form.
 */
export function stringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return numberToXmlString(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof XObject) throw new Error('An XObject cannot be used as a value.');
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** XmlConvert.ToString(double): INF, -INF, NaN, otherwise round-trippable "R" format. */
export function numberToXmlString(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'INF';
  if (v === -Infinity) return '-INF';
  if (Object.is(v, -0)) return '-0';
  return formatDoubleR(v);
}

/**
 * .NET Core 3.0+ double.ToString("R", InvariantCulture): shortest round-trip digits, scientific
 * notation when the exponent is < -5 or >= 15 ("E+XX"/"E-XX", at least two exponent digits).
 */
export function formatDoubleR(v: number): string {
  if (v === 0) return '0';
  const neg = v < 0;
  const [mant, expStr] = Math.abs(v).toExponential().split('e');
  const digits = mant.replace('.', '');
  const exp = parseInt(expStr, 10);
  let s: string;
  if (exp >= 15 || exp < -5) {
    const m = digits.length > 1 ? digits[0] + '.' + digits.slice(1) : digits;
    const e = Math.abs(exp).toString().padStart(2, '0');
    s = `${m}E${exp < 0 ? '-' : '+'}${e}`;
  } else if (exp < 0) {
    s = '0.' + '0'.repeat(-exp - 1) + digits;
  } else if (digits.length <= exp + 1) {
    s = digits + '0'.repeat(exp + 1 - digits.length);
  } else {
    s = digits.slice(0, exp + 1) + '.' + digits.slice(exp + 1);
  }
  return neg ? '-' + s : s;
}

// Set by XmlWriter.ts to avoid a circular import.
let nodeToString: (node: XNode, disableFormatting: boolean) => string = () => {
  throw new Error('XmlWriter not loaded');
};

/** @internal */
export function _setNodeToString(f: (node: XNode, disableFormatting: boolean) => string): void {
  nodeToString = f;
}
