// Port of the parts of System.Xml.Schema.XmlSchemaValidator (driven by XsdValidatingReader) that
// the CAEX schemas can reach, with the .NET messages, their order and their line numbers.
// Method and field names follow the C# source; see docs/port-notes/validation.md.

import { AnyParticle, type Particle } from './ContentModel.js';
import { NS_XML, NS_XS, QName, SimpleType, type NamespaceResolver, type SchemaTypeBase } from './Datatypes.js';
import { type AttDef, BuiltIns, ComplexType, type CompiledSchema, type ElementDecl } from './XsdCompiler.js';
import type { ReaderAttribute, ReaderNode } from './XmlLineReader.js';

const NS_XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const NS_XMLNS = 'http://www.w3.org/2000/xmlns/';

type ProcessContents = 'strict' | 'lax' | 'skip';
type Validity = 'NotKnown' | 'Valid' | 'Invalid';

/** ValidationState. */
class ValidationState {
  localName = '';
  namespace = '';
  elementDecl: ElementDecl | null = null;
  isNill = false;
  checkRequiredAttribute = true;
  validationSkipped = false;
  validity: Validity = 'NotKnown';
  needValidateChildren = false;
  processContents: ProcessContents = 'strict';
  /** DfaContentValidator state (CurrentState.State) and HasMatched. */
  state: ReadonlySet<number> | null = null;
  hasMatched = false;
}

/** Format of SR resources used by the validator. */
const SR = {
  elementNameAndNamespace: (name: string, ns: string) => `'${name}' in namespace '${ns}'`,
  elementName: (name: string) => `'${name}'`,
};

export class XmlSchemaValidator {
  private readonly stack: ValidationState[] = [];
  private context!: ValidationState;
  private processContents: ProcessContents = 'strict';
  private isRoot = true;
  private rootHasSchema = true;
  private attPresence = new Set<QName>();
  private textValue = '';
  private lineNumber = 0;
  /** Namespace resolver of the current element (the reader's IXmlNamespaceResolver). */
  private nsResolver: NamespaceResolver | null = null;
  readonly messages: string[] = [];
  hasErrors = false;

  constructor(private readonly schema: CompiledSchema) {
    this.push(QName.Empty);
  }

  /** XsdValidatingReader.Read loop over the reader nodes. */
  run(nodes: Iterable<ReaderNode>): void {
    for (const node of nodes) {
      switch (node.type) {
        case 'element':
          this.processElementEvent(node);
          break;
        case 'text':
        case 'cdata':
          this.lineNumber = node.lineNumber;
          this.validateText(node.value);
          break;
        case 'significantWhitespace':
          this.lineNumber = node.lineNumber;
          this.validateWhitespace(node.value);
          break;
        case 'endElement':
          this.lineNumber = node.lineNumber;
          this.validateEndElement();
          break;
      }
    }
  }

  /** XsdValidatingReader.ProcessElementEvent. */
  private processElementEvent(node: Extract<ReaderNode, { type: 'element' }>): void {
    let xsiNil: string | null = null;
    let xsiType: string | null = null;
    for (const a of node.attributes) {
      if (a.namespaceUri === NS_XSI) {
        if (a.localName === 'type') xsiType = a.value;
        else if (a.localName === 'nil') xsiNil = a.value;
      }
    }
    this.nsResolver = node.lookupNamespace;
    this.lineNumber = node.lineNumber;
    this.validateElement(node.localName, node.namespaceUri, xsiType, xsiNil);
    this.validateAttributes(node.attributes);
    this.lineNumber = node.lineNumber;
    this.validateEndOfAttributes();
    if (node.isEmpty) this.validateEndElement();
  }

  private validateAttributes(attributes: readonly ReaderAttribute[]): void {
    for (const a of attributes) {
      if (a.namespaceUri === NS_XMLNS) continue;
      this.lineNumber = a.lineNumber;
      this.validateAttribute(a.localName, a.namespaceUri, a.value);
    }
    this.getUnspecifiedDefaultAttributes();
  }

  // ------------------------------------------------------------------------------------------
  // XmlSchemaValidator

