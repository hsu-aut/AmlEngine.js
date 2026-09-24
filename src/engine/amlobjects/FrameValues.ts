// Port of Aml.Engine.AmlObjects.FrameValues (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { EventSource } from '../../system/index.js';
import type { PropertyChangedEventArgs } from '../caex/CAEXWrapper.js';
import type { FrameAttributeType } from './FrameAttributeType.js';

/**
 * The values of a Frame attribute (position x, y, z in m and rotation rx, ry, rz in degrees).
 * Changes are written to the associated FrameAttributeType, if any.
 */
export class FrameValues {
  private _rx: number;

  private _ry: number;

  private _rz: number;

  private _x: number;

  private _y: number;

  private _z: number;

  private _propertyChanged: EventSource<PropertyChangedEventArgs> | null = null;

  /** The rotation about the x axis (deg). */
  get rx(): number {
    return this._rx;
  }

  set rx(value: number) {
    this._rx = value;
    this.notifyPropertyChanged('rx');
  }

  /** The rotation about the y axis (deg). */
  get ry(): number {
    return this._ry;
  }

  set ry(value: number) {
    this._ry = value;
    this.notifyPropertyChanged('ry');
  }

  /** The rotation about the z axis (deg). */
  get rz(): number {
    return this._rz;
  }

  set rz(value: number) {
    this._rz = value;
    this.notifyPropertyChanged('rz');
  }

  /** The x coordinate (m). */
  get x(): number {
    return this._x;
  }

  set x(value: number) {
    this._x = value;
    this.notifyPropertyChanged('x');
  }

  /** The y coordinate (m). */
  get y(): number {
    return this._y;
  }

  set y(value: number) {
    this._y = value;
    this.notifyPropertyChanged('y');
  }

  /** The z coordinate (m). */
  get z(): number {
    return this._z;
  }

  set z(value: number) {
    this._z = value;
    this.notifyPropertyChanged('z');
  }

  /** @internal The associated frame attribute. */
  frameAttribute: FrameAttributeType | null = null;

  /** Occurs when a property value changes. */
  get propertyChanged(): EventSource<PropertyChangedEventArgs> {
    return (this._propertyChanged ??= new EventSource<PropertyChangedEventArgs>());
  }

  /**
   * Initializes a new instance with the provided values (`FrameValues(x, y, z, rx, ry, rz)`) or
   * with all values 0 (`FrameValues()`).
   */
  constructor(x = 0.0, y = 0.0, z = 0.0, rx = 0.0, ry = 0.0, rz = 0.0) {
    this._rx = rx;
    this._ry = ry;
    this._rz = rz;
    this._x = x;
    this._y = y;
    this._z = z;
  }

  private notifyPropertyChanged(info: string): void {
    this._propertyChanged?.raise(this, { propertyName: info });
    this.frameAttribute?.framePropertyChanged(this, info);
  }
}

registerInterfaces(FrameValues, 'INotifyPropertyChanged');

T.FrameValues = FrameValues;
