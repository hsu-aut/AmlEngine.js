// Port of Aml.Engine.AmlObjects.MetaInformation (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { DateTime, XmlConvert, XmlDateTimeSerializationMode } from '../../system/index.js';
import { XElement } from '../../xml/index.js';
import type { SourceDocumentInformationType } from '../caex/SourceDocumentInformationType.js';

/**
 * Meta information of the source tool of an AutomationML document (WriterHeader in CAEX 2.15,
 * SourceDocumentInformation in CAEX 3.0).
 */
export class MetaInformation {
  /** The date and time of the last writing. */
  lastWritingDateTime: string | null = null;

  /** Unique identifier of the writing tool. */
  writerID: string | null = null;

  /** Name of the writing tool. */
  writerName: string | null = null;

  /** Unique identifier of the project. */
  writerProjectID: string | null = null;

  /** Title of the project. */
  writerProjectTitle: string | null = null;

  /** Release information of the writing tool. */
  writerRelease: string | null = null;

  /** Vendor of the writing tool. */
  writerVendor: string | null = null;

  /** URL of the vendor of the writing tool. */
  writerVendorURL: string | null = null;

  /** Version of the writing tool. */
  writerVersion: string | null = null;

  /**
   * Initializes a new instance: without argument with empty values and the current time
   * (`MetaInformation()`), from a WriterHeader element (`MetaInformation(XElement)`) or from a
   * SourceDocumentInformation object (`MetaInformation(SourceDocumentInformationType)`).
   */
  constructor(arg?: XElement | SourceDocumentInformationType) {
    if (arg === undefined) {
      this.writerID = '';
      this.writerName = '';
      this.writerProjectID = '';
      this.writerProjectTitle = '';
      this.writerRelease = '';
      this.writerVendor = '';
      this.writerVendorURL = '';
      this.writerVersion = '';
      this.lastWritingDateTime = XmlConvert.toString(DateTime.now, XmlDateTimeSerializationMode.Local);
      return;
    }
    if (arg instanceof XElement || arg === null) {
      const writerHeader = arg as XElement;
      for (const item of writerHeader.elements()) {
        switch (item.name.localName) {
          case 'WriterName':
            this.writerName = item.value;
            break;
          case 'WriterID':
            this.writerID = item.value;
            break;
          case 'WriterVendor':
            this.writerVendor = item.value;
            break;
          case 'WriterVendorURL':
            this.writerVendorURL = item.value;
            break;
          case 'WriterVersion':
            this.writerVersion = item.value;
            break;
          case 'WriterRelease':
            this.writerRelease = item.value;
            break;
          case 'LastWritingDateTime':
            this.lastWritingDateTime = item.value;
            break;
          case 'WriterProjectTitle':
            this.writerProjectTitle = item.value;
            break;
          case 'WriterProjectID':
            this.writerProjectID = item.value;
            break;
        }
      }
      return;
    }
    const sourceDocumentInformation = arg;
    this.writerID = sourceDocumentInformation.originID;
    this.writerName = sourceDocumentInformation.originName;
    this.writerProjectID = sourceDocumentInformation.originProjectID;
    this.writerProjectTitle = sourceDocumentInformation.originProjectTitle;
    this.writerRelease = sourceDocumentInformation.originRelease;
    this.writerVendor = sourceDocumentInformation.originVendor;
    this.writerVendorURL = sourceDocumentInformation.originVendorURL;
    this.writerVersion = sourceDocumentInformation.originVersion;
    this.lastWritingDateTime = XmlConvert.toString(sourceDocumentInformation.lastWritingDateTime, XmlDateTimeSerializationMode.Local);
  }
}

T.MetaInformation = MetaInformation;
