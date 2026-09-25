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

/** XDocument.Parse uses XmlReaderSettings.MaxCharactersFromEntities = 10,000,000. */
const MAX_CHARACTERS_FROM_ENTITIES = 10_000_000;

/** Character references in an entity value are expanded when the entity is declared. */
function expandCharRefs(v: string): string {
  return v.replace(/&#(x[0-9a-fA-F]+|[0-9]+);/g, (_, n: string) =>
    String.fromCodePoint(n[0] === 'x' ? parseInt(n.substring(1), 16) : parseInt(n, 10)),
  );
}

interface Scope {
  prefixes: Map<string, string>;
  space: 'preserve' | 'default' | null;
}

export function parseXml(input: string, options: XmlParseOptions): XDocument {
  return new Parser(input, options).parseDocument();
}

class Parser {
  private s: string;
  private pos = 0;
  /** General entities of the internal DTD subset: replacement text, or null for external ones. */
  private readonly entities = new Map<string, string | null>();
  /** Characters produced by entity expansion so far (XmlReaderSettings.MaxCharactersFromEntities). */
  private entityChars = 0;
  private readonly expanding: string[] = [];
  /** True while parsing the replacement text of an entity: end of input ends the content. */
  private inFragment = false;
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
    // XmlTextReaderImpl.ParseXmlDeclaration: version, then optional encoding, then optional
    // standalone, each preceded by white space; any other name, order or repetition is an error.
    this.pos = 5;
    const attrs = new Map<string, string>();
    let state = 0; // 0: version expected, 1: after version, 2: after encoding, 3: after standalone
    for (;;) {
      const ws = this.skipWs();
      if (this.s[this.pos] === '?') {
        if (this.s[this.pos + 1] !== '>' || state === 0) this.fail('Syntax for an XML declaration is invalid.');
        this.pos += 2;
        break;
      }
      if (!ws && state !== 0) this.fail("Unexpected token '?>' expected.");
      const name = this.readName();
      if (!((name === 'version' && state === 0) || (name === 'encoding' && state === 1) || (name === 'standalone' && (state === 1 || state === 2)))) {
        this.fail('Syntax for an XML declaration is invalid.');
      }
      this.skipWs();
      this.expect('=');
      this.skipWs();
      const q = this.s[this.pos];
      if (q !== '"' && q !== "'") this.fail('\'"\' or \'\'\' expected.');
      const end = this.s.indexOf(q, this.pos + 1);
      if (end < 0) this.fail('Unexpected end of file.');
      const value = this.s.substring(this.pos + 1, end);
      if (name === 'version' && value !== '1.0') this.fail(`Version number '${value}' is invalid.`);
      if (name === 'standalone' && value !== 'yes' && value !== 'no') this.fail('Syntax for an XML declaration is invalid.');
      attrs.set(name, value);
      state = name === 'version' ? 1 : name === 'encoding' ? 2 : 3;
      this.pos = end + 1;
    }
    this.doc.declaration = new XDeclaration(attrs.get('version')!, attrs.get('encoding') ?? null, attrs.get('standalone') ?? null);
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
      const begin = this.pos + 1;
      const close = this.scanSubset(begin);
      subset = this.s.substring(begin, close);
      this.pos = close + 1;
      this.skipWs();
    }
    this.expect('>');
    this.addNode(this.doc, new XDocumentType(name, publicId, systemId, normalizeEol(subset)));
  }

  /** Scans the internal subset up to its closing ']' and records general entity declarations. */
  private scanSubset(start: number): number {
    const s = this.s;
    const skipQuoted = (at: number): number => {
      const end = s.indexOf(s[at], at + 1);
      if (end < 0) this.fail('Unexpected end of file while parsing DTD.');
      return end + 1;
    };
    const skipDeclaration = (from: number): number => {
      let j = from;
      for (;;) {
        while (j < s.length && s[j] !== '>' && s[j] !== '"' && s[j] !== "'") j++;
        if (j >= s.length) this.fail('Unexpected end of file while parsing DTD.');
        if (s[j] === '>') return j + 1;
        j = skipQuoted(j);
      }
    };
    let i = start;
    while (i < s.length) {
      if (s[i] === ']') return i;
      if (s.startsWith('<!--', i)) {
        const end = s.indexOf('-->', i + 4);
        if (end < 0) this.fail('Unexpected end of file while parsing DTD.');
        i = end + 3;
      } else if (s.startsWith('<?', i)) {
        const end = s.indexOf('?>', i + 2);
        if (end < 0) this.fail('Unexpected end of file while parsing DTD.');
        i = end + 2;
      } else if (s.startsWith('<!ENTITY', i)) {
        const m = /^<!ENTITY\s+(%\s+)?([^\s>]+)\s+/.exec(s.substring(i, i + 512));
        if (!m) this.fail('Invalid entity declaration.');
        let j = i + m[0].length;
        let value: string | null = null;
        if (s[j] === '"' || s[j] === "'") {
          const end = skipQuoted(j);
          value = expandCharRefs(normalizeEol(s.substring(j + 1, end - 1)));
          j = end;
        }
        // External entities (SYSTEM/PUBLIC) are declared but never resolved.
        const next = skipDeclaration(j);
        // Parameter entities are ignored; the first declaration of a general entity wins.
        if (!m[1] && !this.entities.has(m[2])) this.entities.set(m[2], value);
        i = next;
      } else if (s.startsWith('<!', i)) {
        i = skipDeclaration(i + 2);
      } else i++;
    }
    this.fail('Unexpected end of file while parsing DTD.');
  }

  /** Replacement text of a declared internal general entity, counted against the expansion limit. */
  private entityText(name: string): string {
    const v = this.entities.get(name);
    if (v === null || v === undefined) this.fail(`Reference to external entity '${name}' cannot be resolved.`);
    if (this.expanding.includes(name)) this.fail(`General entity '${name}' references itself.`);
    this.entityChars += v.length;
    if (this.entityChars > MAX_CHARACTERS_FROM_ENTITIES) {
      this.fail('The input document has exceeded a limit set by MaxCharactersFromEntities.');
    }
    return v;
  }

  /** Parses the replacement text of an entity as content of the current element. */
  private expandInContent(el: XElement, name: string): void {
    // XmlReader without a resolver skips references to external entities in content.
    if (this.entities.get(name) === null) return;
    const text = this.entityText(name);
    const saved = { s: this.s, pos: this.pos, inFragment: this.inFragment };
    this.expanding.push(name);
    this.s = text;
    this.pos = 0;
    this.inFragment = true;
    try {
      this.parseContent(el);
    } finally {
      this.expanding.pop();
      this.s = saved.s;
      this.pos = saved.pos;
      this.inFragment = saved.inFragment;
    }
  }

  /** Attribute value normalization applied to the replacement text of an entity. */
  private expandInAttribute(name: string): string {
    const text = this.entityText(name);
    this.expanding.push(name);
    try {
      let v = '';
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '<') this.fail("'<', hexadecimal value 0x3C, is an invalid attribute character.");
        if (c === '&') {
          const end = text.indexOf(';', i);
          if (end < 0) this.fail('An error occurred while parsing EntityName.');
          const ref = text.substring(i + 1, end);
          i = end;
          const pre = PREDEFINED[ref];
          if (pre !== undefined) v += pre;
          else if (this.entities.has(ref)) v += this.expandInAttribute(ref);
          else this.fail(`Reference to undeclared entity '${ref}'.`);
        } else if (c === '\n' || c === '\t' || c === '\r') v += ' ';
        else v += c;
      }
      return v;
    } finally {
      this.expanding.pop();
    }
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
      if (this.pos >= s.length) {
        if (this.inFragment) {
          flush();
          return;
        }
        this.fail('Unexpected end of file has occurred. The following elements are not closed: ' + el.name.localName + '.');
      }
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
        const name = this.generalEntityName();
        if (name !== null) {
          flush();
          this.pos += name.length + 2;
          this.expandInContent(el, name);
          continue;
        }
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
        const name = this.generalEntityName();
        if (name !== null) {
          this.pos += name.length + 2;
          v += this.expandInAttribute(name);
          continue;
        }
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

  /** At '&': the name of a declared general entity (not predefined, not a character reference), else null. */
  private generalEntityName(): string | null {
    if (this.entities.size === 0) return null;
    const end = this.s.indexOf(';', this.pos);
    if (end < 0) return null;
    const body = this.s.substring(this.pos + 1, end);
    if (body.startsWith('#') || PREDEFINED[body] !== undefined) return null;
    return this.entities.has(body) ? body : null;
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
