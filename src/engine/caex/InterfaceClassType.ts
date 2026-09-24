// Port of Aml.Engine.CAEX.InterfaceClassType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { from, type Enumerable } from '../../system/linq.js';
import type { XElement } from '../../xml/index.js';
import { CaexObjectWithReference } from './CaexObjectWithReference.js';
import { CAEXDocumentExtensions } from './extensions/CAEXDocumentExtensions.js';
import type { AttributeSequence } from './AttributeSequence.js';
import type { AttributeType } from './AttributeType.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ExternalInterfaceSequence } from './ExternalInterfaceSequence.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { InterfaceFamilyType } from './InterfaceFamilyType.js';
import type { ObjectWithAMLAttributes } from '../amlobjects/ObjectWithAMLAttributes.js';

type Ctor<C = unknown> = abstract new (...args: never[]) => C;

/** `typeof(type).IsAssignableFrom(typeof(c))` for classes. */
function isAssignableFrom(type: Ctor, c: Ctor): boolean {
  return type === c || c.prototype instanceof type;
}

/** Wrapper for the CAEX element 'InterfaceClass' (base of InterfaceFamilyType and ExternalInterfaceType). */
export class InterfaceClassType extends CaexObjectWithReference<InterfaceClassType> {
  private _attribute: AttributeSequence | null = null;

  private _externalInterface: ExternalInterfaceSequence | null = null;

  /** Gets the collection of Attribute objects for this instance. */
  get attribute(): AttributeSequence {
    return this._attribute ?? (this._attribute = new T.AttributeSequence(this.node, T.AttributeType.Constructor, () => this));
  }

  /** Gets the attributes and all nested attributes. */
  get attributeAndDescendants(): Enumerable<AttributeType> {
    return from<AttributeType>(this.attribute).concat(from<AttributeType>(this.attribute).selectMany((a) => a.attributeAndDescendants));
  }

  /** Gets and sets the base class (the referenced InterfaceClass). */
  get baseClass(): InterfaceFamilyType | null {
    const found = CAEXDocumentExtensions.findByPath(this.caexDocument, this.refBaseClassPath, true, T.InterfaceFamilyType);
    return found instanceof T.InterfaceFamilyType ? found : null;
  }

  set baseClass(value: InterfaceFamilyType | null) {
    this.refBaseClassPath = value?.getReferencePath(this) ?? null;
  }

  /** Gets a collection of ExternalInterface objects contained in this instance. */
  get externalInterface(): ExternalInterfaceSequence {
    return this._externalInterface ?? (this._externalInterface = new T.ExternalInterfaceSequence(this.node, T.ExternalInterfaceType.Constructor, () => this));
  }

  /** Gets the collection of ExternalInterface objects including all nested descendant interfaces. */
  get externalInterfaceAndDescendants(): Enumerable<ExternalInterfaceType> {
    return from<ExternalInterfaceType>(this.externalInterface).concat(
      from<ExternalInterfaceType>(this.externalInterface).selectMany((a) => a.externalInterfaceAndDescendants),
    );
  }

  /** Gets and sets the RefBaseClassPath attribute. */
  get refBaseClassPath(): string | null {
    return this.getXAttributeValue(this.referenceAttributeName);
  }

  set refBaseClassPath(value: string | null) {
    if (!(this.refBaseClassPath === value)) {
      this.setXAttributeValue(this.referenceAttributeName, value);
      this.raisePropertyChanged('RefBaseClassPath');
    }
  }

  /**
   * Initializes a new instance.
   * @param interfaceClassNode An 'InterfaceClass' or 'ExternalInterface' XML node.
   */
  constructor(interfaceClassNode: XElement | null) {
    super(interfaceClassNode, 'RefBaseClassPath');
  }

  /** C# `implicit operator ObjectWithAMLAttributes(InterfaceClassType)`. */
  static op_Implicit(interfaceClass: InterfaceClassType | null): ObjectWithAMLAttributes | null {
    if (!T.CAEXWrapper.equals(interfaceClass, null)) {
      return new T.ObjectWithAMLAttributes(interfaceClass!);
    }
    return null;
  }

  /** Gets the CAEXSequence owned by this CAEX object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return caexObject instanceof T.AttributeType
      ? this.attribute
      : !(caexObject instanceof T.ExternalInterfaceType)
        ? super.caexSequence(caexObject)
        : this.externalInterface;
  }

  /** C# `Container<T>()`: the sequence for elements of the given type. */
  override container<TW extends CAEXWrapper>(type: Ctor<TW>): CAEXSequence<TW> | null {
    if (!isAssignableFrom(type, T.AttributeType)) {
      if (!isAssignableFrom(type, T.ExternalInterfaceType)) {
        return super.container(type);
      }
      // `ExternalInterface as CAEXSequence<T>`: generic classes are invariant in C#.
      return (type as Ctor) === T.ExternalInterfaceType ? (this.externalInterface as unknown as CAEXSequence<TW>) : null;
    }
    return (type as Ctor) === T.AttributeType ? (this.attribute as unknown as CAEXSequence<TW>) : null;
  }

  /**
   * Inserts the specified CAEX object in its associated sequence (`Insert(CAEXWrapper, bool, bool)`)
   * or at the given position (`Insert(int, CAEXWrapper)`).
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(arg0: CAEXWrapper | number | null, arg1?: boolean | CAEXWrapper | null, arg2?: boolean): boolean {
    if (typeof arg0 === 'number') {
      const pos = arg0;
      const caexObject = (arg1 ?? null) as CAEXWrapper | null;
      if (!(caexObject instanceof T.AttributeType)) {
        if (caexObject instanceof T.ExternalInterfaceType) {
          return this.externalInterface.insertAt(pos, caexObject) != null;
        }
        return super.insert(pos, caexObject);
      }
      return this.attribute.insertAt(pos, caexObject) != null;
    }
    const caexObject = arg0;
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (!(caexObject instanceof T.AttributeType)) {
      if (caexObject instanceof T.ExternalInterfaceType) {
        return this.externalInterface.insert(caexObject, asFirst, asIs) != null;
      }
      return super.insert(caexObject, asFirst, asIs);
    }
    return this.attribute.insert(caexObject, asFirst, asIs) != null;
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!(caexObject instanceof T.AttributeType)) {
      if (caexObject instanceof T.ExternalInterfaceType) {
        return this.externalInterface.import(caexObject, name, withSubclasses);
      }
      return super.import(caexObject, name, withSubclasses);
    }
    return this.attribute.import(caexObject, name, withSubclasses);
  }
}

registerInterfaces(InterfaceClassType, 'IObjectWithExternalInterface', 'IObjectWithAttributes', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.InterfaceClassType = InterfaceClassType;
