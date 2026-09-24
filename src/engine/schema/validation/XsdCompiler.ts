// Compiles the CAEX XSD text into the structures System.Xml.Schema.Compiler produces for the
// validator: element declarations (SchemaElementDecl) with content validators, attribute
// definitions in AttributeUses order (own attributes first, then the base type's), named types
// (for xsi:type), global element declarations and target namespaces (SchemaInfo).
// Only the XSD constructs the CAEX 2.15 / 3.0 schemas use are supported: global elements,
// named/anonymous complex types with complexContent extension or simpleContent extension or a
// direct particle, sequence/choice/group ref, simple types restricting xs:string with enumerations,
// attributes with use/default/fixed, and the built-in types xs:string, xs:dateTime, xs:anyType.

import { XElement, XName, parseXDocument } from '../../../xml/index.js';
import { ContentModel, type AnyParticle, type Particle } from './ContentModel.js';
import { NS_XML, NS_XS, QName, SimpleType, type Primitive, type SchemaTypeBase } from './Datatypes.js';

export const DERIVED_EMPTY = 0;
export const DERIVED_EXTENSION = 2;
export const DERIVED_RESTRICTION = 4;

export type ContentType = 'TextOnly' | 'Empty' | 'ElementOnly' | 'Mixed';

/** SchemaDeclBase.Use. */
export type Presence = 'Default' | 'Required' | 'Implied' | 'Fixed' | 'RequiredFixed';

/** SchemaAttDef. */
export class AttDef {
  constructor(
    readonly name: QName,
    readonly schemaType: SimpleType,
    readonly presence: Presence,
    /** DefaultValueRaw (default or fixed value). */
    readonly defaultValue: string | null,
  ) {}

  /** SchemaDeclBase.CheckValue: fixed values must be equal. */
  checkValue(typed: unknown): boolean {
    if (this.presence === 'Fixed' || this.presence === 'RequiredFixed') {
      return typed !== null && this.schemaType.isEqual(typed, this.defaultValue);
    }
    return true;
  }
}

/** XmlSchemaAnyAttribute (##any only). */
export interface AnyAttribute {
  readonly processContents: 'strict' | 'lax' | 'skip';
}

/** Kind of ContentValidator: the static Empty/TextOnly/Mixed/Any validators or a particle DFA. */
export type ValidatorKind = 'Empty' | 'TextOnly' | 'Mixed' | 'Any' | 'Particle';

/** SchemaElementDecl (the fields the validator reads). */
export class ElementDecl {
  isNillable = false;
  isAbstract = false;
  block = DERIVED_EMPTY;
  constructor(
    readonly schemaType: SchemaTypeBase,
    readonly contentType: ContentType,
    readonly validatorKind: ValidatorKind,
    readonly model: ContentModel | null,
    readonly attDefs: ReadonlyMap<QName, AttDef>,
    readonly anyAttribute: AnyAttribute | null,
    /** Datatype for text-only content. */
    readonly datatype: SimpleType | null,
  ) {}

  get hasRequiredAttribute(): boolean {
    for (const a of this.attDefs.values()) if (a.presence === 'Required' || a.presence === 'RequiredFixed') return true;
    return false;
  }

  /** ContentValidator.IsOpen: the static Any validator is open, particle validators are not. */
  get isOpen(): boolean {
    if (this.contentType === 'TextOnly' || this.contentType === 'Empty') return false;
    return this.validatorKind === 'Any';
  }
}

/** XmlSchemaComplexType after compilation. */
export class ComplexType implements SchemaTypeBase {
  readonly isSimple = false;
  contentType: ContentType = 'Empty';
  particle: Particle | null = null;
  readonly attributeUses = new Map<QName, AttDef>();
  anyAttribute: AnyAttribute | null = null;
  datatype: SimpleType | null = null;
  baseType: SchemaTypeBase | null = null;
  derivedBy = DERIVED_EMPTY;
  private _decl: ElementDecl | null = null;
  constructor(readonly qualifiedName: QName) {}

