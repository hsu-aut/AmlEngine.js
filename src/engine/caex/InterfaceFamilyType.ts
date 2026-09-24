// Port of Aml.Engine.CAEX.InterfaceFamilyType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces, implementsInterface } from '../interfaces.js';
import { from, type Enumerable } from '../../system/linq.js';
import { InvalidCastException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { XElement } from '../../xml/index.js';
import { InterfaceClassType } from './InterfaceClassType.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from './extensions/CAEXDocumentExtensions.js';
import { CAEXElementFactory } from './extensions/CAEXElementFactory.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { CollectionExtensions } from './extensions/CollectionExtensions.js';
import { InstanceExtensions } from './extensions/InstanceExtensions.js';
import { ObjectWithBaseClass } from './extensions/ObjectWithBaseClass.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { XmlOperation } from '../xmlext/XmlOperation.js';
import type { AttributeType } from './AttributeType.js';
import type { CAEXDocument } from './CAEXDocument.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';

type Ctor<C = unknown> = abstract new (...args: never[]) => C;

/** `typeof(type).IsAssignableFrom(typeof(c))` for classes. */
function isAssignableFrom(type: Ctor, c: Ctor): boolean {
  return type === c || c.prototype instanceof type;
}

/**
 * Wrapper for the CAEX element 'InterfaceClass' that allows definition of child InterfaceClasses
 * within the class hierarchy.
 */
export class InterfaceFamilyType extends InterfaceClassType implements Iterable<InterfaceFamilyType> {
  private _interfaceClass: CAEXSequenceOfCAEXObjectsWithReference<InterfaceFamilyType> | null = null;

  /** Gets the attributes of this class and all inherited attributes of base classes. */
  get attributeAndInherited(): Enumerable<AttributeType> {
    return from(XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Attribute', new T.AttributeValueComparer('Name'))).select(
      (a) => new T.AttributeType(a),
    );
  }

  /** Gets and sets the base class of this InterfaceClass. */
  override get baseClass(): InterfaceFamilyType | null {
    const parent = this.caexParent;
    if (isNullOrEmpty(this.refBaseClassPath) || !(this.refBaseClassPath === ((parent instanceof T.InterfaceFamilyType ? parent : null)?.name ?? null))) {
      const found = CAEXDocumentExtensions.findByPath(this.caexDocument, this.refBaseClassPath, true, T.InterfaceFamilyType);
      return found instanceof T.InterfaceFamilyType ? found : null;
    }
    return this.caexParent as InterfaceFamilyType;
  }

  override set baseClass(value: InterfaceFamilyType | null) {
    this.refBaseClassPath = ObjectWithBaseClass.baseClassReference(this, value);
  }

  /** Gets the external interfaces of this class and all inherited interfaces of base classes. */
  get externalInterfaceAndInherited(): Enumerable<ExternalInterfaceType> {
    return from(XmlOperation.existingElementsFromBaseClassAndSelf(this, 'ExternalInterface', new T.AttributeValueComparer('Name'))).select(
      (a) => new T.ExternalInterfaceType(a),
    );
  }

  /** Gets the collection of child InterfaceClass objects. */
  get interfaceClass(): CAEXSequenceOfCAEXObjectsWithReference<InterfaceFamilyType> {
    return (
      this._interfaceClass ??
      (this._interfaceClass = new T.CAEXSequenceOfCAEXObjectsWithReference<InterfaceFamilyType>(
        this.node,
        'InterfaceClass',
        InterfaceFamilyType.Constructor,
        () => this,
      ))
    );
  }

  /** Gets and sets the RefBaseClassPath attribute (validated against the class hierarchy). */
  override get refBaseClassPath(): string | null {
    return super.refBaseClassPath;
  }

  override set refBaseClassPath(value: string | null) {
    super.refBaseClassPath = ObjectWithBaseClass.baseClassReference(this, value);
  }

  /** Gets the name of the referenced base class. */
  get referencedClassName(): string {
    // C# casts to IClassWithBaseClassReference to select that extension overload.
    return ObjectWithBaseClass.referencedClassName(this);
  }

  /** The constructor function for the InterfaceFamilyType. */
  static get Constructor(): (n: XElement | null) => InterfaceFamilyType {
    return (n) => new InterfaceFamilyType(n);
  }

  /**
   * Initializes a new instance.
   * @param node An 'InterfaceClass' XML node.
   */
  constructor(node: XElement | null) {
    super(node);
  }

  /** Gets the CAEXSequence owned by this CAEX object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return !(caexObject instanceof T.InterfaceFamilyType) ? super.caexSequence(caexObject) : this.interfaceClass;
  }

  /** C# `Container<T>()`: the sequence for elements of the given type. */
  override container<TW extends CAEXWrapper>(type: Ctor<TW>): CAEXSequence<TW> | null {
    if (!isAssignableFrom(type, T.InterfaceFamilyType)) {
      return super.container(type);
    }
    // `InterfaceClass as CAEXSequence<T>`: generic classes are invariant in C#.
    return (type as Ctor) === T.InterfaceFamilyType ? (this.interfaceClass as unknown as CAEXSequence<TW>) : null;
  }

  private createClassInstanceInDocument(): ExternalInterfaceType {
    const cAEXDocument = this.caexDocument;
    ServiceLocator.undoRedoService?.pause(cAEXDocument);
    T.CaexCommand.isSilent = true;
    const externalInterfaceType = CAEXElementFactory.create(cAEXDocument!, T.ExternalInterfaceType)!;
    externalInterfaceType.name = this.name;
    externalInterfaceType.baseClass = this;
    for (const item of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Attribute', new T.AttributeValueComparer('Name'))) {
      externalInterfaceType.attribute.appendRaw(new XElement(item));
    }
    for (const item2 of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'ExternalInterface', new T.AttributeValueComparer('Name'))) {
      externalInterfaceType.externalInterface.appendRaw(new XElement(item2));
    }
    XmlOperation.makeUnique(externalInterfaceType.node!);
    ServiceLocator.undoRedoService?.resume(cAEXDocument);
    T.CaexCommand.isSilent = false;
    return externalInterfaceType;
  }

  /**
   * Creates an ExternalInterface instance of this InterfaceClass in the target document (default:
   * the document of this class).
   */
  createClassInstance(targetDocument: CAEXDocument | null = null): ExternalInterfaceType {
    if (targetDocument == null) {
      targetDocument = this.caexDocument;
    }
    if (targetDocument === this.caexDocument) {
      return this.createClassInstanceInDocument();
    }
    ServiceLocator.undoRedoService?.pause(targetDocument);
    T.CaexCommand.isSilent = true;
    XmlOperation.setUpdateReference(false);
    const externalInterfaceType = CAEXElementFactory.create(targetDocument!, T.ExternalInterfaceType)!;
    externalInterfaceType.name = this.name;
    externalInterfaceType.baseClass = this;
    for (const item of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Attribute', new T.AttributeValueComparer('Name'))) {
      const attributeType = new T.AttributeType(item);
      externalInterfaceType.attribute.import(attributeType, attributeType.name, false);
    }
    InstanceExtensions.importInterfacesToInstance(externalInterfaceType, this);
    InstanceExtensions.mapIDReferences(XmlOperation.idMap, externalInterfaceType, targetDocument);
    XmlOperation.setUpdateReference(true);
    ServiceLocator.undoRedoService?.resume(targetDocument);
    T.CaexCommand.isSilent = false;
    return externalInterfaceType;
  }

  /** Enumeration of the child InterfaceClass objects. */
  [Symbol.iterator](): Iterator<InterfaceFamilyType> {
    return this.interfaceClass[Symbol.iterator]();
  }

  /**
   * Gets the reference hierarchy (this class and its base classes). With a type argument this is
   * the obsolete generic overload `GetReferenceHierarchy<T>(bool)` returning a `Queue<T>` (an
   * array in FIFO order); the type is a class constructor or a C# interface name.
   */
  getReferenceHierarchy(includeExternals?: boolean): Iterable<InterfaceFamilyType>;
  getReferenceHierarchy<TC>(includeExternals: boolean, type: Ctor<TC> | string): TC[];
  getReferenceHierarchy<TC>(includeExternals = true, type?: Ctor<TC> | string): Iterable<InterfaceFamilyType> | TC[] {
    if (type !== undefined) {
      return [...this.getReferenceHierarchy(includeExternals)].map((x) => castTo(x, type));
    }
    if (!includeExternals && CAEXPathBuilder.isReferenceWithAlias(this.refBaseClassPath, CAEXBasicObjectExtensions.caexSchema(this))) {
      return [this];
    }
    if (!T.CAEXWrapper.equals(this.baseClass, null)) {
      return from(CollectionExtensions.yield(this) as Iterable<InterfaceFamilyType>).concat(this.baseClass!.getReferenceHierarchy(includeExternals));
    }
    return CollectionExtensions.yield(this) as Iterable<InterfaceFamilyType>;
  }

  /**
   * Inserts the specified CAEX object in its associated sequence (`Insert(CAEXWrapper, bool, bool)`)
   * or at the given position (`Insert(int, CAEXWrapper)`). Defines the InterfaceClass sequence.
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(arg0: CAEXWrapper | number | null, arg1?: boolean | CAEXWrapper | null, arg2?: boolean): boolean {
    if (typeof arg0 === 'number') {
      const caexObject = (arg1 ?? null) as CAEXWrapper | null;
      if (caexObject instanceof T.InterfaceFamilyType) {
        return this.interfaceClass.insertAt(arg0, caexObject) != null;
      }
      return super.insert(arg0, caexObject);
    }
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (arg0 instanceof T.InterfaceFamilyType) {
      return this.interfaceClass.insert(arg0, asFirst, asIs) != null;
    }
    return super.insert(arg0, asFirst, asIs);
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (caexObject instanceof T.InterfaceFamilyType) {
      return this.interfaceClass.import(caexObject, name, withSubclasses);
    }
    return super.import(caexObject, name, withSubclasses);
  }

  /**
   * Removes this InterfaceClass. With `removeRelations`, references of derived classes and
   * ExternalInterfaces are removed as well.
   */
  override remove(removeRelations = false): void {
    if (removeRelations) {
      for (const item of [...ServiceLocator.queryService.elementsWithCAEXPathReference(this.caexDocument!.caexFile, this.caexPath())]) {
        const caexObject = item.caexObject;
        if (!(caexObject instanceof T.InterfaceFamilyType)) {
          if (caexObject instanceof T.ExternalInterfaceType) {
            caexObject.interfaceClass = null;
          }
        } else {
          caexObject.baseClass = null;
        }
      }
    }
    super.remove(removeRelations);
  }
}

/** `Cast<T>()` of LINQ: a class constructor or a C# interface name; InvalidCastException otherwise. */
function castTo<TC>(x: unknown, type: Ctor<TC> | string): TC {
  const ok = typeof type === 'string' ? implementsInterface(x, type) : x instanceof type;
  if (x !== null && !ok) {
    throw new InvalidCastException(`Unable to cast object of type '${(x as object).constructor.name}' to type '${typeof type === 'string' ? type : type.name}'.`);
  }
  return x as TC;
}

registerInterfaces(
  InterfaceFamilyType,
  'IInstantiable_1',
  'IInstantiable',
  'ICAEXObject',
  'ICAEXBasicObject',
  'ICAEXWrapper',
  'IXMLWrapper',
  'IInterfaceClassContainer',
  'IObjectWithInheritedAttributes',
  'IObjectWithAttributes',
  'IClassWithBaseClassReference_1',
  'IClassWithBaseClassReference',
  'IClassWithExternalInterface',
  'IObjectWithExternalInterfaceAndInherited',
  'IObjectWithExternalInterface',
);

T.InterfaceFamilyType = InterfaceFamilyType;
