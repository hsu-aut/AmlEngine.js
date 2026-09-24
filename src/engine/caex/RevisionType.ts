// Port of Aml.Engine.CAEX.RevisionType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../../system/strings.js';
import type { DateTime } from '../../system/index.js';
import type { XElement } from '../../xml/index.js';
import { XmlCAEXAttributes } from '../xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXBasicObject } from './CAEXBasicObject.js';
import type { CAEXObject } from './CAEXObject.js';

/** Wrapper for the CAEX element Revision. */
export class RevisionType extends CAEXBasicObject {
  /** Gets and sets the AuthorName. */
  get authorName(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'AuthorName'));
  }

  set authorName(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'AuthorName'), value);
  }

  /** Gets and sets the Comment. */
  get comment(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'Comment'));
  }

  set comment(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'Comment'), value);
  }

  /** Gets and sets the NewVersion (the path of the new version). */
  get newVersion(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'NewVersion'));
  }

  set newVersion(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'NewVersion'), value);
  }

  /** Gets and sets the object referenced by NewVersion. */
  get newVersionObject(): CAEXObject | null {
    if (isNullOrEmpty(this.newVersion)) {
      return null;
    }
    return ServiceLocator.queryService.findByPath(this.caexDocument, this.newVersion);
  }

  set newVersionObject(value: CAEXObject | null) {
    this.newVersion = value != null ? XmlCAEXAttributes.caexPath(value.node!) : null;
  }

  /** Gets and sets the OldVersion (the path of the old version). */
  get oldVersion(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'OldVersion'));
  }

  set oldVersion(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'OldVersion'), value);
  }

  /** Determines if this revision describes a new version (OldVersion is defined). */
  get isNewVersion(): boolean {
    return !isNullOrWhiteSpace(this.oldVersion);
  }

  /** Determines if this revision describes an old version (NewVersion is defined). */
  get isOldVersion(): boolean {
    return !isNullOrWhiteSpace(this.newVersion);
  }

  /** Gets and sets the object referenced by OldVersion. */
  get oldVersionObject(): CAEXObject | null {
    if (isNullOrEmpty(this.oldVersion)) {
      return null;
    }
    return ServiceLocator.queryService.findByPath(CAEXBasicObjectExtensions.caexDocument(this), this.oldVersion);
  }

  set oldVersionObject(value: CAEXObject | null) {
    this.oldVersion = value != null ? value.getReferencePath(this) : null;
  }

  /** Gets and sets the RevisionDate. */
  get revisionDate(): DateTime {
    return XmlCAEXAttributes.getDateTimeValue(this.node!, XmlCAEXSchema.xName(this.node!, 'RevisionDate'));
  }

  set revisionDate(value: DateTime) {
    XmlCAEXAttributes.setDateTimeValue(this.node!, XmlCAEXSchema.xName(this.node!, 'RevisionDate'), value);
  }

  /** @internal The constructor function used by sequences. */
  static get Constructor(): (n: XElement) => RevisionType {
    return (n) => new RevisionType(n);
  }

  /** Determines if this revision describes an extension (a new version with 'Extension' as Comment or Version). */
  get isExtension(): boolean {
    if (this.isNewVersion) {
      if (!(this.comment === 'Extension')) {
        return this.version === 'Extension';
      }
      return true;
    }
    return false;
  }

  /**
   * Initializes a new instance.
   * @param revisionNode The XML node.
   */
  constructor(revisionNode: XElement | null) {
    super(revisionNode);
  }

  /** Marks this revision as an extension with the given description. */
  makeExtension(description: string | null): void {
    this.version = 'Extension';
    this.description = description;
  }
}

T.RevisionType = RevisionType;
