// Port of Aml.Engine.CAEX.AttributeTypeLibType.

import type { XElement } from '../../xml/index.js';
import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { CAEXLibrary } from './CAEXLibrary.js';
import type { AttributeFamilyType } from './AttributeFamilyType.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';

/**
 * Wrapper for the CAEX element 'AttributeTypeLib', a container for a hierarchy of AttributeType
 * elements (CAEX 3.0 only).
 */
export class AttributeTypeLibType extends CAEXLibrary<AttributeFamilyType> {
  /** @internal The constructor function for this type. */
  static Constructor: (n: XElement) => AttributeTypeLibType = (n) => new AttributeTypeLibType(n);

  /** Gets the collection of AttributeType objects contained in this AttributeTypeLib element. */
  get attributeType(): CAEXSequenceOfCAEXObjectsWithReference<AttributeFamilyType> {
    return this.libraryElements;
  }

  /** Initializes a new instance for an 'AttributeTypeLib' XML node. */
  constructor(attributeTypeLibNode: XElement | null) {
    super(attributeTypeLibNode);
    this.createElementSequence = (o: XElement | null) =>
      new T.CAEXSequenceOfCAEXObjectsWithReference<AttributeFamilyType>(o, 'AttributeType', T.AttributeFamilyType.Constructor, () => this);
  }

  /** Gets the CAEXSequence owned by this object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return !(caexObject instanceof T.AttributeFamilyType) ? super.caexSequence(caexObject) : this.attributeType;
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
      if (caexObject instanceof T.AttributeFamilyType) {
        return this.attributeType.insertAt(pos, caexObject) !== null;
      }
      return super.insert(pos, caexObject);
    }
    const caexObject = a;
    const asFirst = (b as boolean | undefined) ?? true;
    const asIs = c ?? false;
    if (caexObject instanceof T.AttributeFamilyType) {
      return this.attributeType.insert(caexObject, asFirst, asIs) !== null;
    }
    return super.insert(caexObject, asFirst, asIs);
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (caexObject instanceof T.AttributeFamilyType) {
      return this.attributeType.import(caexObject, name, withSubclasses);
    }
    return super.import(caexObject, name, withSubclasses);
  }
}

registerInterfaces(AttributeTypeLibType, 'IAttributeTypeContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
T.AttributeTypeLibType = AttributeTypeLibType;