  private validateElement(localName: string, namespaceUri: string, xsiType: string | null, xsiNil: string | null): void {
    this.clearPSVI();
    const contextQName = QName.get(localName, namespaceUri);
    const { particle, invalidElementInContext } = this.validateElementContext(contextQName);
    let schemaElementDecl = this.fastGetElementDecl(contextQName, particle);
    this.push(contextQName);
    if (invalidElementInContext) this.context.validity = 'Invalid';
    if (this.processContents !== 'skip') {
      if (schemaElementDecl === null) schemaElementDecl = this.schema.elementDecls.get(contextQName) ?? null;
      const declFound = { value: schemaElementDecl !== null };
      if (xsiType !== null || xsiNil !== null) {
        schemaElementDecl = this.checkXsiTypeAndNil(schemaElementDecl, xsiType, xsiNil, declFound);
      }
      if (schemaElementDecl === null) this.throwDeclNotFoundWarningOrError(declFound.value);
    }
    this.context.elementDecl = schemaElementDecl;
    if (schemaElementDecl !== null) {
      this.attPresence.clear();
      this.context.needValidateChildren = this.processContents !== 'skip';
      // ContentValidator.InitValidation.
      if (schemaElementDecl.model !== null) {
        this.context.state = schemaElementDecl.model.initialState;
        this.context.hasMatched = schemaElementDecl.model.isAccepting(this.context.state);
      }
    }
    if (this.isRoot) this.isRoot = false;
  }

  private validateAttribute(localName: string, namespaceUri: string, attributeValue: string): void {
    if (namespaceUri === NS_XMLNS) return;
    const elementDecl = this.context.elementDecl;
    const qname = QName.get(localName, namespaceUri);
    if (this.attPresence.has(qname)) {
      this.sendValidationEvent(`The '${qname}' attribute has already been validated and is a duplicate attribute.`);
      return;
    }
    if (namespaceUri !== NS_XSI) {
      const { attDef: found, state } = this.getAttributeXsd(elementDecl, qname);
      let schemaAttDef = found;
      switch (state) {
        case 'UndeclaredElementAndAttribute':
          if ((schemaAttDef = this.checkIsXmlAttribute(qname)) === null) {
            if (elementDecl === null && this.processContents === 'strict' && qname.ns.length !== 0 && this.schema.contains(qname.ns)) {
              this.sendValidationEvent(`The '${qname}' attribute is not declared.`);
            }
            // else: Sch_NoAttributeSchemaFound warning (not reported).
            break;
          }
          this.attributeFound(qname, schemaAttDef, elementDecl, attributeValue);
          break;
        case 'UndeclaredAttribute':
          if ((schemaAttDef = this.checkIsXmlAttribute(qname)) === null) {
            this.sendValidationEvent(`The '${qname}' attribute is not declared.`);
            break;
          }
          this.attributeFound(qname, schemaAttDef, elementDecl, attributeValue);
          break;
        case 'AttributeFound':
          this.attributeFound(qname, schemaAttDef!, elementDecl, attributeValue);
          break;
        case 'AnyAttributeLax':
        case 'AnyAttributeSkip':
          break;
      }
    } else if (localName === 'type' || localName === 'nil' || localName === 'schemaLocation' || localName === 'noNamespaceSchemaLocation') {
      this.attPresence.add(qname);
    } else {
      this.sendValidationEvent(`The attribute '${qname}' does not match one of the four allowed attributes in the 'xsi' namespace.`);
    }
  }

  private attributeFound(qname: QName, attDef: AttDef, elementDecl: ElementDecl | null, value: string): void {
    if (elementDecl !== null) this.attPresence.add(qname);
    this.checkAttributeValue(value, attDef);
  }

