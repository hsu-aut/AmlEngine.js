// The compiled CAEX schema, as System.Xml.Schema objects expose it to Aml.Engine. The data is
// exported from the engine by the oracle (Oracle schema) and packed by scripts/gen-schema.mjs;
// this module rebuilds objects with the property names of XmlSchemaElement, XmlSchemaAttribute,
// XmlSchemaComplexType etc., so the ported XmlSchemaManager reads like the C# original.

import { XmlTypeCode, xmlTypeCodeFromName } from '../../system/XmlTypeCode.js';

/** decimal.MaxValue in .NET marks maxOccurs="unbounded". */
export const UNBOUNDED = Number.POSITIVE_INFINITY;

export enum XmlSchemaUse {
  None = 0,
  Optional = 1,
  Prohibited = 2,
  Required = 3,
}

export enum XmlSchemaContentType {
  TextOnly = 0,
  Empty = 1,
  ElementOnly = 2,
  Mixed = 3,
}

export interface XmlSchemaFacet {
  /** Enumeration, Pattern, MaxLength, MinInclusive, ... */
  readonly kind: string;
  readonly value: string;
}

export class XmlSchemaSimpleType {
  constructor(
    readonly name: string | null,
    readonly typeCode: XmlTypeCode,
    readonly variety: string | null,
    readonly facets: readonly XmlSchemaFacet[],
    readonly union: readonly XmlSchemaSimpleType[] | null,
    readonly list: XmlSchemaSimpleType | null,
  ) {}

  /** Datatype.TypeCode (the same value here). */
  get datatype(): { typeCode: XmlTypeCode } {
    return { typeCode: this.typeCode };
  }

  /** Enumeration facet values (Content as XmlSchemaSimpleTypeRestriction). */
  get enumeration(): string[] {
    return this.facets.filter((f) => f.kind === 'Enumeration').map((f) => f.value);
  }
}

export class XmlSchemaAttribute {
  constructor(
    readonly name: string,
    readonly namespace: string,
    readonly use: XmlSchemaUse,
    readonly defaultValue: string | null,
    readonly fixedValue: string | null,
    /** XmlSchemaManager.AttributeValueType(attribute). */
    readonly typeCode: XmlTypeCode,
    readonly attributeSchemaType: XmlSchemaSimpleType | null,
    readonly annotation: string,
  ) {}
}

export type XmlSchemaParticle = XmlSchemaGroupBase | XmlSchemaElementRef | XmlSchemaAny;

export abstract class XmlSchemaGroupBase {
  abstract readonly kind: 'sequence' | 'choice' | 'all';
  constructor(
    readonly minOccurs: number,
    readonly maxOccurs: number,
    readonly items: readonly XmlSchemaParticle[],
  ) {}
}

export class XmlSchemaSequence extends XmlSchemaGroupBase {
  readonly kind = 'sequence' as const;
}

export class XmlSchemaChoice extends XmlSchemaGroupBase {
  readonly kind = 'choice' as const;
}

export class XmlSchemaAll extends XmlSchemaGroupBase {
  readonly kind = 'all' as const;
}

/** An element occurrence inside a content model (its type lives in the element info). */
export class XmlSchemaElementRef {
  readonly kind = 'element' as const;
  constructor(
    readonly name: string,
    readonly minOccurs: number,
    readonly maxOccurs: number,
  ) {}
}

export class XmlSchemaAny {
  readonly kind = 'any' as const;
  constructor(
    readonly minOccurs: number,
    readonly maxOccurs: number,
    readonly namespace: string | null,
    readonly processContents: string,
  ) {}
}

export class XmlSchemaComplexType {
  constructor(
    readonly name: string | null,
    readonly typeCode: XmlTypeCode,
    readonly contentType: XmlSchemaContentType,
    readonly isMixed: boolean,
    /** ContentModel is XmlSchemaSimpleContent. */
    readonly simpleContent: boolean,
    readonly contentTypeParticle: XmlSchemaParticle | null,
    /** AttributeUses in the enumeration order of the .NET Hashtable. */
    readonly attributeUses: readonly XmlSchemaAttribute[],
    readonly hasAttributeWildcard: boolean,
    /** Text content type (simple content), if any. */
    readonly simpleContentType: XmlSchemaSimpleType | null,
  ) {}

  get datatype(): { typeCode: XmlTypeCode } | null {
    return this.simpleContentType ? { typeCode: this.simpleContentType.typeCode } : null;
  }
}

export type XmlSchemaType = XmlSchemaComplexType | XmlSchemaSimpleType;

/** The schema element of a parent child relation (XmlSchemaElement). */
export class XmlSchemaElement {
  constructor(
    readonly name: string,
    readonly minOccurs: number,
    readonly maxOccurs: number,
    /** Kind of the particle containing the element declaration (Parent), null for global ones. */
    readonly parentKind: 'sequence' | 'choice' | 'all' | null,
    readonly parentMaxOccurs: number | null,
    readonly defaultValue: string | null,
    readonly fixedValue: string | null,
    readonly elementSchemaType: XmlSchemaType | null,
    readonly annotation: string,
    /** Results of the static helpers of XmlSchemaManager, evaluated by the engine itself. */
    readonly acceptsAny: boolean,
    readonly isChoiceForOneElement: boolean,
  ) {}

