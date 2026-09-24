// Port of Aml.Engine.CAEX.CAEXBasicObject (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces, implementsInterface } from '../interfaces.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { from } from '../../system/linq.js';
import type { DateTime } from '../../system/index.js';
import type { XElement } from '../../xml/index.js';
import { XmlCAEXAttributes } from '../xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { ObjectWithBaseClass } from './extensions/ObjectWithBaseClass.js';
import { CAEXWrapper } from './CAEXWrapper.js';
import { ChangeMode, changeModeToString, tryParseChangeMode } from './ChangeMode.js';
import type { ValueSequence } from './ValueSequence.js';
import type { CopyrightType } from './CopyrightType.js';
import type { DescriptionType } from './DescriptionType.js';
import type { VersionType } from './VersionType.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { RevisionType } from './RevisionType.js';
import type { SourceObjectInformationType } from './SourceObjectInformationType.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { ICAEXBasicObject } from './ICAEXBasicObject.js';
import type { ICAEXContainer } from './ICAEXContainer.js';
import type { IClassWithBaseClassReference } from './IClassWithBaseClassReference.js';

type Ctor<C> = abstract new (...args: never[]) => C;

/**
 * The class CAEXBasicObject comprises a basic set of attributes and header information which
 * exist for all CAEX elements.
 */
export class CAEXBasicObject extends CAEXWrapper implements ICAEXContainer, ICAEXBasicObject {
  /** Gets the collection of AdditionalInformation values contained in this instance. */
  get additionalInformation(): ValueSequence<unknown> {
    return new T.ValueSequence<unknown>(this.node, 'AdditionalInformation', () => this, 'object');
  }

  /** Gets and sets the change mode for a CAEX element (optional in CAEX). */
  get changeMode(): ChangeMode {
    const result = tryParseChangeMode(CAEXBasicObject.uppercaseFirst(this.getXAttributeValue('ChangeMode')));
    if (result === null) {
      return ChangeMode.Undefined;
    }
    return result;
  }

  set changeMode(value: ChangeMode) {
    if (this.changeMode !== value) {
      this.setXAttributeValue('ChangeMode', value === ChangeMode.Undefined ? null : changeModeToString(value).toLowerCase());
      this.raisePropertyChanged('ChangeMode');
    }
  }

  /** Determines if this is an inherited element. */
  get isInherited(): boolean {
    const parent = this.caexParent;
    if (implementsInterface(parent, 'IClassWithBaseClassReference')) {
      return ObjectWithBaseClass.isInherited(parent as unknown as IClassWithBaseClassReference, this);
    }
    return false;
  }