  get decl(): ElementDecl {
    if (this._decl === null) {
      let kind: ValidatorKind;
      let model: ContentModel | null = null;
      if (this.contentType === 'Empty') kind = 'Empty';
      else if (this.contentType === 'TextOnly') kind = 'TextOnly';
      else {
        model = ContentModel.build(this.particle);
        if (model === null) kind = this.contentType === 'ElementOnly' ? 'Empty' : 'Mixed';
        else {
          if (!model.upaEnforced) throw new Error('content models without UPA enforcement (NfaContentValidator) are not supported');
          kind = 'Particle';
        }
      }
      const effective: ContentType = kind === 'Empty' ? 'Empty' : this.contentType;
      this._decl = new ElementDecl(this, effective, kind, model, this.attributeUses, this.anyAttribute, this.datatype);
    }
    return this._decl;
  }
}

export type SchemaType = SimpleType | ComplexType;

const XS = (n: string) => QName.get(n, NS_XS);

/** Built-in types (DatatypeImplementation / XmlSchemaComplexType.AnyType). */
export class BuiltIns {
  static readonly anyType: ComplexType = (() => {
    const t = new ComplexType(XS('anyType'));
    const any: AnyParticle = { kind: 'any', namespace: '##any', processContents: 'lax', minOccurs: 0, maxOccurs: Infinity };
    t.particle = { kind: 'sequence', items: [any], minOccurs: 1, maxOccurs: 1 };
    t.contentType = 'Mixed';
    t.anyAttribute = { processContents: 'lax' };
    return t;
  })();

  static readonly anySimpleType = new SimpleType(XS('anySimpleType'), 'anySimpleType', BuiltIns.anyType, DERIVED_RESTRICTION);

  private static readonly simple = new Map<string, SimpleType>();

  /** DatatypeImplementation.GetSimpleTypeFromXsdType for the supported built-ins. */
  static simpleType(localName: string): SimpleType | null {
    if (localName === 'anySimpleType') return BuiltIns.anySimpleType;
    const prims: Primitive[] = ['string', 'normalizedString', 'token', 'language', 'Name', 'NCName', 'NMTOKEN', 'anyURI', 'dateTime', 'boolean', 'QName'];
    if (!prims.includes(localName as Primitive)) return null;
    let t = BuiltIns.simple.get(localName);
    if (!t) {
      const parents: Record<string, string> = { normalizedString: 'string', token: 'normalizedString', language: 'token', Name: 'token', NMTOKEN: 'token', NCName: 'Name' };
      const base = parents[localName] ? BuiltIns.simpleType(parents[localName]!)! : BuiltIns.anySimpleType;
      t = new SimpleType(XS(localName), localName as Primitive, base, DERIVED_RESTRICTION);
      BuiltIns.simple.set(localName, t);
    }
    return t;
  }

  /** Element declaration of a simple type (text-only content). */
  static simpleDecl(t: SimpleType): ElementDecl {
    return new ElementDecl(t, 'TextOnly', 'TextOnly', null, new Map(), null, t);
  }
}

/** The compiled schema set of one CAEX version (XmlSchemaSet.CompiledInfo). */
export class CompiledSchema {
  readonly elementDecls = new Map<QName, ElementDecl>();
  readonly types = new Map<QName, SchemaType>();
  readonly targetNamespaces = new Set<string>();
  /** Global attribute declarations (SchemaInfo.AttributeDecls); the xml: attributes once loaded. */
  readonly attributeDecls = new Map<QName, AttDef>();
  private xmlNamespaceLoaded = false;

  constructor(readonly targetNamespace: string) {}

  contains(ns: string): boolean {
    return this.targetNamespaces.has(ns);
  }