  /** SchemaInfo.GetAttributeXsd. */
  private getAttributeXsd(ed: ElementDecl | null, qname: QName): { attDef: AttDef | null; state: string } {
    if (ed !== null) {
      const value = ed.attDefs.get(qname) ?? null;
      if (value !== null) return { attDef: value, state: 'AttributeFound' };
      const anyAttribute = ed.anyAttribute;
      if (anyAttribute !== null) {
        if (anyAttribute.processContents !== 'skip') {
          const g = this.schema.attributeDecls.get(qname) ?? null;
          if (g !== null) return { attDef: g, state: 'AttributeFound' };
          if (anyAttribute.processContents === 'lax') return { attDef: null, state: 'AnyAttributeLax' };
          return { attDef: null, state: 'UndeclaredAttribute' };
        }
        return { attDef: null, state: 'AnyAttributeSkip' };
      }
      return { attDef: null, state: 'UndeclaredAttribute' };
    }
    const g = this.schema.attributeDecls.get(qname) ?? null;
    if (g !== null) return { attDef: g, state: 'AttributeFound' };
    return { attDef: null, state: 'UndeclaredElementAndAttribute' };
  }

  /** CheckIsXmlAttribute (XmlSchemaValidationFlags.AllowXmlAttributes is set by default). */
  private checkIsXmlAttribute(qname: QName): AttDef | null {
    if (qname.ns === NS_XML) {
      if (!this.schema.contains(NS_XML)) this.schema.addXmlNamespaceSchema();
      return this.schema.attributeDecls.get(qname) ?? null;
    }
    return null;
  }

  private getUnspecifiedDefaultAttributes(): void {
    // Default attribute values (ChangeMode="state") produce no messages for these schemas.
  }

  private validateEndOfAttributes(): void {
    const elementDecl = this.context.elementDecl;
    if (elementDecl !== null && elementDecl.hasRequiredAttribute) {
      this.context.checkRequiredAttribute = false;
      this.checkRequiredAttributes(elementDecl);
    }
  }

  private validateText(elementValue: string): void {
    if (!this.context.needValidateChildren) return;
    if (this.context.isNill) {
      this.sendValidationEvent(`Element '${qnameString(this.context.localName, this.context.namespace)}' must have no character or element children.`);
      return;
    }
    const decl = this.context.elementDecl!;
    switch (decl.contentType) {
      case 'Empty':
        this.sendValidationEvent('The element cannot contain text. Content model is empty.');
        break;
      case 'TextOnly':
        this.textValue += elementValue;
        break;
      case 'ElementOnly':
        if (!isOnlyWhitespace(elementValue)) {
          const list = this.expectedParticles(this.context);
          const name = buildElementName(this.context.localName, this.context.namespace);
          if (list.length === 0) this.sendValidationEvent(`The element ${name} cannot contain text.`);
          else this.sendValidationEvent(`The element ${name} cannot contain text. List of possible elements expected: ${printExpectedElements(list)}.`);
        }
        break;
      case 'Mixed':
        break;
    }
  }

  private validateWhitespace(elementValue: string): void {
    if (!this.context.needValidateChildren) return;
    if (this.context.isNill) {
      this.sendValidationEvent(`Element '${qnameString(this.context.localName, this.context.namespace)}' must have no character or element children.`);
    }
    const decl = this.context.elementDecl!;
    switch (decl.contentType) {
      case 'Empty':
        this.sendValidationEvent('The element cannot contain whitespace. Content model is empty.');
        break;
      case 'TextOnly':
        this.textValue += elementValue;
        break;
      default:
        break;
    }
  }

  /** InternalValidateEndElement. */
  private validateEndElement(): void {
    const elementDecl = this.context.elementDecl;
    if (elementDecl !== null) {
      if (this.context.checkRequiredAttribute && elementDecl.hasRequiredAttribute) this.checkRequiredAttributes(elementDecl);
      if (!this.context.isNill && this.context.needValidateChildren) {
        if (elementDecl.contentType === 'TextOnly') this.validateAtomicValue(this.textValue);
        if (!this.completeValidation(this.context)) {
          this.completeValidationError(this.context);
          this.context.validity = 'Invalid';
        }
      }
    }
    this.pop();
  }

  private completeValidation(context: ValidationState): boolean {
    const decl = context.elementDecl!;
    if (decl.validatorKind === 'Particle') return context.hasMatched;
    return true;
  }

