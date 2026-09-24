// Port of Aml.Engine.CAEX.InterfaceClassLibType.

import type { XElement } from '../../xml/index.js';
import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { CAEXLibrary } from './CAEXLibrary.js';
import type { InterfaceFamilyType } from './InterfaceFamilyType.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';

/** Wrapper for the CAEX element 'InterfaceClassLib'. */
export class InterfaceClassLibType extends CAEXLibrary<InterfaceFamilyType> {
  /** @internal The constructor function for this type. */
  static get Constructor(): (n: XElement) => InterfaceClassLibType {
    return (n) => new InterfaceClassLibType(n);
  }

  /** Gets the collection of InterfaceClass objects contained in this library. */
  get interfaceClass(): CAEXSequenceOfCAEXObjectsWithReference<InterfaceFamilyType> {
    return this.libraryElements;
  }

  /** Initializes a new instance for a 'InterfaceClassLib' XML node. */
  constructor(interfaceClassLibNode: XElement | null) {
    super(interfaceClassLibNode);
    this.createElementSequence = (o: XElement | null) =>
      new T.CAEXSequenceOfCAEXObjectsWithReference<InterfaceFamilyType>(o, 'InterfaceClass', T.InterfaceFamilyType.Constructor, () => this);
  }

  /** Gets the CAEXSequence owned by this object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return !(caexObject instanceof T.InterfaceFamilyType) ? super.caexSequence(caexObject) : this.interfaceClass;
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
      if (caexObject instanceof T.InterfaceFamilyType) {
        return this.interfaceClass.insertAt(pos, caexObject) !== null;
      }
      return super.insert(pos, caexObject);
    }
    const caexObject = a;
    const asFirst = (b as boolean | undefined) ?? true;
    const asIs = c ?? false;
    if (caexObject instanceof T.InterfaceFamilyType) {
      return this.interfaceClass.insert(caexObject, asFirst, asIs) !== null;
    }
    return super.insert(caexObject, asFirst, asIs);
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (caexObject instanceof T.InterfaceFamilyType) {
      return this.interfaceClass.import(caexObject, name, withSubclasses);
    }
    return super.import(caexObject, name, withSubclasses);
  }
}

registerInterfaces(InterfaceClassLibType, 'IInterfaceClassContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
T.InterfaceClassLibType = InterfaceClassLibType;
