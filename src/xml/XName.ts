// Port of System.Xml.Linq.XNamespace / XName. Both are interned, so reference equality is
// name equality, as in .NET.

import { verifyNCName } from './XmlChars.js';

export class XNamespace {
  private static readonly table = new Map<string, XNamespace>();
  private readonly names = new Map<string, XName>();

  static readonly None: XNamespace = XNamespace.get('');
  static readonly Xml: XNamespace = XNamespace.get('http://www.w3.org/XML/1998/namespace');
  static readonly Xmlns: XNamespace = XNamespace.get('http://www.w3.org/2000/xmlns/');

  private constructor(readonly namespaceName: string) {}

  static get(namespaceName: string): XNamespace {
    let ns = XNamespace.table.get(namespaceName);
    if (!ns) {
      ns = new XNamespace(namespaceName);
      XNamespace.table.set(namespaceName, ns);
    }
    return ns;
  }

  getName(localName: string): XName {
    let name = this.names.get(localName);
    if (!name) {
      verifyNCName(localName);
      name = new XName(this, localName);
      this.names.set(localName, name);
    }
    return name;
  }

  toString(): string {
    return this.namespaceName;
  }
}

export class XName {
  /** @internal use XName.get or XNamespace.getName */
  constructor(
    readonly namespace: XNamespace,
    readonly localName: string,
  ) {}

  get namespaceName(): string {
    return this.namespace.namespaceName;
  }

  /** Accepts "local" or the expanded form "{namespace}local". */
  static get(expandedName: string): XName;
  static get(localName: string, namespaceName: string): XName;
  static get(name: string, namespaceName?: string): XName {
    if (namespaceName !== undefined) return XNamespace.get(namespaceName).getName(name);
    if (name.length === 0) throw new Error(`The empty string '' is not a valid name.`);
    if (name[0] !== '{') return XNamespace.None.getName(name);
    const end = name.lastIndexOf('}');
    if (end <= 1 || end === name.length - 1) throw new Error(`The '{' character, hexadecimal value 0x7B, cannot be included in a name.`);
    return XNamespace.get(name.substring(1, end)).getName(name.substring(end + 1));
  }

  toString(): string {
    return this.namespace === XNamespace.None ? this.localName : `{${this.namespaceName}}${this.localName}`;
  }
}

/** Anything accepted where .NET takes an XName (implicit string conversion). */
export type XNameLike = XName | string;

export function toXName(name: XNameLike): XName {
  return typeof name === 'string' ? XName.get(name) : name;
}
