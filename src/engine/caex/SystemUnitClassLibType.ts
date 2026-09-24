// Port of Aml.Engine.CAEX.SystemUnitClassLibType.

import type { XElement } from '../../xml/index.js';
import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { CAEXLibrary } from './CAEXLibrary.js';
import type { SystemUnitFamilyType } from './SystemUnitFamilyType.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';

/** Wrapper for the CAEX element 'SystemUnitClassLib'. */
export class SystemUnitClassLibType extends CAEXLibrary<SystemUnitFamilyType> {
  /** @internal The constructor function for this type. */
  static Constructor: (n: XElement) => SystemUnitClassLibType = (n) => new SystemUnitClassLibType(n);

  /** Gets the collection of SystemUnitClass objects contained in this library. */
  get systemUnitClass(): CAEXSequenceOfCAEXObjectsWithReference<SystemUnitFamilyType> {
    return this.libraryElements;
  }

  /** Initializes a new instance for a 'SystemUnitClassLib' XML node. */
  constructor(systemUnitClassLibNode: XElement | null) {
    super(systemUnitClassLibNode);
    this.createElementSequence = (o: XElement | null) =>
      new T.CAEXSequenceOfCAEXObjectsWithReference<SystemUnitFamilyType>(o, 'SystemUnitClass', T.SystemUnitFamilyType.Constructor, () => this);
  }

  /** Gets the CAEXSequence owned by this object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return !(caexObject instanceof T.SystemUnitFamilyType) ? super.caexSequence(caexObject) : this.systemUnitClass;
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
      if (caexObject instanceof T.SystemUnitFamilyType) {
        return this.systemUnitClass.insertAt(pos, caexObject) !== null;
      }
      return super.insert(pos, caexObject);
    }
    const caexObject = a;
    const asFirst = (b as boolean | undefined) ?? true;
    const asIs = c ?? false;
    if (caexObject instanceof T.SystemUnitFamilyType) {
      return this.systemUnitClass.insert(caexObject, asFirst, asIs) !== null;
    }
    return super.insert(caexObject, asFirst, asIs);
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (caexObject instanceof T.SystemUnitFamilyType) {
      return this.systemUnitClass.import(caexObject, name, withSubclasses);
    }
    return super.import(caexObject, name, withSubclasses);
  }
}

registerInterfaces(SystemUnitClassLibType, 'ISystemUnitClassContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
T.SystemUnitClassLibType = SystemUnitClassLibType;
