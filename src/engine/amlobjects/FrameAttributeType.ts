// Port of Aml.Engine.AmlObjects.FrameAttributeType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { ArgumentOutOfRangeException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { AttributeType } from '../caex/AttributeType.js';
import { CAEXElementFactory } from '../caex/extensions/CAEXElementFactory.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import { AutomationMLBaseAttributeTypeLib } from './AutomationMLBaseAttributeTypeLib.js';
import { ClassReferenceWithAlias } from './ClassReferenceWithAlias.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { FrameValues } from './FrameValues.js';
import type { XElement } from '../../xml/index.js';

/**
 * A Frame attribute defines the position (x, y, z in m) and the rotation (rx, ry, rz in degrees)
 * of an AML object [IEC 62714-1:2014 A.3.2].
 */
export class FrameAttributeType extends AttributeType {
  /** The frame attribute name. */
  static readonly FRAME_NAME = 'Frame';

  /** The name of the rx attribute. */
  static readonly RX_Name = 'rx';

  /** The name of the ry attribute. */
  static readonly RY_Name = 'ry';

  /** The name of the rz attribute. */
  static readonly RZ_Name = 'rz';

  /** The name of the x attribute. */
  static readonly X_Name = 'x';

  /** The name of the y attribute. */
  static readonly Y_Name = 'y';

  /** The name of the z attribute. */
  static readonly Z_Name = 'z';

  /**
   * The number format info (a clone of `CultureInfo.CurrentCulture.NumberFormat` in C#; here the
   * invariant separators, since JS has no current culture).
   * @deprecated don't use this, because all frame values have to be saved as xs:double with standard format
   */
  static readonly FormatInfo: { readonly numberDecimalSeparator: string; readonly numberGroupSeparator: string } = {
    numberDecimalSeparator: '.',
    numberGroupSeparator: ',',
  };

  /** Gets or sets the frame values. */
  get frame(): FrameValues {
    const frameValues = new T.FrameValues(
      this.xAttribute?.getDouble() ?? 0.0,
      this.yAttribute?.getDouble() ?? 0.0,
      this.zAttribute?.getDouble() ?? 0.0,
      this.rxAttribute?.getDouble() ?? 0.0,
      this.ryAttribute?.getDouble() ?? 0.0,
      this.rzAttribute?.getDouble() ?? 0.0,
    );
    frameValues.frameAttribute = this;
    return frameValues;
  }

  set frame(value: FrameValues) {
    this.createFrameAttributes();
    value.frameAttribute = this;
    this.xAttribute!.setDouble(value.x);
    this.yAttribute!.setDouble(value.y);
    this.zAttribute!.setDouble(value.z);
    this.rxAttribute!.setDouble(value.rx);
    this.ryAttribute!.setDouble(value.ry);
    this.rzAttribute!.setDouble(value.rz);
  }

  /** Gets the rx attribute. */
  get rxAttribute(): AttributeType | null {
    return this.attribute.item('rx');
  }

  /** Gets the ry attribute. */
  get ryAttribute(): AttributeType | null {
    return this.attribute.item('ry');
  }

  /** Gets the rz attribute. */
  get rzAttribute(): AttributeType | null {
    return this.attribute.item('rz');
  }

  /** Gets the x attribute. */
  get xAttribute(): AttributeType | null {
    return this.attribute.item('x');
  }

  /** Gets the y attribute. */
  get yAttribute(): AttributeType | null {
    return this.attribute.item('y');
  }

  /** Gets the z attribute. */
  get zAttribute(): AttributeType | null {
    return this.attribute.item('z');
  }

  /**
   * Initializes a new instance for the attribute node (`FrameAttributeType(XElement)`), and sets
   * the frame values if provided (`FrameAttributeType(XElement, FrameValues)`).
   */
  constructor(attributeNode: XElement | null, frameValues?: FrameValues) {
    super(attributeNode!);
    if (frameValues !== undefined) {
      this.frame = frameValues;
    }
  }

  /**
   * Creates a new Frame attribute with the frame values 0, using the provided document.
   * @param doc The document.
   * @param alias An alias name, if the attribute type library is an external reference.
   */
  static create(doc: CAEXDocument, alias: string | null = null): FrameAttributeType {
    const attributeType = CAEXElementFactory.create(doc, T.AttributeType)!;
    attributeType.name = 'Frame';
    if (doc.schema !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      attributeType.refAttributeType = ClassReferenceWithAlias.classReference('AutomationMLBaseAttributeTypeLib/Frame', alias);
    }
    return new FrameAttributeType(attributeType.node, new T.FrameValues());
  }

