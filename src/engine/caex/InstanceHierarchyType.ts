// Port of Aml.Engine.CAEX.InstanceHierarchyType.

import type { XElement } from '../../xml/index.js';
import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { CAEXLibrary } from './CAEXLibrary.js';
import type { InternalElementType } from './InternalElementType.js';
import type { InternalElementSequence } from './InternalElementSequence.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';

/**
 * Wrapper for the CAEX element 'InstanceHierarchy', a container element for a hierarchy of
 * InternalElements.
 */
export class InstanceHierarchyType extends CAEXLibrary<InternalElementType> {
  /** The constructor function for the InstanceHierarchyType. */
  static get Constructor(): (n: XElement) => InstanceHierarchyType {
    return (n) => new InstanceHierarchyType(n);
  }

  /** Gets the wrappers for the InternalElements of the top level of the InstanceHierarchy. */
  get internalElement(): InternalElementSequence {
    return this.libraryElements as InternalElementSequence;
  }

  /** Initializes a new instance for an 'InstanceHierarchy' XML node. */
  constructor(instanceHierarchyNode: XElement | null) {
    super(instanceHierarchyNode);
    this.createElementSequence = (o: XElement | null) =>
      new T.InternalElementSequence(o, T.InternalElementType.Constructor, () => this);
  }

  /** Gets the CAEXSequence owned by this object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return !(caexObject instanceof T.InternalElementType) ? super.caexSequence(caexObject) : this.internalElement;
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
      if (caexObject instanceof T.InternalElementType) {
        return this.internalElement.insertAt(pos, caexObject) !== null;
      }
      return super.insert(pos, caexObject);
    }
    const caexObject = a;
    const asFirst = (b as boolean | undefined) ?? true;
    const asIs = c ?? false;
    if (caexObject instanceof T.InternalElementType) {
      return this.internalElement.insert(caexObject, asFirst, asIs) !== null;
    }
    return super.insert(caexObject, asFirst, asIs);
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (caexObject instanceof T.InternalElementType) {
      return this.internalElement.import(caexObject, name, withSubclasses);
    }
    return super.import(caexObject, name, withSubclasses);
  }
}

registerInterfaces(InstanceHierarchyType, 'IInternalElementContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
T.InstanceHierarchyType = InstanceHierarchyType;
