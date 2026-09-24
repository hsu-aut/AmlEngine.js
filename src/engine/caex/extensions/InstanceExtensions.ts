// Port of Aml.Engine.CAEX.Extensions.InstanceExtensions (Aml.Engine 4.5.2), internal in C#.

import { implementsInterface } from '../../interfaces.js';
import { ArgumentException } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { from } from '../../../system/linq.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import { CAEXPathBuilder } from './CAEXPathBuilder.js';
import { T } from '../../registry.js';
import type { AttributeType } from '../AttributeType.js';
import type { CAEXDocument } from '../CAEXDocument.js';
import type { CAEXObject } from '../CAEXObject.js';
import type { ExternalInterfaceType } from '../ExternalInterfaceType.js';
import type { IClassWithExternalInterface } from '../IClassWithExternalInterface.js';
import type { IObjectWithAttributes } from '../IObjectWithAttributes.js';
import type { IObjectWithExternalInterface } from '../IObjectWithExternalInterface.js';
import type { IObjectWithExternalInterfaceAndInherited } from '../IObjectWithExternalInterfaceAndInherited.js';
import type { IObjectWithInheritedAttributes } from '../IObjectWithInheritedAttributes.js';
import type { InternalElementType } from '../InternalElementType.js';
import type { ICAEXReference } from '../../services/interfaces/ICAEXReference.js';

/** Helpers keeping instances up to date with their classes. */
export class InstanceExtensions {
  private constructor() {}

  /** Adds (copies) the attributes of the reference which the instance doesn't have; updates nested attributes. */
  static updateWithAddedAttributes(instanceWithAttributes: IObjectWithAttributes, referenceWithAttributes: IObjectWithAttributes | null): void {
    const list: AttributeType[] = implementsInterface(referenceWithAttributes, 'IObjectWithInheritedAttributes')
      ? [...(referenceWithAttributes as unknown as IObjectWithInheritedAttributes).attributeAndInherited]
      : [...(referenceWithAttributes!.attribute as Iterable<AttributeType>)];
    for (let i = 0; i < list.length; i++) {
      const attribute = list[i];
      const attributeType = from<AttributeType>(instanceWithAttributes.attribute).firstOrDefault((e) => e.name === attribute.name);
      if (attributeType != null) {
        InstanceExtensions.updateWithAddedAttributes(attributeType, attribute);
      } else {
        instanceWithAttributes.attribute.insertAt(i, attribute.copy() as AttributeType);
      }
    }
  }

  /** Adds (copies) the interfaces of the reference which the instance doesn't have; updates nested interfaces and attributes. */
  static updateWithAddedExternalInterfaces(
    instanceWithInterfaces: IObjectWithExternalInterface,
    referenceWithInterfaces: IObjectWithExternalInterface | null,
  ): void {
    const list: ExternalInterfaceType[] = implementsInterface(referenceWithInterfaces, 'IObjectWithExternalInterfaceAndInherited')
      ? [...(referenceWithInterfaces as unknown as IObjectWithExternalInterfaceAndInherited).externalInterfaceAndInherited]
      : [...(referenceWithInterfaces!.externalInterface as Iterable<ExternalInterfaceType>)];
    for (let i = 0; i < list.length; i++) {
      const externalInterface = list[i];
      const externalInterfaceType = from<ExternalInterfaceType>(instanceWithInterfaces.externalInterface).firstOrDefault(
        (e) => e.name === externalInterface.name,
      );
      if (externalInterfaceType != null) {
        InstanceExtensions.updateWithAddedExternalInterfaces(externalInterfaceType, externalInterface);
        InstanceExtensions.updateWithAddedAttributes(externalInterfaceType, externalInterface);
      } else {
        instanceWithInterfaces.externalInterface.insertAt(i, externalInterface.copy() as ExternalInterfaceType);
      }
    }
  }