  private validateElementContext(elementName: QName): { particle: Particle | null; invalidElementInContext: boolean } {
    let obj: Particle | null = null;
    let invalid = false;
    if (this.context.needValidateChildren) {
      if (this.context.isNill) {
        this.sendValidationEvent(`Element '${qnameString(this.context.localName, this.context.namespace)}' must have no character or element children.`);
        return { particle: null, invalidElementInContext: false };
      }
      obj = this.contentValidatorValidateElement(elementName, this.context);
      if (obj === null) {
        this.elementValidationError(elementName, this.context);
        invalid = true;
        this.processContents = this.context.processContents = 'skip';
      }
    }
    return { particle: obj, invalidElementInContext: invalid };
  }

  /** ContentValidator.ValidateElement (static validators and DfaContentValidator). */
  private contentValidatorValidateElement(name: QName, context: ValidationState): Particle | null {
    const decl = context.elementDecl!;
    if (decl.validatorKind === 'Particle') {
      const r = decl.model!.step(context.state!, name);
      if (r !== null) {
        context.state = r.state;
        context.hasMatched = decl.model!.isAccepting(r.state);
        return r.particle;
      }
      if (decl.isOpen && context.hasMatched) return null;
      context.needValidateChildren = false;
      return null;
    }
    if (decl.contentType === 'TextOnly' || decl.contentType === 'Empty') context.needValidateChildren = false;
    return null;
  }

  private fastGetElementDecl(elementName: QName, particle: Particle | null): ElementDecl | null {
    let decl: ElementDecl | null = null;
    if (particle !== null) {
      if (particle.kind === 'element') decl = particle.decl() as ElementDecl;
      else if (particle.kind === 'any') this.processContents = (particle as AnyParticle).processContents;
    }
    if (decl === null && this.processContents !== 'skip') {
      decl = this.schema.elementDecls.get(elementName) ?? null;
    }
    return decl;
  }

  private checkXsiTypeAndNil(elementDecl: ElementDecl | null, xsiType: string | null, xsiNil: string | null, declFound: { value: boolean }): ElementDecl | null {
    let typeName = QName.Empty;
    if (xsiType !== null) {
      const r = BuiltIns.simpleType('QName')!.tryParseValue(xsiType, this.nsResolver);
      if (!r.ok) {
        this.sendValidationEvent(`The attribute 'type' has an invalid value '${xsiType}' according to its schema type 'QName' - ${r.message}`);
      } else typeName = r.value as QName;
    }
    if (elementDecl !== null) {
      if (elementDecl.isNillable) {
        // Not reachable: no CAEX element is nillable.
      } else if (xsiNil !== null) {
        this.sendValidationEvent("If the 'nillable' attribute is false in the schema, the 'xsi:nil' attribute must not be present in the instance.");
      }
    }
    if (typeName.isEmpty) return elementDecl;
    let typeDecl = this.schema.getTypeDecl(typeName);
    const severityError = this.hasSchema && this.processContents === 'strict';
    if (typeDecl === null && typeName.ns === NS_XS) {
      const simple = BuiltIns.simpleType(typeName.name);
      if (simple !== null) typeDecl = this.schema.simpleTypeDecl(simple);
      else if (typeName.name === 'anyType') typeDecl = BuiltIns.anyType.decl;
    }
    if (typeDecl === null) {
      if (severityError) this.sendValidationEvent(`This is an invalid xsi:type '${typeName}'.`);
      return null;
    }
    declFound.value = true;
    if (elementDecl !== null && !isDerivedFrom(typeDecl.schemaType, elementDecl.schemaType, elementDecl.block)) {
      this.sendValidationEvent(
        `The xsi:type attribute value '${typeName}' is not valid for the element '${qnameString(this.context.localName, this.context.namespace)}', either because it is not a type validly derived from the type in the schema, or because it has xsi:type derivation blocked.`,
      );
      return null;
    }
    return typeDecl;
  }

