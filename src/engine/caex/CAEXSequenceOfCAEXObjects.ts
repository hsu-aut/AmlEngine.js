// Port of Aml.Engine.CAEX.CAEXSequenceOfCAEXObjects<T> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { implementsInterface } from '../interfaces.js';
import { from } from '../../system/linq.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { ObjectWithBaseClass } from './extensions/ObjectWithBaseClass.js';
import { CAEXSequence } from './CAEXSequence.js';
import { NamedElementSequence } from './NamedElementSequence.js';
import { CAEXWrapper } from './CAEXWrapper.js';
import type { CAEXObject } from './CAEXObject.js';
import type { AttributeValuePair, NameValueTuple } from './ICAEXSequence.js';
import type { IClassWithBaseClassReference } from './IClassWithBaseClassReference.js';
import type { ICAEXReference } from '../services/interfaces/ICAEXReference.js';

type Ctor<C> = abstract new (...args: never[]) => C;

/**
 * A sequence of CAEX objects (objects with a Name), with access by name and by name path.
 *
 * Constructor overloads of C#: `(owner, caexName, create, getCAEXOwner?)` and
 * `(owner, caexName, create, condition, getCAEXOwner?)`. A fourth argument that is a function
 * with a parameter is the condition; a function without parameters is getCAEXOwner.
 */
export class CAEXSequenceOfCAEXObjects<TW extends CAEXObject> extends CAEXSequence<TW> {
  /**
   * Indexers:
   * - `item(i)`: by position (CAEXSequence);
   * - `item({ name, value })`: by attribute value pair (CAEXSequence);
   * - `item(name)`: the CAEX object with the specified name; if none exists and the name is a
   *   path, the object is searched along the path (virtual `this[string name]`);
   * - `item(...names)` or `item(names)`: the object at the end of the path of names
   *   (`this[params string[] caexObjectNames]`).
   */
  override item(i: number): TW | null;
  override item(attributeValuePair: AttributeValuePair): TW | null;
  override item(name: string | null): TW | null;
  override item(caexObjectNames: readonly string[] | null): TW | null;
  override item(...caexObjectNames: string[]): TW | null;
  override item(...args: unknown[]): TW | null {
    if (args.length === 1) {
      const a = args[0];
      if (typeof a === 'number') {
        return super.item(a);
      }
      if (typeof a === 'string' || a === null || a === undefined) {
        return this.itemByName((a ?? null) as string | null);
      }
      if (Array.isArray(a)) {
        return this.itemByNames(a as string[]);
      }
      return super.item(a as AttributeValuePair);
    }
    return this.itemByNames(args as string[]);
  }

  /** `this[string name]` (virtual in C#; subclasses override `item` for strings). */
  protected itemByName(name: string | null): TW | null {
    const xElement = from(this.elements).firstOrDefault((e) => (e.attribute('Name')?.value ?? null) === name);
    if (xElement != null) {
      return this.createCaexWrapper(xElement);
    }
    const array = from<string>(CAEXPathBuilder.pathPartObjectNames(name!, CAEXBasicObjectExtensions.caexSchema(this.caexOwner))).toArray();
    if (array.length !== 1) {
      return this.itemByNames(array);
    }
    return null;
  }

  /** `this[params string[] caexObjectNames]`. */
  private itemByNames(caexObjectNames: readonly string[] | null): TW | null {
    if (caexObjectNames == null || caexObjectNames.length === 0) {
      return null;
    }
    const val = this.item(caexObjectNames[0]!);
    if (!CAEXWrapper.equals(val, null)) {
      if (caexObjectNames.length !== 1) {
        // Container<T>(): the run time type argument is the class of the found object.
        const container = val!.container(val!.constructor as Ctor<TW>);
        const obj = container instanceof CAEXSequenceOfCAEXObjects ? (container as CAEXSequenceOfCAEXObjects<TW>) : null;
        if (obj == null) {
          return null;
        }
        return obj.itemByNames(caexObjectNames.slice(1));
      }
      return val;
    }
    return null;
  }

