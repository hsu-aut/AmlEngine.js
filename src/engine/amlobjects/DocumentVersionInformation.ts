// Port of Aml.Engine.AmlObjects.DocumentVersionInformation (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import type { XElement } from '../../xml/index.js';

/**
 * Document version information as defined in the AutomationML BPR 06 "Naming of related documents
 * and their versions". DocumentVersions are stored as AdditionalInformation attached to the
 * CAEXFile node of the AML document.
 */
export class DocumentVersionInformation {
  /** The name of the referenced document ("DocumentIdentifier"). */
  documentIdentifier: string | null = null;

  /** The version range of the referenced document ("main.minor.revision"). */
  version: string | null = null;

  /**
   * Initializes a new instance: without argument with an empty identifier and version "1.0.0";
   * with an element (an AdditionalInformation or a Document element) from its content.
   */
  constructor(element?: XElement) {
    if (element === undefined) {
      this.documentIdentifier = '';
      this.version = '1.0.0';
      return;
    }
    const xElement = element.name.localName === 'AdditionalInformation' ? element.element(XmlCAEXSchema.xName(element, 'Document')) : element;
    if (xElement != null) {
      this.documentIdentifier = xElement.attribute('DocumentIdentifier')?.value ?? '';
      this.version = xElement.attribute('Version')?.value ?? '1.0.0';
    }
  }

  /** @internal */
  static isValidDocumentNode(element: XElement): boolean {
    if (!(element.name.localName !== 'AdditionalInformation')) {
      return element.element(XmlCAEXSchema.xName(element, 'Document')) != null;
    }
    return true;
  }
}

T.DocumentVersionInformation = DocumentVersionInformation;