  /** HasSchema: evaluated for the root only, afterwards the cached value. */
  private get hasSchema(): boolean {
    if (this.isRoot) {
      this.isRoot = false;
      if (!this.schema.contains(this.context.namespace)) this.rootHasSchema = false;
    }
    return this.rootHasSchema;
  }

  private throwDeclNotFoundWarningOrError(declFound: boolean): void {
    if (declFound) {
      this.processContents = this.context.processContents = 'skip';
      this.context.needValidateChildren = false;
    } else if (this.hasSchema && this.processContents === 'strict') {
      this.processContents = this.context.processContents = 'skip';
      this.context.needValidateChildren = false;
      this.sendValidationEvent(`The '${qnameString(this.context.localName, this.context.namespace)}' element is not declared.`);
    }
    // else: Sch_NoElementSchemaFound warning (not reported).
  }

  private validateAtomicValue(stringValue: string): void {
    if (this.context.isNill) return;
    const decl = this.context.elementDecl!;
    const datatype = decl.datatype!;
    const r = datatype.tryParseValue(stringValue, this.nsResolver);
    if (!r.ok) {
      this.sendValidationEvent(
        `The '${qnameString(this.context.localName, this.context.namespace)}' element is invalid - The value '${stringValue}' is invalid according to its datatype '${getTypeName(decl.schemaType, datatype)}' - ${r.message}`,
      );
    }
  }

  private checkAttributeValue(value: string, attdef: AttDef): void {
    const r = attdef.schemaType.tryParseValue(value, this.nsResolver);
    if (!r.ok) {
      this.sendValidationEvent(
        `The '${attdef.name}' attribute is invalid - The value '${value}' is invalid according to its datatype '${getTypeName(attdef.schemaType, attdef.schemaType)}' - ${r.message}`,
      );
      return;
    }
    if (!attdef.checkValue(r.value)) {
      this.sendValidationEvent(`The value of the '${attdef.name}' attribute does not equal its fixed value.`);
    }
  }

  private clearPSVI(): void {
    this.textValue = '';
    this.attPresence.clear();
  }

  private checkRequiredAttributes(decl: ElementDecl): void {
    for (const a of decl.attDefs.values()) {
      if (!this.attPresence.has(a.name) && (a.presence === 'Required' || a.presence === 'RequiredFixed')) {
        this.sendValidationEvent(`The required attribute '${a.name}' is missing.`);
      }
    }
  }

  private push(name: QName): void {
    const c = new ValidationState();
    c.localName = name.name;
    c.namespace = name.ns;
    c.processContents = this.processContents;
    this.stack.push(c);
    this.context = c;
  }

  private pop(): void {
    const popped = this.stack.pop()!;
    this.context = this.stack[this.stack.length - 1]!;
    if (popped.validity === 'Invalid') this.context.validity = 'Invalid';
    if (popped.validationSkipped) this.context.validationSkipped = true;
    this.processContents = this.context.processContents;
  }

  private expectedParticles(context: ValidationState): Particle[] {
    const decl = context.elementDecl;
    if (decl === null || decl.validatorKind !== 'Particle') return [];
    return decl.model!.expectedParticles(context.state!);
  }

  private elementValidationError(name: QName, context: ValidationState): void {
    const decl = context.elementDecl;
    if (decl === null) return;
    const contentType = decl.contentType;
    if (contentType === 'ElementOnly' || (contentType === 'Mixed' && decl.validatorKind !== 'Mixed' && decl.validatorKind !== 'Any')) {
      const list = this.expectedParticles(context);
      const parent = buildElementName(context.localName, context.namespace);
      if (list.length === 0) {
        this.sendValidationEvent(`The element ${parent} has invalid child element ${buildElementName(name.name, name.ns)}.`);
      } else {
        this.sendValidationEvent(`The element ${parent} has invalid child element ${buildElementName(name.name, name.ns)}. List of possible elements expected: ${printExpectedElements(list)}.`);
      }
    } else if (contentType === 'Empty') {
      this.sendValidationEvent(`The element '${qnameString(context.localName, context.namespace)}' cannot contain child element '${name}' because the parent element's content model is empty.`);
    } else if (!decl.isOpen) {
      this.sendValidationEvent(`The element '${qnameString(context.localName, context.namespace)}' cannot contain child element '${name}' because the parent element's content model is text only.`);
    }
  }