  /** Replaces referenced IDs by the mapped IDs (ID references and attribute mirror references). */
  static mapIDReferences(iDMap: Map<string, string> | null, caexObject: CAEXObject, targetDocument: CAEXDocument | null): void {
    const lookup = ServiceLocator.defaultQueryService.allElementsWithIDReference(caexObject) as Iterable<Iterable<ICAEXReference> & { key: string }>;
    for (const item of lookup) {
      if (!iDMap!.has(item.key)) {
        continue;
      }
      const value = iDMap!.get(item.key) as string;
      for (const item2 of item) {
        item2.setValue(replaceOrdinal(item2.referenceAttributeValue!, item.key, value));
      }
    }
    const attributes = from<AttributeType>(CAEXBasicObjectExtensions.descendants(caexObject, T.AttributeType) as Iterable<AttributeType>).where(
      (a) => !isNullOrEmpty(a.refAttributeType) && a.attributeTypeReference == null,
    );
    for (const item3 of attributes) {
      const r = CAEXPathBuilder.instanceIDInAttributeReference(item3.refAttributeType, targetDocument);
      const text = r.result;
      const isAttributeReference = r.isAttributeReference;
      if (iDMap!.has(text) && isAttributeReference) {
        const value2 = iDMap!.get(text) as string;
        item3.refAttributeType = replaceOrdinal(item3.refAttributeType as string, text, value2);
      }
    }
  }

  /** Imports all interfaces (including inherited) of the source class into the instance. */
  static importInterfacesToInstance(import_: IObjectWithExternalInterface, source: IClassWithExternalInterface): void {
    for (const item of source.externalInterfaceAndInherited as Iterable<ExternalInterfaceType>) {
      import_.externalInterface.import(item, item.name, false);
    }
  }

  /**
   * Adds (copies) the InternalElements of the SystemUnitClass (including inherited) which the
   * instance doesn't have, recursively; with a reference element, those of that element.
   */
  static updateWithAddedInternalElements(internalElement: InternalElementType, referenceInternalElement?: InternalElementType): void {
    if (referenceInternalElement !== undefined) {
      InstanceExtensions.updateWithAddedInternalElementsFrom(internalElement, referenceInternalElement);
      return;
    }
    const list: InternalElementType[] = [...(internalElement.systemUnitClass!.internalElementAndInherited as Iterable<InternalElementType>)];
    for (let i = 0; i < list.length; i++) {
      const element = list[i];
      const internalElementType = from<InternalElementType>(internalElement.internalElement).firstOrDefault((e) => e.name === element.name);
      if (internalElementType != null) {
        InstanceExtensions.updateWithAddedInternalElementsFrom(internalElementType, element);
        InstanceExtensions.updateWithAddedAttributes(internalElementType, element);
        InstanceExtensions.updateWithAddedExternalInterfaces(internalElementType, element);
      } else {
        internalElement.internalElement.insertAt(i, element.copy() as InternalElementType);
      }
    }
  }

  /** UpdateWithAddedInternalElements(InternalElementType, InternalElementType), private in C#. */
  private static updateWithAddedInternalElementsFrom(internalElement: InternalElementType, referenceInternalElement: InternalElementType): void {
    const list: InternalElementType[] = [...(referenceInternalElement.internalElement as Iterable<InternalElementType>)];
    for (let i = 0; i < list.length; i++) {
      const element = list[i];
      const internalElementType = from<InternalElementType>(internalElement.internalElement).firstOrDefault((e) => e.name === element.name);
      if (internalElementType != null) {
        InstanceExtensions.updateWithAddedInternalElementsFrom(internalElementType, element);
        InstanceExtensions.updateWithAddedAttributes(internalElementType, element);
        InstanceExtensions.updateWithAddedExternalInterfaces(internalElementType, element);
      } else {
        internalElement.internalElement.insertAt(i, element.copy() as InternalElementType);
      }
    }
  }
}

/** string.Replace(string, string), ordinal. */
function replaceOrdinal(s: string, oldValue: string, newValue: string | null): string {
  if (oldValue.length === 0) throw new ArgumentException('String cannot be of zero length.', 'oldValue');
  return s.split(oldValue).join(newValue ?? '');
}
