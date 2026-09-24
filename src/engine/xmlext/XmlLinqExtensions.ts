// Port of Aml.Engine.Xml.Extensions.XmlLinqExtensions (Aml.Engine 4.5.2).

import { ArgumentException, ArgumentNullException } from '../../system/exceptions.js';
import type { XAttribute } from '../../xml/index.js';

/** Extensions for XML Linq elements. */
export class XmlLinqExtensions {
  private constructor() {}

  /** Positions the new attribute after the current attribute. */
  static addAfterSelf(self: XAttribute | null, value: XAttribute | null): void {
    XmlLinqExtensions.addToIndex(self, value, true);
  }

  /** Positions the new attribute before the current attribute. */
  static addBeforeSelf(self: XAttribute | null, value: XAttribute | null): void {
    XmlLinqExtensions.addToIndex(self, value, false);
  }

  private static addToIndex(self: XAttribute | null, value: XAttribute | null, isAfter: boolean): void {
    if (self === null || self === undefined) {
      throw new ArgumentNullException('self');
    }
    if (value === null || value === undefined) {
      throw new ArgumentNullException('value');
    }
    const obj = self.parent;
    if (obj === null) {
      throw new ArgumentException('Attribute does not belong to any element.');
    }
    const list = [...obj.attributes()];
    const num = list.indexOf(self);
    list.splice(num + (isAfter ? 1 : 0), 0, value);
    obj.removeAttributes();
    obj.add(list);
  }
}
