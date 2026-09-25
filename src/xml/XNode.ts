// Port of the System.Xml.Linq node tree, following the .NET implementation closely:
// - child nodes form a circular singly linked list; a container's content is null (empty tag),
//   a string (text only) or its last node;
// - attributes form a circular list referenced by the last attribute;
// - enumerations are live, exactly like in .NET (removing the current node ends them);
// - the "skip notify" code paths are used throughout, because XObject change events are not
//   supported (Aml.Engine never subscribes to them, so .NET takes those paths as well).

import { XName, XNamespace, type XNameLike, toXName } from './XName.js';
import { XmlException, isName, isWhitespaceOnly, verifyNCName } from './XmlChars.js';
import { formatDouble } from '../system/Number.js';
import { ArgumentException, ArgumentNullException, InvalidOperationException } from '../system/exceptions.js';

export enum XmlNodeType {
  None = 0,
  Element = 1,
  Attribute = 2,
  Text = 3,
  CDATA = 4,
  ProcessingInstruction = 7,
  Comment = 8,
  Document = 9,
  DocumentType = 10,
}

export class XObject {
  /** @internal */ _parent: XContainer | null = null;

  get nodeType(): XmlNodeType {
    return XmlNodeType.None;
  }

  get parent(): XElement | null {
    return this._parent instanceof XElement ? this._parent : null;
  }

  get document(): XDocument | null {
    let n: XObject = this;
    while (n._parent) n = n._parent;
    return n instanceof XDocument ? n : null;
  }
}

export abstract class XNode extends XObject {
  /** @internal */ _next: XNode | null = null;

  get nextNode(): XNode | null {
    const p = this._parent;
    return p === null || this === p._content ? null : this._next;
  }

  get previousNode(): XNode | null {
    const p = this._parent;
    if (p === null) return null;
    let n = (p._content as XNode)._next!;
    let prev: XNode | null = null;
    while (n !== this) {
      prev = n;
      n = n._next!;
    }
    return prev;
  }

  addAfterSelf(...content: unknown[]): void {
    if (this._parent === null) throw missingParent();
    new Inserter(this._parent, this).add(content);
  }

  addBeforeSelf(...content: unknown[]): void {
    const parent = this._parent;
    if (parent === null) throw missingParent();
    let p: XNode | null = parent._content as XNode;
    while (p!._next !== this) p = p!._next;
    if (p === parent._content) p = null;
    new Inserter(parent, p).add(content);
  }

  ancestors(name?: XNameLike): Generator<XElement> {
    return getAncestors(this, name === undefined ? null : toXName(name), false);
  }

  *elementsAfterSelf(name?: XNameLike): Generator<XElement> {
    const nm = name === undefined ? null : toXName(name);
    let n: XNode = this;
    while (n._parent !== null && n !== n._parent._content) {
      n = n._next!;
      if (n instanceof XElement && (nm === null || n.name === nm)) yield n;
    }
  }

  *elementsBeforeSelf(name?: XNameLike): Generator<XElement> {
    const nm = name === undefined ? null : toXName(name);
    const parent = this._parent;
    if (parent === null) return;
    let n = parent._content as XNode;
    do {
      n = n._next!;
      if (n === this) break;
      if (n instanceof XElement && (nm === null || n.name === nm)) yield n;
    } while (this._parent !== null && this._parent === n._parent);
  }

  *nodesAfterSelf(): Generator<XNode> {
    let n: XNode = this;
    while (n._parent !== null && n !== n._parent._content) {
      n = n._next!;
      yield n;
    }
  }

  *nodesBeforeSelf(): Generator<XNode> {
    const parent = this._parent;
    if (parent === null) return;
    let n = parent._content as XNode;
    do {
      n = n._next!;
      if (n === this) break;
      yield n;
    } while (this._parent !== null && this._parent === n._parent);
  }

  remove(): void {
    if (this._parent === null) throw missingParent();
    this._parent._removeNode(this);
  }

  replaceWith(...content: unknown[]): void {
    const c = this._parent;
    if (c === null) throw missingParent();
    let p: XNode | null = c._content as XNode;
    while (p!._next !== this) p = p!._next;
    if (p === c._content) p = null;
    c._removeNode(this);
    if (p !== null && p._parent !== c) throw externalCode();
    new Inserter(c, p).add(content);
  }

  /** @internal */
  abstract _cloneNode(): XNode;

