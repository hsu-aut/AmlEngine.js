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
  XProcessingInstruction,
  XText,
  _setNodeToString,
} from './XNode.js';
import { isWhitespaceOnly, isXmlChar } from './XmlChars.js';

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

interface NsDecl {
  prefix: string;
  ns: string;
  /** Implicit declarations are written when the start tag is closed, unless made explicit. */
  kind: 'implicit' | 'written';
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
  private elementStack: Array<{ qname: string; nsStart: number }> = [];

  // namespace scope of the well-formed writer
  private readonly ns: NsDecl[] = [
    { prefix: 'xml', ns: XML.namespaceName, kind: 'written' },
    { prefix: 'xmlns', ns: XMLNS.namespaceName, kind: 'written' },
    { prefix: '', ns: '', kind: 'written' },
  ];
  private generatedPrefixes = 0;

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
    this.elementStack.push({ qname, nsStart: this.ns.length });
    // The element's own namespace must be in scope; declare it implicitly otherwise.
    if (this.lookupNamespace(prefix) !== nsUri) this.ns.push({ prefix, ns: nsUri, kind: 'implicit' });
  }

  writeAttribute(prefix: string | null, localName: string, nsUri: string, value: string): void {
    if (nsUri === XMLNS.namespaceName) {
      const declPrefix = prefix === null || prefix.length === 0 ? (localName === 'xmlns' ? '' : localName) : localName;
      this.writeNamespaceDeclaration(declPrefix, value);
      return;
    }
    if (prefix === null) {
      if (nsUri.length === 0) prefix = '';
      else {
        prefix = this.lookupPrefix(nsUri);
        if (prefix === null || prefix.length === 0) prefix = this.generatePrefix(nsUri);
      }
    } else if (prefix.length > 0 && nsUri.length > 0 && this.lookupNamespace(prefix) !== nsUri && prefix !== 'xml') {
      this.pushNamespaceImplicit(prefix, nsUri);
    }
    const qname = prefix.length ? `${prefix}:${localName}` : localName;
    this.raw(` ${qname}="${this.escapeAttribute(value)}"`);
  }

  private writeNamespaceDeclaration(prefix: string, nsUri: string): void {
    const scopeStart = this.elementStack[this.elementStack.length - 1].nsStart;
    for (let i = this.ns.length - 1; i >= scopeStart; i--) {
      const d = this.ns[i];
      if (d.prefix !== prefix) continue;
      if (d.ns !== nsUri) throw new Error(`The prefix '${prefix}' cannot be redefined from '${d.ns}' to '${nsUri}' within the same start element tag.`);
      if (d.kind === 'implicit') {
        d.kind = 'written';
        this.rawNamespace(prefix, nsUri);
      }
      return;
    }
    if (this.settings.omitDuplicateNamespaces && this.lookupNamespace(prefix) === nsUri) return;
    this.ns.push({ prefix, ns: nsUri, kind: 'written' });
    this.rawNamespace(prefix, nsUri);
  }

  private rawNamespace(prefix: string, nsUri: string): void {
    this.raw(prefix.length ? ` xmlns:${prefix}="${this.escapeAttribute(nsUri)}"` : ` xmlns="${this.escapeAttribute(nsUri)}"`);
  }

  private pushNamespaceImplicit(prefix: string, nsUri: string): void {
    this.ns.push({ prefix, ns: nsUri, kind: 'implicit' });
  }

  private generatePrefix(nsUri: string): string {
    for (;;) {
      const p = `p${++this.generatedPrefixes}`;
      if (this.lookupNamespace(p) === null) {
        this.pushNamespaceImplicit(p, nsUri);
        return p;
      }
    }
  }

  private lookupNamespace(prefix: string): string | null {
    for (let i = this.ns.length - 1; i >= 0; i--) if (this.ns[i].prefix === prefix) return this.ns[i].ns;
    return null;
  }

  private lookupPrefix(nsUri: string): string | null {
    for (let i = this.ns.length - 1; i >= 0; i--) {
      const d = this.ns[i];
      if (d.ns === nsUri && this.lookupNamespace(d.prefix) === nsUri) return d.prefix;
    }
    return null;
  }

  /** XmlWellFormedWriter writes pending declarations from the top of its namespace stack down. */
  private writeImplicitNamespaces(nsStart: number): void {
    for (let i = this.ns.length - 1; i >= nsStart; i--) {
      const d = this.ns[i];
      if (d.kind === 'implicit') {
        d.kind = 'written';
        this.rawNamespace(d.prefix, d.ns);
      }
    }
  }

  private closeStartTag(): void {
    if (!this.inStartTag) return;
    const top = this.elementStack[this.elementStack.length - 1];
    this.writeImplicitNamespaces(top.nsStart);
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
      this.writeImplicitNamespaces(this.elementStack[this.elementStack.length - 1].nsStart);
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
    this.ns.length = top.nsStart;
  }

  // ---- content ----------------------------------------------------------------------------

  writeString(text: string): void {
    this.closeStartTag();
    this.mixedContent = true;
    this.raw(this.escapeText(text));
  }

  writeWhitespace(text: string): void {
    if (!isWhitespaceOnly(text)) throw new Error('Only white space characters should be used.');
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
    if (publicId !== null) s += ` PUBLIC "${publicId}" "${systemId ?? ''}"`;
    else if (systemId !== null) s += ` SYSTEM "${systemId}"`;
    if (subset !== null) s += ` [${subset}]`;
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

function invalidChar(cp: number): Error {
  return new Error(`'${String.fromCodePoint(cp)}', hexadecimal value 0x${cp.toString(16).toUpperCase().padStart(2, '0')}, is an invalid character.`);
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
      for (const n of c) {
        if (n instanceof XElement) this.writeTree(n);
        else writeNode(n, this.w);
      }
      this.w.writeEndElement(true);
    }
    this.resolver.popScope();
  }

  private pushAncestors(e: XElement): void {
    for (let p = e.parent; p; p = p.parent) {
      for (const a of p._attrs) {
        if (a.isNamespaceDeclaration) this.resolver.addFirst(a.name.namespace === XNamespace.None ? '' : a.name.localName, a.value);
      }
    }
  }

  private writeStartElement(e: XElement): void {
    this.resolver.pushScope();
    for (const a of e._attrs) {
      if (a.isNamespaceDeclaration) this.resolver.add(a.name.namespace === XNamespace.None ? '' : a.name.localName, a.value);
    }
    const ns = e.name.namespace;
    this.w.writeStartElement(this.getPrefixOfNamespace(ns, true), e.name.localName, ns.namespaceName);
    for (const a of e._attrs) {
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
  for (const n of content) writeNode(n, w);
}

/** XNode.ToString(SaveOptions): no declaration, indented unless formatting is disabled. */
export function nodeToString(node: XNode, disableFormatting: boolean, omitDuplicateNamespaces = false): string {
  const w = new WellFormedWriter({
    ...DEFAULT_WRITER_SETTINGS,
    indent: !disableFormatting,
    omitXmlDeclaration: true,
    omitDuplicateNamespaces,
  });
  if (node instanceof XDocument) writeContent(node, w);
  else writeNode(node, w);
  return w.result();
}

_setNodeToString(nodeToString);

export type { XAttribute };
