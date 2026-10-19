// Port of Aml.Engine.CAEX.Extensions.AdditionalInformationExtension (Aml.Engine 4.5.2).
//
// The C# implementation (de)serializes the content with System.Xml.Serialization.XmlSerializer,
// which has no counterpart in JavaScript. The sequence and its selection condition are ported;
// reading or writing a value throws NotSupportedException (see docs/port-notes/extensions.md).

import { T } from '../../registry.js';
import { NotSupportedException } from '../../../system/exceptions.js';
import { parseXDocument, type XElement } from '../../../xml/index.js';
import { XmlOperation } from '../../xmlext/XmlOperation.js';
import type { CAEXBasicObject } from '../CAEXBasicObject.js';
import type { ValueSequence } from '../ValueSequence.js';

type Ctor<R> = abstract new (...args: never[]) => R;

/** Extension for AdditionalInformation elements holding XML serialized objects. */
export class AdditionalInformationExtension {
  private constructor() {}

  /**
   * Gets the sequence of AdditionalInformation elements whose content is an XML serialized
   * object of type `type` (C# generic parameter T).
   */
  static serializedAdditionalInformation<R>(caexObject: CAEXBasicObject, type: Ctor<R>): ValueSequence<R> {
    const valueSequence = new T.ValueSequence<R>(caexObject.node, 'AdditionalInformation', (e: XElement) =>
      AdditionalInformationExtension.condition(e, type),
    );
    valueSequence.valueConverter.setConverters(
      (element: XElement) => AdditionalInformationExtension.convertFrom(element, type),
      (association: R) => AdditionalInformationExtension.convertTo(association, type),
    );
    return valueSequence;
  }

  private static condition<R>(e: XElement, type: Ctor<R>): boolean {
    // XElement.Parse(e.Value)?.Name?.LocalName == typeof(T).Name
    return (parseXDocument(e.value).root?.name?.localName ?? null) === type.name;
  }

  private static convertFrom<R>(element: XElement, type: Ctor<R>): R {
    // new XmlSerializer(typeof(T)).Deserialize(new StringReader(element.Value))
    const obj = deserialize(element.value, type);
    if (obj instanceof T.AdditionalInformationContent) {
      const parent = element.parent;
      const wrapper = parent == null ? null : XmlOperation.createCAEXWrapper(parent);
      obj.caexObject = wrapper instanceof T.CAEXBasicObject ? wrapper : null;
    }
    return obj;
  }

  private static convertTo<R>(association: R, type: Ctor<R>): unknown {
    // XmlSerializer.Serialize with Indent = true, OmitXmlDeclaration = true and no namespaces.
    return serialize(association, type);
  }
}

function deserialize<R>(_text: string, type: Ctor<R>): R {
  throw new NotSupportedException(`XmlSerializer is not available: cannot deserialize ${type.name}.`);
}

function serialize<R>(_value: R, type: Ctor<R>): string {
  throw new NotSupportedException(`XmlSerializer is not available: cannot serialize ${type.name}.`);
}
