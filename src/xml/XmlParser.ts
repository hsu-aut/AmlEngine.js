// XML 1.0 parser producing an XDocument with the semantics of XDocument.Load/Parse over an XmlReader:
// line-end and attribute-value normalization, namespace resolution, whitespace handling.

import { XName, XNamespace } from './XName.js';
import {
  XAttribute,
  XCData,
  XComment,
  XContainer,
  XDeclaration,
  XDocument,
  XDocumentType,
  XElement,
  XNode,
  XProcessingInstruction,
  XText,
} from './XNode.js';
import { XmlException, isNameChar, isNameStartChar, isXmlChar } from './XmlChars.js';

export interface XmlParseOptions {
  /**
   * true: whitespace-only text nodes are kept (XDocument.Parse with LoadOptions.PreserveWhitespace).
   * false: they are dropped unless inside xml:space="preserve" (XmlReaderSettings.IgnoreWhitespace).
   */
  preserveWhitespace: boolean;
  /** XmlReaderSettings.DtdProcessing = Prohibit (the XmlReader default); XDocument.Parse allows a DTD. */
  prohibitDtd?: boolean;
}

const XMLNS_URI = 'http://www.w3.org/2000/xmlns/';
const XML_URI = 'http://www.w3.org/XML/1998/namespace';

const PREDEFINED: Record<string, string> = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' };

interface Scope {
  prefixes: Map<string, string>;
  space: 'preserve' | 'default' | null;
}

export function parseXml(input: string, options: XmlParseOptions): XDocument {
  return new Parser(input, options).parseDocument();
}

class Parser {
  private readonly s: string;
  private pos = 0;
  private readonly doc = new XDocument();
  private readonly scopes: Scope[] = [];

  constructor(
    input: string,
    private readonly options: XmlParseOptions,
  ) {
    // A leading byte order mark is not part of the document.
    this.s = input.charCodeAt(0) === 0xfeff ? input.substring(1) : input;
  }

  parseDocument(): XDocument {
    const s = this.s;
    if (s.startsWith('<?xml') && /[\s?]/.test(s[5] ?? '')) this.parseXmlDeclaration();
    let sawRoot = false;
    let sawDoctype = false;
    while (this.pos < s.length) {
      const ch = s[this.pos];
      if (ch === '<') {
        if (s.startsWith('<?', this.pos)) this.addNode(this.doc, this.parsePI());
        else if (s.startsWith('<!--', this.pos)) this.addNode(this.doc, this.parseComment());
        else if (s.startsWith('<!DOCTYPE', this.pos)) {
          if (this.options.prohibitDtd) this.fail('For security reasons DTD is prohibited in this XML document. To enable DTD processing set the DtdProcessing property on XmlReaderSettings to Parse and pass the settings into XmlReader.Create method.');
          if (sawRoot || sawDoctype) this.fail('Unexpected DTD declaration.');
          sawDoctype = true;
          this.parseDoctype();
        } else if (s.startsWith('<![CDATA[', this.pos)) this.fail('Data at the root level is invalid.');
        else {
          if (sawRoot) this.fail('There are multiple root elements.');
          sawRoot = true;
          this.parseElement(this.doc);
        }
      } else if (isWs(ch)) {
        const start = this.pos;
        while (this.pos < s.length && isWs(s[this.pos])) this.pos++;
        if (this.options.preserveWhitespace) this.doc._addStringSkipNotify(normalizeEol(s.substring(start, this.pos)));
      } else {
        this.fail('Data at the root level is invalid.');
      }
    }
    if (!sawRoot) this.fail('Root element is missing.');
    return this.doc;
  }

  private parseXmlDeclaration(): void {
    this.pos = 5;
    const attrs = new Map<string, string>();
    for (;;) {
      this.skipWs();
      if (this.s.startsWith('?>', this.pos)) {
        this.pos += 2;
        break;
      }
      const name = this.readName();
      this.skipWs();
      this.expect('=');
      this.skipWs();
      const q = this.s[this.pos];
      if (q !== '"' && q !== "'") this.fail('\'"\' or \'\'\' expected.');
      const end = this.s.indexOf(q, this.pos + 1);
      if (end < 0) this.fail('Unexpected end of file.');
      attrs.set(name, this.s.substring(this.pos + 1, end));
      this.pos = end + 1;
    }
    const version = attrs.get('version');
    if (version === undefined) this.fail('Version number is missing.');
    if (version !== '1.0') this.fail(`Version number '${version}' is invalid.`);
    const standalone = attrs.get('standalone');
    if (standalone !== undefined && standalone !== 'yes' && standalone !== 'no') this.fail('Syntax for an XML declaration is invalid.');
    this.doc.declaration = new XDeclaration(version, attrs.get('encoding') ?? null, standalone ?? null);
  }

