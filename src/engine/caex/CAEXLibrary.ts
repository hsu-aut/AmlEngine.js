// Port of Aml.Engine.CAEX.CAEXLibrary<TLibItem> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import type { XElement } from '../../xml/index.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { CAEXObject } from './CAEXObject.js';
import { CAEXWrapper, newException } from './CAEXWrapper.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';
import type { CAEXFileType } from './CAEXFileType.js';
import type { ICAEXLibrary } from './ICAEXLibrary.js';
import type { IDigitalSigned } from './IDigitalSigned.js';
import type { IMultipleOccurrences } from './IMultipleOccurrences.js';
import type { ISigning } from '../services/interfaces/ISigning.js';

/** Base class of the CAEX libraries (InstanceHierarchy and the class libraries). */
export class CAEXLibrary<TLibItem extends CAEXObject>
  extends CAEXObject
  implements ICAEXLibrary, IDigitalSigned, IMultipleOccurrences<CAEXLibrary<TLibItem>>, Iterable<TLibItem>
{
  private _libraryElements: CAEXSequenceOfCAEXObjectsWithReference<TLibItem> | null = null;

  /** @internal The function creating the sequence of library elements (set by subclasses). */
  createElementSequence: ((e: XElement) => CAEXSequenceOfCAEXObjectsWithReference<TLibItem>) | null = null;

  /** @internal */
  get libraryElements(): CAEXSequenceOfCAEXObjectsWithReference<TLibItem> {
    return this._libraryElements ?? (this._libraryElements = this.createElementSequence!(this.node as XElement));
  }

  /**
   * Indexers: `item(name)` gets the library element with the name (or path);
   * `item(...names)` / `item(names)` the element at the end of the path of names.
   */
  item(name: string | null): TLibItem | null;
  item(names: readonly string[]): TLibItem | null;
  item(...names: string[]): TLibItem | null;
  item(...args: unknown[]): TLibItem | null {
    if (args.length === 1 && !Array.isArray(args[0])) {
      return this.libraryElements.item((args[0] ?? null) as string | null);
    }
    const names = (args.length === 1 ? args[0] : args) as readonly string[];
    return this.libraryElements.item(names);
  }

  /**
   * Initializes a new instance.
   * @param libraryNode The XML node.
   */
  constructor(libraryNode: XElement | null) {
    super(libraryNode);
  }

  /**
   * Creates a copy of this library with the given name, inserts it into the CAEX file and changes
   * the references of the copy to point into the copy. Returns the copy or `null`.
   */
  copyAndChangeReferences(caexFile: CAEXFileType, name: string | null): CAEXLibrary<TLibItem> | null {
    const copy = this.copy();
    const cAEXLibrary = copy instanceof CAEXLibrary ? (copy as CAEXLibrary<TLibItem>) : null;
    if (CAEXWrapper.equals(cAEXLibrary, null)) {
      return null;
    }
    cAEXLibrary!.name = name;
    if (!caexFile.insert(cAEXLibrary, false)) {
      return null;
    }
    cAEXLibrary!.changeReferences(this);
    return cAEXLibrary;
  }

  /** Enumerates the library elements. */
  [Symbol.iterator](): Iterator<TLibItem> {
    return this.libraryElements[Symbol.iterator]();
  }

  /** Inserts the provided library as a new sibling after this library. */
  insertAfter(caexObject: CAEXLibrary<TLibItem> | null): void {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw newException('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, true);
  }

  /** Inserts the provided library as a new sibling before this library. */
  insertBefore(caexObject: CAEXLibrary<TLibItem> | null): void {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw newException('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, false);
  }

  /**
   * Verifies the signature with the registered ISigning service (`null` if none):
   * `verifySignature(publicKey = null)` or `verifySignature(signature, publicKey)`.
   */
  verifySignature(publicKey?: string | null): boolean | null;
  verifySignature(signature: string | null, publicKey: string | null): boolean | null;
  verifySignature(arg0: string | null = null, arg1?: string | null): boolean | null {
    const service = ServiceLocator.getService<ISigning>('ISigning');
    if (arguments.length >= 2) {
      return service?.verifySignature(this, arg0, arg1 ?? null) ?? null;
    }
    return service?.verifySignature(this, arg0) ?? null;
  }
}

registerInterfaces(CAEXLibrary, 'ICAEXLibrary', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper', 'IDigitalSigned', 'ISplitPoint', 'IMultipleOccurrences');

T.CAEXLibrary = CAEXLibrary;
