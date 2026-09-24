// Port of Aml.Engine.AmlObjects.AMLPort (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from } from '../../system/linq.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { InternalElementType } from '../caex/InternalElementType.js';
import { CAEXElementFactory } from '../caex/extensions/CAEXElementFactory.js';
import { AutomationMLBaseRoleClassLib } from './AutomationMLBaseRoleClassLib.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { CAEXWrapper } from '../caex/CAEXWrapper.js';
import type { InternalElementSequence } from '../caex/InternalElementSequence.js';
import type { XElement } from '../../xml/index.js';

/**
 * An AML Port is an AML object that groups a number of interfaces [IEC 62714-1:2014 8.2].
 * The AML Port object has been replaced in AutomationML version 2.1 with an Interface only.
 */
export class AMLPort extends InternalElementType {
  /** The Port name. */
  static readonly PortName = 'Port';

  /** The collection of InternalElement objects for an AMLPort is always `null` (static in C#). */
  static get internalElement(): InternalElementSequence | null {
    return null;
  }

  /** Gets a value indicating whether the defining InternalElement instance is an AMLPort. */
  get isPort(): boolean {
    return from(this.roleReferences).any((r) => AutomationMLBaseRoleClassLib.isPort(r));
  }

  /**
   * Initializes a new instance.
   * @param internalElementNode An InternalElement node.
   */
  constructor(internalElementNode: XElement | null) {
    super(internalElementNode);
  }

  /**
   * Creates an AMLPort AML object with this name, using the provided document.
   * @param document The CAEX document.
   * @param name The name of the new AMLPort object.
   * @param alias An alias name, if the port role is defined in an external referenced file.
   * @returns The created AMLPort object.
   */
  static create(document: CAEXDocument, name: string, alias: string | null = null): AMLPort {
    const internalElementType = CAEXElementFactory.create(document, T.InternalElementType)!;
    internalElementType.name = name;
    AutomationMLBaseRoleClassLib.makePort(internalElementType.roleRequirements.append(), alias);
    internalElementType.attribute.append('Direction').attributeDataType = T.XsdDataTypes.stringType;
    internalElementType.attribute.append('Category').attributeDataType = T.XsdDataTypes.stringType;
    const attributeType = internalElementType.attribute.append('Cardinality');
    attributeType.attribute.append('MinOccur').attributeDataType = T.XsdDataTypes.unsignedIntType;
    attributeType.attribute.append('MaxOccur').attributeDataType = T.XsdDataTypes.unsignedIntType;
    return new AMLPort(internalElementType.node);
  }

  /**
   * Inserts the specified CAEX object in its associated container. AMLPort objects are not allowed
   * to contain child InternalElement objects (and no SystemUnitClass objects at all); for those
   * the result is `false`. The `Insert(int, CAEXWrapper)` overload is not overridden in C#.
   * @throws ArgumentNullException caexObject is null.
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(arg0: CAEXWrapper | number | null, arg1?: boolean | CAEXWrapper | null, arg2?: boolean): boolean {
    if (typeof arg0 === 'number') {
      return super.insert(arg0, (arg1 ?? null) as CAEXWrapper | null);
    }
    const caexObject = arg0;
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (!T.CAEXWrapper.equals(caexObject, null)) {
      if (!(caexObject instanceof T.SystemUnitClassType)) {
        return super.insert(caexObject, asFirst, asIs);
      }
      return false;
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Imports the CAEX object; SystemUnitClass objects are not imported (`null`). */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!T.CAEXWrapper.equals(caexObject, null)) {
      if (caexObject instanceof T.SystemUnitClassType) {
        return null;
      }
      return super.import(caexObject, name, withSubclasses);
    }
    throw new ArgumentNullException('caexObject');
  }
}

T.AMLPort = AMLPort;
