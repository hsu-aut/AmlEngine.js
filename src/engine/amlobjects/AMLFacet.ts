// Port of Aml.Engine.AmlObjects.AMLFacet (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { implementsInterface } from '../interfaces.js';
import { from } from '../../system/linq.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { InternalElementType } from '../caex/InternalElementType.js';
import { CAEXElementFactory } from '../caex/extensions/CAEXElementFactory.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import { ObjectWithBaseClass } from '../caex/extensions/ObjectWithBaseClass.js';
import { AutomationMLBaseRoleClassLib } from './AutomationMLBaseRoleClassLib.js';
import type { AttributeSequence } from '../caex/AttributeSequence.js';
import type { AttributeType } from '../caex/AttributeType.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { CAEXWrapper } from '../caex/CAEXWrapper.js';
import type { ExternalInterfaceSequence } from '../caex/ExternalInterfaceSequence.js';
import type { ExternalInterfaceType } from '../caex/ExternalInterfaceType.js';
import type { ICAEXSequence } from '../caex/ICAEXSequence.js';
import type { ICAEXWrapper } from '../caex/ICAEXWrapper.js';
import type { IObjectWithAttributes } from '../caex/IObjectWithAttributes.js';
import type { IObjectWithExternalInterface } from '../caex/IObjectWithExternalInterface.js';
import type { InternalElementSequence } from '../caex/InternalElementSequence.js';
import type { SystemUnitFamilyType } from '../caex/SystemUnitFamilyType.js';
import type { XElement } from '../../xml/index.js';
import type { FacetAttributeSequence } from './FacetAttributeSequence.js';
import type { FacetExternalInterfaceSequence } from './FacetExternalInterfaceSequence.js';
import type { ObjectWithAMLAttributes } from './ObjectWithAMLAttributes.js';

/**
 * An AML Facet is an AML object providing a certain view on attributes or interfaces of its parent
 * AML object [IEC 62714-1:2014 8.3]. It is a CAEX InternalElement with an association to the
 * RoleClass "Facet"; it contains attributes and interfaces of its parent only.
 */
export class AMLFacet extends InternalElementType {
  /** The Facet name. */
  static readonly FacetName = 'Facet';

  private _facetAttribute: FacetAttributeSequence | null = null;

  private _facetExternalInterface: FacetExternalInterfaceSequence | null = null;

  /** The collection of InternalElement objects for an AMLFacet is always `null` (static in C#). */
  static get internalElement(): InternalElementSequence | null {
    return null;
  }

  /**
   * Gets the collection of Attribute objects of this facet (the FacetAttributeSequence). C# hides
   * the base property with `new`; here it overrides it.
   */
  override get attribute(): AttributeSequence {
    return this.facetAttribute;
  }

  /**
   * Gets the collection of ExternalInterface objects of this facet (the
   * FacetExternalInterfaceSequence). C# hides the base property with `new`; here it overrides it.
   */
  override get externalInterface(): ExternalInterfaceSequence {
    return this.facetExternalInterface;
  }

  /** Gets the collection of Attribute objects of this facet. */
  get facetAttribute(): FacetAttributeSequence {
    return (this._facetAttribute ??= new T.FacetAttributeSequence(this.node, T.AttributeType.Constructor, () => this));
  }

  /** Gets the collection of ExternalInterface objects of this facet. */
  get facetExternalInterface(): FacetExternalInterfaceSequence {
    return (this._facetExternalInterface ??= new T.FacetExternalInterfaceSequence(this.node, T.ExternalInterfaceType.Constructor, () => this));
  }

  /** Gets a value indicating whether the defining InternalElement instance is an AMLFacet. */
  get isFacet(): boolean {
    return from(this.roleReferences).any((r) => (r != null ? AutomationMLBaseRoleClassLib.isFacet(r) : false));
  }

  /**
   * Initializes a new instance.
   * @param internalElementNode An InternalElement node.
   */
  constructor(internalElementNode: XElement | null) {
    super(internalElementNode);
  }