  private parseDoctype(): void {
    // Kept as XDocumentType. Entity declarations are not supported and rejected.
    this.pos += 9;
    if (!this.skipWs()) this.fail('Expecting white space.');
    const name = this.readName();
    this.skipWs();
    let publicId: string | null = null;
    let systemId: string | null = null;
    if (this.s.startsWith('PUBLIC', this.pos)) {
      this.pos += 6;
      this.skipWs();
      publicId = this.readQuoted();
      this.skipWs();
      systemId = this.readQuoted();
    } else if (this.s.startsWith('SYSTEM', this.pos)) {
      this.pos += 6;
      this.skipWs();
      systemId = this.readQuoted();
    }
    this.skipWs();
    let subset = '';
    if (this.s[this.pos] === '[') {
      const end = this.s.indexOf(']', this.pos);
      if (end < 0) this.fail('Unexpected end of file while parsing DTD.');
      subset = this.s.substring(this.pos + 1, end);
      if (/<!ENTITY/.test(subset)) this.fail('Entity declarations in a DTD are not supported.');
      this.pos = end + 1;
      this.skipWs();
    }
    this.expect('>');
    this.addNode(this.doc, new XDocumentType(name, publicId, systemId, normalizeEol(subset)));
  }

  private readQuoted(): string {
    const q = this.s[this.pos];
    if (q !== '"' && q !== "'") this.fail(`'"' or ''' is expected.`);
    const end = this.s.indexOf(q, this.pos + 1);
    if (end < 0) this.fail('Unexpected end of file.');
    const v =this.s.substring(this.pos + 1, end);
    this.pos = end + 1;
    return v;
  }

  private parseElement(parent: XContainer): void {
    this.pos++; // '<'
    const qname = this.readQName();
    const rawAttrs: Array<[string, string]> = [];
    let selfClosing = false;
    for (;;) {
      const hadWs = this.skipWs();
      const c = this.s[this.pos];
      if (c === '/') {
        if (this.s[this.pos + 1] !== '>') this.fail('\'/\' is an unexpected token.');
        this.pos += 2;
        selfClosing = true;
        break;
      }
      if (c === '>') {
        this.pos++;
        break;
      }
      if (c === undefined) this.fail('Unexpected end of file.');
      if (!hadWs) this.fail('Name cannot begin with the \'' + c + '\' character.');
      const an = this.readQName();
      this.skipWs();
      this.expect('=');
      this.skipWs();
      const v = this.readAttributeValue();
      for (const [n] of rawAttrs) if (n === an) this.fail(`'${an}' is a duplicate attribute name.`);
      rawAttrs.push([an, v]);
    }

    const outer = this.scopes.length ? this.scopes[this.scopes.length - 1] : null;
    const scope: Scope = { prefixes: new Map(), space: outer?.space ?? null };
    for (const [n, v] of rawAttrs) {
      if (n === 'xmlns') scope.prefixes.set('', v);
      else if (n.startsWith('xmlns:')) {
        const p = n.substring(6);
        if (p === 'xmlns' || (p === 'xml' && v !== XML_URI)) this.fail(`Prefix "${p}" cannot be mapped to namespace name reserved for "xml" or "xmlns".`);
        if (v === '') this.fail(`Invalid namespace declaration.`);
        scope.prefixes.set(p, v);
      } else if (n === 'xml:space') {
        if (v !== 'preserve' && v !== 'default') this.fail(`'${v}' is an invalid xml:space value.`);
        scope.space = v;
      }
    }
    this.scopes.push(scope);

    const el = new XElement(this.resolveName(qname, true));
    const seen = new Set<XName>();
    for (const [n, v] of rawAttrs) {
      const name = this.resolveName(n, false);
      if (seen.has(name)) this.fail(`'${n}' is a duplicate attribute name.`);
      seen.add(name);
      el._appendAttributeSkipNotify(new XAttribute(name, v));
    }
    this.addNode(parent, el);

    if (!selfClosing) {
      this.parseContent(el);
      // '</' already consumed by parseContent
      const endName = this.readQName();
      if (endName !== qname) this.fail(`The '${qname}' start tag does not match the end tag of '${endName}'.`);
      this.skipWs();
      this.expect('>');
      if (el._content === null) el._content = '';
    }
    this.scopes.pop();
  }

