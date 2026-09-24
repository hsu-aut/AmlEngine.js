// Port of Aml.Engine.CAEX.MappingType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from } from '../../system/linq.js';
import type { XElement } from '../../xml/index.js';
import { CAEXBasicObject } from './CAEXBasicObject.js';
import type { AttributeNameMappingType } from './AttributeNameMappingType.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { IObjectWithRoleReference } from './IObjectWithRoleReference.js';
import type { InterfaceIDMappingType } from './InterfaceIDMappingType.js';
import type { InterfaceNameMappingType } from './InterfaceNameMappingType.js';
import type { RoleRequirementsType } from './RoleRequirementsType.js';
import type { SupportedRoleClassType } from './SupportedRoleClassType.js';

/** Wrapper for the CAEX element 'MappingObject'. */
export class MappingType extends CAEXBasicObject {
  /** Gets the collection of AttributeNameMapping objects (a new sequence on every access). */
  get attributeNameMapping(): CAEXSequence<AttributeNameMappingType> {
    return new T.CAEXSequence<AttributeNameMappingType>(this.node, 'AttributeNameMapping', T.AttributeNameMappingType.Constructor, () => this);
  }

  /** Gets the collection of InterfaceIDMapping objects (a new sequence on every access). */
  get interfaceIDMapping(): CAEXSequence<InterfaceIDMappingType> {
    return new T.CAEXSequence<InterfaceIDMappingType>(this.node, 'InterfaceIDMapping', T.InterfaceIDMappingType.Constructor, () => this);
  }

  /** Gets the collection of InterfaceNameMapping objects (a new sequence on every access). */
  get interfaceNameMapping(): CAEXSequence<InterfaceNameMappingType> {
    return new T.CAEXSequence<InterfaceNameMappingType>(this.node, 'InterfaceNameMapping', T.InterfaceNameMappingType.Constructor, () => this);
  }

  /** The constructor function for the MappingType. */
  static get Constructor(): (n: XElement | null) => MappingType {
    return (n) => new MappingType(n);
  }

  /** The role reference this mapping belongs to (internal in C#). */
  get mappingRoleReference(): IObjectWithRoleReference | null {
    const cAEXParent = this.caexParent;
    if (!(cAEXParent instanceof T.RoleRequirementsType)) {
      if (!(cAEXParent instanceof T.SupportedRoleClassType)) {
        if (cAEXParent instanceof T.InternalElementType) {
          const objectWithRoleReference: IObjectWithRoleReference | null = from<RoleRequirementsType>(cAEXParent.roleRequirements).firstOrDefault();
          return objectWithRoleReference ?? from<SupportedRoleClassType>(cAEXParent.supportedRoleClass).firstOrDefault();
        }
        return null;
      }
      return cAEXParent;
    }
    return cAEXParent;
  }

  /**
   * Initializes a new instance.
   * @param nodeElement A 'MappingObject' XML node.
   */
  constructor(nodeElement: XElement | null) {
    super(nodeElement);
  }

  /** Gets the CAEXSequence owned by this CAEX object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return caexObject instanceof T.InterfaceNameMappingType
      ? this.interfaceNameMapping
      : caexObject instanceof T.InterfaceIDMappingType
        ? this.interfaceIDMapping
        : !(caexObject instanceof T.AttributeNameMappingType)
          ? super.caexSequence(caexObject)
          : this.attributeNameMapping;
  }

  /**
   * Inserts the specified CAEX object in its associated sequence (`Insert(CAEXWrapper, bool, bool)`)
   * or at the given position (`Insert(int, CAEXWrapper)`).
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(arg0: CAEXWrapper | number | null, arg1?: boolean | CAEXWrapper | null, arg2?: boolean): boolean {
    if (typeof arg0 === 'number') {
      const pos = arg0;
      const caexObject = (arg1 ?? null) as CAEXWrapper | null;
      if (!(caexObject instanceof T.InterfaceNameMappingType)) {
        if (!(caexObject instanceof T.InterfaceIDMappingType)) {
          if (caexObject instanceof T.AttributeNameMappingType) {
            return this.attributeNameMapping.insertAt(pos, caexObject) != null;
          }
          return super.insert(pos, caexObject);
        }
        return this.interfaceIDMapping.insertAt(pos, caexObject) != null;
      }
      return this.interfaceNameMapping.insertAt(pos, caexObject) != null;
    }
    const caexObject = arg0;
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (!(caexObject instanceof T.InterfaceNameMappingType)) {
      if (!(caexObject instanceof T.InterfaceIDMappingType)) {
        if (caexObject instanceof T.AttributeNameMappingType) {
          return this.attributeNameMapping.insert(caexObject, asFirst, asIs) != null;
        }
        return super.insert(caexObject, asFirst, asIs);
      }
      return this.interfaceIDMapping.insert(caexObject, asFirst, asIs) != null;
    }
    return this.interfaceNameMapping.insert(caexObject, asFirst, asIs) != null;
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!(caexObject instanceof T.InterfaceNameMappingType)) {
      if (!(caexObject instanceof T.InterfaceIDMappingType)) {
        if (caexObject instanceof T.AttributeNameMappingType) {
          return this.attributeNameMapping.import(caexObject, name, withSubclasses);
        }
        return super.import(caexObject, name, withSubclasses);
      }
      return this.interfaceIDMapping.import(caexObject, name, withSubclasses);
    }
    return this.interfaceNameMapping.import(caexObject, name, withSubclasses);
  }
}

T.MappingType = MappingType;