  /**
   * Creates an AMLFacet AML object with this name, using the provided document.
   * @param document The CAEX document.
   * @param name The name of the new AMLFacet object.
   * @param alias An alias name, if the facet role is defined in an external referenced file.
   * @returns The new AMLFacet object.
   */
  static create(document: CAEXDocument, name: string, alias: string | null = null): AMLFacet {
    const internalElementType = CAEXElementFactory.create(document, T.InternalElementType)!;
    internalElementType.name = name;
    AutomationMLBaseRoleClassLib.makeFacet(internalElementType.roleRequirements.append(), alias);
    return new AMLFacet(internalElementType.node);
  }

  /** C# `implicit operator ObjectWithAMLAttributes(AMLFacet)`. */
  static override op_Implicit(facet: AMLFacet | null): ObjectWithAMLAttributes | null {
    if (!T.CAEXWrapper.equals(facet, null)) {
      return new T.ObjectWithAMLAttributes(facet!);
    }
    return null;
  }

  /** Gets the attributes of the parent object which are assigned to this facet. */
  assignedParentAttributes(): AttributeType[] {
    const objectWithAttributes = this.caexParent;
    if (!implementsInterface(objectWithAttributes, 'IObjectWithAttributes')) {
      return [];
    }
    let source: Iterable<AttributeType>;
    if (!(objectWithAttributes instanceof T.SystemUnitFamilyType)) {
      source = (objectWithAttributes as unknown as IObjectWithAttributes).attribute;
    } else {
      source = ObjectWithBaseClass.getInheritedAttributes(objectWithAttributes as SystemUnitFamilyType);
    }
    return from(source)
      .where((a) => this.hasAttributeOfParent(a))
      .toList();
  }

  /** Gets the interfaces of the parent object which are assigned to this facet. */
  assignedParentInterfaces(): ExternalInterfaceType[] {
    const objectWithExternalInterface = this.caexParent;
    if (!implementsInterface(objectWithExternalInterface, 'IObjectWithExternalInterface')) {
      return [];
    }
    let source: Iterable<ExternalInterfaceType>;
    if (!(objectWithExternalInterface instanceof T.SystemUnitFamilyType)) {
      source = (objectWithExternalInterface as unknown as IObjectWithExternalInterface).externalInterface;
    } else {
      source = ObjectWithBaseClass.getInheritedInterfaces(objectWithExternalInterface as SystemUnitFamilyType);
    }
    return from(source)
      .where((e) => this.hasInterfaceOfParent(e))
      .toList();
  }