  /** Determines whether the node is a Frame attribute with the six frame values. */
  static isFrame(node: XElement | null): boolean {
    const attributeType = new T.AttributeType(node!);
    if (attributeType.name !== 'Frame') {
      return false;
    }
    let num = 0;
    for (const current of attributeType.attribute) {
      switch (current.name) {
        case 'x':
        case 'y':
        case 'z':
        case 'rx':
        case 'ry':
        case 'rz':
          num++;
          break;
      }
    }
    return num === 6;
  }

  /** Determines whether the attribute is a Frame attribute. */
  static isFrameAttribute(attribute: AttributeType): boolean {
    if (CAEXBasicObjectExtensions.caexSchema(attribute) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      if (!AutomationMLBaseAttributeTypeLib.isFrame(attribute)) {
        return (attribute?.name ?? null) === 'Frame';
      }
      return true;
    }
    return (attribute?.name ?? null) === 'Frame';
  }

  /**
   * Sets the missing units and the data type xs:double of the frame values of a Frame attribute.
   * @returns `true`, if something has been changed.
   */
  static validateAndRepairFrameDatatypes(node: XElement | null): boolean {
    const attributeType = new T.AttributeType(node!);
    if (attributeType.name !== 'Frame') {
      return false;
    }
    let result = false;
    for (const item of attributeType.attribute) {
      switch (item.name) {
        case 'y':
        case 'x':
        case 'z':
        case 'rx':
        case 'ry':
        case 'rz': {
          if (isNullOrEmpty(item.unit)) {
            result = true;
            const attributeType2 = item;
            let unit: string | null;
            switch (item.name) {
              case 'y':
              case 'x':
              case 'z':
                unit = 'm';
                break;
              case 'ry':
              case 'rx':
              case 'rz':
                unit = 'deg';
                break;
              default:
                unit = item.unit;
                break;
            }
            attributeType2.unit = unit;
          }
          if (!(item.attributeDataType === T.XsdDataTypes.doubleType)) {
            item.attributeDataType = T.XsdDataTypes.doubleType;
            result = true;
          }
          break;
        }
      }
    }
    return result;
  }

  /** @internal Writes a changed frame value to the associated attribute. */
  framePropertyChanged(frameValues: FrameValues, propertyName: string): void {
    switch (propertyName) {
      case 'x':
        this.xAttribute?.setDouble(frameValues.x);
        break;
      case 'y':
        this.yAttribute?.setDouble(frameValues.y);
        break;
      case 'z':
        this.zAttribute?.setDouble(frameValues.z);
        break;
      case 'rx':
        this.rxAttribute?.setDouble(frameValues.rx);
        break;
      case 'ry':
        this.ryAttribute?.setDouble(frameValues.ry);
        break;
      case 'rz':
        this.rzAttribute?.setDouble(frameValues.rz);
        break;
      default:
        throw new ArgumentOutOfRangeException(propertyName);
    }
  }

  private createFrameAttributes(): void {
    if (T.CAEXWrapper.equals(this.xAttribute, null)) {
      const attributeType = this.attribute.append();
      attributeType.name = 'x';
      attributeType.attributeDataType = T.XsdDataTypes.doubleType;
      attributeType.unit = 'm';
    }
    if (T.CAEXWrapper.equals(this.yAttribute, null)) {
      const attributeType2 = this.attribute.append();
      attributeType2.name = 'y';
      attributeType2.attributeDataType = T.XsdDataTypes.doubleType;
      attributeType2.unit = 'm';
    }
    if (T.CAEXWrapper.equals(this.zAttribute, null)) {
      const attributeType3 = this.attribute.append();
      attributeType3.name = 'z';
      attributeType3.attributeDataType = T.XsdDataTypes.doubleType;
      attributeType3.unit = 'm';
    }
    if (T.CAEXWrapper.equals(this.rxAttribute, null)) {
      const attributeType4 = this.attribute.append();
      attributeType4.name = 'rx';
      attributeType4.attributeDataType = T.XsdDataTypes.doubleType;
      attributeType4.unit = 'deg';
    }
    if (T.CAEXWrapper.equals(this.ryAttribute, null)) {
      const attributeType5 = this.attribute.append();
      attributeType5.name = 'ry';
      attributeType5.attributeDataType = T.XsdDataTypes.doubleType;
      attributeType5.unit = 'deg';
    }
    if (T.CAEXWrapper.equals(this.rzAttribute, null)) {
      const attributeType6 = this.attribute.append();
      attributeType6.name = 'rz';
      attributeType6.attributeDataType = T.XsdDataTypes.doubleType;
      attributeType6.unit = 'deg';
    }
  }
}

T.FrameAttributeType = FrameAttributeType;
