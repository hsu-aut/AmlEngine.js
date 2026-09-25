// Serializer reproducing the output of XDocument.Save / XElement.ToString in .NET: the XLinq
// ElementWriter (prefix resolution), XmlWellFormedWriter (namespace declarations) and
// XmlEncodedRawTextWriterIndent (indentation, escaping, new line handling).

import { XNamespace } from './XName.js';
import {
  XAttribute,
  XCData,
  XComment,
  XContainer,
  XDocument,
  XDocumentType,
  XElement,
  XNode,
  XObject,
  XProcessingInstruction,
  XText,
  _setNodeToString,
} from './XNode.js';
import { XmlException, isWhitespaceOnly, isXmlChar } from './XmlChars.js';
import { ArgumentException } from '../system/exceptions.js';

export interface XmlWriterSettings {
  indent: boolean;
  indentChars: string;
  newLineChars: string;
  omitXmlDeclaration: boolean;
  omitDuplicateNamespaces: boolean;
  /** Encoding name written into the XML declaration. */
  encodingName: string;
  /** Code points the target encoding can represent; others are written as character entities. */
  canEncode?: (cp: number) => boolean;
}

export const DEFAULT_WRITER_SETTINGS: XmlWriterSettings = {
  indent: true,
  indentChars: '  ',
  newLineChars: '\r\n',
  omitXmlDeclaration: false,
  omitDuplicateNamespaces: false,
  encodingName: 'utf-8',
};

const XMLNS = XNamespace.Xmlns;
const XML = XNamespace.Xml;

type NsKind = 'special' | 'implied' | 'needToWrite' | 'written';

interface NsDecl {
  prefix: string;
  ns: string;
  kind: NsKind;
}

/** Emulates XmlWellFormedWriter on top of an indenting raw text writer. */
class WellFormedWriter {
  private out: string[] = [];
  private len = 0;

  // raw writer state
  private indentLevel = 0;
  private mixedContent = false;
  private readonly mixedStack: boolean[] = [];
  private textPos = 0;
  private contentPos = -1;
  private inStartTag = false;
  /** Open elements with the namespace stack top before each was pushed (prevNSTop). */
  private elementStack: Array<{ qname: string; prevNSTop: number }> = [];

  // XmlWellFormedWriter namespace stack: _nsTop is ns.length - 1
  private readonly ns: NsDecl[] = [
    { prefix: 'xmlns', ns: XMLNS.namespaceName, kind: 'special' },
    { prefix: 'xml', ns: XML.namespaceName, kind: 'special' },
    { prefix: '', ns: '', kind: 'implied' },
  ];

  constructor(private readonly settings: XmlWriterSettings) {}

  result(): string {
    return this.out.join('');
  }

  private raw(s: string): void {
    this.out.push(s);
    this.len += s.length;
  }

  private writeIndent(): void {
    this.raw(this.settings.newLineChars);
    for (let i = this.indentLevel; i > 0; i--) this.raw(this.settings.indentChars);
  }

  writeStartDocument(standalone: 'yes' | 'no' | null): void {
    if (this.settings.omitXmlDeclaration) return;
    let decl = `<?xml version="1.0" encoding="${this.settings.encodingName}"`;
    if (standalone) decl += ` standalone="${standalone}"`;
    this.raw(decl + '?>');
  }

  private get nsTop(): number {
    return this.ns.length - 1;
  }

  private get currentPrevNSTop(): number {
    return this.elementStack[this.elementStack.length - 1].prevNSTop;
  }

  // ---- elements ---------------------------------------------------------------------------

  writeStartElement(prefix: string | null, localName: string, nsUri: string): void {
    this.closeStartTag();
    if (prefix === null) {
      prefix = this.lookupPrefix(nsUri);
      if (prefix === null) prefix = '';
    }
    const qname = prefix.length ? `${prefix}:${localName}` : localName;
    if (this.settings.indent) {
      if (!this.mixedContent && this.textPos !== this.len) this.writeIndent();
      this.indentLevel++;
      this.mixedStack.push(this.mixedContent);
    }
    this.raw('<' + qname);
    this.inStartTag = true;
    this.elementStack.push({ qname, prevNSTop: this.nsTop });
    this.pushNamespaceImplicit(prefix, nsUri);
  }

