// A pull reader over the text XDocument.Save writes, producing the node sequence and line numbers
// an XmlReader (XmlTextReaderImpl) created with IgnoreWhitespace, IgnoreComments and
// IgnoreProcessingInstructions reports to XsdValidatingReader: elements with resolved names and
// attributes, text and CDATA nodes, significant whitespace (inside xml:space="preserve"), end
// elements. Insignificant whitespace, comments and processing instructions are skipped.
// The input is well-formed (it was written by the XML writer), so the reader does not re-check
// well-formedness; a DOCTYPE fails like DtdProcessing.Prohibit.

import { XmlException } from '../../../xml/index.js';
import { NS_XML } from './Datatypes.js';

const NS_XMLNS = 'http://www.w3.org/2000/xmlns/';

export interface ReaderAttribute {
  readonly localName: string;
  readonly namespaceUri: string;
  readonly value: string;
  readonly lineNumber: number;
}

export type ReaderNode =
  | {
      readonly type: 'element';
      readonly localName: string;
      readonly namespaceUri: string;
      readonly attributes: readonly ReaderAttribute[];
      readonly isEmpty: boolean;
      readonly lineNumber: number;
      /** Namespace lookup in the scope of this element (for xsi:type). */
      readonly lookupNamespace: (prefix: string) => string | null;
    }
  | { readonly type: 'text' | 'cdata' | 'significantWhitespace'; readonly value: string; readonly lineNumber: number }
  | { readonly type: 'endElement'; readonly lineNumber: number };

interface Scope {
  ns: Map<string, string>;
  preserve: boolean;
}

function isWs(c: number): boolean {
  return c === 0x20 || c === 0x9 || c === 0xa || c === 0xd;
}

/** Reads all nodes of `text`. */
export function* readNodes(text: string): Generator<ReaderNode> {
  // Line starts (CR LF, CR and LF each end a line, as in XmlTextReaderImpl).
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0xd) {
      if (text.charCodeAt(i + 1) === 0xa) i++;
      lineStarts.push(i + 1);
    } else if (c === 0xa) lineStarts.push(i + 1);
  }
  const lineAt = (pos: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const scopes: Scope[] = [{ ns: new Map([['xml', NS_XML], ['xmlns', NS_XMLNS]]), preserve: false }];
  const lookup = (scope: Scope[], prefix: string): string | null => {
    for (let i = scope.length - 1; i >= 0; i--) {
      const v = scope[i]!.ns.get(prefix);
      if (v !== undefined) return v;
    }
    return prefix === '' ? '' : null;
  };

  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  let depth = 0;
  while (i < n) {
    if (text.charCodeAt(i) !== 0x3c /* < */) {
      // Character data up to the next markup.
      const start = i;
      let end = text.indexOf('<', i);
      if (end < 0) end = n;
      i = end;
      if (depth === 0) continue;
      const raw = text.slice(start, end);
      let allWs = true;
      for (let k = 0; k < raw.length; k++) {
        if (!isWs(raw.charCodeAt(k))) {
          allWs = false;
          break;
        }
      }
      const value = decodeText(raw);
      if (allWs) {
        if (scopes[scopes.length - 1]!.preserve) yield { type: 'significantWhitespace', value, lineNumber: lineAt(start) };
        continue;
      }
      yield { type: 'text', value, lineNumber: lineAt(start) };
      continue;
    }
    if (text.startsWith('<!--', i)) {
      i = text.indexOf('-->', i + 4) + 3;
      continue;
    }
    if (text.startsWith('<?', i)) {
      i = text.indexOf('?>', i + 2) + 2;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      yield { type: 'cdata', value: normalizeLineEnds(text.slice(i + 9, end)), lineNumber: lineAt(i) };
      i = end + 3;
      continue;
    }
    if (text.startsWith('<!', i)) {
      throw new XmlException(
        'For security reasons DTD is prohibited in this XML document. To enable DTD processing set the DtdProcessing property on XmlReaderSettings to Parse and pass the settings into XmlReader.Create method.',
      );
    }
    if (text.charCodeAt(i + 1) === 0x2f /* / */) {
      const line = lineAt(i);
      i = text.indexOf('>', i) + 1;
      scopes.pop();
      depth--;
      yield { type: 'endElement', lineNumber: line };
      continue;
    }
    // Start tag.
    const line = lineAt(i);
    let j = i + 1;
    while (j < n && !isWs(text.charCodeAt(j)) && text[j] !== '>' && text[j] !== '/') j++;
    const qname = text.slice(i + 1, j);
    const rawAttrs: { name: string; value: string; line: number }[] = [];
    for (;;) {
      while (isWs(text.charCodeAt(j))) j++;
      const c = text[j];
      if (c === '>' || c === '/') break;
      let k = j;
      while (!isWs(text.charCodeAt(k)) && text[k] !== '=') k++;
      const name = text.slice(j, k);
      const attrLine = lineAt(j);
      while (text[k] !== '"' && text[k] !== "'") k++;
      const q = text[k]!;
      const ve = text.indexOf(q, k + 1);
      rawAttrs.push({ name, value: decodeAttribute(text.slice(k + 1, ve)), line: attrLine });
      j = ve + 1;
    }
    const isEmpty = text[j] === '/';
    i = text.indexOf('>', j) + 1;
    const scope: Scope = { ns: new Map(), preserve: scopes[scopes.length - 1]!.preserve };
    for (const a of rawAttrs) {
      if (a.name === 'xmlns') scope.ns.set('', a.value);
      else if (a.name.startsWith('xmlns:')) scope.ns.set(a.name.slice(6), a.value);
      else if (a.name === 'xml:space') {
        if (a.value === 'preserve') scope.preserve = true;
        else if (a.value === 'default') scope.preserve = false;
      }
    }
    scopes.push(scope);
    const current = scopes.slice();
    const split = (name: string, isAttr: boolean): [string, string] => {
      const colon = name.indexOf(':');
      if (colon < 0) return [name, isAttr ? (name === 'xmlns' ? NS_XMLNS : '') : lookup(current, '') ?? ''];
      const prefix = name.slice(0, colon);
      return [name.slice(colon + 1), lookup(current, prefix) ?? ''];
    };
    const [localName, namespaceUri] = split(qname, false);
    const attributes = rawAttrs.map((a) => {
      const [l, ns] = split(a.name, true);
      return { localName: l, namespaceUri: ns, value: a.value, lineNumber: a.line };
    });
    yield {
      type: 'element',
      localName,
      namespaceUri,
      attributes,
      isEmpty,
      lineNumber: line,
      lookupNamespace: (prefix: string) => {
        const v = lookup(current, prefix);
        return prefix === '' && v === '' ? null : v;
      },
    };
    if (isEmpty) scopes.pop();
    else depth++;
  }
}

function normalizeLineEnds(s: string): string {
  return s.indexOf('\r') < 0 ? s : s.replace(/\r\n?/g, '\n');
}

function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (_m, e: string) => {
    switch (e) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    }
  });
}

function decodeText(raw: string): string {
  return decodeEntities(normalizeLineEnds(raw));
}

/** Attribute-value normalization: literal white space characters become spaces. */
function decodeAttribute(raw: string): string {
  return decodeEntities(normalizeLineEnds(raw).replace(/[\t\n]/g, ' '));
}
