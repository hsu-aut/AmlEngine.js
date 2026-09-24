// Port of Aml.Engine.CAEX.RoleFamilyType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces, implementsInterface } from '../interfaces.js';
import { from, type Enumerable } from '../../system/linq.js';
import { InvalidCastException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { XElement } from '../../xml/index.js';
import { RoleClassType } from './RoleClassType.js';
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
import type { RoleRequirementsType } from './RoleRequirementsType.js';
import type { SupportedRoleClassType } from './SupportedRoleClassType.js';

type Ctor<C = unknown> = abstract new (...args: never[]) => C;

/** `typeof(type).IsAssignableFrom(typeof(c))` for classes. */
function isAssignableFrom(type: Ctor, c: Ctor): boolean {
  return type === c || c.prototype instanceof type;
}

/**
 * Wrapper for the CAEX element 'RoleClass' that allows definition of child RoleClasses within the
 * class hierarchy.
 */
export class RoleFamilyType extends RoleClassType implements Iterable<RoleFamilyType> {
  private _elements: CAEXSequenceOfCAEXObjectsWithReference<RoleFamilyType> | null = null;

  /** Gets the attributes of this class and all inherited attributes of base classes. */
  get attributeAndInherited(): Enumerable<AttributeType> {
    return from(XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Attribute', new T.AttributeValueComparer('Name'))).select(
      (a) => new T.AttributeType(a),
    );
  }

  /** Gets and sets the base class of this RoleClass. */
  get baseClass(): RoleFamilyType | null {
    const parent = this.caexParent;
    if (isNullOrEmpty(this.refBaseClassPath) || !(this.refBaseClassPath === ((parent instanceof T.RoleFamilyType ? parent : null)?.name ?? null))) {
      const found = CAEXDocumentExtensions.findByPath(this.caexDocument, this.refBaseClassPath, true, T.RoleFamilyType);
      return found instanceof T.RoleFamilyType ? found : null;
    }
    return this.caexParent as RoleFamilyType;
  }

  set baseClass(value: RoleFamilyType | null) {
    this.refBaseClassPath = ObjectWithBaseClass.baseClassReference(this, value);
  }

  /** Gets the external interfaces of this class and all inherited interfaces of base classes. */
  get externalInterfaceAndInherited(): Enumerable<ExternalInterfaceType> {
    return from(XmlOperation.existingElementsFromBaseClassAndSelf(this, 'ExternalInterface', new T.AttributeValueComparer('Name'))).select(
      (a) => new T.ExternalInterfaceType(a),
    );
  }

  /** Gets and sets the RefBaseClassPath attribute. */
  get refBaseClassPath(): string | null {
    return this.getXAttributeValue(this.referenceAttributeName);
  }

  set refBaseClassPath(value: string | null) {
    if (!(this.refBaseClassPath === value)) {
      this.setXAttributeValue(this.referenceAttributeName, ObjectWithBaseClass.baseClassReference(this, value));
      this.raisePropertyChanged('RefBaseClassPath');
    }
  }

  /** Gets the name of the referenced base class. */
  get referencedClassName(): string {
    return ObjectWithBaseClass.referencedClassName(this);
  }

  /** Gets the collection of child RoleClass objects. */
  get roleClass(): CAEXSequenceOfCAEXObjectsWithReference<RoleFamilyType> {
    return (
      this._elements ??
      (this._elements = new T.CAEXSequenceOfCAEXObjectsWithReference<RoleFamilyType>(this.node, 'RoleClass', RoleFamilyType.Constructor, () => this))
    );
  }

  /** The constructor function for the RoleFamilyType. */
  static get Constructor(): (n: XElement | null) => RoleFamilyType {
    return (n) => new RoleFamilyType(n);
  }

  /**
   * Initializes a new instance.
   * @param roleClassNode A 'RoleClass' XML node.
   */
  constructor(roleClassNode: XElement | null) {
    super(roleClassNode);
  }

  /** Gets the CAEXSequence owned by this CAEX object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return !(caexObject instanceof T.RoleFamilyType) ? super.caexSequence(caexObject) : this.roleClass;
  }

  /** C# `Container<T>()`: the sequence for elements of the given type. */
  override container<TW extends CAEXWrapper>(type: Ctor<TW>): CAEXSequence<TW> | null {
    if (!isAssignableFrom(type, T.RoleFamilyType)) {
      return super.container(type);
    }
    // `RoleClass as CAEXSequence<T>`: generic classes are invariant in C#.
    return (type as Ctor) === T.RoleFamilyType ? (this.roleClass as unknown as CAEXSequence<TW>) : null;
  }

  private createClassInstanceInDocument(): RoleRequirementsType {
    const cAEXDocument = this.caexDocument;
    ServiceLocator.undoRedoService?.pause(cAEXDocument);
    T.CaexCommand.isSilent = true;
    const roleRequirementsType = CAEXElementFactory.create(cAEXDocument!, T.RoleRequirementsType)!;
    roleRequirementsType.roleClass = this;
    for (const item of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Attribute', new T.AttributeValueComparer('Name'))) {
      roleRequirementsType.attribute.appendRaw(new XElement(item));
    }
    for (const item2 of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'ExternalInterface', new T.AttributeValueComparer('Name'))) {
      roleRequirementsType.externalInterface.appendRaw(new XElement(item2));
    }
    XmlOperation.makeUnique(roleRequirementsType.node!);
    ServiceLocator.undoRedoService?.resume(cAEXDocument);
    T.CaexCommand.isSilent = false;
    return roleRequirementsType;
  }

  /**
   * Creates a RoleRequirements instance of this RoleClass in the target document (default: the
   * document of this class).
   */
  createClassInstance(targetDocument: CAEXDocument | null = null): RoleRequirementsType {
    if (targetDocument == null) {
      targetDocument = this.caexDocument;
    }
    if (targetDocument === this.caexDocument) {
      return this.createClassInstanceInDocument();
    }
    ServiceLocator.undoRedoService?.pause(targetDocument);
    T.CaexCommand.isSilent = true;
    const roleRequirementsType = CAEXElementFactory.create(targetDocument!, T.RoleRequirementsType)!;
    roleRequirementsType.roleClass = this;
    for (const item of ObjectWithBaseClass.inheritedElements(this, true, T.AttributeType)) {
      roleRequirementsType.attribute.import(item, item.name, false);
    }
    InstanceExtensions.importInterfacesToInstance(roleRequirementsType, this);
    ServiceLocator.undoRedoService?.resume(targetDocument);
    T.CaexCommand.isSilent = false;
    return roleRequirementsType;
  }

  /** Creates a SupportedRoleClass referencing this RoleClass. */
  createSupportedRoleClass(): SupportedRoleClassType {
    const num = ServiceLocator.undoRedoService?.beginTransaction(CAEXBasicObjectExtensions.caexDocument(this), 'Create SupportedRoleClass') ?? false;
    const supportedRoleClassType = CAEXElementFactory.create(CAEXBasicObjectExtensions.caexDocument(this)!, T.SupportedRoleClassType)!;
    supportedRoleClassType.roleClass = this;
    if (num) {
      ServiceLocator.undoRedoService?.endTransaction(CAEXBasicObjectExtensions.caexDocument(this));
    }
    return supportedRoleClassType;
  }

  /** Enumeration of the child RoleClass objects. */
  [Symbol.iterator](): Iterator<RoleFamilyType> {
    return this.roleClass[Symbol.iterator]();
  }

  /**
   * Gets the reference hierarchy (this class and its base classes). With a type argument this is
   * the obsolete generic overload `GetReferenceHierarchy<T>(bool)` returning a `Queue<T>` (an
   * array in FIFO order); the type is a class constructor or a C# interface name.
   */
  getReferenceHierarchy(includeExternals?: boolean): Iterable<RoleFamilyType>;
  getReferenceHierarchy<TC>(includeExternals: boolean, type: Ctor<TC> | string): TC[];
  getReferenceHierarchy<TC>(includeExternals = true, type?: Ctor<TC> | string): Iterable<RoleFamilyType> | TC[] {
    if (type !== undefined) {
      return [...this.getReferenceHierarchy(includeExternals)].map((x) => castTo(x, type));
    }
    if (!includeExternals && CAEXPathBuilder.isReferenceWithAlias(this.refBaseClassPath, CAEXBasicObjectExtensions.caexSchema(this))) {
      return [this];
    }
    if (!T.CAEXWrapper.equals(this.baseClass, null)) {
      return from(CollectionExtensions.yield(this) as Iterable<RoleFamilyType>).concat(this.baseClass!.getReferenceHierarchy(includeExternals));
    }
    return CollectionExtensions.yield(this) as Iterable<RoleFamilyType>;
  }

  /**
   * Inserts the specified CAEX object in its associated sequence (`Insert(CAEXWrapper, bool, bool)`)
   * or at the given position (`Insert(int, CAEXWrapper)`). Defines the RoleClass sequence.
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(arg0: CAEXWrapper | number | null, arg1?: boolean | CAEXWrapper | null, arg2?: boolean): boolean {
    if (typeof arg0 === 'number') {
      const caexObject = (arg1 ?? null) as CAEXWrapper | null;
      if (caexObject instanceof T.RoleFamilyType) {
        return this.roleClass.insertAt(arg0, caexObject) != null;
      }
      return super.insert(arg0, caexObject);
    }
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (arg0 instanceof T.RoleFamilyType) {
      return this.roleClass.insert(arg0, asFirst, asIs) != null;
    }
    return super.insert(arg0, asFirst, asIs);
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (caexObject instanceof T.RoleFamilyType) {
      return this.roleClass.import(caexObject, name, withSubclasses);
    }
    return super.import(caexObject, name, withSubclasses);
  }

  /**
   * Removes this RoleClass. With `removeRelations`, references of derived classes, RoleRequirements
   * and SupportedRoleClasses are removed as well.
   */
  override remove(removeRelations = false): void {
    if (removeRelations) {
      for (const item of [...ServiceLocator.queryService.elementsWithCAEXPathReference(this.caexDocument!.caexFile, this.caexPath())]) {
        const caexObject = item.caexObject;
        if (!(caexObject instanceof T.RoleFamilyType)) {
          if (!(caexObject instanceof T.RoleRequirementsType)) {
            if (caexObject instanceof T.SupportedRoleClassType) {
              caexObject.remove(true);
            }
          } else {
            caexObject.remove(true);
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
  RoleFamilyType,
  'IInstantiable_1',
  'IInstantiable',
  'ICAEXObject',
  'ICAEXBasicObject',
  'ICAEXWrapper',
  'IXMLWrapper',
  'IClassWithBaseClassReference_1',
  'IClassWithBaseClassReference',
  'IObjectWithAttributes',
  'IClassWithExternalInterface',
  'IObjectWithExternalInterfaceAndInherited',
  'IObjectWithExternalInterface',
  'IRoleClassContainer',
  'IObjectWithInheritedAttributes',
);

T.RoleFamilyType = RoleFamilyType;
