// Port of Aml.Engine.CAEX.AttributeFamilyType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { XElement } from '../../xml/index.js';
import { InvalidCastException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { from } from '../../system/linq.js';
import type { Enumerable } from '../../system/linq.js';
import { AttributeTypeType } from './AttributeTypeType.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from './extensions/CAEXDocumentExtensions.js';
import { CAEXElementFactory } from './extensions/CAEXElementFactory.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { CollectionExtensions } from './extensions/CollectionExtensions.js';
import { ObjectWithBaseClass } from './extensions/ObjectWithBaseClass.js';
import { XmlOperation } from '../xmlext/XmlOperation.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import type { AttributeType } from './AttributeType.js';
import type { AttributeValueRequirementType } from './AttributeValueRequirementType.js';
import type { CAEXDocument } from './CAEXDocument.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtor<R> = abstract new (...args: any[]) => R;

/**
 * This class is a wrapper for the CAEX element 'AttributeType' which defines base structures for
 * attribute type definitions. AttributeTypes are organized in AttributeType libraries. This class
 * supports direct enumeration of the AttributeType's children in the AttributeType tree. It was
 * introduced with CAEX 3.0.
 */
export class AttributeFamilyType extends AttributeTypeType implements Iterable<AttributeFamilyType> {
  private _attributeType: CAEXSequenceOfCAEXObjectsWithReference<AttributeFamilyType> | null = null;

  /** Gets the attributes of this instance and the attributes inherited from the base classes. */
  get attributeAndInherited(): Enumerable<AttributeType> {
    return from(XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Attribute', new T.AttributeValueComparer('Name'))).select(
      (a: XElement) => new T.AttributeType(a),
    );
  }

  /**
   * Gets and set the AttributeDataType. If the AttributeDataType is not defined for this
   * AttributeType but a BaseClass exists, the AttributeDataType of the BaseClass is returned. If
   * this optional attribute is not defined, the data type is assumed to be "xs:string".
   */
  override get attributeDataType(): string | null {
    return super.attributeDataType ?? this.baseClass?.attributeDataType ?? T.XsdDataTypes.stringType;
  }

  override set attributeDataType(value: string | null) {
    super.attributeDataType = value;
  }

  /** Gets a collection of the subordinate AttributeTypes (the direct children) in the AttributeType tree. */
  get attributeType(): CAEXSequenceOfCAEXObjectsWithReference<AttributeFamilyType> {
    return (this._attributeType ??= new T.CAEXSequenceOfCAEXObjectsWithReference<AttributeFamilyType>(
      this.node,
      'AttributeType',
      AttributeFamilyType.Constructor,
      () => this,
    ));
  }

  /**
   * Gets and sets the base class for this AttributeType (class to class inheritance, defined by
   * the RefAttributeType attribute). Cyclic references are denied.
   */
  get baseClass(): AttributeFamilyType | null {
    const parent = this.caexParent;
    if (isNullOrEmpty(this.refAttributeType) || !(this.refAttributeType === ((parent instanceof T.AttributeFamilyType ? parent : null)?.name ?? null))) {
      const c = this.caexDocument === null || this.caexDocument === undefined
        ? null
        : CAEXDocumentExtensions.findByPath(this.caexDocument, this.refAttributeType, true, T.AttributeFamilyType);
      return c instanceof T.AttributeFamilyType ? c : null;
    }
    return this.caexParent as AttributeFamilyType;
  }

  set baseClass(value: AttributeFamilyType | null) {
    this.refAttributeType = ObjectWithBaseClass.baseClassReference(this, value);
  }

  /**
   * Gets and set the DefaultValue. If the DefaultValue is not defined for this AttributeType but
   * a BaseClass exists, the DefaultValue of the BaseClass is returned.
   */
  override get defaultValue(): string | null {
    let defaultValue = super.defaultValue;
    if (defaultValue === null) {
      const baseClass = this.baseClass;
      if (baseClass === null) {
        return null;
      }
      defaultValue = baseClass.defaultValue;
    }
    return defaultValue;
  }

  override set defaultValue(value: string | null) {
    super.defaultValue = value;
  }

  /** Gets all attributes, including the inherited attributes of the base classes in the inheritance tree. */
  get inheritedAttributes(): Iterable<AttributeType> {
    return new T.CAEXEnumerable<AttributeType>(XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Attribute', new T.AttributeValueComparer('Name')), T.AttributeType);
  }

  /** Gets all constraints, including the inherited constraints of the base classes in the inheritance tree. */
  get inheritedConstraints(): Iterable<AttributeValueRequirementType> {
    return new T.CAEXEnumerable<AttributeValueRequirementType>(
      XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Constraint', new T.AttributeValueComparer('Name')),
      T.AttributeValueRequirementType,
    );
  }

  /**
   * Gets and sets the RefAttributeType CAEX attribute, used to create class to class relations
   * between AttributeType objects. Cyclic references are denied.
   */
  override get refAttributeType(): string | null {
    return super.refAttributeType;
  }

  override set refAttributeType(value: string | null) {
    super.refAttributeType = value === null ? null : ObjectWithBaseClass.baseClassReference(this, value);
  }

  /** Gets the reference base class path. */
  get refBaseClassPath(): string | null {
    return super.refAttributeType;
  }

  set refBaseClassPath(value: string | null) {
    super.refAttributeType = ObjectWithBaseClass.baseClassReference(this, value);
  }

  /** Gets the name (not the full path) of the referenced base class. */
  get referencedClassName(): string | null {
    return ObjectWithBaseClass.referencedClassName(this);
  }

  /**
   * Gets and set the Unit. If the Unit is not defined for this AttributeType but a BaseClass
   * exists, the Unit of the BaseClass is returned.
   */
  override get unit(): string | null {
    let unit = super.unit;
    if (unit === null) {
      const baseClass = this.baseClass;
      if (baseClass === null) {
        return null;
      }
      unit = baseClass.unit;
    }
    return unit;
  }

  override set unit(value: string | null) {
    super.unit = value;
  }

  /**
   * The constructor function for the AttributeFamilyType (C# `AttributeFamilyType.Constructor`;
   * the name `constructor` is not available for a static member in JS).
   * @internal
   */
  static get Constructor(): (n: XElement) => AttributeFamilyType {
    return (n: XElement) => new AttributeFamilyType(n);
  }

  /** @param attributeTypeNode An AttributeType XML node. */
  constructor(attributeTypeNode: XElement) {
    super(attributeTypeNode, 'RefBaseClassPath');
  }

  /** Gets the CAEXSequence owned by this CAEX object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      if (!(caexObject instanceof T.AttributeFamilyType)) {
        return super.caexSequence(caexObject);
      }
      return this.attributeType as unknown as ICAEXSequence;
    }
    return null;
  }

  /** C# `Container<T>()`: the sequence for elements of the given class. */
  override container<TItem extends CAEXWrapper>(type: AnyCtor<TItem>): CAEXSequence<TItem> | null {
    if (!((type as unknown) === T.AttributeFamilyType || (typeof type === 'function' && T.AttributeFamilyType.prototype instanceof type))) {
      return super.container(type);
    }
    const attributeType: unknown = this.attributeType;
    return attributeType instanceof T.CAEXSequence ? (attributeType as CAEXSequence<TItem>) : null;
  }

  private createInstanceAttributes(attributeInstance: AttributeType): void {
    attributeInstance.attributeDataType = this.attributeDataType;
    attributeInstance.attributeTypeReference = this;
    if (!isNullOrEmpty(super.value)) {
      attributeInstance.value = super.value;
    } else {
      attributeInstance.value = this.defaultValue;
    }
    attributeInstance.defaultValue = this.defaultValue;
    attributeInstance.name = super.name;
    attributeInstance.unit = this.unit;
  }

  private createClassInstanceInDocument(): AttributeType {
    const cAEXDocument: CAEXDocument = this.caexDocument!;
    ServiceLocator.undoRedoService?.pause(cAEXDocument);
    T.CaexCommand.isSilent = true;
    const attributeType = CAEXElementFactory.create(cAEXDocument, T.AttributeType)!;
    this.createInstanceAttributes(attributeType);
    for (const item of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Attribute', new T.AttributeValueComparer('Name'))) {
      attributeType.attribute.appendRaw(new XElement(item));
    }
    for (const item2 of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Constraint', new T.AttributeValueComparer('Name'))) {
      attributeType.constraint.appendRaw(new XElement(item2));
    }
    for (const item3 of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'RefSemantic', new T.AttributeValueComparer('CorrespondingAttributePath'))) {
      attributeType.refSemantic.appendRaw(new XElement(item3));
    }
    XmlOperation.makeUnique(attributeType.node!);
    ServiceLocator.undoRedoService?.resume(cAEXDocument);
    T.CaexCommand.isSilent = false;
    return attributeType;
  }

  /**
   * Creates a class instance for this AttributeType object. All inherited base classes are
   * resolved in the resulting Attribute. If a document is specified, the instance is created in
   * that document, otherwise in the document of the class (also IInstantiable.CreateClassInstance).
   */
  createClassInstance(targetDocument: CAEXDocument | null = null): AttributeType {
    if (targetDocument === null || targetDocument === undefined) {
      targetDocument = this.caexDocument!;
    }
    if (targetDocument === this.caexDocument) {
      return this.createClassInstanceInDocument();
    }
    ServiceLocator.undoRedoService?.pause(targetDocument);
    T.CaexCommand.isSilent = true;
    const attributeType = CAEXElementFactory.create(targetDocument, T.AttributeType)!;
    this.createInstanceAttributes(attributeType);
    for (const item of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Attribute', new T.AttributeValueComparer('Name'))) {
      const attributeType2 = new T.AttributeType(item);
      attributeType.attribute.import(attributeType2, attributeType2.name, false);
    }
    for (const item2 of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'Constraint', new T.AttributeValueComparer('Name'))) {
      attributeType.constraint.appendRaw(new XElement(item2));
    }
    for (const item3 of XmlOperation.existingElementsFromBaseClassAndSelf(this, 'RefSemantic', new T.AttributeValueComparer('CorrespondingAttributePath'))) {
      attributeType.refSemantic.appendRaw(new XElement(item3));
    }
    ServiceLocator.undoRedoService?.resume(targetDocument);
    T.CaexCommand.isSilent = false;
    return attributeType;
  }

  /** Enumerates the AttributeType children (the `attributeType` sequence). */
  [Symbol.iterator](): Iterator<AttributeFamilyType> {
    return this.attributeType[Symbol.iterator]();
  }

  /**
   * Gets the reference (inheritance) hierarchy: this instance and the reference hierarchy of an
   * associated BaseClass. With a class as second argument, this is the obsolete generic C#
   * overload `GetReferenceHierarchy<T>(bool)`, which returns a snapshot (C# Queue<T>) and throws
   * an InvalidCastException for an element that is not of that class.
   */
  getReferenceHierarchy(includeExternals?: boolean): Iterable<AttributeFamilyType>;
  getReferenceHierarchy<TClass>(includeExternals: boolean, type: AnyCtor<TClass>): TClass[];
  getReferenceHierarchy<TClass>(includeExternals = true, type?: AnyCtor<TClass>): Iterable<AttributeFamilyType> | TClass[] {
    if (type !== undefined) {
      return from(this.getReferenceHierarchy(includeExternals))
        .select((x) => {
          if (!(x instanceof type)) throw new InvalidCastException('Specified cast is not valid.');
          return x as TClass;
        })
        .toList();
    }
    if (!includeExternals && CAEXPathBuilder.isReferenceWithAlias(this.refBaseClassPath, CAEXBasicObjectExtensions.caexSchema(this))) {
      return [this];
    }
    if (!T.CAEXWrapper.equals(this.baseClass, null)) {
      return from<AttributeFamilyType>(CollectionExtensions.yield<AttributeFamilyType>(this)).concat(this.baseClass!.getReferenceHierarchy(includeExternals));
    }
    return CollectionExtensions.yield<AttributeFamilyType>(this);
  }

  /**
   * Inserts the specified CAEX object in its associated sequence. C# overloads
   * `Insert(CAEXWrapper, bool asFirst = true, bool asIs = false)` and `Insert(int pos, CAEXWrapper)`.
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(caexObjectOrPos: CAEXWrapper | number | null, asFirstOrObject?: boolean | CAEXWrapper | null, asIsArg?: boolean): boolean {
    const asIs = asIsArg ?? false;
    if (typeof caexObjectOrPos === 'number') {
      const pos = caexObjectOrPos;
      const caexObject = (asFirstOrObject ?? null) as CAEXWrapper | null;
      if (caexObject instanceof T.AttributeFamilyType) {
        return this.attributeType.insertAt(pos, caexObject) !== null;
      }
      return super.insert(pos, caexObject);
    }
    const caexObject = caexObjectOrPos;
    const asFirst = (asFirstOrObject ?? true) as boolean;
    if (caexObject instanceof T.AttributeFamilyType) {
      return this.attributeType.insert(caexObject, asFirst, asIs) !== null;
    }
    return super.insert(caexObject, asFirst, asIs);
  }

  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (caexObject instanceof T.AttributeFamilyType) {
      return this.attributeType.import(caexObject, name, withSubclasses);
    }
    return super.import(caexObject, name, withSubclasses);
  }

  /**
   * Removes this AttributeType from the document. If `removeRelations` is set, all existing
   * references found in Attributes or other AttributeTypes are removed (but not the referencing
   * elements).
   */
  override remove(removeRelations = false): void {
    if (removeRelations) {
      for (const item of from(ServiceLocator.queryService.elementsWithCAEXPathReference(this.caexDocument!.caexFile, this.caexPath())).toList()) {
        const caexObject = item.caexObject;
        if (!(caexObject instanceof T.AttributeFamilyType)) {
          if (caexObject instanceof T.AttributeType) {
            caexObject.attributeTypeReference = null;
          }
        } else {
          caexObject.baseClass = null;
        }
      }
    }
    super.remove(removeRelations);
  }
}

registerInterfaces(
  AttributeFamilyType,
  'IInstantiable_1',
  'IInstantiable',
  'ICAEXObject',
  'ICAEXBasicObject',
  'ICAEXWrapper',
  'IXMLWrapper',
  'IObjectWithInheritedAttributes',
  'IObjectWithAttributes',
  'IClassWithBaseClassReference_1',
  'IClassWithBaseClassReference',
  'IAttributeTypeContainer',
);

T.AttributeFamilyType = AttributeFamilyType;