  /** @internal Appends the text value for XElement.Value. */
  _appendText(_sb: string[]): void {}

  override toString(disableFormatting = false): string {
    return nodeToString(this, disableFormatting);
  }
}

export class XText extends XNode {
  /** @internal */ _text: string;

  constructor(value: string | XText) {
    super();
    if (value instanceof XText) this._text = value._text;
    else {
      if (value === null || value === undefined) throw new ArgumentNullException('value');
      this._text = value;
    }
  }

  override get nodeType(): XmlNodeType {
    return XmlNodeType.Text;
  }

  get value(): string {
    return this._text;
  }

  set value(v: string) {
    if (v === null || v === undefined) throw new ArgumentNullException('value');
    this._text = v;
  }

  /** @internal */
  _cloneNode(): XNode {
    return new XText(this);
  }

  /** @internal */
  override _appendText(sb: string[]): void {
    sb.push(this._text);
  }
}

export class XCData extends XText {
  override get nodeType(): XmlNodeType {
    return XmlNodeType.CDATA;
  }

  /** @internal */
  override _cloneNode(): XNode {
    return new XCData(this);
  }
}

export class XComment extends XNode {
  /** @internal */ _value: string;

  constructor(value: string) {
    super();
    if (value === null || value === undefined) throw new ArgumentNullException('value');
    this._value = value;
  }

  get value(): string {
    return this._value;
  }

  set value(v: string) {
    if (v === null || v === undefined) throw new ArgumentNullException('value');
    this._value = v;
  }

  override get nodeType(): XmlNodeType {
    return XmlNodeType.Comment;
  }

  /** @internal */
  _cloneNode(): XNode {
    return new XComment(this.value);
  }
}

export class XProcessingInstruction extends XNode {
  /** @internal */ _target: string;
  /** @internal */ _data: string;

  constructor(target: string, data: string) {
    super();
    if (target === null || target === undefined) throw new ArgumentNullException('target');
    if (data === null || data === undefined) throw new ArgumentNullException('data');
    validatePIName(target);
    this._target = target;
    this._data = data;
  }

  get target(): string {
    return this._target;
  }

  set target(v: string) {
    validatePIName(v);
    this._target = v;
  }

  get data(): string {
    return this._data;
  }

  set data(v: string) {
    if (v === null || v === undefined) throw new ArgumentNullException('value');
    this._data = v;
  }

  override get nodeType(): XmlNodeType {
    return XmlNodeType.ProcessingInstruction;
  }

  /** @internal */
  _cloneNode(): XNode {
    return new XProcessingInstruction(this.target, this.data);
  }
}

export class XDocumentType extends XNode {
  /** @internal */ _name: string;

  constructor(
    name: string,
    public publicId: string | null,
    public systemId: string | null,
    public internalSubset: string | null,
  ) {
    super();
    this._name = verifyName(name);
  }

  get name(): string {
    return this._name;
  }

  set name(v: string) {
    this._name = verifyName(v);
  }

  override get nodeType(): XmlNodeType {
    return XmlNodeType.DocumentType;
  }

  /** @internal */
  _cloneNode(): XNode {
    return new XDocumentType(this.name, this.publicId, this.systemId, this.internalSubset);
  }
}

export class XAttribute extends XObject {
  /** @internal */ _next: XAttribute | null = null;
  readonly name: XName;
  /** @internal */ _value: string;

  constructor(name: XNameLike, value: unknown);
  constructor(other: XAttribute);
  constructor(nameOrOther: XNameLike | XAttribute, value?: unknown) {
    super();
    if (nameOrOther instanceof XAttribute) {
      this.name = nameOrOther.name;
      this._value = nameOrOther._value;
      return;
    }
    this.name = toXName(nameOrOther);
    if (value === null || value === undefined) throw new ArgumentNullException('value');
    const s = getStringValue(value);
    validateAttribute(this.name, s);
    this._value = s;
  }

  override get nodeType(): XmlNodeType {
    return XmlNodeType.Attribute;
  }

  get value(): string {
    return this._value;
  }

  set value(v: string) {
    if (v === null || v === undefined) throw new ArgumentNullException('value');
    validateAttribute(this.name, v);
    this._value = v;
  }

  get isNamespaceDeclaration(): boolean {
    const ns = this.name.namespace;
    if (ns === XNamespace.None) return this.name.localName === 'xmlns';
    return ns === XNamespace.Xmlns;
  }