  writeAttribute(prefix: string | null, localName: string, nsUri: string, value: string): void {
    if (prefix === null) {
      if (!(localName === 'xmlns' && nsUri === XMLNS.namespaceName)) prefix = this.lookupPrefix(nsUri);
      if (prefix === null) prefix = '';
    }
    if (prefix.length === 0) {
      if (localName === 'xmlns') {
        // default namespace declaration
        if (this.pushNamespaceExplicit('', value)) this.rawNamespace('', value);
        return;
      }
      if (nsUri.length > 0) {
        prefix = this.lookupPrefix(nsUri);
        if (prefix === null || prefix.length === 0) prefix = this.generatePrefix();
      }
    } else if (prefix === 'xmlns') {
      if (this.pushNamespaceExplicit(localName, value)) this.rawNamespace(localName, value);
      return;
    } else if (prefix === 'xml' && (localName === 'space' || localName === 'lang')) {
      // XmlWellFormedWriter: special attributes, written without pushing a namespace; the value
      // of xml:space must be "default" or "preserve" after trimming.
      if (localName === 'space') {
        const v = value.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '');
        if (v !== 'default' && v !== 'preserve') throw new ArgumentException(`'${value}' is an invalid xml:space value.`);
      }
      this.raw(` xml:${localName}="${this.escapeAttribute(value)}"`);
      return;
    } else if (nsUri.length === 0) {
      prefix = '';
    } else {
      // A prefix declared on this element for another namespace gets a generated one.
      const i = this.lookupNamespaceIndex(prefix);
      if (i > this.currentPrevNSTop && this.ns[i].ns !== nsUri) prefix = this.generatePrefix();
    }
    if (prefix.length !== 0) this.pushNamespaceImplicit(prefix, nsUri);
    const qname = prefix.length ? `${prefix}:${localName}` : localName;
    this.raw(` ${qname}="${this.escapeAttribute(value)}"`);
  }

  private rawNamespace(prefix: string, nsUri: string): void {
    this.raw(prefix.length ? ` xmlns:${prefix}="${this.escapeAttribute(nsUri)}"` : ` xmlns="${this.escapeAttribute(nsUri)}"`);
  }

  private pushNamespaceImplicit(prefix: string, nsUri: string): void {
    let kind: NsKind;
    const existing = this.lookupNamespaceIndex(prefix);
    if (existing !== -1) {
      if (existing > this.currentPrevNSTop) {
        if (this.ns[existing].ns !== nsUri) throw redefinePrefix(prefix, this.ns[existing].ns, nsUri);
        return;
      }
      if (this.ns[existing].kind === 'special') {
        if (prefix !== 'xml' || nsUri !== this.ns[existing].ns) {
          throw new ArgumentException(`Prefix "${prefix}" is reserved for use by XML and can be mapped only to namespace name "${this.ns[existing].ns}".`);
        }
        kind = 'implied';
      } else kind = this.ns[existing].ns === nsUri ? 'implied' : 'needToWrite';
    } else {
      if ((nsUri === XML.namespaceName && prefix !== 'xml') || (nsUri === XMLNS.namespaceName && prefix !== 'xmlns')) {
        throw new ArgumentException(`Prefix "${prefix}" cannot be mapped to namespace name reserved for "xml" or "xmlns".`);
      }
      kind = 'needToWrite';
    }
    this.ns.push({ prefix, ns: nsUri, kind });
  }

  /** Returns whether the declaration must be written out. */
  private pushNamespaceExplicit(prefix: string, nsUri: string): boolean {
    let writeItOut = true;
    const existing = this.lookupNamespaceIndex(prefix);
    if (existing !== -1) {
      if (existing > this.currentPrevNSTop) {
        const d = this.ns[existing];
        if (d.ns !== nsUri) throw redefinePrefix(prefix, d.ns, nsUri);
        if (d.kind === 'written') {
          throw new XmlException(`'${prefix.length === 0 ? 'xmlns' : 'xmlns:' + prefix}' is a duplicate attribute name.`);
        }
        if (this.settings.omitDuplicateNamespaces && d.kind !== 'needToWrite') writeItOut = false;
        d.kind = 'written';
        return writeItOut;
      }
    } else if (nsUri.length === 0 && prefix.length !== 0) {
      throw new ArgumentException('Cannot use a prefix with an empty namespace.');
    }
    if ((nsUri === XML.namespaceName && prefix !== 'xml') || (nsUri === XMLNS.namespaceName && prefix !== 'xmlns')) {
      throw new ArgumentException(`Prefix "${prefix}" cannot be mapped to namespace name reserved for "xml" or "xmlns".`);
    }
    if (prefix === 'xmlns' || (prefix === 'xml' && nsUri !== XML.namespaceName)) {
      throw new ArgumentException(`Prefix "${prefix}" is reserved for use by XML.`);
    }
    if (this.settings.omitDuplicateNamespaces && existing !== -1 && this.ns[existing].ns === nsUri) writeItOut = false;
    this.ns.push({ prefix, ns: nsUri, kind: 'written' });
    return writeItOut;
  }

  private generatePrefix(): string {
    const genPrefix = `p${this.nsTop - 2}`;
    if (this.lookupNamespace(genPrefix) === null) return genPrefix;
    for (let i = 0; ; i++) {
      const s = genPrefix + i;
      if (this.lookupNamespace(s) === null) return s;
    }
  }

  private lookupNamespaceIndex(prefix: string): number {
    for (let i = this.nsTop; i >= 0; i--) if (this.ns[i].prefix === prefix) return i;
    return -1;
  }

  private lookupNamespace(prefix: string): string | null {
    const i = this.lookupNamespaceIndex(prefix);
    return i === -1 ? null : this.ns[i].ns;
  }

  private lookupPrefix(nsUri: string): string | null {
    for (let i = this.nsTop; i >= 0; i--) {
      if (this.ns[i].ns === nsUri) {
        const prefix = this.ns[i].prefix;
        for (i++; i <= this.nsTop; i++) if (this.ns[i].prefix === prefix) return null;
        return prefix;
      }
    }
    return null;
  }

  /** XmlWellFormedWriter writes pending declarations from the top of its namespace stack down. */
  private writePendingNamespaces(): void {
    const prev = this.currentPrevNSTop;
    for (let i = this.nsTop; i > prev; i--) {
      const d = this.ns[i];
      if (d.kind === 'needToWrite') {
        d.kind = 'written';
        this.rawNamespace(d.prefix, d.ns);
      }
    }
  }

  private closeStartTag(): void {
    if (!this.inStartTag) return;
    this.writePendingNamespaces();
    this.raw('>');
    this.inStartTag = false;
    this.contentPos = this.len;
    if (this.settings.indent) {
      // The root element does not inherit mixed content from whitespace at document level.
      this.mixedContent = this.indentLevel === 1 ? false : this.mixedStack[this.mixedStack.length - 1];
    }
  }

  writeEndElement(full: boolean): void {
    if (this.inStartTag && !full) {
      this.writePendingNamespaces();
      this.inStartTag = false;
      if (this.settings.indent) {
        this.indentLevel--;
        this.mixedContent = this.mixedStack.pop()!;
      }
      this.raw(' />');
      this.popElement();
      return;
    }
    this.closeStartTag();
    if (this.settings.indent) {
      this.indentLevel--;
      if (!this.mixedContent && this.contentPos !== this.len && this.textPos !== this.len) this.writeIndent();
      this.mixedContent = this.mixedStack.pop()!;
    }
    this.raw(`</${this.elementStack[this.elementStack.length - 1].qname}>`);
    this.popElement();
  }

  private popElement(): void {
    const top = this.elementStack.pop()!;
    this.ns.length = top.prevNSTop + 1;
  }

  /** @internal */
  attributeText(a: XAttribute): string {
    let prefix = '';
    const ns = a.name.namespace;
    if (a.isNamespaceDeclaration) prefix = ns === XNamespace.None ? '' : 'xmlns';
    else if (ns !== XNamespace.None) prefix = a.parent?.getPrefixOfNamespace(ns) ?? '';
    const q = prefix ? `${prefix}:${a.name.localName}` : a.name.localName;
    return `${q}="${this.escapeAttribute(a.value)}"`;
  }

  // ---- content ----------------------------------------------------------------------------

  writeString(text: string): void {
    this.closeStartTag();
    this.mixedContent = true;
    this.raw(this.escapeText(text));
  }

  writeWhitespace(text: string): void {
    if (!isWhitespaceOnly(text)) throw new ArgumentException('Only white space characters should be used.');
    this.closeStartTag();
    this.mixedContent = true;
    this.raw(this.replaceNewLines(text));
  }

  writeCData(text: string): void {
    this.closeStartTag();
    this.mixedContent = true;
    this.checkChars(text);
    this.raw('<![CDATA[' + this.replaceNewLines(text.replace(/]]>/g, ']]]]><![CDATA[>')) + ']]>');
  }

  writeComment(text: string): void {
    this.closeStartTag();
    if (this.settings.indent && !this.mixedContent && this.textPos !== this.len) this.writeIndent();
    this.checkChars(text);
    let t = text.replace(/--/g, '- -').replace(/--/g, '- -');
    if (t.endsWith('-')) t += ' ';
    this.raw('<!--' + this.replaceNewLines(t) + '-->');
  }

  writeDocType(name: string, publicId: string | null, systemId: string | null, subset: string | null): void {
    if (this.settings.indent && !this.mixedContent && this.textPos !== this.len) this.writeIndent();
    let s = '<!DOCTYPE ' + name;
    // XmlEncodedRawTextWriter.WriteDocType: a space only when there is no public or system id.
    if (publicId !== null) s += ` PUBLIC "${publicId}" "${systemId ?? ''}"`;
    else if (systemId !== null) s += ` SYSTEM "${systemId}"`;
    else s += ' ';
    if (subset !== null) s += `[${subset}]`;
    this.raw(s + '>');
  }

  writeProcessingInstruction(target: string, data: string): void {
    this.closeStartTag();
    if (this.settings.indent && !this.mixedContent && this.textPos !== this.len) this.writeIndent();
    this.checkChars(data);
    const d = this.replaceNewLines(data.replace(/\?>/g, '? >'));
    this.raw(d.length ? `<?${target} ${d}?>` : `<?${target}?>`);
  }

  // ---- escaping ---------------------------------------------------------------------------

  private escapeText(s: string): string {
    let r = '';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      switch (c) {
        case 0x3c: r += '&lt;'; break;
        case 0x3e: r += '&gt;'; break;
        case 0x26: r += '&amp;'; break;
        case 0x0a: r += this.settings.newLineChars; break;
        case 0x0d:
          r += this.settings.newLineChars;
          if (s.charCodeAt(i + 1) === 0x0a) i++;
          break;
        default:
          i = this.appendChar(s, i, c, (x) => (r += x));
      }
    }
    return r;
  }

  private escapeAttribute(s: string): string {
    let r = '';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      switch (c) {
        case 0x3c: r += '&lt;'; break;
        case 0x3e: r += '&gt;'; break;
        case 0x26: r += '&amp;'; break;
        case 0x22: r += '&quot;'; break;
        case 0x09: r += '&#x9;'; break;
        case 0x0a: r += '&#xA;'; break;
        case 0x0d: r += '&#xD;'; break;
        default:
          i = this.appendChar(s, i, c, (x) => (r += x));
      }
    }
    return r;
  }

  /** Appends one character (or surrogate pair), validating it; returns the index of its last code unit. */
  private appendChar(s: string, i: number, c: number, emit: (x: string) => void): number {
    if (c >= 0x20 && c < 0xd800) {
      this.emitEncodable(c, String.fromCharCode(c), emit);
      return i;
    }
    if (c === 0x09) {
      emit('\t');
      return i;
    }
    const cp = s.codePointAt(i)!;
    if (cp > 0xffff) {
      this.emitEncodable(cp, String.fromCodePoint(cp), emit);
      return i + 1;
    }
    if (!isXmlChar(cp)) throw invalidChar(cp);
    this.emitEncodable(cp, String.fromCharCode(c), emit);
    return i;
  }

  private emitEncodable(cp: number, ch: string, emit: (x: string) => void): void {
    const can = this.settings.canEncode;
    if (can && !can(cp)) emit(`&#x${cp.toString(16).toUpperCase()};`);
    else emit(ch);
  }

  private replaceNewLines(s: string): string {
    return s.indexOf('\r') < 0 && s.indexOf('\n') < 0 ? s : s.replace(/\r\n|\r|\n/g, this.settings.newLineChars);
  }

  private checkChars(s: string): void {
    for (let i = 0; i < s.length; i++) {
      const cp = s.codePointAt(i)!;
      if (!isXmlChar(cp)) throw invalidChar(cp);
      if (cp > 0xffff) i++;
    }
  }
}