  constructor(owner: XElement | null, caexName: string, create: (e: XElement) => TW, getCAEXOwner?: (() => CAEXWrapper | null) | null);
  constructor(
    owner: XElement | null,
    caexName: string,
    create: (e: XElement) => TW,
    condition: (e: XElement) => boolean,
    getCAEXOwner?: (() => CAEXWrapper | null) | null,
  );
  constructor(
    owner: XElement | null,
    caexName: string,
    create: (e: XElement) => TW,
    arg3?: (() => CAEXWrapper | null) | ((e: XElement) => boolean) | null,
    arg4?: (() => CAEXWrapper | null) | null,
  ) {
    const withCondition = arg4 !== undefined || (typeof arg3 === 'function' && arg3.length > 0);
    super(owner, caexName, create, withCondition ? (arg4 ?? null) : ((arg3 as (() => CAEXWrapper | null) | null | undefined) ?? null));
    if (withCondition) {
      this.elementSelectionCondition = (arg3 as ((e: XElement) => boolean) | null | undefined) ?? null;
    }
  }

  /**
   * `Append()`, `Append(params (string Name, object Value)[])` (CAEXSequence) and
   * `Append(string name)`: creates a new CAEX object with the (unique) name and appends it.
   */
  override append(name: string | null): TW;
  override append(...attributeValueTuples: NameValueTuple[]): TW;
  override append(...args: (string | null | NameValueTuple)[]): TW {
    if (args.length === 1 && (typeof args[0] === 'string' || args[0] === null)) {
      const name = args[0] as string | null;
      const val = this.append();
      this.makeUniqueName(val, null, name);
      return val;
    }
    return super.append(...(args as NameValueTuple[]));
  }

  /**
   * Inserts the specified CAEX object into this sequence (see CAEXSequence.insert); the name is
   * made unique unless `asIs` is set.
   */
  override insert(sourceCAEXObject: TW | null, asFirst = true, asIs = false): TW | null {
    if (CAEXWrapper.equals(sourceCAEXObject, null)) {
      throw new ArgumentNullException('sourceCAEXObject');
    }
    const val = super.insert(sourceCAEXObject, asFirst, asIs);
    if (!asIs) {
      this.makeUniqueName(val!, sourceCAEXObject, null);
    }
    return val;
  }

  /** @internal */
  override import(sourceCAEXObject: TW | null, name: string | null, withSubclasses: boolean): TW | null {
    if (CAEXWrapper.equals(sourceCAEXObject, null)) {
      throw new ArgumentNullException('sourceCAEXObject');
    }
    const val = super.import(sourceCAEXObject, name, withSubclasses);
    this.makeUniqueName(val!, sourceCAEXObject, name);
    return val;
  }

  /**
   * `Prepend()`, `Prepend(params (string Name, object Value)[])` (CAEXSequence) and
   * `Prepend(string name)`: creates a new CAEX object with the (unique) name and prepends it.
   */
  override prepend(name: string | null): TW;
  override prepend(...attributeValueTuples: NameValueTuple[]): TW;
  override prepend(...args: (string | null | NameValueTuple)[]): TW {
    if (args.length === 1 && (typeof args[0] === 'string' || args[0] === null)) {
      const name = args[0] as string | null;
      const val = this.prepend();
      this.makeUniqueName(val, null, name);
      return val;
    }
    return super.prepend(...(args as NameValueTuple[]));
  }

  /** @internal */
  override createElement(owner: XElement | null): XElement | null {
    if (owner == null) {
      throw new ArgumentNullException('owner');
    }
    const xElement = super.createElement(owner)!;
    xElement.setAttributeValue('Name', ServiceLocator.uniqueNameService?.uniqueCAEXName(owner, this.elementName.localName) ?? '');
    return xElement;
  }

  private static elementNameShallBeUnique(node: XElement): boolean {
    if (
      XmlCAEXSchema.caexSchema(node) !== T.CAEXDocument.CAEXSchema.CAEX2_15 &&
      !XmlCAEXSchema.isCAEXClass(node) &&
      !XmlCAEXSchema.isFacet(node)
    ) {
      return XmlCAEXSchema.isBasicAttribute(node);
    }
    return true;
  }