  get nextAttribute(): XAttribute | null {
    const p = this._parent as XElement | null;
    return p !== null && p._lastAttr !== this ? this._next : null;
  }

  get previousAttribute(): XAttribute | null {
    const p = this._parent as XElement | null;
    if (p === null) return null;
    let a = p._lastAttr!;
    while (a._next !== this) a = a._next!;
    return a !== p._lastAttr ? a : null;
  }

  remove(): void {
    if (this._parent === null) throw missingParent();
    (this._parent as XElement)._removeAttribute(this);
  }

  setValue(value: unknown): void {
    if (value === null || value === undefined) throw new ArgumentNullException('value');
    this.value = getStringValue(value);
  }

  override toString(): string {
    return nodeToString(this, true);
  }
}

export abstract class XContainer extends XNode {
  /**
   * null (empty), a string (text only) or the last child node of the circular list.
   * @internal
   */
  _content: null | string | XNode = null;

  get firstNode(): XNode | null {
    const last = this.lastNode;
    return last !== null ? last._next : null;
  }

  get lastNode(): XNode | null {
    const c = this._content;
    if (c === null) return null;
    if (typeof c === 'string') {
      if (c.length === 0) return null;
      const t = new XText(c);
      t._parent = this;
      t._next = t;
      this._content = t;
      return t;
    }
    return c;
  }

  add(...content: unknown[]): void {
    for (const c of content) this._addContentSkipNotify(c);
  }

  addFirst(...content: unknown[]): void {
    new Inserter(this, null).add(content);
  }

  descendantNodes(): Generator<XNode> {
    return getDescendantNodes(this, false);
  }

  descendants(name?: XNameLike): Generator<XElement> {
    return getDescendants(this, name === undefined ? null : toXName(name), false);
  }

  element(name: XNameLike): XElement | null {
    const nm = toXName(name);
    let n = this._content;
    if (n instanceof XNode) {
      const last = n;
      do {
        n = n._next!;
        if (n instanceof XElement && n.name === nm) return n;
      } while (n !== last);
    }
    return null;
  }

  elements(name?: XNameLike): Generator<XElement> {
    return this._getElements(name === undefined ? null : toXName(name));
  }

  *nodes(): Generator<XNode> {
    let n = this.lastNode;
    if (n !== null) {
      do {
        n = n._next!;
        yield n;
      } while (n._parent === this && n !== this._content);
    }
  }

  removeNodes(): void {
    const last = this._content;
    if (last instanceof XNode) {
      let n: XNode = last;
      do {
        const next: XNode = n._next!;
        n._parent = null;
        n._next = null;
        n = next;
      } while (n !== last);
    }
    this._content = null;
  }

  replaceNodes(...content: unknown[]): void {
    const snapshot = getContentSnapshot(content);
    this.removeNodes();
    this.add(snapshot);
  }

  /** @internal */
  *_getElements(name: XName | null): Generator<XElement> {
    let n = this._content;
    if (n instanceof XNode) {
      do {
        n = n._next!;
        if (n instanceof XElement && (name === null || n.name === name)) yield n;
      } while (n._parent === this && n !== this._content);
    }
  }

  /** @internal */
  _addContentSkipNotify(content: unknown): void {
    if (content === null || content === undefined) return;
    if (content instanceof XNode) return this._addNodeSkipNotify(content);
    if (typeof content === 'string') return this._addStringSkipNotify(content);
    if (content instanceof XAttribute) return this._addAttributeSkipNotify(content);
    if (isIterable(content)) {
      for (const c of content) this._addContentSkipNotify(c);
      return;
    }
    this._addStringSkipNotify(getStringValue(content));
  }

  /** @internal */
  _addNodeSkipNotify(n: XNode): void {
    this._validateNode(n, this);
    if (n._parent !== null) n = n._cloneNode();
    else {
      let p: XNode = this;
      while (p._parent !== null) p = p._parent;
      if (n === p) n = n._cloneNode();
    }
    this._convertTextToNode();
    this._appendNodeSkipNotify(n);
  }

  /** @internal */
  _addStringSkipNotify(s: string): void {
    this._validateString(s);
    const c = this._content;
    if (c === null) this._content = s;
    else if (s.length > 0) {
      if (typeof c === 'string') this._content = c + s;
      else if (c instanceof XText && !(c instanceof XCData)) c._text += s;
      else this._appendNodeSkipNotify(new XText(s));
    }
  }