function redefinePrefix(prefix: string, from: string, to: string): Error {
  return new XmlException(`The prefix '${prefix}' cannot be redefined from '${from}' to '${to}' within the same start element tag.`);
}

function invalidChar(cp: number): Error {
  return new ArgumentException(`'${String.fromCodePoint(cp)}', hexadecimal value 0x${cp.toString(16).toUpperCase().padStart(2, '0')}, is an invalid character.`);
}

/** Port of System.Xml.Linq.NamespaceResolver used by the XLinq ElementWriter. */
class NamespaceResolver {
  private scopes: Array<Array<{ prefix: string; ns: string }>> = [];

  pushScope(): void {
    this.scopes.push([]);
  }

  popScope(): void {
    this.scopes.pop();
  }

  add(prefix: string, ns: string): void {
    this.scopes[this.scopes.length - 1].push({ prefix, ns });
  }

  addFirst(prefix: string, ns: string): void {
    if (this.scopes.length === 0) this.scopes.push([]);
    this.scopes[0].unshift({ prefix, ns });
  }

  /** Most recent declaration of ns whose prefix is not redeclared later. */
  getPrefixOfNamespace(ns: string, allowDefault: boolean): string | null {
    const all = this.scopes.flat();
    for (let i = all.length - 1; i >= 0; i--) {
      const a = all[i];
      if (a.ns !== ns) continue;
      let shadowed = false;
      for (let j = all.length - 1; j > i; j--) if (all[j].prefix === a.prefix) { shadowed = true; break; }
      if (shadowed) continue;
      if (allowDefault || a.prefix.length > 0) return a.prefix;
    }
    return null;
  }
}

