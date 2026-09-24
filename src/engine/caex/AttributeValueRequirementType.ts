// Port of Aml.Engine.CAEX.AttributeValueRequirementType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import type { XElement } from '../../xml/index.js';
import { NotImplementedException } from '../../system/exceptions.js';
import { CAEXBasicObject } from './CAEXBasicObject.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { NominalScaledTypeType } from './NominalScaledTypeType.js';
import type { OrdinalScaledTypeType } from './OrdinalScaledTypeType.js';
import type { UnknownTypeType } from './UnknownTypeType.js';

/**
 * This class is a wrapper for the CAEX-Element 'AttributeValueRequirement' which allows the
 * specification of one value constraint for an attribute: a NominalScaledType, an
 * OrdinalScaledType or an UnknownType.
 */
export class AttributeValueRequirementType extends CAEXBasicObject {
  /**
   * The constructor function (C# `AttributeValueRequirementType.Constructor`, set by the static
   * constructor; the name `constructor` is not available for a static member in JS).
   * @internal
   */
  static Constructor: (n: XElement) => AttributeValueRequirementType;

  /** Gets and sets the name of the attribute value constraint. */
  get name(): string | null {
    return this.getXAttributeValue('Name');
  }

  set name(value: string | null) {
    if (!(this.name === value)) {
      this.setXAttributeValue('Name', value);
      this.raisePropertyChanged('Name');
    }
  }

  /** Gets the 'NominalScaledType' constraint. */
  get nominalScaledType(): NominalScaledTypeType {
    return new T.NominalScaledTypeType(this.element('NominalScaledType'));
  }

  /** Gets the 'OrdinalScaledType' constraint. */
  get ordinalScaledType(): OrdinalScaledTypeType {
    return new T.OrdinalScaledTypeType(this.element('OrdinalScaledType'));
  }

  /** Gets the 'UnknownType' constraint. */
  get unknownType(): UnknownTypeType {
    return new T.UnknownTypeType(this.element('UnknownType'));
  }

  /** @param constraintNode A 'Constraint' XML node. */
  constructor(constraintNode: XElement) {
    super(constraintNode);
  }

  static {
    AttributeValueRequirementType.Constructor = (n: XElement) => new AttributeValueRequirementType(n);
  }

  /**
   * Inserts the specified CAEX object (UnknownType, OrdinalScaledType or NominalScaledType; only
   * one of them is allowed as a child). C# overloads `Insert(CAEXWrapper, bool asFirst = true,
   * bool asIs = false)` (asFirst is ignored) and `Insert(int pos, CAEXWrapper)`.
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(caexObjectOrPos: CAEXWrapper | number | null, asFirstOrObject?: boolean | CAEXWrapper | null, asIsArg?: boolean): boolean {
    const asIs = asIsArg ?? false;
    if (typeof caexObjectOrPos === 'number') {
      const pos = caexObjectOrPos;
      const caexObject = (asFirstOrObject ?? null) as CAEXWrapper | null;
      if (!this.canAdd()) {
        return super.insert(pos, caexObject);
      }
      T.InsertCmd.insertElement(this.node!, caexObject!.node!);
      if (!(caexObject instanceof T.UnknownTypeType)) {
        if (!(caexObject instanceof T.OrdinalScaledTypeType)) {
          if (caexObject instanceof T.NominalScaledTypeType) {
            return T.CAEXWrapper.equals(this.nominalScaledType, caexObject);
          }
          return super.insert(pos, caexObject);
        }
        return T.CAEXWrapper.equals(this.ordinalScaledType, caexObject);
      }
      return T.CAEXWrapper.equals(this.unknownType, caexObject);
    }
    const caexObject = caexObjectOrPos;
    const asFirst = (asFirstOrObject ?? true) as boolean;
    if (!this.canAdd()) {
      return super.insert(caexObject, asFirst, asIs);
    }
    T.InsertCmd.insertElement(this.node!, caexObject!.node!);
    if (!(caexObject instanceof T.UnknownTypeType)) {
      if (!(caexObject instanceof T.OrdinalScaledTypeType)) {
        if (caexObject instanceof T.NominalScaledTypeType) {
          return !T.CAEXWrapper.equals(this.nominalScaledType, null);
        }
        throw new NotImplementedException();
      }
      return !T.CAEXWrapper.equals(this.ordinalScaledType, null);
    }
    return !T.CAEXWrapper.equals(this.unknownType, null);
  }

  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!this.canAdd()) {
      return super.import(caexObject, name, withSubclasses);
    }
    T.InsertCmd.insertElement(this.node!, caexObject!.node!);
    if (!(caexObject instanceof T.UnknownTypeType)) {
      if (!(caexObject instanceof T.OrdinalScaledTypeType)) {
        if (caexObject instanceof T.NominalScaledTypeType) {
          return this.nominalScaledType;
        }
        throw new NotImplementedException();
      }
      return this.ordinalScaledType;
    }
    return this.unknownType;
  }

  /** A new 'NominalScaledType' constraint is defined if no constraint has been defined before. */
  new_NominalType(): NominalScaledTypeType | null {
    if (!this.canAdd()) {
      return null;
    }
    return new T.NominalScaledTypeType(T.InsertNewCmd.insertNewElement(this.node!, XmlCAEXSchema.xName(this.node, 'NominalScaledType')));
  }

  /** A new 'OrdinalScaledType' constraint is added if no constraint has been defined before. */
  new_OrdinalType(): OrdinalScaledTypeType | null {
    if (!this.canAdd()) {
      return null;
    }
    return new T.OrdinalScaledTypeType(T.InsertNewCmd.insertNewElement(this.node!, XmlCAEXSchema.xName(this.node, 'OrdinalScaledType')));
  }

  /** A new 'UnknownType' constraint is added if no constraint has been defined before. */
  new_UnknownType(): UnknownTypeType | null {
    if (!this.canAdd()) {
      return null;
    }
    return new T.UnknownTypeType(T.InsertNewCmd.insertNewElement(this.node!, XmlCAEXSchema.xName(this.node, 'UnknownType')));
  }

  private canAdd(): boolean {
    if (this.node !== null && this.node !== undefined) {
      if (!this.unknownType.exists) {
        if (!this.nominalScaledType.exists) {
          if (!this.ordinalScaledType.exists) {
            return true;
          }
          throw exception(
            'Exception',
            'A OrdinalScaledType node is already existent. It is not allowed to add more than one child node to current element according to CAEX Schema',
          );
        }
        throw exception(
          'Exception',
          'A NominalScaledType node is already existent. It is not allowed to add more than one child node to current element according to CAEX Schema',
        );
      }
      throw exception(
        'Exception',
        'A UnknownType node is already existent. It is not allowed to add more than one UnknownType node to current element according to CAEX Schema',
      );
    }
    throw exception('FieldAccessException', 'Node not defined for this Instance');
  }
}

T.AttributeValueRequirementType = AttributeValueRequirementType;

/** A .NET exception without a class of its own in src/system (System.Exception, FieldAccessException). */
function exception(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}