  /** @internal */
  _addAttributeSkipNotify(_a: XAttribute): void {}

  /** @internal */
  _appendNodeSkipNotify(n: XNode): void {
    n._parent = this;
    const c = this._content;
    if (c === null || typeof c === 'string') n._next = n;
    else {
      n._next = c._next;
      c._next = n;
    }
    this._content = n;
  }

  /** @internal */
  _convertTextToNode(): void {
    const s = this._content;
    if (typeof s === 'string' && s.length > 0) {
      const t = new XText(s);
      t._parent = this;
      t._next = t;
      this._content = t;
    }
  }

  /** @internal */
  _removeNode(n: XNode): void {
    if (n._parent !== this) throw externalCode();
    let p = this._content as XNode;
    while (p._next !== n) p = p._next!;
    if (p === n) this._content = null;
    else {
      if (this._content === n) this._content = p;
      p._next = n._next;
    }
    n._parent = null;
    n._next = null;
  }

  /** @internal */
  override _appendText(sb: string[]): void {
    const c = this._content;
    if (typeof c === 'string') sb.push(c);
    else if (c !== null) {
      let n: XNode = c;
      do {
        n = n._next!;
        n._appendText(sb);
      } while (n !== c);
    }
  }

  /** @internal */
  _validateNode(_node: XNode, _previous: XNode | null): void {}

  /** @internal */
  _validateString(_s: string): void {}
}

export class XElement extends XContainer {
  /** @internal */ _name: XName;
  /** @internal */ _lastAttr: XAttribute | null = null;

  constructor(name: XNameLike, ...content: unknown[]);
  constructor(other: XElement);
  constructor(nameOrOther: XNameLike | XElement, ...content: unknown[]) {
    super();
    if (nameOrOther instanceof XElement) {
      const other = nameOrOther;
      this._name = other._name;
      const oc = other._content;
      if (typeof oc === 'string') this._content = oc;
      else if (oc !== null) {
        let n: XNode = oc;
        do {
          n = n._next!;
          this._appendNodeSkipNotify(n._cloneNode());
        } while (n !== oc);
      }
      let a = other._lastAttr;
      if (a !== null) {
        do {
          a = a._next!;
          this._appendAttributeSkipNotify(new XAttribute(a));
        } while (a !== other._lastAttr);
      }
      return;
    }
    if (nameOrOther === null || nameOrOther === undefined) throw new ArgumentNullException('name');
    this._name = toXName(nameOrOther);
    for (const c of content) this._addContentSkipNotify(c);
  }

  override get nodeType(): XmlNodeType {
    return XmlNodeType.Element;
  }

  get name(): XName {
    return this._name;
  }

  set name(v: XNameLike) {
    if (v === null || v === undefined) throw new ArgumentNullException('value');
    this._name = toXName(v);
  }

  get isEmpty(): boolean {
    return this._content === null;
  }

  get hasElements(): boolean {
    const last = this._content;
    if (last instanceof XNode) {
      let n: XNode = last;
      do {
        if (n instanceof XElement) return true;
        n = n._next!;
      } while (n !== last);
    }
    return false;
  }

  get hasAttributes(): boolean {
    return this._lastAttr !== null;
  }

  get firstAttribute(): XAttribute | null {
    return this._lastAttr !== null ? this._lastAttr._next : null;
  }

  get lastAttribute(): XAttribute | null {
    return this._lastAttr;
  }

  get value(): string {
    const c = this._content;
    if (c === null) return '';
    if (typeof c === 'string') return c;
    const sb: string[] = [];
    this._appendText(sb);
    return sb.join('');
  }

  set value(v: string) {
    if (v === null || v === undefined) throw new ArgumentNullException('value');
    this.removeNodes();
    this.add(v);
  }

  setValue(value: unknown): void {
    if (value === null || value === undefined) throw new ArgumentNullException('value');
    this.value = getStringValue(value);
  }

  ancestorsAndSelf(name?: XNameLike): Generator<XElement> {
    return getAncestors(this, name === undefined ? null : toXName(name), true);
  }

  descendantsAndSelf(name?: XNameLike): Generator<XElement> {
    return getDescendants(this, name === undefined ? null : toXName(name), true);
  }

  descendantNodesAndSelf(): Generator<XNode> {
    return getDescendantNodes(this, true);
  }