/** Port of System.Xml.Linq.ElementWriter. */
class ElementWriter {
  private readonly resolver = new NamespaceResolver();

  constructor(private readonly w: WellFormedWriter) {}

  writeElement(root: XElement): void {
    this.pushAncestors(root);
    this.writeTree(root);
  }

  private writeTree(e: XElement): void {
    this.writeStartElement(e);
    const c = e._content;
    if (c === null) {
      this.w.writeEndElement(false);
    } else if (typeof c === 'string') {
      this.w.writeString(c);
      this.w.writeEndElement(true);
    } else {
      for (const n of childNodes(e)) {
        if (n instanceof XElement) this.writeTree(n);
        else writeNode(n, this.w);
      }
      this.w.writeEndElement(true);
    }
    this.resolver.popScope();
  }

  private pushAncestors(e: XElement): void {
    for (let p = e.parent; p; p = p.parent) {
      for (const a of p.attributes()) {
        if (a.isNamespaceDeclaration) this.resolver.addFirst(a.name.namespace === XNamespace.None ? '' : a.name.localName, a.value);
      }
    }
  }

  private writeStartElement(e: XElement): void {
    this.resolver.pushScope();
    for (const a of e.attributes()) {
      if (a.isNamespaceDeclaration) this.resolver.add(a.name.namespace === XNamespace.None ? '' : a.name.localName, a.value);
    }
    const ns = e.name.namespace;
    this.w.writeStartElement(this.getPrefixOfNamespace(ns, true), e.name.localName, ns.namespaceName);
    for (const a of e.attributes()) {
      const ans = a.name.namespace;
      const local = a.name.localName;
      const nsName = ans.namespaceName.length === 0 && local === 'xmlns' ? XMLNS.namespaceName : ans.namespaceName;
      this.w.writeAttribute(this.getPrefixOfNamespace(ans, false), local, nsName, a.value);
    }
  }