  private parseContent(el: XElement): void {
    const s = this.s;
    let text = '';
    let textIsWs = true;
    const flush = () => {
      if (text.length === 0) return;
      if (textIsWs && !this.options.preserveWhitespace && this.currentSpace() !== 'preserve') {
        text = '';
        return;
      }
      el._addStringSkipNotify(text);
      text = '';
      textIsWs = true;
    };
    for (;;) {
      if (this.pos >= s.length) this.fail('Unexpected end of file has occurred. The following elements are not closed: ' + el.name.localName + '.');
      const c = s[this.pos];
      if (c === '<') {
        if (s[this.pos + 1] === '/') {
          flush();
          this.pos += 2;
          return;
        }
        if (s.startsWith('<!--', this.pos)) {
          flush();
          this.addNode(el, this.parseComment());
        } else if (s.startsWith('<![CDATA[', this.pos)) {
          flush();
          const end = s.indexOf(']]>', this.pos + 9);
          if (end < 0) this.fail('Unexpected end of file while parsing CDATA has occurred.');
          const value = normalizeEol(s.substring(this.pos + 9, end));
          this.checkChars(value);
          this.addNode(el, new XCData(value));
          this.pos = end + 3;
        } else if (s.startsWith('<?', this.pos)) {
          flush();
          this.addNode(el, this.parsePI());
        } else if (s.startsWith('<!', this.pos)) {
          this.fail('Unexpected declaration.');
        } else {
          flush();
          this.parseElement(el);
        }
      } else if (c === '&') {
        const ch = this.readReference();
        text += ch;
        // Whitespace is judged by value: "&#32;" alone is ignorable whitespace too.
        if (!isWs(ch)) textIsWs = false;
      } else {
        const start = this.pos;
        while (this.pos < s.length) {
          const d = s.charCodeAt(this.pos);
          if (d === 0x3c || d === 0x26) break; // '<' '&'
          if (d === 0x3e && s.startsWith(']]>', this.pos - 2) && this.pos - 2 >= start) this.fail('\']]>\' is not allowed in character data.');
          this.pos++;
        }
        const chunk = s.substring(start, this.pos);
        this.checkChars(chunk);
        if (textIsWs && !isAllWs(chunk)) textIsWs = false;
        text += normalizeEol(chunk);
      }
    }
  }

  /** AddNodeSkipNotify without validation: text content turns into a node first. */
  private addNode(parent: XContainer, node: XNode): void {
    parent._convertTextToNode();
    parent._appendNodeSkipNotify(node);
  }

  private currentSpace(): 'preserve' | 'default' | null {
    return this.scopes.length ? this.scopes[this.scopes.length - 1].space : null;
  }

  private parseComment(): XComment {
    const end = this.s.indexOf('-->', this.pos + 4);
    if (end < 0) this.fail('Unexpected end of file while parsing Comment has occurred.');
    const value = this.s.substring(this.pos + 4, end);
    if (value.includes('--') || value.endsWith('-')) this.fail('An XML comment cannot contain \'--\', and \'-\' cannot be the last character.');
    this.checkChars(value);
    this.pos = end + 3;
    return new XComment(normalizeEol(value));
  }

  private parsePI(): XProcessingInstruction {
    this.pos += 2;
    const target = this.readName();
    if (target.toLowerCase() === 'xml') this.fail('Unexpected XML declaration. The XML declaration must be the first node in the document, and no white space characters are allowed to appear before it.');
    const end = this.s.indexOf('?>', this.pos);
    if (end < 0) this.fail('Unexpected end of file while parsing PI has occurred.');
    let data = this.s.substring(this.pos, end);
    if (data.length && !isWs(data[0])) this.fail('Invalid processing instruction.');
    data = data.replace(/^[ \t\r\n]+/, '');
    this.checkChars(data);
    this.pos = end + 2;
    return new XProcessingInstruction(target, normalizeEol(data));
  }

  private readAttributeValue(): string {
    const q = this.s[this.pos];
    if (q !== '"' && q !== "'") this.fail('\'"\' or \'\'\' is expected.');
    this.pos++;
    let v = '';
    for (;;) {
      if (this.pos >= this.s.length) this.fail('Unexpected end of file.');
      const c = this.s[this.pos];
      if (c === q) {
        this.pos++;
        return v;
      }
      if (c === '<') this.fail('\'<\', hexadecimal value 0x3C, is an invalid attribute character.');
      if (c === '&') {
        v += this.readReference();
        continue;
      }
      if (c === '\r') {
        // CR LF and lone CR are one line end, normalized to a single space.
        v += ' ';
        this.pos += this.s[this.pos + 1] === '\n' ? 2 : 1;
        continue;
      }
      if (c === '\n' || c === '\t') {
        v += ' ';
        this.pos++;
        continue;
      }
      const cp = this.s.codePointAt(this.pos)!;
      if (!isXmlChar(cp)) this.invalidChar(cp);
      const ch = String.fromCodePoint(cp);
      v += ch;
      this.pos += ch.length;
    }
  }