  attribute(name: XNameLike): XAttribute | null {
    const nm = toXName(name);
    let a = this._lastAttr;
    if (a !== null) {
      do {
        a = a._next!;
        if (a.name === nm) return a;
      } while (a !== this._lastAttr);
    }
    return null;
  }

  *attributes(name?: XNameLike): Generator<XAttribute> {
    const nm = name === undefined ? null : toXName(name);
    let a = this._lastAttr;
    if (a !== null) {
      do {
        a = a._next!;
        if (nm === null || a.name === nm) yield a;
      } while (a._parent === this && a !== this._lastAttr);
    }
  }

  setAttributeValue(name: XNameLike, value: unknown): void {
    const nm = toXName(name);
    const a = this.attribute(nm);
    if (value === null || value === undefined) {
      if (a !== null) this._removeAttribute(a);
    } else if (a !== null) a.value = getStringValue(value);
    else this._appendAttribute(new XAttribute(nm, value));
  }

  setElementValue(name: XNameLike, value: unknown): void {
    const nm = toXName(name);
    const e = this.element(nm);
    if (value === null || value === undefined) {
      if (e !== null) this._removeNode(e);
    } else if (e !== null) e.value = getStringValue(value);
    else this._addNodeSkipNotify(new XElement(nm, getStringValue(value)));
  }

  removeAttributes(): void {
    const last = this._lastAttr;
    if (last !== null) {
      let a: XAttribute = last;
      do {
        const next: XAttribute = a._next!;
        a._parent = null;
        a._next = null;
        a = next;
      } while (a !== last);
    }
    this._lastAttr = null;
  }

  removeAll(): void {
    this.removeAttributes();
    this.removeNodes();
  }

  replaceAll(...content: unknown[]): void {
    const snapshot = getContentSnapshot(content);
    this.removeAll();
    this.add(snapshot);
  }

  replaceAttributes(...content: unknown[]): void {
    const snapshot = getContentSnapshot(content);
    this.removeAttributes();
    this.add(snapshot);
  }

  getDefaultNamespace(): XNamespace {
    return this._getNamespaceOfPrefixInScope('xmlns', null) ?? XNamespace.None;
  }

  getNamespaceOfPrefix(prefix: string): XNamespace | null {
    if (prefix === null || prefix === undefined) throw new ArgumentNullException('prefix');
    if (prefix.length === 0) throw new ArgumentException(`'${prefix}' is an invalid prefix.`);
    if (prefix === 'xmlns') return XNamespace.Xmlns;
    return this._getNamespaceOfPrefixInScope(prefix, null) ?? (prefix === 'xml' ? XNamespace.Xml : null);
  }

  getPrefixOfNamespace(ns: XNamespace): string | null {
    const namespaceName = ns.namespaceName;
    let hasInScopeNamespace = false;
    let e: XElement | null = this;
    do {
      const lastAttr: XAttribute | null = e._lastAttr;
      if (lastAttr !== null) {
        let hasLocalNamespace = false;
        let a: XAttribute = lastAttr;
        do {
          a = a._next!;
          if (a.isNamespaceDeclaration) {
            if (a.value === namespaceName) {
              if (a.name.namespaceName.length !== 0 && (!hasInScopeNamespace || this._getNamespaceOfPrefixInScope(a.name.localName, e) === null)) {
                return a.name.localName;
              }
            }
            hasLocalNamespace = true;
          }
        } while (a !== lastAttr);
        hasInScopeNamespace = hasInScopeNamespace || hasLocalNamespace;
      }
      e = e._parent instanceof XElement ? e._parent : null;
    } while (e !== null);
    if (namespaceName === XNamespace.Xml.namespaceName) {
      if (!hasInScopeNamespace || this._getNamespaceOfPrefixInScope('xml', null) === null) return 'xml';
    } else if (namespaceName === XNamespace.Xmlns.namespaceName) return 'xmlns';
    return null;
  }

  /** @internal Looks up a namespace declaration (prefix "xmlns" means the default namespace). */
  _getNamespaceOfPrefixInScope(prefix: string, outOfScope: XElement | null): XNamespace | null {
    let e: XElement | null = this;
    while (e !== outOfScope && e !== null) {
      const lastAttr: XAttribute | null = e._lastAttr;
      if (lastAttr !== null) {
        let a: XAttribute = lastAttr;
        do {
          a = a._next!;
          if (a.isNamespaceDeclaration && a.name.localName === prefix) return XNamespace.get(a.value);
        } while (a !== lastAttr);
      }
      e = e._parent instanceof XElement ? e._parent : null;
    }
    return null;
  }