  private getPrefixOfNamespace(ns: XNamespace, allowDefault: boolean): string | null {
    const name = ns.namespaceName;
    if (name.length === 0) return '';
    const p = this.resolver.getPrefixOfNamespace(name, allowDefault);
    if (p !== null) return p;
    if (ns === XML) return 'xml';
    if (ns === XMLNS) return 'xmlns';
    return null;
  }
}

function writeNode(n: XNode, w: WellFormedWriter): void {
  if (n instanceof XElement) new ElementWriter(w).writeElement(n);
  else if (n instanceof XCData) w.writeCData(n.value);
  else if (n instanceof XText) {
    if (n._parent instanceof XDocument) w.writeWhitespace(n.value);
    else w.writeString(n.value);
  } else if (n instanceof XComment) w.writeComment(n.value);
  else if (n instanceof XProcessingInstruction) w.writeProcessingInstruction(n.target, n.data);
  else if (n instanceof XDocumentType) w.writeDocType(n.name, n.publicId, n.systemId, n.internalSubset);
}

/** XDocument.Save / WriteTo. */
export function writeDocument(doc: XDocument, settings: XmlWriterSettings): string {
  const w = new WellFormedWriter(settings);
  const sa = doc.declaration?.standalone;
  w.writeStartDocument(sa === 'yes' || sa === 'no' ? sa : null);
  writeContent(doc, w);
  return w.result();
}