  /** `SchemaElement.Parent is XmlSchemaChoice`. */
  get parentIsChoice(): boolean {
    return this.parentKind === 'choice';
  }
}

/** Raw element info as exported by the oracle, before the namespace is applied. */
export interface ElementInfoData {
  element: XmlSchemaElement;
  optional: readonly string[];
  required: readonly string[];
  choices: readonly string[];
  withoutChoice: readonly string[];
  attributes: readonly XmlSchemaAttribute[];
}

export interface SchemaData {
  namespace: string;
  /** Dictionary key (parent local name + child local name, or the global element name) to info index. */
  keys: ReadonlyMap<string, number>;
  infos: readonly ElementInfoData[];
}

// ---- unpacking --------------------------------------------------------------------------------

export interface PackedSchema {
  namespace: string;
  keys: Record<string, number>;
  infos: number[];
  pool: unknown[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function unpackSchema(packed: PackedSchema): SchemaData {
  const cache = new Map<number, unknown>();
  const raw = (v: unknown): any => {
    if (v === null || typeof v !== 'object') return v;
    const ref = (v as { $?: number }).$;
    if (typeof ref === 'number') {
      if (!cache.has(ref)) cache.set(ref, raw(packed.pool[ref]));
      return cache.get(ref);
    }
    if (Array.isArray(v)) return v.map(raw);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, raw(x)]));
  };
  const occurs = (o: number | 'unbounded' | null | undefined): number => (o === 'unbounded' ? UNBOUNDED : (o ?? 1));

  const simpleCache = new Map<unknown, XmlSchemaSimpleType>();
  const simple = (s: any): XmlSchemaSimpleType | null => {
    if (!s) return null;
    let t = simpleCache.get(s);
    if (!t) {
      t = new XmlSchemaSimpleType(
        s.name ?? null,
        xmlTypeCodeFromName(s.typeCode),
        s.variety ?? null,
        (s.facets ?? []).map((f: any) => ({ kind: f.kind, value: f.value })),
        s.union ? s.union.map(simple) : null,
        s.list ? simple(s.list) : null,
      );
      simpleCache.set(s, t);
    }
    return t;
  };
  const particle = (p: any): XmlSchemaParticle | null => {
    if (!p) return null;
    switch (p.kind) {
      case 'element':
        return new XmlSchemaElementRef(p.name, occurs(p.min), occurs(p.max));
      case 'any':
        return new XmlSchemaAny(occurs(p.min), occurs(p.max), p.namespace ?? null, p.processContents);
      case 'sequence':
        return new XmlSchemaSequence(occurs(p.min), occurs(p.max), p.items.map(particle).filter((x: unknown) => x !== null));
      case 'choice':
        return new XmlSchemaChoice(occurs(p.min), occurs(p.max), p.items.map(particle).filter((x: unknown) => x !== null));
      case 'all':
        return new XmlSchemaAll(occurs(p.min), occurs(p.max), p.items.map(particle).filter((x: unknown) => x !== null));
      default:
        return null;
    }
  };
  const attribute = (a: any): XmlSchemaAttribute =>
    new XmlSchemaAttribute(
      a.name,
      a.namespace ?? '',
      (XmlSchemaUse as any)[a.use] ?? XmlSchemaUse.None,
      a.defaultValue ?? null,
      a.fixedValue ?? null,
      xmlTypeCodeFromName(a.typeCode),
      simple(a.simpleType),
      a.annotation ?? '',
    );

  const infos = packed.infos.map((id): ElementInfoData => {
    const i = raw({ $: id });
    const attributes = (i.attributes ?? []).map(attribute);
    let type: XmlSchemaType | null = null;
    if (i.typeKind === 'complex') {
      type = new XmlSchemaComplexType(
        i.typeName ?? null,
        xmlTypeCodeFromName(i.typeCode),
        (XmlSchemaContentType as any)[i.contentType] ?? XmlSchemaContentType.Empty,
        !!i.isMixed,
        !!i.simpleContent,
        particle(i.particle),
        attributes,
        !!i.anyAttribute,
        simple(i.simpleType),
      );
    } else if (i.typeKind === 'simple') {
      type = simple(i.simpleType) ?? new XmlSchemaSimpleType(i.typeName ?? null, xmlTypeCodeFromName(i.typeCode), null, [], null, null);
    }
    const element = new XmlSchemaElement(
      i.name,
      occurs(i.minOccurs),
      occurs(i.maxOccurs),
      i.parent ?? null,
      i.parentMaxOccurs === undefined || i.parentMaxOccurs === null ? null : occurs(i.parentMaxOccurs),
      i.defaultValue ?? null,
      i.fixedValue ?? null,
      type,
      i.annotation ?? '',
      !!i.acceptsAny,
      !!i.isChoiceForOneElement,
    );
    return {
      element,
      optional: i.optional ?? [],
      required: i.required ?? [],
      choices: i.choices ?? [],
      withoutChoice: i.withoutChoice ?? [],
      attributes,
    };
  });
  return { namespace: packed.namespace, keys: new Map(Object.entries(packed.keys)), infos };
}