  /** @internal */
  override _addAttributeSkipNotify(a: XAttribute): void {
    if (this.attribute(a.name) !== null) throw duplicateAttribute();
    if (a._parent !== null) a = new XAttribute(a);
    this._appendAttributeSkipNotify(a);
  }

  /** @internal */
  _appendAttribute(a: XAttribute): void {
    if (a._parent !== null) throw externalCode();
    this._appendAttributeSkipNotify(a);
  }

  /** @internal */
  _appendAttributeSkipNotify(a: XAttribute): void {
    a._parent = this;
    if (this._lastAttr === null) a._next = a;
    else {
      a._next = this._lastAttr._next;
      this._lastAttr._next = a;
    }
    this._lastAttr = a;
  }

  /** @internal */
  _removeAttribute(a: XAttribute): void {
    if (a._parent !== this) throw externalCode();
    let p = this._lastAttr!;
    let n: XAttribute;
    while ((n = p._next!) !== a) p = n;
    if (p === a) this._lastAttr = null;
    else {
      if (this._lastAttr === a) this._lastAttr = p;
      p._next = a._next;
    }
    a._parent = null;
    a._next = null;
  }

  /** @internal */
  override _validateNode(node: XNode, _previous: XNode | null): void {
    if (node instanceof XDocument) throw new ArgumentException('A node of type Document cannot be added to content.');
    if (node instanceof XDocumentType) throw new ArgumentException('A node of type DocumentType cannot be added to content.');
  }

  /** @internal */
  _cloneNode(): XNode {
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
    if (content.length === 1 && content[0] instanceof XDocument) {
      const other = content[0];
      const oc = other._content;
      if (typeof oc === 'string') this._content = oc;
      else if (oc !== null) {
        let n: XNode = oc;
        do {
          n = n._next!;
          this._appendNodeSkipNotify(n._cloneNode());
        } while (n !== oc);
      }
      if (other.declaration) this.declaration = new XDeclaration(other.declaration.version, other.declaration.encoding, other.declaration.standalone);
      return;
    }
    for (const c of content) this._addContentSkipNotify(c);
  }

  override get nodeType(): XmlNodeType {
    return XmlNodeType.Document;
  }

  get root(): XElement | null {
    const last = this._content;
    if (last instanceof XNode) {
      let n: XNode = last;
      do {
        n = n._next!;
        if (n instanceof XElement) return n;
      } while (n !== last);
    }
    return null;
  }

  get documentType(): XDocumentType | null {
    const last = this._content;
    if (last instanceof XNode) {
      let n: XNode = last;
      do {
        n = n._next!;
        if (n instanceof XDocumentType) return n;
      } while (n !== last);
    }
    return null;
  }

  /** @internal */
  override _validateNode(node: XNode, previous: XNode | null): void {
    switch (node.nodeType) {
      case XmlNodeType.Text:
        this._validateString((node as XText).value);
        break;
      case XmlNodeType.Element:
        this._validateDocument(previous, XmlNodeType.DocumentType, XmlNodeType.None);
        break;
      case XmlNodeType.DocumentType:
        this._validateDocument(previous, XmlNodeType.None, XmlNodeType.Element);
        break;
      case XmlNodeType.CDATA:
        throw new ArgumentException('A node of type CDATA cannot be added to content.');
      case XmlNodeType.Document:
        throw new ArgumentException('A node of type Document cannot be added to content.');
    }
  }

  private _validateDocument(previous: XNode | null, allowBefore: XmlNodeType, allowAfter: XmlNodeType): void {
    const last = this._content;
    if (last instanceof XNode) {
      let n: XNode = last;
      if (previous === null) allowBefore = allowAfter;
      do {
        n = n._next!;
        const nt = n.nodeType;
        if (nt === XmlNodeType.Element || nt === XmlNodeType.DocumentType) {
          if (nt !== allowBefore) throw new InvalidOperationException('This operation would create an incorrectly structured document.');
          allowBefore = XmlNodeType.None;
        }
        if (n === previous) allowBefore = allowAfter;
      } while (n !== last);
    }
  }

  /** @internal */
  override _validateString(s: string): void {
    if (!isWhitespaceOnly(s)) throw new ArgumentException('Non-whitespace characters cannot be added to content.');
  }

