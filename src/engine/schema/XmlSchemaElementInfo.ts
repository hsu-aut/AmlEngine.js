// Port of Aml.Engine.Schema.XmlSchemaElementInfo.
//
// The C# class derives its lists from the compiled XmlSchemaElement (content particle and
// attribute uses). Here the lists come from the tables the engine itself computed, exported by
// the oracle (src/engine/schema/SchemaModel.ts); SetInfo applies the namespace to them.

import { XName, XNamespace } from '../../xml/index.js';
import { T } from '../registry.js';
import { XmlSchemaComplexType, XmlSchemaUse, type ElementInfoData, type XmlSchemaAttribute, type XmlSchemaElement } from './SchemaModel.js';

/** Methods and properties to access schema information for a schema element. */
export class XmlSchemaElementInfo {
  private _allAttributes: XmlSchemaAttribute[] = [];
  private _choices: XName[] = [];
  private _optional: XName[] = [];
  private _required: XName[] = [];
  private _requiredAttributes: XmlSchemaAttribute[] = [];
  private _withoutChoice: XName[] = [];
  private readonly _schemaElement: XmlSchemaElement;

  /** @internal The exported element tables (names without namespace). */
  readonly data: ElementInfoData | null;

  /**
   * @internal Resolves a child element name (local name) of this element to its schema element;
   * set by the schema manager (the C# code walks the content particle instead).
   */
  resolveChild: ((childLocalName: string) => XmlSchemaElement | null) | null = null;

  /** Gets the schema elements for all attributes of this instance. */
  get allAttributes(): XmlSchemaAttribute[] {
    return this._allAttributes;
  }

  /** Gets the names for all choices defined for this instance. */
  get choices(): XName[] {
    return this._choices;
  }

  /** Gets the maximum occurrence (decimal.MaxValue, here Infinity, for unbounded). */
  get maxOccurrence(): number {
    return this.schemaElement.maxOccurs;
  }

  /** Gets the names for all optional elements defined for this instance. */
  get optional(): XName[] {
    return this._optional;
  }

  /** Gets the names for all required elements defined for this instance. */
  get required(): XName[] {
    return this._required;
  }

  /** Gets the schema elements of all required attributes defined for this instance. */
  get requiredAttributes(): XmlSchemaAttribute[] {
    return this._requiredAttributes;
  }

  /** Gets the defining schema element for this instance. */
  get schemaElement(): XmlSchemaElement {
    return this._schemaElement;
  }

  /** Gets the names of all elements in this instance which don't provide choices. */
  get withoutChoice(): XName[] {
    return this._withoutChoice;
  }

  /** Creates an instance for the schema element (with its exported tables). */
  constructor(schemaElement: XmlSchemaElement, data: ElementInfoData | null = null) {
    this._schemaElement = schemaElement;
    this.data = data;
  }

  /** @internal */
  getChildElements(includeChoice: boolean): XmlSchemaElement[] {
    if (this.schemaElement.elementSchemaType instanceof XmlSchemaComplexType) {
      const names = includeChoice ? (this.data?.optional ?? []) : (this.data?.withoutChoice ?? []);
      const list: XmlSchemaElement[] = [];
      for (const n of names) {
        const e = this.resolveChild?.(n) ?? null;
        if (e !== null) list.push(e);
      }
      return list;
    }
    return [];
  }

  /** @internal Sets the schema information for this instance and the provided namespace. */
  setInfo(ns: XNamespace): void {
    const name = (n: string): XName => {
      if (!(ns === XNamespace.None)) {
        return ns.getName(n);
      }
      return XName.get(n);
    };
    const data = this.data;
    this._optional = (data?.optional ?? []).map(name);
    this._withoutChoice = (data?.withoutChoice ?? []).map(name);
    this._choices = (data?.choices ?? []).map(name);
    this._required = (data?.required ?? []).map(name);
    this._requiredAttributes = [...this.attributes(true)];
    this._allAttributes = [...this.attributes()];
  }

  private *attributes(required = false): Generator<XmlSchemaAttribute> {
    const type = this.schemaElement.elementSchemaType;
    if (!(type instanceof XmlSchemaComplexType) || type.attributeUses.length <= 0) {
      return;
    }
    for (const xmlSchemaAttribute of type.attributeUses) {
      if (!(xmlSchemaAttribute !== null && required) || xmlSchemaAttribute.use === XmlSchemaUse.Required) {
        yield xmlSchemaAttribute;
      }
    }
  }

  /**
   * The C# helper walking a content particle (sequence/choice) for its element declarations.
   * The content model is resolved from the exported tables instead; kept for completeness.
   */
  private static schemaElements(info: XmlSchemaElementInfo, includeChoice: boolean): XmlSchemaElement[] {
    return info.getChildElements(includeChoice);
  }
}

T.XmlSchemaElementInfo = XmlSchemaElementInfo;