  /** SchemaInfo.GetTypeDecl (named types of the schema and xs:anyType). */
  getTypeDecl(q: QName): ElementDecl | null {
    if (q === BuiltIns.anyType.qualifiedName) return BuiltIns.anyType.decl;
    const t = this.types.get(q);
    if (!t) return null;
    return t instanceof ComplexType ? t.decl : this.simpleTypeDecl(t);
  }

  private readonly simpleDecls = new Map<SimpleType, ElementDecl>();
  simpleTypeDecl(t: SimpleType): ElementDecl {
    let d = this.simpleDecls.get(t);
    if (!d) {
      d = BuiltIns.simpleDecl(t);
      this.simpleDecls.set(t, d);
    }
    return d;
  }

  /**
   * XmlSchemaValidator.AddXmlNamespaceSchema: adds the built-in schema of the xml namespace
   * (xml:lang, xml:base, xml:space) to the schema set. In .NET this mutates the shared
   * XmlSchemaSet of the schema manager, so it stays loaded for later validations.
   */
  addXmlNamespaceSchema(): void {
    if (this.xmlNamespaceLoaded) return;
    this.xmlNamespaceLoaded = true;
    this.targetNamespaces.add(NS_XML);
    const lang = QName.get('lang', NS_XML);
    const base = QName.get('base', NS_XML);
    const space = QName.get('space', NS_XML);
    const spaceType = new SimpleType(QName.Empty, 'NCName', BuiltIns.simpleType('NCName'), DERIVED_RESTRICTION, ['default', 'preserve']);
    this.attributeDecls.set(lang, new AttDef(lang, BuiltIns.simpleType('language')!, 'Implied', null));
    this.attributeDecls.set(base, new AttDef(base, BuiltIns.simpleType('anyURI')!, 'Implied', null));
    this.attributeDecls.set(space, new AttDef(space, spaceType, 'Implied', null));
  }
}

const xs = (local: string) => XName.get(`{${NS_XS}}${local}`);