  /** @internal XDocument.AddAttributeSkipNotify: a document has no attributes. */
  override _addAttributeSkipNotify(_a: XAttribute): void {
    throw new ArgumentException('An attribute cannot be added to content.');
  }

  /** @internal */
  _cloneNode(): XNode {
    return new XDocument(this);
  }
}

/** Port of System.Xml.Linq.Inserter: insertion after an anchor node (null: at the start). */
class Inserter {
  private _text: string | null = null;

  constructor(
    private readonly _parent: XContainer,
    private _previous: XNode | null,
  ) {}

  add(content: unknown): void {
    this.addContent(content);
    const text = this._text;
    if (text !== null) {
      if (this._parent._content === null) {
        this._parent._content = text;
      } else if (text.length > 0) {
        const prev = this._previous;
        if (prev instanceof XText && !(prev instanceof XCData)) prev._text += text;
        else {
          this._parent._convertTextToNode();
          this.insertNode(new XText(text));
        }
      }
    }
  }

  private addContent(content: unknown): void {
    if (content === null || content === undefined) return;
    if (content instanceof XNode) return this.addNode(content);
    if (typeof content === 'string') return this.addString(content);
    if (content instanceof XAttribute) throw new ArgumentException('An attribute cannot be added to content.');
    if (isIterable(content)) {
      for (const c of content) this.addContent(c);
      return;
    }
    this.addString(getStringValue(content));
  }

  private addNode(n: XNode): void {
    this._parent._validateNode(n, this._previous);
    if (n._parent !== null) n = n._cloneNode();
    else {
      let p: XNode = this._parent;
      while (p._parent !== null) p = p._parent;
      if (n === p) n = n._cloneNode();
    }
    this._parent._convertTextToNode();
    if (this._text !== null) {
      if (this._text.length > 0) {
        const prev = this._previous;
        if (prev instanceof XText && !(prev instanceof XCData)) prev._text += this._text;
        else this.insertNode(new XText(this._text));
      }
      this._text = null;
    }
    this.insertNode(n);
  }

  private addString(s: string): void {
    this._parent._validateString(s);
    this._text = (this._text ?? '') + s;
  }

  private insertNode(n: XNode): void {
    if (n._parent !== null) throw externalCode();
    const parent = this._parent;
    n._parent = parent;
    const c = parent._content;
    if (c === null || typeof c === 'string') {
      n._next = n;
      parent._content = n;
    } else if (this._previous === null) {
      n._next = c._next;
      c._next = n;
    } else {
      n._next = this._previous._next;
      this._previous._next = n;
      if (parent._content === this._previous) parent._content = n;
    }
    this._previous = n;
  }
}

function* getAncestors(start: XNode, name: XName | null, self: boolean): Generator<XElement> {
  let e: XContainer | null = self ? (start as XContainer) : start._parent;
  while (e instanceof XElement) {
    if (name === null || e.name === name) yield e;
    e = e._parent;
  }
}

function* getDescendantNodes(root: XContainer, self: boolean): Generator<XNode> {
  if (self) yield root;
  let n: XNode = root;
  for (;;) {
    const first = n instanceof XContainer ? n.firstNode : null;
    if (first !== null) n = first;
    else {
      while (n !== root && n === n._parent!._content) n = n._parent!;
      if (n === root) break;
      n = n._next!;
    }
    yield n;
  }
}

function* getDescendants(root: XContainer, name: XName | null, self: boolean): Generator<XElement> {
  if (self) {
    const e = root as XElement;
    if (name === null || e.name === name) yield e;
  }
  let n: XNode = root;
  let c: XContainer | null = root;
  for (;;) {
    if (c !== null && c._content instanceof XNode) n = c._content._next!;
    else {
      while (n !== root && n === n._parent!._content) n = n._parent!;
      if (n === root) break;
      n = n._next!;
    }
    const e = n instanceof XElement ? n : null;
    if (e !== null && (name === null || e.name === name)) yield e;
    c = e;
  }
}

function getContentSnapshot(content: unknown[]): unknown[] {
  const out: unknown[] = [];
  const walk = (c: unknown) => {
    if (c === null || c === undefined) return;
    if (typeof c === 'string' || c instanceof XObject) out.push(c);
    else if (isIterable(c)) for (const x of c) walk(x);
    else out.push(c);
  };
  for (const c of content) walk(c);
  return out;
}

function isIterable(v: unknown): v is Iterable<unknown> {
  return typeof v === 'object' && v !== null && Symbol.iterator in v;
}

