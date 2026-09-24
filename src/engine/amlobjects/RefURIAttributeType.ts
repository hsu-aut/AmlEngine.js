// Port of Aml.Engine.AmlObjects.RefURIAttributeType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { Uri, UriKind } from '../../system/index.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { AttributeType } from '../caex/AttributeType.js';
import { CAEXElementFactory } from '../caex/extensions/CAEXElementFactory.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import { AutomationMLBaseAttributeTypeLib } from './AutomationMLBaseAttributeTypeLib.js';
import * as Path from './internal/NetPath.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { XElement } from '../../xml/index.js';

/**
 * The refURI attribute is an attribute with the standardized name 'refURI', referencing an
 * external document (and a node in it by the fragment).
 */
export class RefURIAttributeType extends AttributeType {
  /** The refURI attribute name. */
  static readonly REF_URI_ATTRIBUTE = 'refURI';

  /**
   * Gets the file path of the referenced document ('' if the URI is not a file URI); for relative
   * URIs the unescaped relative path without leading '/'. A fragment is removed.
   */
  get filePath(): string {
    if (this.theUri == null) {
      return '';
    }
    if (this.theUri.isAbsoluteUri) {
      if (!this.isFile()) {
        return '';
      }
      const num = this.theUri.localPath.indexOf('#');
      if (num <= 0) {
        return this.theUri.localPath;
      }
      return this.theUri.localPath.substring(0, num);
    }
    const text = RefURIAttributeType.relativePath(this.theUri);
    const num2 = text.indexOf('#');
    if (num2 <= 0) {
      return text;
    }
    return text.substring(0, num2);
  }

  /** Gets a value indicating whether this instance is a refURI attribute. */
  get isRefURIAttribute(): boolean {
    if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      if (!AutomationMLBaseAttributeTypeLib.isRefUri(this)) {
        return this.name === 'refURI';
      }
      return true;
    }
    return this.name === 'refURI';
  }

  /** Gets the referenced node (the fragment including '#', or ''). */
  get referencedNode(): string {
    if (!this.isAbsoluteUri()) {
      return this.fragment();
    }
    return this.theUri!.fragment;
  }

  /** Gets or sets the URI of the attribute value (`null` if the value is empty). */
  get theUri(): Uri | null {
    if (!isNullOrEmpty(this.value)) {
      const result = Uri.tryCreate(this.value, UriKind.RelativeOrAbsolute);
      if (result == null) {
        return this.tryCreateUri();
      }
      return result;
    }
    return null;
  }

  set theUri(value: Uri | null) {
    this.value = value != null ? value.toString() : '';
  }

  /**
   * Initializes a new instance.
   * @param attributeNode The attribute node.
   */
  constructor(attributeNode: XElement | null) {
    super(attributeNode!);
  }

  /**
   * Creates a new refURI attribute using the specified document.
   * @param doc The document.
   */
  static create(doc: CAEXDocument): RefURIAttributeType {
    const attributeType = CAEXElementFactory.create(doc, T.AttributeType)!;
    attributeType.name = 'refURI';
    if (doc.schema !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      attributeType.refAttributeType = 'AutomationMLBaseAttributeTypeLib/refURI';
    }
    return new RefURIAttributeType(attributeType.node);
  }

  /** Determines whether the URI is absolute. */
  isAbsoluteUri(): boolean {
    if (this.theUri != null) {
      return this.theUri.isAbsoluteUri;
    }
    return false;
  }

  /** Determines whether the URI references a file (a file URI or a relative URI). */
  isFile(): boolean {
    if (this.theUri != null) {
      if (!this.theUri.isAbsoluteUri || !(this.theUri.scheme.toUpperCase() === 'FILE')) {
        return !this.theUri.isAbsoluteUri;
      }
      return true;
    }
    return false;
  }

  /** Compares the unescaped URI with the unescaped attribute value. */
  uriReferencesAreEqual(refUri: string): boolean {
    return Uri.unescapeDataString(refUri) === Uri.unescapeDataString(this.value);
  }

  private static relativePath(uri: Uri): string {
    return RefURIAttributeType.trimStartSlash(Uri.unescapeDataString(uri.originalString));
  }

  private static trimStartSlash(s: string): string {
    let i = 0;
    while (i < s.length && s[i] === '/') i++;
    return s.substring(i);
  }

  private fragment(): string {
    if (this.theUri == null || this.theUri.isAbsoluteUri) {
      return '';
    }
    const array = this.theUri.originalString.split('#');
    if (array.length <= 1) {
      return '';
    }
    return '#' + array[1];
  }

  private tryCreateUri(): Uri | null {
    try {
      let extension = Path.getExtension(this.value);
      if (extension == null) {
        return null;
      }
      const num = extension.indexOf('#');
      let text: string;
      if (num > 0) {
        extension = extension.substring(0, num);
        const directoryName = Path.getDirectoryName(this.value);
        text = Path.getFileNameWithoutExtension(this.value) + extension;
        if (!isNullOrEmpty(directoryName)) {
          text = Path.combine(directoryName!, text);
        }
      } else {
        text = this.value!;
      }
      if (Path.fileExists(text)) {
        return new Uri('file:///' + Path.getFullPath(this.value!));
      }
      const filePath = this.caexDocument!.filePath;
      if (isNullOrEmpty(filePath)) {
        return null;
      }
      const directoryName2 = Path.getDirectoryName(filePath);
      if (!Path.directoryExists(directoryName2)) {
        return null;
      }
      text = Path.combine(directoryName2!, text);
      if (!Path.fileExists(text)) {
        return null;
      }
      return new Uri('file:///' + Path.combine(directoryName2!, this.value!));
    } catch {
      return null;
    }
  }
}

T.RefURIAttributeType = RefURIAttributeType;