/** Compiles one XSD text (targetNamespace from the schema element). */
export function compileXsd(text: string): CompiledSchema {
  const doc = parseXDocument(text);
  const schemaEl = doc.root!;
  const tns = schemaEl.attribute('targetNamespace')?.value ?? '';
  const elementQualified = schemaEl.attribute('elementFormDefault')?.value === 'qualified';
  const schema = new CompiledSchema(tns);
  schema.targetNamespaces.add(tns);

  const complexDefs = new Map<string, XElement>();
  const simpleDefs = new Map<string, XElement>();
  const groupDefs = new Map<string, XElement>();
  const elementDefs: XElement[] = [];
  for (const child of schemaEl.elements()) {
    const name = child.attribute('name')?.value ?? '';
    if (child.name === xs('complexType')) complexDefs.set(name, child);
    else if (child.name === xs('simpleType')) simpleDefs.set(name, child);
    else if (child.name === xs('group')) groupDefs.set(name, child);
    else if (child.name === xs('element')) elementDefs.push(child);
  }

  const named = new Map<string, SchemaType>();

  /** Resolves a QName written in the XSD (prefix bound on the element). */
  function resolveQName(ctx: XElement, value: string): QName {
    const i = value.indexOf(':');
    const prefix = i < 0 ? '' : value.slice(0, i);
    const local = i < 0 ? value : value.slice(i + 1);
    const ns = prefix === '' ? ctx.getDefaultNamespace().namespaceName : ctx.getNamespaceOfPrefix(prefix)?.namespaceName ?? '';
    return QName.get(local, ns);
  }

  function resolveType(ctx: XElement, value: string): SchemaType {
    const q = resolveQName(ctx, value);
    if (q.ns === NS_XS) {
      if (q.name === 'anyType') return BuiltIns.anyType;
      const s = BuiltIns.simpleType(q.name);
      if (!s) throw new Error(`unsupported built-in type ${q.name}`);
      return s;
    }
    if (q.ns !== tns) throw new Error(`unknown type ${value}`);
    return namedType(q.name);
  }

  function namedType(name: string): SchemaType {
    const existing = named.get(name);
    if (existing) return existing;
    const qn = QName.get(name, tns);
    const c = complexDefs.get(name);
    if (c) {
      const t = new ComplexType(qn);
      named.set(name, t);
      compileComplexType(t, c);
      return t;
    }
    const s = simpleDefs.get(name);
    if (s) {
      const t = compileSimpleType(qn, s);
      named.set(name, t);
      return t;
    }
    throw new Error(`unknown type ${name}`);
  }

  function compileSimpleType(qn: QName, el: XElement): SimpleType {
    const r = el.element(xs('restriction'));
    if (!r) throw new Error('only restrictions are supported');
    const base = resolveType(r, r.attribute('base')!.value);
    if (!(base instanceof SimpleType)) throw new Error('simple type base must be simple');
    const enums = [...r.elements(xs('enumeration'))].map((e) => e.attribute('value')!.value);
    return new SimpleType(qn, base.primitive, base, DERIVED_RESTRICTION, enums.length ? enums : null);
  }

  function occurs(el: XElement): [number, number] {
    const min = el.attribute('minOccurs')?.value;
    const max = el.attribute('maxOccurs')?.value;
    return [min === undefined ? 1 : Number(min), max === undefined ? 1 : max === 'unbounded' ? Infinity : Number(max)];
  }

  /** Particle of an xs:sequence / xs:choice / xs:group ref / xs:element (null if empty). */
  function compileParticle(el: XElement): Particle | null {
    const [min, max] = occurs(el);
    if (el.name === xs('element')) {
      const name = el.attribute('name')!.value;
      const qname = QName.get(name, elementQualified ? tns : '');
      let decl: ElementDecl | null = null;
      return {
        kind: 'element',
        qname,
        minOccurs: min,
        maxOccurs: max,
        decl: () => (decl ??= elementDecl(el)),
      };
    }
    if (el.name === xs('group')) {
      const g = groupDefs.get(resolveQName(el, el.attribute('ref')!.value).name)!;
      const inner = [...g.elements()].find((c) => c.name === xs('sequence') || c.name === xs('choice'))!;
      const p = compileParticle(inner);
      if (p === null || p.kind !== 'sequence' && p.kind !== 'choice') return p;
      return { kind: p.kind, items: p.items, minOccurs: min, maxOccurs: max };
    }
    if (el.name === xs('sequence') || el.name === xs('choice')) {
      const items: Particle[] = [];
      for (const c of el.elements()) {
        if (c.name === xs('annotation')) continue;
        const p = compileParticle(c);
        if (p !== null) items.push(p);
      }
      if (items.length === 0) return null;
      return { kind: el.name === xs('sequence') ? 'sequence' : 'choice', items, minOccurs: min, maxOccurs: max };
    }
    if (el.name === xs('any')) throw new Error('xs:any is not supported');
    return null;
  }

  function particleChild(el: XElement): XElement | null {
    for (const c of el.elements()) {
      if (c.name === xs('sequence') || c.name === xs('choice') || c.name === xs('group') || c.name === xs('all')) return c;
    }
    return null;
  }

  function compileAttribute(el: XElement): AttDef {
    const name = QName.get(el.attribute('name')!.value, '');
    const typeAttr = el.attribute('type')?.value;
    let type: SimpleType;
    if (typeAttr !== undefined) {
      const t = resolveType(el, typeAttr);
      if (!(t instanceof SimpleType)) throw new Error('attribute type must be simple');
      type = t;
    } else {
      const st = el.element(xs('simpleType'));
      type = st ? compileSimpleType(QName.Empty, st) : BuiltIns.anySimpleType;
    }
    const use = el.attribute('use')?.value ?? 'optional';
    const fixed = el.attribute('fixed')?.value;
    const def = el.attribute('default')?.value;
    let presence: Presence;
    if (use === 'required') presence = fixed !== undefined ? 'RequiredFixed' : 'Required';
    else if (fixed !== undefined) presence = 'Fixed';
    else if (def !== undefined) presence = 'Default';
    else presence = 'Implied';
    return new AttDef(name, type, presence, fixed ?? def ?? null);
  }

  function addOwnAttributes(t: ComplexType, holder: XElement): void {
    for (const a of holder.elements(xs('attribute'))) {
      const def = compileAttribute(a);
      if (!t.attributeUses.has(def.name)) t.attributeUses.set(def.name, def);
    }
  }

  function addBaseAttributes(t: ComplexType, base: SchemaType): void {
    if (base instanceof ComplexType) {
      for (const [k, v] of base.attributeUses) if (!t.attributeUses.has(k)) t.attributeUses.set(k, v);
    }
  }

  function compileComplexType(t: ComplexType, el: XElement): void {
    const mixed = el.attribute('mixed')?.value === 'true';
    const cc = el.element(xs('complexContent'));
    const sc = el.element(xs('simpleContent'));
    if (cc) {
      const ext = cc.element(xs('extension'));
      if (!ext) throw new Error('only complexContent extensions are supported');
      const base = resolveType(ext, ext.attribute('base')!.value);
      if (!(base instanceof ComplexType)) throw new Error('complexContent base must be complex');
      addOwnAttributes(t, ext);
      addBaseAttributes(t, base);
      t.anyAttribute = base.anyAttribute;
      const pc = particleChild(ext);
      const own = pc ? compileParticle(pc) : null;
      if (base.particle !== null && own !== null) {
        t.particle = { kind: 'sequence', items: [base.particle, own], minOccurs: 1, maxOccurs: 1 };
      } else {
        t.particle = base.particle ?? own;
      }
      const ccMixed = cc.attribute('mixed')?.value === 'true';
      let ct: ContentType = ccMixed ? 'Mixed' : own !== null ? 'ElementOnly' : 'Empty';
      if (ct === 'Empty') {
        ct = base.contentType;
        if (ct === 'TextOnly') t.datatype = base.datatype;
      }
      t.contentType = ct;
      t.baseType = base;
      t.derivedBy = DERIVED_EXTENSION;
    } else if (sc) {
      const ext = sc.element(xs('extension'));
      if (!ext) throw new Error('only simpleContent extensions are supported');
      const base = resolveType(ext, ext.attribute('base')!.value);
      addOwnAttributes(t, ext);
      addBaseAttributes(t, base);
      t.contentType = 'TextOnly';
      t.datatype = base instanceof SimpleType ? base : base.datatype;
      t.baseType = base;
      t.derivedBy = DERIVED_EXTENSION;
    } else {
      addOwnAttributes(t, el);
      const pc = particleChild(el);
      t.particle = pc ? compileParticle(pc) : null;
      t.contentType = mixed ? 'Mixed' : t.particle !== null ? 'ElementOnly' : 'Empty';
      t.baseType = BuiltIns.anyType;
      t.derivedBy = DERIVED_RESTRICTION;
    }
  }

  /** XmlSchemaElement.ElementDecl. */
  function elementDecl(el: XElement): ElementDecl {
    const typeAttr = el.attribute('type')?.value;
    let type: SchemaType;
    if (typeAttr !== undefined) type = resolveType(el, typeAttr);
    else {
      const ct = el.element(xs('complexType'));
      const st = el.element(xs('simpleType'));
      if (ct) {
        type = new ComplexType(QName.Empty);
        compileComplexType(type, ct);
      } else if (st) type = compileSimpleType(QName.Empty, st);
      else type = BuiltIns.anyType;
    }
    return type instanceof ComplexType ? type.decl : schema.simpleTypeDecl(type);
  }

  for (const name of complexDefs.keys()) schema.types.set(QName.get(name, tns), namedType(name));
  for (const name of simpleDefs.keys()) schema.types.set(QName.get(name, tns), namedType(name));
  for (const e of elementDefs) schema.elementDecls.set(QName.get(e.attribute('name')!.value, tns), elementDecl(e));
  return schema;
}