/** Values that know their XML schema lexical form (DateTime, Decimal, ... from src/system). */
export interface XmlConvertible {
  toXmlString(): string;
}

/**
 * XContainer.GetStringValue: the conversion applied to non-string content values.
 * Numbers are formatted as xs:double (XmlConvert.ToString(double)).
 */
export function getStringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return numberToXmlString(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof XObject) throw new ArgumentException('An XObject cannot be used as a value.');
  if (typeof value === 'object' && value !== null && typeof (value as XmlConvertible).toXmlString === 'function') {
    return (value as XmlConvertible).toXmlString();
  }
  return String(value);
}

/** @deprecated use getStringValue */
export const stringValue = getStringValue;

/** XmlConvert.ToString(double): INF, -INF, NaN, otherwise the round-trip "R" format. */
export function numberToXmlString(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'INF';
  if (v === -Infinity) return '-INF';
  if (Object.is(v, -0)) return '-0';
  return formatDoubleR(v);
}

/** double.ToString("R", InvariantCulture), from the system layer (verified against .NET). */
export function formatDoubleR(v: number): string {
  return formatDouble(v, 'R');
}

/** XAttribute.ValidateAttribute: the constraints on namespace declarations. */
function validateAttribute(name: XName, value: string): void {
  const ns = name.namespace;
  if (ns === XNamespace.Xmlns) {
    if (value.length === 0) throw new ArgumentException(`The prefix '${name.localName}' cannot be bound to the empty namespace name.`);
    if (value === XNamespace.Xml.namespaceName) {
      if (name.localName !== 'xml') throw new ArgumentException("The prefix 'xml' is bound to the namespace name 'http://www.w3.org/XML/1998/namespace'. Other prefixes must not be bound to this namespace name, and it must not be declared as the default namespace.");
    } else if (value === XNamespace.Xmlns.namespaceName) {
      throw new ArgumentException("The prefix 'xmlns' is bound to the namespace name 'http://www.w3.org/2000/xmlns/'. It must not be declared. Other prefixes must not be bound to this namespace name, and it must not be declared as the default namespace.");
    } else if (name.localName === 'xml') {
      throw new ArgumentException("The prefix 'xml' is bound to the namespace name 'http://www.w3.org/XML/1998/namespace'. Other prefixes must not be bound to this namespace name, and it must not be declared as the default namespace.");
    } else if (name.localName === 'xmlns') {
      throw new ArgumentException("The prefix 'xmlns' is bound to the namespace name 'http://www.w3.org/2000/xmlns/'. It must not be declared. Other prefixes must not be bound to this namespace name, and it must not be declared as the default namespace.");
    }
  } else if (ns === XNamespace.None && name.localName === 'xmlns') {
    if (value === XNamespace.Xml.namespaceName || value === XNamespace.Xmlns.namespaceName) {
      throw new ArgumentException(`The namespace name '${value}' cannot be declared as the default namespace.`);
    }
  }
}

/** XProcessingInstruction.ValidateName: XmlConvert.VerifyNCName, and not "xml" in any case. */
function validatePIName(name: string): void {
  if (name === null || name === undefined) throw new ArgumentNullException('name');
  if (name.length === 0) throw new ArgumentException("The empty string '' is not a valid name.", 'name');
  verifyNCName(name);
  if (name.toLowerCase() === 'xml') throw new ArgumentException(`'${name}' is an invalid name for processing instructions.`);
}

/** XmlConvert.VerifyName. */
function verifyName(name: string): string {
  if (name === null || name === undefined) throw new ArgumentNullException('name');
  if (name.length === 0) throw new ArgumentException("The empty string '' is not a valid name.", 'name');
  if (!isName(name)) throw new XmlException(`Invalid name character in '${name}'.`);
  return name;
}

function missingParent(): Error {
  return new InvalidOperationException('The parent is missing.');
}

function externalCode(): Error {
  return new InvalidOperationException('This operation was corrupted by external code.');
}

function duplicateAttribute(): Error {
  return new InvalidOperationException('Duplicate attribute.');
}

// Set by XmlWriter.ts to avoid a circular import.
let nodeToString: (node: XObject, disableFormatting: boolean) => string = () => {
  throw new Error('XmlWriter not loaded');
};

/** @internal */
export function _setNodeToString(f: (node: XObject, disableFormatting: boolean) => string): void {
  nodeToString = f;
}
