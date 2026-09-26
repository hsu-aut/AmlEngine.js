// Port of System.Xml.Linq.XNamespace / XName. Both are interned, so reference equality is
// name equality, as in .NET.

import { verifyNCName } from './XmlChars.js';
import { ArgumentException } from '../system/exceptions.js';

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
      // XmlConvert.VerifyNCName: ArgumentException.ThrowIfNullOrEmpty(name) before the name check.
      if (localName === '') throw new ArgumentException('The value cannot be an empty string.', 'name');
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
    // .NET 8: ArgumentException.ThrowIfNullOrEmpty(expandedName).
    if (name.length === 0) throw new ArgumentException('The value cannot be an empty string.', 'expandedName');
    if (name[0] !== '{') return XNamespace.None.getName(name);
    const end = name.lastIndexOf('}');
    // .NET: ArgumentException (SR.Argument_InvalidExpandedName).
    if (end <= 1 || end === name.length - 1) throw new ArgumentException(`'${name}' is an invalid expanded name.`);
    return XNamespace.get(name.substring(1, end)).getName(name.substring(end + 1));
  }

  toString(): string {
    return this.namespace === XNamespace.None ? this.localName : `{${this.namespaceName}}${this.localName}`;
  }
}

/** Anything accepted where .NET takes an XName (implicit string conversion). */
export type XNameLike = XName | string;

export function toXName(name: XNameLike): XName {
  if (typeof name !== 'string') return name;
  // Names are interned: remember the last conversion (loops look up the same name per element).
  if (name !== lastString) {
    lastName = XName.get(name);
    lastString = name;
  }
  return lastName!;
}
let lastString: string | null = null;
let lastName: XName | null = null;