  private static changeName<TC extends CAEXObject>(insertedCAEXObject: TC, sourceCAEXObject: TC | null, name: string | null): void {
    const oldName = sourceCAEXObject?.name ?? null;
    const oldPath = sourceCAEXObject?.caexPath() ?? null;
    insertedCAEXObject.name = name;
    if (!CAEXWrapper.equals(sourceCAEXObject, null) && !isNullOrEmpty(sourceCAEXObject!.name)) {
      CAEXSequenceOfCAEXObjects.changeReferences(insertedCAEXObject, oldPath, oldName);
    }
  }

  /** @internal */
  static changeReferences(copiedObject: CAEXObject, oldPath: string | null, oldName: string | null): void {
    const newPathStart = copiedObject.caexPath();
    for (const item of ServiceLocator.queryService.allElementsWithCAEXPathReference(copiedObject)) {
      if (isNullOrEmpty(item.key)) {
        continue;
      }
      if (oldPath === null) {
        // string.StartsWith(null)
        throw new ArgumentNullException('value');
      }
      if (item.key.startsWith(oldPath)) {
        for (const item2 of item as Iterable<ICAEXReference>) {
          item2.setValue(CAEXPathBuilder.changePathStart(item2.referenceAttributeValue as string, oldPath, newPathStart));
        }
      } else {
        if (!(item.key === oldName)) {
          continue;
        }
        for (const item3 of from<ICAEXReference>(item as Iterable<ICAEXReference>).where((r) => r.caexObject!.caexParent!.equals(copiedObject))) {
          item3.setValue(copiedObject.name);
        }
      }
    }
  }

  private makeUniqueName(insertedCAEXObject: TW, sourceCAEXObject: TW | null, name: string | null): void {
    if (isNullOrEmpty(name)) {
      name = insertedCAEXObject.name;
    } else {
      insertedCAEXObject.name = name;
    }
    if (
      ServiceLocator.uniqueNameService != null &&
      (NamedElementSequence.uniqueName || CAEXSequenceOfCAEXObjects.elementNameShallBeUnique(insertedCAEXObject.node!))
    ) {
      if (isNullOrEmpty(name)) {
        name = insertedCAEXObject.tagName;
        CAEXSequenceOfCAEXObjects.changeName(insertedCAEXObject, sourceCAEXObject, name);
      }
      const caexOwner = this.caexOwner;
      if (implementsInterface(caexOwner, 'IClassWithBaseClassReference')) {
        const classWithBaseClass = caexOwner as unknown as IClassWithBaseClassReference;
        // InheritedElements<T>(): the run time type argument is the class of the inserted object.
        const source = from<TW>(
          ObjectWithBaseClass.inheritedElements<TW>(classWithBaseClass, true, insertedCAEXObject.constructor as Ctor<TW>),
        ).except([insertedCAEXObject]);
        CAEXSequenceOfCAEXObjects.changeName(
          insertedCAEXObject,
          sourceCAEXObject,
          ServiceLocator.uniqueNameService.uniqueCAEXName(
            source.select((e) => e.node!),
            this.elementName.localName,
            name as string,
          ),
        );
      } else if (!ServiceLocator.uniqueNameService.isUniqueCAEXName(insertedCAEXObject.node!)) {
        CAEXSequenceOfCAEXObjects.changeName(
          insertedCAEXObject,
          sourceCAEXObject,
          ServiceLocator.uniqueNameService.uniqueCAEXName(this.owner!, this.elementName.localName, name as string),
        );
      } else {
        CAEXSequenceOfCAEXObjects.changeName(insertedCAEXObject, sourceCAEXObject, name);
      }
    } else {
      if (isNullOrEmpty(name)) {
        name = this.elementName.localName;
      }
      insertedCAEXObject.name = name;
    }
  }
}

T.CAEXSequenceOfCAEXObjects = CAEXSequenceOfCAEXObjects;