  /**
   * Gets the CAEXSequence owned by this CAEX object which contains the specified CAEX object.
   * @returns The sequence, or `null` if the object is not a child of this object.
   */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      if (!(caexObject instanceof T.ExternalInterfaceType)) {
        if (!(caexObject instanceof T.AttributeType)) {
          return super.caexSequence(caexObject);
        }
        return this.facetAttribute;
      }
      return this.facetExternalInterface;
    }
    return null;
  }

  /** Determines whether the attribute of the parent is assigned to this facet. */
  hasAttributeOfParent(attribute: AttributeType): boolean {
    if (CAEXBasicObjectExtensions.caexSchema(attribute) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return from(this.attribute).any((e) => e.isMirror && T.CAEXWrapper.equals(e.master, attribute));
    }
    return from(this.attribute).any((e) => e.name === attribute.name);
  }

  /** Determines whether the interface of the parent is assigned to this facet. */
  hasInterfaceOfParent(externalInterface: ExternalInterfaceType): boolean {
    if (CAEXBasicObjectExtensions.caexSchema(externalInterface) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return from(this.externalInterface).any((e) => e.isMirror && T.CAEXWrapper.equals(e.master, externalInterface));
    }
    return from(this.externalInterface).any((e) => e.name === externalInterface.name);
  }

  /**
   * Inserts the specified CAEX object in its associated container. Attributes and interfaces are
   * inserted into the facet sequences (only those of the parent); SystemUnitClass objects are not
   * inserted (`false`). The `Insert(int, CAEXWrapper)` overload is not overridden in C#.
   * @throws ArgumentNullException caexObject is null.
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(arg0: CAEXWrapper | number | null, arg1?: boolean | CAEXWrapper | null, arg2?: boolean): boolean {
    if (typeof arg0 === 'number') {
      return super.insert(arg0, (arg1 ?? null) as CAEXWrapper | null);
    }
    const caexObject = arg0;
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (T.CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (!(caexObject instanceof T.SystemUnitClassType)) {
      if (caexObject instanceof T.ExternalInterfaceType) {
        return this.facetExternalInterface.insert(caexObject, asFirst, asIs) != null;
      }
      if (!(caexObject instanceof T.AttributeType)) {
        return super.insert(caexObject, asFirst, asIs);
      }
      return this.facetAttribute.insert(caexObject, asFirst, asIs) != null;
    }
    return false;
  }

  /** Imports the CAEX object; attributes and interfaces into the facet sequences, SystemUnitClass objects not (`null`). */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (T.CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (!(caexObject instanceof T.SystemUnitClassType)) {
      if (caexObject instanceof T.ExternalInterfaceType) {
        return this.facetExternalInterface.import(caexObject, name, withSubclasses);
      }
      return !(caexObject instanceof T.AttributeType)
        ? super.import(caexObject, name, withSubclasses)
        : this.facetAttribute.import(caexObject, name, withSubclasses);
    }
    return null;
  }

  /** Gets the attributes of the parent object which are not assigned to this facet. */
  notAssignedParentAttributes(): AttributeType[] {
    const objectWithAttributes = this.caexParent;
    if (!implementsInterface(objectWithAttributes, 'IObjectWithAttributes')) {
      return [];
    }
    let source: Iterable<AttributeType>;
    if (!(objectWithAttributes instanceof T.SystemUnitFamilyType)) {
      source = (objectWithAttributes as unknown as IObjectWithAttributes).attribute;
    } else {
      source = ObjectWithBaseClass.getInheritedAttributes(objectWithAttributes as SystemUnitFamilyType);
    }
    return from(source)
      .where((attribute2) => !this.hasAttributeOfParent(attribute2))
      .toList();
  }

  /** Gets the interfaces of the parent object which are not assigned to this facet. */
  notAssignedParentInterfaces(): ExternalInterfaceType[] {
    const objectWithExternalInterface = this.caexParent;
    if (!implementsInterface(objectWithExternalInterface, 'IObjectWithExternalInterface')) {
      return [];
    }
    let source: Iterable<ExternalInterfaceType>;
    if (!(objectWithExternalInterface instanceof T.SystemUnitFamilyType)) {
      source = (objectWithExternalInterface as unknown as IObjectWithExternalInterface).externalInterface;
    } else {
      source = ObjectWithBaseClass.getInheritedInterfaces(objectWithExternalInterface as SystemUnitFamilyType);
    }
    return from(source)
      .where((externalInterface2) => !this.hasInterfaceOfParent(externalInterface2))
      .toList();
  }

  /** Gets the source attribute of the parent for the provided facet attribute. */
  sourceAttribute(facetAttribute: AttributeType): AttributeType | null {
    if (CAEXBasicObjectExtensions.caexSchema(facetAttribute) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return facetAttribute.master;
    }
    return from(this.assignedParentAttributes()).firstOrDefault((a) => a.name === facetAttribute.name);
  }

  /** Gets the source interface of the parent for the provided facet interface. */
  sourceInterface(facetInterface: ExternalInterfaceType): ExternalInterfaceType | null {
    if (CAEXBasicObjectExtensions.caexSchema(facetInterface) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return facetInterface.master;
    }
    return from(this.assignedParentInterfaces()).firstOrDefault((a) => a.name === facetInterface.name);
  }
}

T.AMLFacet = AMLFacet;
