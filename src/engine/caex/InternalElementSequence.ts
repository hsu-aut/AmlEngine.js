// Port of Aml.Engine.CAEX.InternalElementSequence (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from, type Enumerable } from '../../system/linq.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { XAttribute, XElement } from '../../xml/index.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';
import { CAEXWrapper } from './CAEXWrapper.js';
import type { InternalElementType } from './InternalElementType.js';

/** The sequence of InternalElement elements of a CAEX object. */
export class InternalElementSequence extends CAEXSequenceOfCAEXObjectsWithReference<InternalElementType> {
  /**
   * Initializes a new instance.
   * @param owner The owner.
   * @param create The constructor function.
   * @param getCAEXOwner If set, the caexOwner is provided by this function.
   */
  constructor(owner: XElement | null, create: (e: XElement) => InternalElementType, getCAEXOwner: (() => CAEXWrapper | null) | null = null) {
    super(owner, 'InternalElement', create, getCAEXOwner);
  }

  /**
   * Creates a mirror of the master InternalElement and appends it to this sequence; the name is
   * made unique if a UniqueNameService is registered.
   */
  addNewMirror(masterInternalElement: InternalElementType | null): InternalElementType {
    if (CAEXWrapper.equals(masterInternalElement, null)) {
      throw new ArgumentNullException('masterInternalElement');
    }
    const internalElementType = masterInternalElement!.createMirror()!;
    if (ServiceLocator.uniqueNameService != null) {
      const name = ServiceLocator.uniqueNameService.uniqueCAEXName(this.owner!, this.elementName.localName, internalElementType.name as string);
      internalElementType.name = name;
    }
    this.insert(internalElementType, false);
    return internalElementType;
  }

  /** Gets the internal elements of this sequence and all their nested internal elements. */
  internalElementDescendantsAndSelf(): Enumerable<InternalElementType> {
    return from<InternalElementType>(this).concat(
      from<InternalElementType>(this).selectMany((e) => e.internalElement.internalElementDescendantsAndSelf()),
    );
  }

  /** @internal */
  override createCaexWrapper(node: XElement | null): InternalElementType {
    if (node != null) {
      return new T.InternalElementType(node);
    }
    return null as unknown as InternalElementType;
  }

  /** @internal */
  override createElement(owner: XElement | null): XElement | null {
    return new XElement(
      this.elementName,
      new XAttribute('Name', ServiceLocator.uniqueNameService?.uniqueCAEXName(owner!, 'InternalElement') ?? ''),
      new XAttribute('ID', ServiceLocator.idService.generateNewID()),
    );
  }
}

T.InternalElementSequence = InternalElementSequence;
