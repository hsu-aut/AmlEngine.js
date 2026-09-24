// Port of Aml.Engine.CAEX.RoleClassLibType.

import type { XElement } from '../../xml/index.js';
import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { CAEXLibrary } from './CAEXLibrary.js';
import type { RoleFamilyType } from './RoleFamilyType.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';

/**
 * Wrapper for the CAEX element 'RoleClassLib', a container for a hierarchy of role class
 * definitions (RoleFamilyType). CAEX supports multiple role class libraries.
 */
export class RoleClassLibType extends CAEXLibrary<RoleFamilyType> {
  /** @internal The constructor function for this type. */
  static get Constructor(): (n: XElement) => RoleClassLibType {
    return (n) => new RoleClassLibType(n);
  }

  /** Gets the collection of RoleClass objects contained in this library. */
  get roleClass(): CAEXSequenceOfCAEXObjectsWithReference<RoleFamilyType> {
    return this.libraryElements;
  }

  /** Initializes a new instance for a 'RoleClassLib' XML node. */
  constructor(roleClassLibNode: XElement | null) {
    super(roleClassLibNode);
    this.createElementSequence = (o: XElement | null) =>
      new T.CAEXSequenceOfCAEXObjectsWithReference<RoleFamilyType>(o, 'RoleClass', T.RoleFamilyType.Constructor, () => this);
  }

  /** Gets the CAEXSequence owned by this object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return !(caexObject instanceof T.RoleFamilyType) ? super.caexSequence(caexObject) : this.roleClass;
  }

  /**
   * Inserts the CAEX object into its associated sequence: insert(caexObject, asFirst = true,
   * asIs = false) or insert(pos, caexObject).
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(a: CAEXWrapper | number | null, b?: boolean | CAEXWrapper | null, c?: boolean): boolean {
    if (typeof a === 'number') {
      const pos = a;
      const caexObject = b as CAEXWrapper | null;
      if (caexObject instanceof T.RoleFamilyType) {
        return this.roleClass.insertAt(pos, caexObject) !== null;
      }
      return super.insert(pos, caexObject);
    }
    const caexObject = a;
    const asFirst = (b as boolean | undefined) ?? true;
    const asIs = c ?? false;
    if (caexObject instanceof T.RoleFamilyType) {
      return this.roleClass.insert(caexObject, asFirst, asIs) !== null;
    }
    return super.insert(caexObject, asFirst, asIs);
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (caexObject instanceof T.RoleFamilyType) {
      return this.roleClass.import(caexObject, name, withSubclasses);
    }
    return super.import(caexObject, name, withSubclasses);
  }
}

registerInterfaces(RoleClassLibType, 'IRoleClassContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
T.RoleClassLibType = RoleClassLibType;