  private readReference(): string {
    const end = this.s.indexOf(';', this.pos);
    if (end < 0 || end - this.pos > 64) this.fail('An error occurred while parsing EntityName.');
    const body = this.s.substring(this.pos + 1, end);
    this.pos = end + 1;
    if (body.startsWith('#')) {
      let cp: number;
      if (body[1] === 'x') {
        if (!/^[0-9a-fA-F]+$/.test(body.substring(2))) this.fail('Invalid syntax for a hexadecimal numeric entity reference.');
        cp = parseInt(body.substring(2), 16);
      } else {
        if (!/^[0-9]+$/.test(body.substring(1))) this.fail('Invalid syntax for a decimal numeric entity reference.');
        cp = parseInt(body.substring(1), 10);
      }
      if (!isXmlChar(cp)) this.fail(`Invalid character reference: &${body};`);
      return String.fromCodePoint(cp);
    }
    const v = PREDEFINED[body];
    if (v === undefined) this.fail(`Reference to undeclared entity '${body}'.`);
    return v;
  }

  private resolveName(qname: string, isElement: boolean): XName {
    const colon = qname.indexOf(':');
    if (colon < 0) {
      if (!isElement) return XNamespace.None.getName(qname);
      return XNamespace.get(this.lookup('') ?? '').getName(qname);
    }
    const prefix = qname.substring(0, colon);
    const local = qname.substring(colon + 1);
    if (prefix === 'xmlns') return XNamespace.get(XMLNS_URI).getName(local);
    if (prefix === 'xml') return XNamespace.get(XML_URI).getName(local);
    const ns = this.lookup(prefix);
    if (ns === undefined) this.fail(`'${prefix}' is an undeclared prefix.`);
    return XNamespace.get(ns).getName(local);
  }

  private lookup(prefix: string): string | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const v = this.scopes[i].prefixes.get(prefix);
      if (v !== undefined) return v;
    }
    return undefined;
  }

  private readQName(): string {
    const name = this.readName();
    const parts = name.split(':');
    if (parts.length > 2 || parts.some((p) => p.length === 0)) this.fail(`The '${name}' name is invalid.`);
    return name;
  }

  private readName(): string {
    const s = this.s;
    const start = this.pos;
    const first = String.fromCodePoint(s.codePointAt(this.pos) ?? 0);
    if (this.pos >= s.length || !isNameStartChar(first)) {
      const ch = s[this.pos];
      this.fail(ch === undefined ? 'Unexpected end of file.' : `Name cannot begin with the '${ch}' character, hexadecimal value 0x${ch.charCodeAt(0).toString(16).toUpperCase()}.`);
    }
    this.pos += first.length;
    while (this.pos < s.length) {
      const ch = String.fromCodePoint(s.codePointAt(this.pos)!);
      if (!isNameChar(ch)) break;
      this.pos += ch.length;
    }
    return s.substring(start, this.pos);
  }

  private skipWs(): boolean {
    const start = this.pos;
    while (this.pos < this.s.length && isWs(this.s[this.pos])) this.pos++;
    return this.pos > start;
  }

  private expect(ch: string): void {
    if (this.s[this.pos] !== ch) this.fail(`'${ch}' is expected.`);
    this.pos++;
  }

  private checkChars(text: string): void {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 0x20 && c < 0xd800) continue;
      const cp = text.codePointAt(i)!;
      if (!isXmlChar(cp)) this.invalidChar(cp);
      if (cp > 0xffff) i++;
    }
  }

  private invalidChar(cp: number): never {
    this.fail(`'${String.fromCodePoint(cp)}', hexadecimal value 0x${cp.toString(16).toUpperCase().padStart(2, '0')}, is an invalid character.`);
  }

  private fail(message: string): never {
    let line = 1;
    let col = 1;
    for (let i = 0; i < this.pos && i < this.s.length; i++) {
      if (this.s[i] === '\n') {
        line++;
        col = 1;
      } else col++;
    }
    throw new XmlException(message, line, col);
  }
}

function isWs(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isAllWs(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (!isWs(s[i])) return false;
  return true;
}

/** XML line-end handling: CR LF and lone CR become LF. */
function normalizeEol(s: string): string {
  return s.indexOf('\r') < 0 ? s : s.replace(/\r\n?/g, '\n');
}

export type { XNode };