  private completeValidationError(context: ValidationState): void {
    const list = this.expectedParticles(context);
    const name = buildElementName(context.localName, context.namespace);
    if (list.length === 0) this.sendValidationEvent(`The element ${name} has incomplete content.`);
    else this.sendValidationEvent(`The element ${name} has incomplete content. List of possible elements expected: ${printExpectedElements(list)}.`);
  }

  private sendValidationEvent(message: string): void {
    this.context.validity = 'Invalid';
    this.hasErrors = true;
    this.messages.push(`Line ${this.lineNumber}:\t ${message}`);
  }
}

/** XmlSchemaType.IsDerivedFrom. */
function isDerivedFrom(derived: SchemaTypeBase | null, base: SchemaTypeBase | null, except: number): boolean {
  if (derived === null || base === null) return false;
  if (derived === base) return true;
  if (base === BuiltIns.anyType) return true;
  let d: SchemaTypeBase | null = derived;
  do {
    if (base instanceof SimpleType && d instanceof SimpleType) {
      if (base === BuiltIns.anySimpleType) return true;
      if ((except & d.derivedBy) !== 0 || !d.isDerivedFromDatatype(base)) return false;
      return true;
    }
    if ((except & d.derivedBy) !== 0) return false;
    d = d.baseType;
    if (d === base) return true;
  } while (d !== null);
  return false;
}

/** GetTypeName: the type's qualified name, or the datatype's TypeCodeString for anonymous types. */
function getTypeName(schemaType: SchemaTypeBase, datatype: SimpleType): string {
  const text = schemaType.qualifiedName.toString();
  return text.length === 0 ? datatype.typeCodeString : text;
}

function qnameString(localName: string, ns: string): string {
  return ns.length === 0 ? localName : `${ns}:${localName}`;
}

function buildElementName(localName: string, ns: string): string {
  return ns.length !== 0 ? SR.elementNameAndNamespace(localName, ns) : SR.elementName(localName);
}

function isOnlyWhitespace(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c !== 0x20 && c !== 0x9 && c !== 0xa && c !== 0xd) return false;
  }
  return true;
}

/** XmlSchemaParticle.GetQualifiedName. */
function particleQName(p: Particle): QName {
  if (p.kind === 'element') return p.qname;
  if (p.kind === 'any') return QName.get('*', p.namespace);
  return QName.Empty;
}

/** PrintExpectedElements(expected, getParticles: true). */
function printExpectedElements(expected: Particle[]): string {
  const continuation = ' as well as ';
  let builder = '';
  let names: QName[] = [];
  let current: Particle;
  if (expected.length === 1) current = expected[0]!;
  else {
    current = expected[0]!;
    for (let i = 1; i < expected.length; i++) {
      const prev = expected[i - 1]!;
      current = expected[i]!;
      const q = particleQName(prev);
      if (q.ns !== particleQName(current).ns) {
        names.push(q);
        builder += printNamesWithNS(names);
        names = [];
        builder += continuation;
      } else names.push(q);
    }
  }
  names.push(particleQName(current));
  builder += printNamesWithNS(names);
  return builder;
}

function printNamesWithNS(expected: QName[]): string {
  let q = expected[0]!;
  if (expected.length === 1) {
    if (q.name === '*') return `any element in namespace '${q.ns}'`;
    return q.ns.length !== 0 ? SR.elementNameAndNamespace(q.name, q.ns) : SR.elementName(q.name);
  }
  let anyElement = false;
  let first = true;
  let sb = '';
  for (const e of expected) {
    q = e;
    if (q.name === '*') {
      anyElement = true;
      continue;
    }
    if (first) first = false;
    else sb += ', ';
    sb += q.name;
  }
  if (anyElement) {
    sb += ', ';
    sb += 'any element';
    return '';
  }
  return q.ns.length !== 0 ? SR.elementNameAndNamespace(sb, q.ns) : SR.elementName(sb);
}