function writeContent(c: XContainer, w: WellFormedWriter): void {
  const content = c._content;
  if (content === null) return;
  if (typeof content === 'string') {
    if (c instanceof XDocument) w.writeWhitespace(content);
    else w.writeString(content);
    return;
  }
  for (const n of childNodes(c)) writeNode(n, w);
}

function* childNodes(c: XContainer): Generator<XNode> {
  const last = c._content;
  if (!(last instanceof XNode)) return;
  let n: XNode = last;
  do {
    n = n._next!;
    yield n;
  } while (n !== last);
}

/** XNode.ToString(SaveOptions): no declaration, indented unless formatting is disabled. */
export function nodeToString(node: XObject, disableFormatting: boolean, omitDuplicateNamespaces = false): string {
  if (node instanceof XAttribute) return attributeToString(node);
  const w = new WellFormedWriter({
    ...DEFAULT_WRITER_SETTINGS,
    indent: !disableFormatting,
    omitXmlDeclaration: true,
    omitDuplicateNamespaces,
  });
  if (node instanceof XDocument) writeContent(node, w);
  else writeNode(node as XNode, w);
  return w.result();
}

/** XAttribute.ToString(): name="escaped value" with the prefix in scope. */
function attributeToString(a: XAttribute): string {
  const w = new WellFormedWriter({ ...DEFAULT_WRITER_SETTINGS, indent: false, omitXmlDeclaration: true });
  return w.attributeText(a);
}

_setNodeToString(nodeToString);

export type { XAttribute };
