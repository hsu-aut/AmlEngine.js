// Port of Aml.Engine.CAEX.InternalElementType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { newException } from './CAEXWrapper.js';
import { from } from '../../system/linq.js';
import { ArgumentException, ArgumentNullException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { XElement } from '../../xml/index.js';
import { SystemUnitClassType } from './SystemUnitClassType.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from './extensions/CAEXDocumentExtensions.js';
import { CAEXPathBuilder, CAEXPathBuilder_IDRefEnum } from './extensions/CAEXPathBuilder.js';
import { InheritanceExtensions } from './extensions/InheritanceExtensions.js';
import { InstanceExtensions } from './extensions/InstanceExtensions.js';
import { InternalElementExtensions } from './extensions/InternalElementExtensions.js';
import { ClassReferenceWithAlias } from '../amlobjects/ClassReferenceWithAlias.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import type { CAEXObject } from './CAEXObject.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { IObjectWithRoleReference } from './IObjectWithRoleReference.js';
import type { MappingType } from './MappingType.js';
import type { RoleFamilyType } from './RoleFamilyType.js';
import type { RoleRequirementsType } from './RoleRequirementsType.js';
import type { SupportedRoleClassType } from './SupportedRoleClassType.js';
import type { SystemUnitFamilyType } from './SystemUnitFamilyType.js';

/** Wrapper for the CAEX element 'InternalElement'. */
export class InternalElementType extends SystemUnitClassType {
  private _roleRequirements: CAEXSequence<RoleRequirementsType> | null = null;

  /** `IMirror.IsMaster` (explicit interface implementation in C#). */
  get isMaster(): boolean {
    return InternalElementExtensions.isMaster(this);
  }

  /** Determines, if this instance is a Mirror. */
  get isMirror(): boolean {
    if (!CAEXPathBuilder.isValidID(this.refBaseSystemUnitPath)) {
      return CAEXPathBuilder.isIDReferenceWithAlias(
        this.refBaseSystemUnitPath,
        CAEXBasicObjectExtensions.caexDocument(this),
        CAEXPathBuilder_IDRefEnum.InternalElementReference,
      );
    }
    return true;
  }

  /** Gets the MappingObject of an InternalElement (CAEX 2.15 only). */
  get mappingObject(): MappingType {
    const mappingType = new T.MappingType(this.element('MappingObject'));
    if (!mappingType.exists) {
      mappingType.owner = this.node;
    }
    return mappingType;
  }

  /**
   * Gets and sets the Master. A Master is only defined, if this instance is a mirror. Setting a
   * master transforms this instance into a mirror.
   */
  get master(): InternalElementType | null {
    if (!this.isMirror) {
      return null;
    }
    const found: CAEXObject | null = ServiceLocator.queryService.findByID(CAEXBasicObjectExtensions.caexDocument(this), this.refBaseSystemUnitPath);
    return found instanceof T.InternalElementType ? found : null;
  }

  set master(value: InternalElementType | null) {
    if (T.CAEXWrapper.equals(value, null) || isNullOrEmpty(value!.id)) {
      this.refBaseSystemUnitPath = null;
      return;
    }
    const externalReferenceResolverService = ServiceLocator.externalReferenceResolverService;
    let isExternal = false;
    let alias: string | null = null;
    if (externalReferenceResolverService != null) {
      const r = externalReferenceResolverService.isExternal(CAEXBasicObjectExtensions.caexDocument(this)!, value!.node!);
      alias = r.alias;
      isExternal = r.result;
    }
    this.refBaseSystemUnitPath = isExternal ? ClassReferenceWithAlias.classReference(value!.id, alias) : value!.id;
  }

  /** Gets the master identifier, if this InternalElement is a mirror. */
  get masterID(): string | null {
    if (!this.isMirror) {
      return null;
    }
    return this.refBaseSystemUnitPath;
  }

  /** Gets and sets the RefBaseSystemUnitPath attribute of an InternalElement. */
  get refBaseSystemUnitPath(): string | null {
    return this.getXAttributeValue('RefBaseSystemUnitPath');
  }

  set refBaseSystemUnitPath(value: string | null) {
    if (!(this.refBaseSystemUnitPath === value)) {
      this.setXAttributeValue('RefBaseSystemUnitPath', value);
      this.raisePropertyChanged('RefBaseSystemUnitPath');
    }
  }

  /**
   * Gets all role references for the InternalElement. The collection includes all
   * RoleRequirement objects and SupportedRoleClass objects.
   */
  override get roleReferences(): Iterable<IObjectWithRoleReference> {
    if (this.roleRequirements.count <= 0) {
      if (this.supportedRoleClass.count <= 0) {
        return [];
      }
      return this.supportedRoleClass;
    }
    if (this.supportedRoleClass.count <= 0) {
      return this.roleRequirements;
    }
    return from<IObjectWithRoleReference>(this.roleRequirements).concat(this.supportedRoleClass);
  }

  /** Gets the collection of RoleRequirements objects contained in this instance. */
  get roleRequirements(): CAEXSequence<RoleRequirementsType> {
    return (
      this._roleRequirements ??
      (this._roleRequirements = new T.CAEXSequence<RoleRequirementsType>(this.node, 'RoleRequirements', T.RoleRequirementsType.Constructor, () => this))
    );
  }

  /** Gets and sets the referenced SystemUnitClass using the RefBaseSystemUnitPath. */
  get systemUnitClass(): SystemUnitFamilyType | null {
    if (isNullOrEmpty(this.refBaseSystemUnitPath) || this.isMirror) {
      return null;
    }
    const found = ServiceLocator.queryService.findByPath(
      CAEXBasicObjectExtensions.caexDocument(this),
      this.refBaseSystemUnitPath,
      true,
      T.SystemUnitClassType,
    );
    return found instanceof T.SystemUnitFamilyType ? found : null;
  }

  set systemUnitClass(value: SystemUnitFamilyType | null) {
    this.refBaseSystemUnitPath = value?.getReferencePath(this) ?? null;
  }

  /** The constructor function for the InternalElementType. */
  static get Constructor(): (n: XElement | null) => InternalElementType {
    return (n) => new InternalElementType(n);
  }

  /** The instantiated SystemUnitClass (`IInstance.Class`). */
  get class(): SystemUnitFamilyType | null {
    return this.systemUnitClass;
  }

  set class(value: SystemUnitFamilyType | null) {
    this.systemUnitClass = value;
  }

  /**
   * Initializes a new instance.
   * @param nodeElement An 'InternalElement' XML node.
   */
  constructor(nodeElement: XElement | null) {
    super(nodeElement, 'RefBaseSystemUnitPath');
  }

  /**
   * Adds a RoleClass reference (RoleRequirement or SupportedRoleClass), using a RoleClass object
   * (`AddRoleClassReference(RoleFamilyType, bool addSupportedRoleClass = false, bool addUnique = true,
   * bool addInstance = false)`) or a CAEX path (`AddRoleClassReference(string, bool addUnique = true,
   * bool addInstance = false)`).
   */
  addRoleClassReference(roleClass: RoleFamilyType | null, addSupportedRoleClass?: boolean, addUnique?: boolean, addInstance?: boolean): IObjectWithRoleReference | null;
  addRoleClassReference(roleClassReference: string | null, addUnique?: boolean, addInstance?: boolean): IObjectWithRoleReference | null;
  addRoleClassReference(arg0: RoleFamilyType | string | null, arg1?: boolean, arg2?: boolean, arg3?: boolean): IObjectWithRoleReference | null {
    if (typeof arg0 === 'string') {
      return this.addRoleClassReferenceByPath(arg0, arg1 ?? true, arg2 ?? false);
    }
    const roleClass = arg0;
    const addSupportedRoleClass = arg1 ?? false;
    const addUnique = arg2 ?? true;
    const addInstance = arg3 ?? false;
    if (T.CAEXWrapper.equals(roleClass, null)) {
      throw new ArgumentNullException('roleClass');
    }
    if (addUnique && from(this.roleReferences).any((rrq) => rrq.roleClass!.equals(roleClass))) {
      return null;
    }
    let objectWithRoleReference: IObjectWithRoleReference;
    if (
      (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15 && this.roleRequirements.exists) ||
      addSupportedRoleClass
    ) {
      objectWithRoleReference = this.supportedRoleClass.append();
      objectWithRoleReference.roleClass = roleClass;
    } else if (addInstance) {
      objectWithRoleReference = roleClass!.createClassInstance(this.caexDocument);
      this.roleRequirements.insert(objectWithRoleReference as RoleRequirementsType);
    } else {
      objectWithRoleReference = this.roleRequirements.append();
      objectWithRoleReference.roleClass = roleClass;
    }
    return objectWithRoleReference;
  }

  private addRoleClassReferenceByPath(roleClassReference: string | null, addUnique: boolean, addInstance: boolean): IObjectWithRoleReference | null {
    if (isNullOrEmpty(roleClassReference)) {
      throw new ArgumentNullException('roleClassReference');
    }
    // C# `string.Equals` on the reference: a null RoleReference throws NullReferenceException.
    if (addUnique && from(this.roleReferences).any((rrq) => (rrq.roleReference as string).valueOf() === roleClassReference)) {
      return null;
    }
    let objectWithRoleReference: IObjectWithRoleReference | null = null;
    if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15 && this.roleRequirements.exists) {
      objectWithRoleReference = this.supportedRoleClass.append();
      objectWithRoleReference.roleReference = roleClassReference;
    } else if (addInstance) {
      const found = CAEXDocumentExtensions.findByPath(this.caexDocument, roleClassReference, true, T.RoleFamilyType);
      const roleFamilyType = found instanceof T.RoleFamilyType ? found : null;
      if (!T.CAEXWrapper.equals(roleFamilyType, null)) {
        objectWithRoleReference = roleFamilyType!.createClassInstance(this.caexDocument);
        this.roleRequirements.insert(objectWithRoleReference as RoleRequirementsType);
      }
    }
    if (objectWithRoleReference != null) {
      return objectWithRoleReference;
    }
    objectWithRoleReference = this.roleRequirements.append();
    objectWithRoleReference.roleReference = roleClassReference;
    return objectWithRoleReference;
  }

  /** Gets the CAEXSequence owned by this CAEX object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return !(caexObject instanceof T.RoleRequirementsType) ? super.caexSequence(caexObject) : this.roleRequirements;
  }

  /** Creates a new mirror element from this InternalElement; this instance becomes its master. */
  createMirror(): InternalElementType {
    const mirror = new InternalElementType(this.internalElement.createElement(this.owner));
    mirror.master = this;
    mirror.name = this.name;
    return mirror;
  }

  /**
   * Creates a SystemUnitClass from this InternalElement. RoleRequirements are transformed to
   * SupportedRoleClasses; their Attributes and ExternalInterfaces are removed.
   */
  createSystemUnitClass(): SystemUnitFamilyType {
    ServiceLocator.undoRedoService?.pause(CAEXBasicObjectExtensions.caexDocument(this));
    ServiceLocator.uniqueNameService?.suspend();
    const cAEXWrapper = this.copy();
    T.CaexCommand.isSilent = true;
    const suc = new XElement(this.xName('SystemUnitClass'), cAEXWrapper.node!.attributes(), cAEXWrapper.node!.elements());
    suc.attribute('RefBaseSystemUnitPath')?.remove();
    for (const item of [...suc.elements(this.xName('RoleRequirements'))]) {
      item.remove();
      const xElement = new XElement(this.xName('SupportedRoleClass'));
      T.CAEXDocument.amlSchemaManager(suc)!.insert(suc, xElement);
      suc.add();
      xElement.setAttributeValue('RefRoleClassPath', item.attribute('RefBaseRoleClassPath')?.value ?? null);
    }
    for (const elementWithIDRef of [...from(suc.descendants()).where((n) => XmlCAEXSchema.isElementWithIDReference(n))]) {
      if (
        from(XmlCAEXSchema.idReferenceAttributes(elementWithIDRef))
          .select((attributeName) => XmlCAEXSchema.idFromReference(elementWithIDRef, attributeName))
          .where((id) => !isNullOrEmpty(id))
          .select((id) => ServiceLocator.queryService.findByID(CAEXBasicObjectExtensions.caexDocument(this), id))
          .any((caexObject) => !T.CAEXWrapper.equals(caexObject, null) && !from(suc.descendants()).contains(caexObject!.node!))
      ) {
        elementWithIDRef.remove();
      }
    }
    T.CaexCommand.isSilent = false;
    ServiceLocator.undoRedoService?.resume(CAEXBasicObjectExtensions.caexDocument(this));
    ServiceLocator.uniqueNameService?.resume();
    return new T.SystemUnitFamilyType(suc);
  }

  /**
   * Determines whether this InternalElement references a RoleClass which is a generalization of the
   * specified RoleClass (`HasGenericRoleClassReference(RoleFamilyType)`) or of the RoleClass with the
   * specified CAEX path (`HasGenericRoleClassReference(string)`).
   */
  hasGenericRoleClassReference(specificRoleClass: RoleFamilyType | string | null): boolean {
    if (typeof specificRoleClass === 'string') {
      const roleReference = specificRoleClass;
      if (!isNullOrEmpty(roleReference)) {
        const doc = this.caexDocument;
        const found = doc == null ? null : CAEXDocumentExtensions.findByPath(doc, roleReference, true, T.RoleFamilyType);
        return this.hasGenericRoleClassReference(found instanceof T.RoleFamilyType ? found : null);
      }
      throw new ArgumentNullException('roleReference');
    }
    if (!T.CAEXWrapper.equals(specificRoleClass, null)) {
      return from(this.roleReferences).any(
        (r) =>
          !T.CAEXWrapper.equals(r.roleClass, null) &&
          !T.CAEXWrapper.equals(r.roleClass, specificRoleClass) &&
          InheritanceExtensions.classIsDerivedFrom(specificRoleClass!, r.roleClass!) === true,
      );
    }
    throw new ArgumentNullException('specificRoleClass');
  }

  /**
   * Determines whether this InternalElement references the specified RoleClass
   * (`HasRoleClassReference(RoleFamilyType, bool)`) or the RoleClass with the specified CAEX path
   * (`HasRoleClassReference(string, bool)`), optionally regarding inheritance.
   */
  hasRoleClassReference(roleClass: RoleFamilyType | string | null, regardInheritance = false): boolean {
    if (typeof roleClass === 'string') {
      const roleReference = roleClass;
      if (!isNullOrEmpty(roleReference)) {
        if (!regardInheritance) {
          return from(this.roleReferences).any((r) => r.roleReference === roleReference);
        }
        return from(this.roleReferences).any((r) => InheritanceExtensions.isDerivedFromRoleClass(r, roleReference));
      }
      throw new ArgumentNullException('roleReference');
    }
    if (!T.CAEXWrapper.equals(roleClass, null)) {
      if (!regardInheritance) {
        return from(this.roleReferences).any((r) => T.CAEXWrapper.equals(r.roleClass, roleClass));
      }
      return from(this.roleReferences).any(
        (r) =>
          T.CAEXWrapper.equals(r.roleClass, roleClass) ||
          (!T.CAEXWrapper.equals(r.roleClass, null) && InheritanceExtensions.classIsDerivedFrom(r.roleClass!, roleClass!) === true),
      );
    }
    throw new ArgumentNullException('roleClass');
  }

  /**
   * Determines whether this InternalElement references the specified SystemUnitClass, optionally
   * regarding inheritance.
   */
  hasSystemUnitClassReference(systemUnitClass: SystemUnitFamilyType | null, regardInheritance = false): boolean {
    if (!T.CAEXWrapper.equals(systemUnitClass, null)) {
      if (!regardInheritance) {
        return this.systemUnitClass?.equals(systemUnitClass) ?? false;
      }
      const own = this.systemUnitClass;
      return (own == null ? null : InheritanceExtensions.classIsDerivedFrom(own, systemUnitClass!)) === true;
    }
    throw new ArgumentNullException('systemUnitClass');
  }

  /**
   * Inserts the specified CAEX object in its associated sequence (`Insert(CAEXWrapper, bool, bool)`)
   * or at the given position (`Insert(int, CAEXWrapper)`). Defines the RoleRequirements sequence.
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(arg0: CAEXWrapper | number | null, arg1?: boolean | CAEXWrapper | null, arg2?: boolean): boolean {
    if (typeof arg0 === 'number') {
      const pos = arg0;
      const caexObject = (arg1 ?? null) as CAEXWrapper | null;
      if (caexObject instanceof T.RoleRequirementsType) {
        return this.roleRequirements.insertAt(pos, caexObject) != null;
      }
      if (
        CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15 ||
        !(caexObject instanceof T.MappingType) ||
        this.mappingObject.exists
      ) {
        return super.insert(pos, caexObject);
      }
      T.InsertCmd.insertElement(this.node!, caexObject.node!);
      return T.CAEXWrapper.equals(this.mappingObject, caexObject);
    }
    const caexObject = arg0;
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (caexObject instanceof T.RoleRequirementsType) {
      return this.roleRequirements.insert(caexObject, asFirst, asIs) != null;
    }
    if (
      CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15 ||
      !(caexObject instanceof T.MappingType) ||
      this.mappingObject.exists
    ) {
      return super.insert(caexObject, asFirst, asIs);
    }
    T.InsertCmd.insertElement(this.node!, caexObject.node!);
    return this.mappingObject != null;
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!(caexObject instanceof T.RoleRequirementsType)) {
      if (caexObject instanceof T.SupportedRoleClassType && !T.CAEXWrapper.equals(caexObject.roleClass, null)) {
        const supportedRoleClassType: SupportedRoleClassType = caexObject;
        return this.roleRequirements.import(supportedRoleClassType.roleClass!.createClassInstance(this.caexDocument), name, withSubclasses);
      }
      if (
        CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15 ||
        !(caexObject instanceof T.MappingType) ||
        this.mappingObject.exists
      ) {
        return super.import(caexObject, name, withSubclasses);
      }
      T.InsertCmd.insertElement(this.node!, caexObject.node!);
      return this.mappingObject;
    }
    return this.roleRequirements.import(caexObject, name, withSubclasses);
  }

  /**
   * Adds a new MappingObject element to this InternalElement (CAEX 2.15 only).
   * @returns The new MappingObject element if not existing, otherwise the existing.
   */
  new_MappingObject(): MappingType {
    if (!this.exists) {
      throw new ArgumentException('An InternalElement object doesn\'t exist!');
    }
    if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      throw newException('A MappingObject node is not allowed for an InternalElement for the currently assigned CAEX schema.');
    }
    const mappingObject = this.mappingObject;
    mappingObject.insertNew();
    return mappingObject;
  }

  /**
   * Replaces an existing role class reference to the provided role (or any generic base role of it)
   * by a new instance of the role class.
   */
  replaceRoleClassReference(roleClass: RoleFamilyType | null, addSupportedRoleClass = false): IObjectWithRoleReference | null {
    if (T.CAEXWrapper.equals(roleClass, null)) {
      throw new ArgumentNullException('roleClass');
    }
    const objectWithRoleReference = from(this.roleReferences).firstOrDefault(
      (r) =>
        T.CAEXWrapper.equals(r.roleClass, roleClass) ||
        (!T.CAEXWrapper.equals(r.roleClass, null) && InheritanceExtensions.classIsDerivedFrom(roleClass!, r.roleClass!) === true),
    );
    T.RemoveCmd.removeElement(objectWithRoleReference?.node ?? null);
    if (!(objectWithRoleReference instanceof T.RoleRequirementsType) || addSupportedRoleClass) {
      return this.addRoleClassReference(roleClass, addSupportedRoleClass);
    }
    const objectWithRoleReference2: IObjectWithRoleReference = roleClass!.createClassInstance(this.caexDocument);
    this.insert(objectWithRoleReference2 as unknown as CAEXWrapper, false);
    return objectWithRoleReference2;
  }

  /**
   * Updates the InternalElement with added attributes, external interfaces and InternalElements of
   * the referenced SystemUnitClass.
   * @returns `true`, if the InternalElement has a related SystemUnitClass.
   */
  updateInstance(): boolean {
    if (T.CAEXWrapper.equals(this.reference, null)) {
      return false;
    }
    InstanceExtensions.updateWithAddedAttributes(this, this.systemUnitClass);
    InstanceExtensions.updateWithAddedExternalInterfaces(this, this.systemUnitClass);
    InstanceExtensions.updateWithAddedInternalElements(this);
    return true;
  }
}

registerInterfaces(
  InternalElementType,
  'ISplitPoint',
  'ICAEXWrapper',
  'IXMLWrapper',
  'IMirror_1',
  'IMirror',
  'ICAEXObject',
  'ICAEXBasicObject',
  'IInstance_1',
  'IInstance',
);

T.InternalElementType = InternalElementType;
