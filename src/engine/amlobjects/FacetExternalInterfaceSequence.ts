// Port of Aml.Engine.AmlObjects.FacetExternalInterfaceSequence (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { implementsInterface } from '../interfaces.js';
import { from } from '../../system/linq.js';
import { ExternalInterfaceSequence } from '../caex/ExternalInterfaceSequence.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import { ObjectWithBaseClass } from '../caex/extensions/ObjectWithBaseClass.js';
import type { ExternalInterfaceType } from '../caex/ExternalInterfaceType.js';
import type { CAEXWrapper } from '../caex/CAEXWrapper.js';
import type { NameValueTuple } from '../caex/ICAEXSequence.js';
import type { IObjectWithExternalInterface } from '../caex/IObjectWithExternalInterface.js';
import type { SystemUnitFamilyType } from '../caex/SystemUnitFamilyType.js';
import type { XElement } from '../../xml/index.js';

/**
 * The external interface sequence of an AMLFacet: a facet may only contain interfaces of its parent. If
 * the owner is not an AMLFacet, the sequence behaves like an ExternalInterfaceSequence (except for the
 * parameterless Append and Prepend, which always return `null`).
 */
export class FacetExternalInterfaceSequence extends ExternalInterfaceSequence {
  /**
   * Initializes a new instance.
   * @param owner The owner.
   * @param create Function to create an ExternalInterfaceType.
   * @param getCAEXOwner If set, the CAEXOwner is provided by this function.
   */
  constructor(owner: XElement | null, create: (e: XElement) => ExternalInterfaceType, getCAEXOwner: (() => CAEXWrapper | null) | null = null) {
    super(owner, create, getCAEXOwner);
  }

  /**
   * `Append()`: appends a new interface if the owner is not a facet; the result is always `null`.
   * `Append(string name)`: if the owner is a facet, appends an interface only when the parent has
   * a not yet assigned interface with this name (in CAEX 3.0 as a mirror of it); otherwise `null`.
   * `Append(params (string, object)[])` is not overridden in C#. Can return `null`.
   */
  override append(): ExternalInterfaceType;
  override append(name: string): ExternalInterfaceType;
  override append(...attributeValueTuples: NameValueTuple[]): ExternalInterfaceType;
  override append(...args: unknown[]): ExternalInterfaceType | null {
    if (args.length === 0) {
      if (!new T.AMLFacet(this.owner).isFacet) {
        super.append();
      }
      return null;
    }
    if (!(args.length === 1 && (typeof args[0] === 'string' || args[0] === null))) {
      return super.append(...(args as NameValueTuple[]));
    }
    const name = args[0] as string | null;
    const aMLFacet = new T.AMLFacet(this.owner);
    if (!aMLFacet.isFacet) {
      return super.append(name as string);
    }
    const externalInterfaceType = from(aMLFacet.notAssignedParentInterfaces()).firstOrDefault((a) => a.name === name);
    if (T.CAEXWrapper.equals(externalInterfaceType, null)) {
      return null;
    }
    const externalInterfaceType2 = super.append();
    externalInterfaceType2.name = name;
    if (CAEXBasicObjectExtensions.caexSchema(externalInterfaceType2) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      externalInterfaceType2.master = externalInterfaceType;
    }
    return externalInterfaceType2;
  }

  /**
   * Inserts the interface. If the owner is a facet, only a not yet assigned interface of the
   * parent is inserted (in CAEX 3.0 as a mirror of it); otherwise the result is `null`.
   */
  override insert(extInterface: ExternalInterfaceType | null, asFirst = true, asIs = false): ExternalInterfaceType | null {
    const aMLFacet = new T.AMLFacet(this.owner);
    if (!aMLFacet.isFacet) {
      return super.insert(extInterface, asFirst, asIs);
    }
    if (aMLFacet.hasInterfaceOfParent(extInterface!)) {
      return null;
    }
    if (!this.isInterfaceOfParent(extInterface!)) {
      return null;
    }
    if (!from(aMLFacet.notAssignedParentInterfaces()).contains(extInterface!)) {
      return null;
    }
    const externalInterfaceType = super.insert(extInterface, asFirst, asIs);
    if (CAEXBasicObjectExtensions.caexSchema(extInterface!) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      externalInterfaceType!.master = extInterface;
    }
    return externalInterfaceType;
  }

  /**
   * `Prepend()`: prepends a new interface if the owner is not a facet; the result is always
   * `null`. The other overloads are not overridden in C#. Can return `null`.
   */
  override prepend(): ExternalInterfaceType;
  override prepend(name: string): ExternalInterfaceType;
  override prepend(...attributeValueTuples: NameValueTuple[]): ExternalInterfaceType;
  override prepend(...args: unknown[]): ExternalInterfaceType | null {
    if (args.length === 1 && (typeof args[0] === 'string' || args[0] === null)) {
      return super.prepend(args[0] as string);
    }
    if (args.length !== 0) {
      return super.prepend(...(args as NameValueTuple[]));
    }
    if (!new T.AMLFacet(this.owner).isFacet) {
      super.prepend();
    }
    return null;
  }

  private isInterfaceOfParent(extInterface: ExternalInterfaceType): boolean {
    const objectWithExternalInterface = new T.AMLFacet(this.owner).caexParent;
    if (!implementsInterface(objectWithExternalInterface, 'IObjectWithExternalInterface')) {
      return false;
    }
    let source: Iterable<ExternalInterfaceType>;
    if (!(objectWithExternalInterface instanceof T.SystemUnitFamilyType)) {
      source = (objectWithExternalInterface as unknown as IObjectWithExternalInterface).externalInterface;
    } else {
      source = ObjectWithBaseClass.getInheritedInterfaces(objectWithExternalInterface as SystemUnitFamilyType);
    }
    return from(source).contains(extInterface);
  }
}

T.FacetExternalInterfaceSequence = FacetExternalInterfaceSequence;
