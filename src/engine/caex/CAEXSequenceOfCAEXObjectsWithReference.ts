// Port of Aml.Engine.CAEX.CAEXSequenceOfCAEXObjectsWithReference<T> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { InvalidCastException } from '../../system/exceptions.js';
import type { XElement } from '../../xml/index.js';
import { CAEXSequenceOfCAEXObjects } from './CAEXSequenceOfCAEXObjects.js';
import type { CAEXObject } from './CAEXObject.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { AttributeTypeType } from './AttributeTypeType.js';

/**
 * A sequence of CAEX objects which can reference a class (base class, class of an instance).
 * Constructor overloads as CAEXSequenceOfCAEXObjects.
 */
export class CAEXSequenceOfCAEXObjectsWithReference<TW extends CAEXObject> extends CAEXSequenceOfCAEXObjects<TW> {
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
    if (arg4 !== undefined || (typeof arg3 === 'function' && arg3.length > 0)) {
      super(owner, caexName, create, arg3 as (e: XElement) => boolean, arg4 ?? null);
    } else {
      super(owner, caexName, create, (arg3 as (() => CAEXWrapper | null) | null | undefined) ?? null);
    }
  }

  /**
   * Creates a new CAEX object with the defined name, appends it and adds a reference to the
   * referenced class. Returns `{ result, isReferenced }` (C# out parameter isReferenced).
   */
  appendWithReference(name: string | null, referencedClass: CAEXObject | null): { result: TW; isReferenced: boolean } {
    const val = this.append(name as string);
    let isReferenced = false;
    if (!(val instanceof T.SystemUnitClassType)) {
      if (!(val instanceof T.RoleClassType)) {
        if (!(val instanceof T.InterfaceClassType)) {
          if (val instanceof T.AttributeTypeType) {
            const attributeTypeType = val as AttributeTypeType;
            isReferenced = attributeTypeType.addReference(referencedClass);
            if (referencedClass !== null && !(referencedClass instanceof T.AttributeTypeType)) {
              throw new InvalidCastException(
                `Unable to cast object of type '${referencedClass.constructor.name}' to type 'Aml.Engine.CAEX.AttributeTypeType'.`,
              );
            }
            attributeTypeType.attributeDataType = (referencedClass as AttributeTypeType).attributeDataType;
          }
        } else {
          isReferenced = val.addReference(referencedClass);
        }
      } else {
        isReferenced = val.addReference(referencedClass);
      }
    } else {
      isReferenced = val.addReference(referencedClass);
    }
    return { result: val, isReferenced };
  }
}

T.CAEXSequenceOfCAEXObjectsWithReference = CAEXSequenceOfCAEXObjectsWithReference;
