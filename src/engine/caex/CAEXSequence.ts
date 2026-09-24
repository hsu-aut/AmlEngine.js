// Port of Aml.Engine.CAEX.CAEXSequence<T> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { from } from '../../system/linq.js';
import { InvalidCastException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { XElement, XName } from '../../xml/index.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from './extensions/CAEXDocumentExtensions.js';
import { NamedElementSequence_1 } from './NamedElementSequence.js';
import { CAEXWrapper, newException } from './CAEXWrapper.js';
import type { CAEXEnumerable } from './CAEXEnumerable.js';
import type { CAEXDocument } from './CAEXDocument.js';
import type { CAEXObject } from './CAEXObject.js';
import type { CAEXBasicObject } from './CAEXBasicObject.js';
import type { ExternalReferenceType } from './ExternalReferenceType.js';
import type { ICAEXSequence, AttributeValuePair, NameValueTuple } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { ICAEXReference } from '../services/interfaces/ICAEXReference.js';

/** C# implicit conversion string -> XName (null stays null). */
function toXName(name: string | null): XName {
  return (name === null ? null : XName.get(name)) as XName;
}

/** Reads the name and value of a `(string Name, object Value)` tuple: `[name, value]` or `{ name, value }`. */
function tupleParts(t: NameValueTuple): [string, unknown] {
  if (Array.isArray(t)) {
    const a = t as readonly [string, unknown];
    return [a[0], a[1]];
  }
  const o = t as { readonly name: string; readonly value: unknown };
  return [o.name, o.value];
}

/**
 * This class implements methods to work with any sequence of CAEX elements. The class wraps all
 * elements of a filtered sequence of an owner element with the constructor function `create`.
 */
export class CAEXSequence<TW extends CAEXWrapper> extends NamedElementSequence_1<TW> implements ICAEXSequence {
  private readonly _create: (e: XElement) => TW;

  /** Gets a wrapper for the first CAEX element in this sequence, or `null`. */
  get first(): TW | null {
    return this.createCaexWrapper(this.firstElement);
  }

  /** Gets a wrapper for the last CAEX element in this sequence, or `null`. */
  get last(): TW | null {
    return this.createCaexWrapper(this.lastElement);
  }

  /** @internal Gets a collection of all CAEX elements of this sequence in document order. */
  get caexElements(): CAEXEnumerable<TW> {
    return new T.CAEXEnumerable<TW>(this, this.elements);
  }

  /**
   * Indexers: `item(i)` gets a wrapper for the CAEX element at the given position (or `null`),
   * `item({ name, value })` the first element whose attribute `name` has the value `value`.
   */
  override item(i: number): TW | null;
  override item(attributeValuePair: AttributeValuePair): TW | null;
  override item(arg: number | AttributeValuePair): TW | null {
    if (typeof arg === 'number') {
      if (this.atIndex(arg) == null) {
        return null;
      }
      return this.createCaexWrapper(this.atIndex(arg));
    }
    const attributeValuePair = arg;
    const xElement = from(this.elements).firstOrDefault(
      (e) => (e.attribute(attributeValuePair.name)?.value ?? null) === attributeValuePair.value,
    );
    if (xElement == null) {
      return null;
    }
    return this.createCaexWrapper(xElement);
  }

  /** The setter of the int indexer does nothing. */
  override setItem(i: number, value: TW | null): void {
    void i;
    void value;
  }

  /**
   * Creates a new instance of the CAEXSequence for the specified owner and the specified name
   * of the child elements.
   * @param owner The owner.
   * @param caexName CAEX-Name of the items in this sequence.
   * @param create The constructor function (e.g. `RevisionType.Constructor`).
   * @param getCAEXOwner If set, the caexOwner is provided by this function.
   */
  constructor(owner: XElement | null, caexName: string, create: (e: XElement) => TW, getCAEXOwner: (() => CAEXWrapper | null) | null = null) {
    super(owner, caexName, getCAEXOwner);
    this._create = create;
  }

  /**
   * Creates a new CAEX object and appends it to already existing elements in this sequence
   * (`Append()`), optionally with attribute (or child element) values given as tuples
   * `[name, value]` (`Append(params (string Name, object Value)[])`).
   */
  append(...attributeValueTuples: NameValueTuple[]): TW {
    if (attributeValueTuples.length === 0) {
      const xElement = this.createElement(this.owner!) ?? throwCouldNotAdd(this);
      if (this.exists) {
        T.AddCmd.addSibling(this.lastElement!, xElement, true);
      } else {
        T.InsertCmd.insertElement(this.owner!, xElement);
      }
      const val = this.createCaexWrapper(xElement);
      const result = val;
      if (val.associatedCAEXDocument == null) {
        val.associatedCAEXDocument = this.caexOwner?.caexDocument ?? null;
      }
      return result;
    }
    const xElement = this.createElement(this.owner!) ?? throwCouldNotAdd(this);
    const manager = T.CAEXDocument.amlSchemaManager(this.owner!)!;
    const list = from<string>(manager.attributeNames(this.owner!.name, xElement.name)).toList();
    const source = from<XName>(T.CAEXDocument.amlSchemaManager(this.owner!)!.childElementNames(this.owner!.name, xElement.name, true)).toList();
    for (let i = 0; i < attributeValueTuples.length; i++) {
      const [name, value] = tupleParts(attributeValueTuples[i]!);
      if (list.includes(name)) {
        xElement.setAttributeValue(name, value);
      } else if (source.some((e) => e.localName === name)) {
        xElement.setElementValue(XmlCAEXSchema.xName(this.owner!, name), value);
      }
    }
    if (this.exists) {
      T.AddCmd.addSibling(this.lastElement!, xElement, true);
    } else {
      T.InsertCmd.insertElement(this.owner!, xElement);
    }
    const val = this.createCaexWrapper(xElement);
    const result = val;
    if (val.associatedCAEXDocument == null) {
      val.associatedCAEXDocument = this.caexOwner?.caexDocument ?? null;
    }
    return result;
  }

  /** Gets the CAEX object at the specified index (throws ArgumentOutOfRangeException if none). */
  at(index: number): TW {
    return this.createCaexWrapper(from(this.elements).elementAt(index));
  }

  /** Gets the enumerator for this sequence. */
  override [Symbol.iterator](): Iterator<TW> {
    return this.caexElements[Symbol.iterator]();
  }

  /**
   * Gets the index of the specified CAEX object in this sequence (`IndexOf(T)`), or of the XML
   * element (`IndexOf(XElement)`, protected in C#).
   */
  override indexOf(caexObject: TW | ICAEXWrapper | XElement | null): number {
    if (caexObject instanceof XElement) {
      return super.indexOf(caexObject);
    }
    return super.indexOf(caexObject?.node ?? null);
  }

  /**
   * Inserts the specified CAEX object into this sequence, as the first (default) or last item.
   * Returns the inserted CAEX object (a copy, if the object already belongs to a sequence).
   * @param caexObject the CAEX object.
   * @param asFirst if `true` (default) prepended, otherwise appended.
   * @param asIs if `true` inserted without any changes to names, IDs and ID references.
   */
  insert(caexObject: TW | null, asFirst = true, asIs = false): TW | null {
    if ((caexObject?.node ?? null) == null) {
      return null;
    }
    const element = asIs ? new XElement(caexObject!.node!) : this.copyToImport(caexObject!);
    if (this.exists) {
      if (asFirst) {
        const first = this.first;
        T.AddCmd.addSibling(this.firstElement!, element, false);
        const first2 = this.first;
        if (CAEXWrapper.equals(first, first2)) {
          return null;
        }
        return first2;
      }
      const last = this.last;
      T.AddCmd.addSibling(this.lastElement!, element, true);
      const last2 = this.last;
      if (CAEXWrapper.equals(last, last2)) {
        return null;
      }
      return last2;
    }
    T.InsertCmd.insertElement(this.owner!, element);
    return this.first;
  }

  /** @internal */
  appendRaw(xNode: XElement | null): boolean {
    if (xNode == null) {
      return false;
    }
    if (this.exists) {
      T.AddCmd.addSibling(this.lastElement!, xNode, true);
      return true;
    }
    T.InsertCmd.insertElement(this.owner!, xNode);
    return true;
  }

  /** Inserts the specified CAEX object into this sequence at the defined index. */
  insertAt(index: number, caexObject: TW | null): TW | null {
    let result: TW | null;
    if ((caexObject?.node ?? null) == null) {
      result = null;
      return result;
    }
    const element = this.copyToImport(caexObject!);
    const val = this.item(index);
    if (val === null || !val.exists) {
      return this.insert(caexObject, false);
    }
    T.AddCmd.addSibling(val.node!, element, false);
    const prev = val.node!.previousNode;
    if (prev !== null && !(prev instanceof XElement)) {
      throw new InvalidCastException(`Unable to cast object of type '${prev.constructor.name}' to type 'System.Xml.Linq.XElement'.`);
    }
    const result2 = (result = this.createCaexWrapper(prev as XElement | null));
    if (result.associatedCAEXDocument == null) {
      result.associatedCAEXDocument = this.caexOwner?.caexDocument ?? null;
    }
    return result2;
  }

  /** Moves the CAEX object at the specified index to a new location in the collection. */
  move(oldIndex: number, newIndex: number): void {
    const val = this.item(oldIndex);
    const val2 = this.item(newIndex);
    if (!CAEXWrapper.equals(val2, null) && !CAEXWrapper.equals(val, null)) {
      T.MoveCmd.move(val!.node!, val2!.node!, oldIndex < newIndex);
    }
  }

  /**
   * Creates a new CAEX object and prepends it to already existing elements (`Prepend()`),
   * optionally with attribute values given as tuples `[name, value]`.
   */
  prepend(...attributeValueTuples: NameValueTuple[]): TW {
    if (attributeValueTuples.length === 0) {
      if (!this.exists) {
        return this.append();
      }
      const xElement = this.createElement(this.owner!) ?? throwCouldNotAdd(this);
      T.AddCmd.addSibling(this.firstElement!, xElement, false);
      const val = this.createCaexWrapper(xElement);
      const result = val;
      if (val.associatedCAEXDocument == null) {
        val.associatedCAEXDocument = this.caexOwner?.caexDocument ?? null;
      }
      return result;
    }
    if (!this.exists) {
      return this.append(...attributeValueTuples);
    }
    const xElement = this.createElement(this.owner!) ?? throwCouldNotAdd(this);
    const list = from<string>(T.CAEXDocument.amlSchemaManager(this.owner!)!.attributeNames(this.owner!.name, xElement.name)).toList();
    for (let i = 0; i < attributeValueTuples.length; i++) {
      const [text, value] = tupleParts(attributeValueTuples[i]!);
      if (list.includes(text)) {
        xElement.setAttributeValue(text, value);
      }
    }
    T.AddCmd.addSibling(this.firstElement!, xElement, false);
    const val = this.createCaexWrapper(xElement);
    const result = val;
    if (val.associatedCAEXDocument == null) {
      val.associatedCAEXDocument = this.caexOwner?.caexDocument ?? null;
    }
    return result;
  }

  /** Removes the provided CAEX object from this sequence. */
  removeElement(caexObject: TW): void {
    this.remove(caexObject.node);
  }

  /**
   * @internal Creates a CAEXWrapper for the provided node by invoking the constructor function.
   * Can be overridden if a direct constructor can be called.
   */
  createCaexWrapper(node: XElement | null): TW {
    return this._create(node as XElement);
  }

  /**
   * @internal Uses the schema manager to create a new sequence member. Can be overridden if the
   * requirements to create a schema conform element are known.
   */
  createElement(owner: XElement): XElement | null {
    return T.CAEXDocument.amlSchemaManager(owner)!.createElement(owner.name, this.elementName);
  }

  /** @internal Returns `{ redefinedAlias }` (C# out parameter). */
  createExternalReference(alias: string | null, path: string | null): { redefinedAlias: string | null } {
    let redefinedAlias = alias;
    if (isNullOrEmpty(path)) {
      return { redefinedAlias };
    }
    const externalReferenceType: ExternalReferenceType | null = this.caexOwner.caexDocument!.caexFile!.externalReference.item({ name: 'Alias', value: alias });
    const externalReferenceType2: ExternalReferenceType | null = this.caexOwner.caexDocument!.caexFile!.externalReference.item({ name: 'Path', value: path });
    if (!CAEXWrapper.equals(externalReferenceType, null)) {
      if (!(path === externalReferenceType!.path)) {
        if (!CAEXWrapper.equals(externalReferenceType2, null)) {
          redefinedAlias = externalReferenceType2!.alias;
        } else {
          redefinedAlias = this.createUniqueAlias(alias);
        }
      }
    } else if (!CAEXWrapper.equals(externalReferenceType2, null)) {
      redefinedAlias = externalReferenceType2!.alias;
    } else {
      this.caexOwner.caexDocument!.caexFile!.externalReference.append(['Alias', alias], ['Path', path]);
    }
    return { redefinedAlias };
  }

  /** @internal */
  import(caexObject: TW | null, name: string | null, withSubclasses: boolean): TW | null {
    void name;
    if ((caexObject?.node ?? null) == null) {
      return null;
    }
    const element = this.copyToImport(caexObject!, true, withSubclasses);
    if (this.exists) {
      const last = this.last;
      T.AddCmd.addSibling(this.lastElement!, element, true);
      const last2 = this.last;
      if (CAEXWrapper.equals(last, last2)) {
        return null;
      }
      return last2;
    }
    T.InsertCmd.insertElement(this.owner!, element);
    return this.first;
  }

  private copyToImport(caexObject: TW, assignNewIds = true, addSubclasses = true): XElement {
    let insertedObject = caexObject;
    if (!CAEXWrapper.equals(caexObject.caexParent, null) || !addSubclasses) {
      insertedObject = caexObject.copy(true, assignNewIds, addSubclasses) as TW;
    }
    if (
      CAEXWrapper.equals(caexObject.caexParent, null) &&
      this.caexOwner.caexDocument != null &&
      this.caexOwner.caexDocument.transformToSchema(insertedObject.node!)
    ) {
      this.caexOwner.caexDocument.finalizeSchemaTransformation(insertedObject.node!);
    }
    if (this.caexOwner?.caexDocument == null || this.caexOwner.document === caexObject.document) {
      return insertedObject.node!;
    }
    if (!(insertedObject instanceof T.CAEXBasicObject) || ServiceLocator.externalReferenceResolverService == null) {
      return insertedObject.node!;
    }
    const cAEXBasicObject: CAEXBasicObject = insertedObject;
    const ext = ServiceLocator.externalReferenceResolverService.isExternal(this.caexOwner.caexDocument, caexObject.node!);
    let alias: string | null = ext.alias;
    if (!ext.result) {
      return insertedObject.node!;
    }
    for (const item of ServiceLocator.defaultQueryService.allElementsWithCAEXPathReference(cAEXBasicObject, null, true)) {
      const text = CAEXPathBuilder.aliasFromReference(item.key, CAEXBasicObjectExtensions.caexSchema(caexObject));
      if (!isNullOrEmpty(text)) {
        const externalReferenceType = CAEXDocumentExtensions.externalReferenceFromAlias(caexObject.caexDocument!, text);
        let redefinedAlias: string | null = text;
        if (!CAEXWrapper.equals(externalReferenceType, null)) {
          redefinedAlias = this.createExternalReference(text, externalReferenceType!.path).redefinedAlias;
        }
        if (!(text !== redefinedAlias)) {
          continue;
        }
        const text2 = CAEXPathBuilder.changeAlias(item.key, redefinedAlias, text);
        for (const item2 of item as Iterable<ICAEXReference>) {
          const element = item2 instanceof T.CAEXReference ? item2.element : null;
          if (CAEXWrapper.equals(item2.caexObject, null) && element != null) {
            T.SetAttributeValueCmd.setValue(element, toXName(item2.referenceAttributeName), text2);
          } else {
            item2.setValue(text2);
          }
        }
        continue;
      }
      if (this.isOwnerDefined && !CAEXWrapper.equals(CAEXDocumentExtensions.findByPath(this.caexOwner.caexDocument, item.key), null)) {
        continue;
      }
      const cAEXObject: CAEXObject | null = CAEXDocumentExtensions.findByPath(caexObject.caexDocument!, item.key);
      if (!CAEXWrapper.equals(cAEXObject, null)) {
        if (from<XElement>({ [Symbol.iterator]: () => cAEXObject!.node!.ancestors() }).any((a) => a === caexObject.node)) {
          continue;
        }
        const externalReferenceResolverService = ServiceLocator.externalReferenceResolverService;
        if (externalReferenceResolverService != null) {
          const ext2 = externalReferenceResolverService.isExternal(null as unknown as CAEXDocument, cAEXObject!.node!);
          alias = ext2.alias;
          if (ext2.result) {
            const path2 = ext2.path;
            const redefinedAlias2 = this.createExternalReference(alias, path2).redefinedAlias;
            // C# $"{redefinedAlias2}{64}{item.Key}": the number 64, not '@'.
            const text3 = `${redefinedAlias2 ?? ''}${64}${item.key ?? ''}`;
            for (const item3 of item as Iterable<ICAEXReference>) {
              const element2 = item3 instanceof T.CAEXReference ? item3.element : null;
              if (CAEXWrapper.equals(item3.caexObject, null) && element2 != null) {
                T.SetAttributeValueCmd.setValue(element2, toXName(item3.referenceAttributeName), text3);
              } else {
                item3.setValue(text3);
              }
            }
            continue;
          }
        }
      } else {
        const parent = item.first().caexObject?.caexParent ?? null;
        if (
          (parent != null ? CAEXBasicObjectExtensions.name_(parent) : null) === item.key &&
          from<XElement>({ [Symbol.iterator]: () => item.first().caexObject!.node!.parent!.ancestorsAndSelf() }).any(
            (a) => a === insertedObject.node,
          )
        ) {
          continue;
        }
      }
      let cAEXObject2: CAEXObject | null = CAEXDocumentExtensions.findByPath(caexObject.caexDocument!, item.key);
      if (CAEXWrapper.equals(cAEXObject2, null)) {
        if (item.first().caexObject instanceof T.AttributeType && CAEXPathBuilder.isAttributeReference(caexObject.caexDocument, item.key)) {
          continue;
        }
        const p = caexObject.caexParent;
        cAEXObject2 = p instanceof T.CAEXObject ? p : null;
      }
      const value = !CAEXWrapper.equals(cAEXObject2, null) ? (alias ?? '') + '@' + (cAEXObject2!.caexPath() ?? '') : item.key;
      for (const item4 of item as Iterable<ICAEXReference>) {
        item4.setValue(value);
      }
    }
    return cAEXBasicObject.node!;
  }

  private createUniqueAlias(alias: string | null): string {
    let num = 0;
    let redefinedAlias: string;
    while (true) {
      redefinedAlias = `${alias ?? ''}${num}`;
      const candidate = redefinedAlias;
      if (from<ExternalReferenceType>(this.caexOwner.caexDocument!.caexFile!.externalReference).all((e) => e.alias !== candidate)) {
        break;
      }
      num++;
    }
    return redefinedAlias;
  }
}

function throwCouldNotAdd(seq: CAEXSequence<CAEXWrapper>): never {
  throw newException(`Could not add ${seq.elementName} to ${seq.owner!.name}`);
}

registerInterfaces(CAEXSequence, 'ICAEXSequence');

T.CAEXSequence = CAEXSequence;
