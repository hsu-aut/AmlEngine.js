// Port of Aml.Engine.CAEX.SystemUnitFamilyType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces, implementsInterface } from '../interfaces.js';
import { from, type Enumerable } from '../../system/linq.js';
import { ArgumentNullException, InvalidCastException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { XElement } from '../../xml/index.js';
import { SystemUnitClassType } from './SystemUnitClassType.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from './extensions/CAEXDocumentExtensions.js';
import { CAEXElementFactory } from './extensions/CAEXElementFactory.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { CollectionExtensions } from './extensions/CollectionExtensions.js';
import { InheritanceExtensions } from './extensions/InheritanceExtensions.js';
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
import type { IObjectWithRoleReference } from './IObjectWithRoleReference.js';
import type { InternalElementType } from './InternalElementType.js';
import type { RoleFamilyType } from './RoleFamilyType.js';
import type { RoleRequirementsType } from './RoleRequirementsType.js';
import type { SupportedRoleClassType } from './SupportedRoleClassType.js';

type Ctor<C = unknown> = abstract new (...args: never[]) => C;

/** `typeof(type).IsAssignableFrom(typeof(c))` for classes. */
function isAssignableFrom(type: Ctor, c: Ctor): boolean {
  return type === c || c.prototype instanceof type;
}

/**
 * Wrapper for the CAEX element 'SystemUnitClass' that allows definition of child SystemUnitClasses
 * within the class hierarchy.
 */
export class SystemUnitFamilyType extends SystemUnitClassType {
  private _systemUnitClass: CAEXSequenceOfCAEXObjectsWithReference<SystemUnitFamilyType> | null = null;

  /** Gets the attributes of this class and all inherited attributes of base classes. */
  get attributeAndInherited(): Enumerable<AttributeType> {
    return from(XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Attribute', new T.AttributeValueComparer('Name'))).select(
      (a) => new T.AttributeType(a),
    );
  }

  /** Gets and sets the base class of this SystemUnitClass. */
  get baseClass(): SystemUnitFamilyType | null {
    const parent = this.caexParent;
    if (isNullOrEmpty(this.refBaseClassPath) || !(this.refBaseClassPath === ((parent instanceof T.SystemUnitFamilyType ? parent : null)?.name ?? null))) {
      const found = CAEXDocumentExtensions.findByPath(this.caexDocument, this.refBaseClassPath, true, T.SystemUnitFamilyType);
      return found instanceof T.SystemUnitFamilyType ? found : null;
    }
    return this.caexParent as SystemUnitFamilyType;
  }

  set baseClass(value: SystemUnitFamilyType | null) {
    this.refBaseClassPath = ObjectWithBaseClass.baseClassReference(this, value);
  }

  /** Gets the external interfaces of this class and all inherited interfaces of base classes. */
  get externalInterfaceAndInherited(): Enumerable<ExternalInterfaceType> {
    return from(XmlOperation.existingElementsFromBaseClassAndSelf(this, 'ExternalInterface', new T.AttributeValueComparer('Name'))).select(
      (a) => new T.ExternalInterfaceType(a),
    );
  }

  /** Gets the internal elements of this class and all inherited internal elements of base classes. */
  get internalElementAndInherited(): Enumerable<InternalElementType> {
    return from(XmlOperation.existingElementsFromBaseClassAndSelf(this, 'InternalElement', new T.AttributeValueComparer('Name'))).select(
      (a) => new T.InternalElementType(a),
    );
  }

  /** Gets and sets the RefBaseClassPath attribute. */
  get refBaseClassPath(): string | null {
    return this.getXAttributeValue('RefBaseClassPath');
  }

  set refBaseClassPath(value: string | null) {
    if (!(this.refBaseClassPath === value)) {
      this.setXAttributeValue('RefBaseClassPath', ObjectWithBaseClass.baseClassReference(this, value));
      this.raisePropertyChanged('RefBaseClassPath');
    }
  }

  /** Gets the name of the referenced base class. */
  get referencedClassName(): string {
    return ObjectWithBaseClass.referencedClassName(this);
  }

  /** Gets the collection of child SystemUnitClass objects. */
  get systemUnitClass(): CAEXSequenceOfCAEXObjectsWithReference<SystemUnitFamilyType> {
    return (
      this._systemUnitClass ??
      (this._systemUnitClass = new T.CAEXSequenceOfCAEXObjectsWithReference<SystemUnitFamilyType>(
        this.node,
        'SystemUnitClass',
        SystemUnitFamilyType.Constructor,
        () => this,
      ))
    );
  }

  /** The constructor function for the SystemUnitFamilyType. */
  static get Constructor(): (n: XElement | null) => SystemUnitFamilyType {
    return (n) => new SystemUnitFamilyType(n);
  }

  /**
   * Initializes a new instance.
   * @param systemUnitClassNode A 'SystemUnitClass' XML node.
   */
  constructor(systemUnitClassNode: XElement | null) {
    super(systemUnitClassNode, 'RefBaseClassPath');
  }

  /**
   * Adds a SupportedRoleClass referencing the provided RoleClass object
   * (`AddRoleClassReference(RoleFamilyType, bool addUnique = true)`) or CAEX path
   * (`AddRoleClassReference(string, bool addUnique = true)`).
   */
  addRoleClassReference(roleClass: RoleFamilyType | string | null, addUnique = true): IObjectWithRoleReference | null {
    if (typeof roleClass === 'string') {
      const roleClassReference = roleClass;
      if (isNullOrEmpty(roleClassReference)) {
        throw new ArgumentNullException('roleClassReference');
      }
      // C# `string.Equals` on the reference: a null RoleReference throws NullReferenceException.
      if (addUnique && from(this.roleReferences).any((rrq) => (rrq.roleReference as string).valueOf() === roleClassReference)) {
        return null;
      }
      const supportedRoleClassType = this.supportedRoleClass.append();
      supportedRoleClassType.roleReference = roleClassReference;
      return supportedRoleClassType;
    }
    if (T.CAEXWrapper.equals(roleClass, null)) {
      throw new ArgumentNullException('roleClass');
    }
    if (addUnique && from(this.roleReferences).any((rrq) => rrq.roleClass!.equals(roleClass))) {
      return null;
    }
    const supportedRoleClassType = this.supportedRoleClass.append();
    supportedRoleClassType.roleClass = roleClass;
    return supportedRoleClassType;
  }

  /** Gets the CAEXSequence owned by this CAEX object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return !(caexObject instanceof T.SystemUnitFamilyType) ? super.caexSequence(caexObject) : this.systemUnitClass;
  }

  /** C# `Container<T>()`: the sequence for elements of the given type. */
  override container<TW extends CAEXWrapper>(type: Ctor<TW>): CAEXSequence<TW> | null {
    if (!isAssignableFrom(type, T.SystemUnitFamilyType)) {
      return super.container(type);
    }
    // `SystemUnitClass as CAEXSequence<T>`: generic classes are invariant in C#.
    return (type as Ctor) === T.SystemUnitFamilyType ? (this.systemUnitClass as unknown as CAEXSequence<TW>) : null;
  }

  private createClassInstanceInDocument(): InternalElementType {
    const cAEXDocument = this.caexDocument;
    ServiceLocator.undoRedoService?.pause(cAEXDocument);
    T.CaexCommand.isSilent = true;
    const internalElementType = CAEXElementFactory.create(cAEXDocument!, T.InternalElementType)!;
    internalElementType.name = this.name;
    internalElementType.systemUnitClass = this;
    for (const item of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Attribute', new T.AttributeValueComparer('Name'))) {
      internalElementType.attribute.appendRaw(new XElement(item));
    }
    for (const item2 of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'ExternalInterface', new T.AttributeValueComparer('Name'))) {
      internalElementType.externalInterface.appendRaw(new XElement(item2));
    }
    for (const item3 of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'InternalElement', new T.AttributeValueComparer('Name'))) {
      internalElementType.internalElement.appendRaw(new XElement(item3));
    }
    for (const item4 of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'InternalLink', new T.InternalLinkComparer())) {
      internalElementType.internalLink.appendRaw(new XElement(item4));
    }
    this.createSupportedRoleInstanceElements(cAEXDocument!, internalElementType);
    XmlOperation.makeUnique(internalElementType.node!);
    ServiceLocator.undoRedoService?.resume(cAEXDocument);
    T.CaexCommand.isSilent = false;
    return internalElementType;
  }

  /**
   * Creates an InternalElement instance of this SystemUnitClass in the target document (default:
   * the document of this class).
   */
  createClassInstance(targetDocument: CAEXDocument | null = null): InternalElementType {
    if (targetDocument == null) {
      targetDocument = this.caexDocument;
    }
    if (targetDocument === this.caexDocument) {
      return this.createClassInstanceInDocument();
    }
    ServiceLocator.undoRedoService?.pause(targetDocument);
    T.CaexCommand.isSilent = true;
    XmlOperation.setUpdateReference(false);
    const internalElementType = CAEXElementFactory.create(targetDocument!, T.InternalElementType)!;
    internalElementType.name = this.name;
    internalElementType.systemUnitClass = this;
    for (const item of ObjectWithBaseClass.inheritedElements(this, true, T.AttributeType)) {
      internalElementType.attribute.import(item, item.name, false);
    }
    InstanceExtensions.importInterfacesToInstance(internalElementType, this);
    for (const item2 of ObjectWithBaseClass.inheritedElements(this, true, T.InternalElementType)) {
      internalElementType.internalElement.import(item2, item2.name, false);
    }
    for (const item3 of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'InternalLink', new T.InternalLinkComparer())) {
      internalElementType.internalLink.appendRaw(new XElement(item3));
    }
    this.createSupportedRoleInstanceElements(targetDocument!, internalElementType);
    InstanceExtensions.mapIDReferences(XmlOperation.idMap, internalElementType, targetDocument);
    XmlOperation.setUpdateReference(true);
    ServiceLocator.undoRedoService?.resume(targetDocument);
    T.CaexCommand.isSilent = false;
    return internalElementType;
  }

  /**
   * Enumeration of the child SystemUnitClass objects. C# hides the inherited InternalElement
   * enumerator with `new`; in JS this one is used for every SystemUnitFamilyType instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override [Symbol.iterator](): Iterator<any> {
    return this.systemUnitClass[Symbol.iterator]();
  }

  /** Gets the SupportedRoleClass objects of this class and its base classes (distinct paths). */
  getInheritedSupportedRoles(): Iterable<SupportedRoleClassType> {
    const elementsWithPath = XmlOperation.existingElementsFromBaseClassAndSelf(this, 'SupportedRoleClass', new T.AttributeValueComparer('RefRoleClassPath'));
    return new T.CAEXEnumerable<SupportedRoleClassType>(
      InheritanceExtensions.makeDistinctPath(CAEXBasicObjectExtensions.caexDocument(this)!, elementsWithPath, 'RefRoleClassPath', T.RoleFamilyType),
    );
  }

  /** Gets the SystemUnitClass referenced by the provided CAEX path. */
  getReferencedSystemUnitClass(systemUnitClassReference: string | null): SystemUnitFamilyType | null {
    if (!isNullOrEmpty(systemUnitClassReference)) {
      return CAEXBasicObjectExtensions.findReferencedClass(this, systemUnitClassReference, T.SystemUnitFamilyType);
    }
    throw new ArgumentNullException('systemUnitClassReference');
  }

  /**
   * Gets the reference hierarchy (this class and its base classes). With a type argument this is
   * the obsolete generic overload `GetReferenceHierarchy<T>(bool)` returning a `Queue<T>` (an
   * array in FIFO order); the type is a class constructor or a C# interface name.
   */
  getReferenceHierarchy(includeExternals?: boolean): Iterable<SystemUnitFamilyType>;
  getReferenceHierarchy<TC>(includeExternals: boolean, type: Ctor<TC> | string): TC[];
  getReferenceHierarchy<TC>(includeExternals = true, type?: Ctor<TC> | string): Iterable<SystemUnitFamilyType> | TC[] {
    if (type !== undefined) {
      return [...this.getReferenceHierarchy(includeExternals)].map((x) => castTo(x, type));
    }
    if (!includeExternals && CAEXPathBuilder.isReferenceWithAlias(this.refBaseClassPath, CAEXBasicObjectExtensions.caexSchema(this))) {
      return [this];
    }
    if (!T.CAEXWrapper.equals(this.baseClass, null)) {
      return from(CollectionExtensions.yield(this) as Iterable<SystemUnitFamilyType>).concat(this.baseClass!.getReferenceHierarchy(includeExternals));
    }
    return CollectionExtensions.yield(this) as Iterable<SystemUnitFamilyType>;
  }

  /**
   * Determines whether a SupportedRoleClass references a generalization of the specified RoleClass
   * (`HasGenericRoleClassReference(RoleFamilyType)`) or of the RoleClass referenced by the specified
   * RoleRequirement (`HasGenericRoleClassReference(RoleRequirementsType)`).
   */
  hasGenericRoleClassReference(roleClass: RoleFamilyType | RoleRequirementsType | null): boolean {
    if (roleClass instanceof T.RoleRequirementsType) {
      const roleReference: RoleRequirementsType = roleClass;
      if (from<SupportedRoleClassType>(this.supportedRoleClass).all((r) => r.roleReference !== roleReference.roleReference)) {
        return from<SupportedRoleClassType>(this.supportedRoleClass).any((r) => InheritanceExtensions.isDerivedFromRoleClass(roleReference, r.roleReference));
      }
      return false;
    }
    if (!T.CAEXWrapper.equals(roleClass, null)) {
      const rc = roleClass as RoleFamilyType;
      return from<SupportedRoleClassType>(this.supportedRoleClass).any(
        (r) => !rc.equals(r.roleClass) && InheritanceExtensions.classIsDerivedFrom(rc, r.roleClass) === true,
      );
    }
    throw new ArgumentNullException('roleClass');
  }

  /**
   * Determines whether this class or a base class supports the specified RoleClass
   * (`HasRoleClassReference(RoleFamilyType, bool)`) or RoleClass path
   * (`HasRoleClassReference(string, bool)`), optionally regarding inheritance of role classes.
   */
  hasRoleClassReference(roleClass: RoleFamilyType | string | null, regardInheritanceOfRoleClasses = false): boolean {
    if (typeof roleClass === 'string') {
      const roleClassReference = roleClass;
      const regardInheritance = regardInheritanceOfRoleClasses;
      if (!isNullOrEmpty(roleClassReference)) {
        if (!regardInheritance) {
          return from(this.getInheritedSupportedRoles()).any((r) => r.roleReference === roleClassReference);
        }
        return from(this.getInheritedSupportedRoles()).any((r) => {
          const flag = InheritanceExtensions.classIsDerivedFrom(r.roleClass!, roleClassReference);
          return flag != null && flag;
        });
      }
      throw new ArgumentNullException('roleClassReference');
    }
    if (!T.CAEXWrapper.equals(roleClass, null)) {
      if (!regardInheritanceOfRoleClasses) {
        return from(this.getInheritedSupportedRoles()).any((r) => T.CAEXWrapper.equals(r.roleClass, roleClass));
      }
      return from(this.getInheritedSupportedRoles()).any((r) => {
        const flag = InheritanceExtensions.classIsDerivedFrom(r.roleClass!, roleClass!);
        return flag != null && flag;
      });
    }
    throw new ArgumentNullException('roleClass');
  }

  /**
   * Inserts the specified CAEX object in its associated sequence (`Insert(CAEXWrapper, bool, bool)`)
   * or at the given position (`Insert(int, CAEXWrapper)`). Defines the SystemUnitClass sequence.
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(arg0: CAEXWrapper | number | null, arg1?: boolean | CAEXWrapper | null, arg2?: boolean): boolean {
    if (typeof arg0 === 'number') {
      const caexObject = (arg1 ?? null) as CAEXWrapper | null;
      if (caexObject instanceof T.SystemUnitFamilyType) {
        return this.systemUnitClass.insertAt(arg0, caexObject) != null;
      }
      return super.insert(arg0, caexObject);
    }
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (arg0 instanceof T.SystemUnitFamilyType) {
      return this.systemUnitClass.insert(arg0, asFirst, asIs) != null;
    }
    return super.insert(arg0, asFirst, asIs);
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (caexObject instanceof T.SystemUnitFamilyType) {
      return this.systemUnitClass.import(caexObject, name, withSubclasses);
    }
    return super.import(caexObject, name, withSubclasses);
  }

  /**
   * Removes this SystemUnitClass. With `removeRelations`, references of derived classes and
   * instances are removed as well.
   */
  override remove(removeRelations = false): void {
    if (removeRelations) {
      for (const item of [...ServiceLocator.queryService.elementsWithCAEXPathReference(this.caexDocument!.caexFile, this.caexPath())]) {
        const caexObject = item.caexObject;
        if (!(caexObject instanceof T.SystemUnitFamilyType)) {
          if (caexObject instanceof T.InternalElementType) {
            caexObject.systemUnitClass = null;
          }
        } else {
          caexObject.baseClass = null;
        }
      }
    }
    super.remove(removeRelations);
  }

  /**
   * Replaces an existing SupportedRoleClass referencing the provided role (or a generic base role
   * of it) by a new SupportedRoleClass referencing the provided role.
   */
  replaceRoleClassReference(roleClass: RoleFamilyType | null): SupportedRoleClassType {
    if (T.CAEXWrapper.equals(roleClass, null)) {
      throw new ArgumentNullException('roleClass');
    }
    T.RemoveCmd.removeElement(
      from<SupportedRoleClassType>(this.supportedRoleClass).firstOrDefault(
        (r) =>
          T.CAEXWrapper.equals(r.roleClass, roleClass) ||
          (!T.CAEXWrapper.equals(r.roleClass, null) && InheritanceExtensions.classIsDerivedFrom(roleClass!, r.roleClass!) === true),
      )?.node ?? null,
    );
    const supportedRoleClassType = this.supportedRoleClass.append();
    supportedRoleClassType.roleClass = roleClass;
    return supportedRoleClassType;
  }

  private createSupportedRoleInstanceElements(targetDocument: CAEXDocument, internalElement: InternalElementType): void {
    const elementsWithPath = XmlOperation.existingElementsFromBaseClassAndSelf(this, 'SupportedRoleClass', new T.AttributeValueComparer('RefRoleClassPath'));
    const enumerable = from(InheritanceExtensions.makeDistinctPath(targetDocument, elementsWithPath, 'RefRoleClassPath', T.RoleFamilyType)).select(
      (r) => new T.SupportedRoleClassType(r),
    );
    if (targetDocument.schema === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      const list = enumerable.toList();
      if (list.length === 1) {
        internalElement.addRoleClassReference(list[0].refRoleClassPath);
        return;
      }
      for (let num = 0; num < list.length; num++) {
        const supportedRoleClassType = list[num];
        internalElement.supportedRoleClass.insert(new T.SupportedRoleClassType(new XElement(supportedRoleClassType.node!)), false);
      }
      return;
    }
    for (const item of enumerable) {
      const roleRequirementsType = internalElement.roleRequirements.append();
      if (!T.CAEXWrapper.equals(item.roleClass, null)) {
        roleRequirementsType.roleClass = item.roleClass;
      } else {
        roleRequirementsType.refBaseRoleClassPath = item.refRoleClassPath;
      }
      if (item.mappingObject.exists) {
        T.InsertCmd.insertElement(roleRequirementsType.node!, new XElement(item.mappingObject.node!));
      }
    }
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
  SystemUnitFamilyType,
  'IInstantiable_1',
  'IInstantiable',
  'ICAEXObject',
  'ICAEXBasicObject',
  'ICAEXWrapper',
  'IXMLWrapper',
  'ISystemUnitClassContainer',
  'IClassWithBaseClassReference_1',
  'IClassWithBaseClassReference',
  'IObjectWithAttributes',
  'IClassWithExternalInterface',
  'IObjectWithExternalInterfaceAndInherited',
  'IObjectWithExternalInterface',
  'IObjectWithInheritedAttributes',
);

T.SystemUnitFamilyType = SystemUnitFamilyType;