  /** Gets and sets the Copyright (for CAEX 2.15 the content of the Copyright object as string). */
  get copyright(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'Copyright'));
  }

  set copyright(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'Copyright'), value);
  }

  /** Gets the wrapper for the Copyright element. */
  get copyrightElement(): CopyrightType {
    return new T.CopyrightType(this.element('Copyright'));
  }

  /** Gets and sets the Description (for CAEX 2.15 the content of the Description object as string). */
  get description(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'Description'));
  }

  set description(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'Description'), value);
  }

  /** Gets the wrapper for the Description element. */
  get descriptionElement(): DescriptionType {
    return new T.DescriptionType(this.element('Description'));
  }

  /** Gets the collection of Revision objects contained in this instance. */
  get revision(): CAEXSequence<RevisionType> {
    return new T.CAEXSequence<RevisionType>(this.node, 'Revision', T.RevisionType.Constructor, () => this);
  }

  /** Gets the collection of SourceObjectInformation objects contained in this instance. */
  get sourceObjectInformation(): CAEXSequence<SourceObjectInformationType> {
    return new T.CAEXSequence<SourceObjectInformationType>(this.node, 'SourceObjectInformation', T.SourceObjectInformationType.Constructor, () => this);
  }

  /** Gets and sets the Version (for CAEX 2.15 the content of the Version object as string). */
  get version(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'Version'));
  }

  set version(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'Version'), value);
  }

  /** Gets the wrapper for the Version element. */
  get versionElement(): VersionType {
    return new T.VersionType(this.element('Version'));
  }

  /**
   * Initializes a new instance.
   * @param basicNode Any CAEX BasicObject XML node.
   */
  constructor(basicNode: XElement | null) {
    super(basicNode);
  }

  /**
   * Gets the CAEXSequence owned by this instance, which contains the specified CAEX object
   * (for example the Revision sequence for a revision object), or `null`.
   */
  caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return caexObject instanceof T.RevisionType
      ? this.revision
      : !(caexObject instanceof T.SourceObjectInformationType)
        ? null
        : this.sourceObjectInformation;
  }

  /** C# `Container<T>()`: the CAEX container for elements of the given type (class constructor). */
  container<TW extends CAEXWrapper>(type: Ctor<TW>): CAEXSequence<TW> | null {
    void type;
    return null;
  }

  /**
   * `Insert(caexObject, asFirst = true, asIs = false)`: inserts the CAEX object in its
   * associated sequence; `Insert(pos, caexObject)`: inserts it at the defined position.
   * Returns `true` if a sequence could be identified and the object has been inserted.
   */
  insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  insert(arg0: CAEXWrapper | number | null, arg1?: boolean | CAEXWrapper | null, arg2?: boolean): boolean {
    if (typeof arg0 === 'number') {
      const pos = arg0;
      const caexObject = (arg1 ?? null) as CAEXWrapper | null;
      if (!(caexObject instanceof T.RevisionType)) {
        if (caexObject instanceof T.SourceObjectInformationType) {
          this.sourceObjectInformation.insertAt(pos, caexObject);
          return from<CAEXWrapper>(this.sourceObjectInformation).contains(caexObject);
        }
        return false;
      }
      this.revision.insertAt(pos, caexObject);
      return from<CAEXWrapper>(this.revision).contains(caexObject);
    }
    const caexObject = arg0;
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (!(caexObject instanceof T.RevisionType)) {
      if (caexObject instanceof T.SourceObjectInformationType) {
        return this.sourceObjectInformation.insert(caexObject, asFirst, asIs) != null;
      }
      return false;
    }
    return this.revision.insert(caexObject, asFirst, asIs) != null;
  }

  /**
   * Imports (copies, with recalculated references) the specified CAEX object into its
   * associated sequence; returns the created object or `null`.
   * @param name The name of the imported object (the original name is kept if not defined).
   * @param withSubclasses `true`, if a class should be imported with all its subclasses.
   */
  import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!(caexObject instanceof T.RevisionType)) {
      if (caexObject instanceof T.SourceObjectInformationType) {
        return this.sourceObjectInformation.import(caexObject, name, withSubclasses);
      }
      return null;
    }
    return this.revision.import(caexObject, name, withSubclasses);
  }

  /**
   * Creates a new Revision object, inserted at the beginning (default) or at the end of the
   * Revision sequence, and initialized with the provided values.
   */
  new_Revision(date: DateTime, author: string | null, asFirst = true): RevisionType | null {
    const revisionType = asFirst ? this.revision.prepend() : this.revision.append();
    if (CAEXWrapper.equals(revisionType, null)) {
      return null;
    }
    revisionType.revisionDate = date;
    revisionType.authorName = author;
    return revisionType;
  }

  /** @internal */
  static uppercaseFirst(s: string | null): string {
    if (isNullOrEmpty(s)) {
      return '';
    }
    return s[0]!.toUpperCase() + s.substring(1, s.length);
  }

  /** @internal */
  property(propertyName: string): unknown {
    switch (propertyName) {
      case 'Version':
        return this.version;
      case 'Description':
        return this.description;
      case 'ChangeMode':
        return this.changeMode;
      case 'Copyright':
        return this.copyright;
      default:
        return null;
    }
  }
}

registerInterfaces(CAEXBasicObject, 'ICAEXContainer', 'ICAEXWrapper', 'IXMLWrapper', 'ICAEXBasicObject');

T.CAEXBasicObject = CAEXBasicObject;
