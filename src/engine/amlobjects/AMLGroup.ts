// Port of Aml.Engine.AmlObjects.AMLGroup (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from, type Enumerable } from '../../system/linq.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { InternalElementType } from '../caex/InternalElementType.js';
import { CAEXElementFactory } from '../caex/extensions/CAEXElementFactory.js';
import { AutomationMLBaseRoleClassLib } from './AutomationMLBaseRoleClassLib.js';
import type { AMLFacet } from './AMLFacet.js';
import type { AMLGroupInternalElementSequence } from './AMLGroupInternalElementSequence.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { CAEXWrapper } from '../caex/CAEXWrapper.js';
import type { ICAEXSequence } from '../caex/ICAEXSequence.js';
import type { ICAEXWrapper } from '../caex/ICAEXWrapper.js';
import type { InternalElementSequence } from '../caex/InternalElementSequence.js';
import type { XElement } from '../../xml/index.js';

/**
 * The AML Group concept allows separating structure information from instance information
 * [IEC 62714-1:2014 8.4]. An AML Group object is a CAEX InternalElement with an association to
 * the RoleClass "Group".
 */
export class AMLGroup extends InternalElementType {
  /** The Group name. */
  static readonly GroupName = 'Group';

  private static readonly AssociatedFacetName = 'AssociatedFacet';

  private _groupInternalElement: AMLGroupInternalElementSequence | null = null;

  /** Gets a collection of InternalElement objects contained in this instance. */
  get amlGroupInternalElement(): AMLGroupInternalElementSequence {
    return (this._groupInternalElement ??= new T.AMLGroupInternalElementSequence(this.node, T.InternalElementType.Constructor, () => this));
  }

  /** Gets or sets the associated facet for the AMLGroup object. */
  get associatedFacet(): string | null {
    return from(this.attribute).firstOrDefault((a) => a.name === AMLGroup.AssociatedFacetName)?.value ?? null;
  }

  set associatedFacet(value: string | null) {
    const attributeType =
      from(this.attribute).firstOrDefault((a) => a.name === AMLGroup.AssociatedFacetName) ?? this.attribute.append(AMLGroup.AssociatedFacetName);
    if (!(attributeType.value === value)) {
      attributeType.value = value;
      this.raisePropertyChanged('AssociatedFacet');
    }
  }

  /**
   * Gets the collection of InternalElement objects for this instance (the
   * AMLGroupInternalElementSequence). C# hides the base property with `new`; here it overrides it.
   */
  override get internalElement(): InternalElementSequence {
    return this.amlGroupInternalElement;
  }

  /** Gets a value indicating whether the defining InternalElement instance is an AMLGroup. */
  get isGroup(): boolean {
    return from(this.roleReferences).any((r) => AutomationMLBaseRoleClassLib.isGroup(r));
  }

  /**
   * Initializes a new instance.
   * @param internalElementNode An InternalElement node.
   */
  constructor(internalElementNode: XElement | null) {
    super(internalElementNode);
  }

  /**
   * Creates an AMLGroup AML object with this name, using the provided document.
   * @param document The CAEX document.
   * @param name The name of the new AMLGroup object.
   * @param alias An alias name, if the group role is defined in an external referenced file.
   * @returns The new AMLGroup object.
   */
  static create(document: CAEXDocument, name: string, alias: string | null = null): AMLGroup {
    const internalElementType = CAEXElementFactory.create(document, T.InternalElementType)!;
    internalElementType.name = name;
    AutomationMLBaseRoleClassLib.makeGroup(internalElementType.roleRequirements.append(), alias);
    return new AMLGroup(internalElementType.node);
  }

  /** Returns the distinct names of the facets defined in the master InternalElements of all mirrors in this group. */
  associableFacets(): Enumerable<string | null> {
    return from(this.associableFacetsOfMirrorElements())
      .select((a) => a.name)
      .distinct();
  }

  /**
   * Gets the CAEXSequence owned by this CAEX object which contains the specified CAEX object.
   * @returns The sequence, or `null` if the object is not a child of this object.
   */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      if (!(caexObject instanceof T.InternalElementType)) {
        return super.caexSequence(caexObject);
      }
      return this.amlGroupInternalElement;
    }
    return null;
  }

  /**
   * Inserts the specified CAEX object in its associated container. An AMLGroup object shall only
   * contain InternalElements which are AMLMirrorObjects and/or further AMLGroup objects; for other
   * InternalElements the result is `false`. The `Insert(int, CAEXWrapper)` overload is not
   * overridden in C#.
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
    if (caexObject !== null && caexObject !== undefined) {
      if (caexObject instanceof T.InternalElementType) {
        return this.amlGroupInternalElement.insert(caexObject, asFirst, asIs) != null;
      }
      return super.insert(caexObject, asFirst, asIs);
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Imports the CAEX object; InternalElements are imported into the AMLGroupInternalElementSequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!T.CAEXWrapper.equals(caexObject, null)) {
      if (caexObject instanceof T.InternalElementType) {
        return this.amlGroupInternalElement.import(caexObject, name, withSubclasses);
      }
      return super.import(caexObject, name, withSubclasses);
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Gets all AMLFacets of all mirrors in the group. */
  associableFacetsOfMirrorElements(): Enumerable<AMLFacet> {
    return from(this.amlGroupInternalElement)
      .where((mirror) => mirror.isMirror)
      .select((mirror) => new T.AMLInternalElementType(mirror.master?.node ?? null))
      .where((systemUnitClass) => systemUnitClass.exists)
      .selectMany((systemUnitClass) => systemUnitClass.amlFacets);
  }
}

T.AMLGroup = AMLGroup;
