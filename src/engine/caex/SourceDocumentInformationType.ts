// Port of Aml.Engine.CAEX.SourceDocumentInformationType (with the nested Properties record).

import type { XElement } from '../../xml/index.js';
import { DateTime, XmlConvert, XmlDateTimeSerializationMode } from '../../system/index.js';
import { isNullOrWhiteSpace } from '../../system/strings.js';
import { T } from '../registry.js';
import { CAEXWrapper } from './CAEXWrapper.js';

/** Properties of the source document information (a C# record: value equality). */
export class SourceDocumentInformationType_Properties {
  /** The origin name. */
  originName: string | null = null;

  /** The origin ID. */
  originID: string | null = null;

  /** The origin vendor. */
  originVendor: string | null = null;

  /** The origin vendor URL. */
  originVendorURL: string | null = null;

  /** The origin version. */
  originVersion: string | null = null;

  /** The origin release. */
  originRelease: string | null = null;

  /** The last writing date and time (default(DateTime) initially). */
  lastWritingDateTime: DateTime = DateTime.minValue;

  /** The origin project title. */
  originProjectTitle: string | null = null;

  /** The origin project ID. */
  originProjectID: string | null = null;

  /** Record equality: all properties equal. */
  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof SourceDocumentInformationType_Properties) || other.constructor !== this.constructor) return false;
    return (
      this.originName === other.originName &&
      this.originID === other.originID &&
      this.originVendor === other.originVendor &&
      this.originVendorURL === other.originVendorURL &&
      this.originVersion === other.originVersion &&
      this.originRelease === other.originRelease &&
      this.lastWritingDateTime.ticks === other.lastWritingDateTime.ticks &&
      this.originProjectTitle === other.originProjectTitle &&
      this.originProjectID === other.originProjectID
    );
  }
}

/**
 * Wrapper for the CAEX element 'SourceDocumentInformation', information about the data source
 * of the CAEX document.
 */
export class SourceDocumentInformationType extends CAEXWrapper {
  /** Properties of the source document information. */
  static readonly Properties = SourceDocumentInformationType_Properties;

  /** Gets and sets the date and time of the creation of the CAEX document. */
  get lastWritingDateTime(): DateTime {
    return XmlConvert.toDateTime(this.getXAttributeValue('LastWritingDateTime') as string, XmlDateTimeSerializationMode.Local);
  }

  set lastWritingDateTime(value: DateTime) {
    if (!(this.lastWritingDateTime.ticks === value.ticks)) {
      this.setXAttributeValue('LastWritingDateTime', XmlConvert.toString(value, XmlDateTimeSerializationMode.Local));
      this.raisePropertyChanged('LastWritingDateTime');
    }
  }

  /** Gets and sets an identifier of the origin of the CAEX document. */
  get originID(): string | null {
    return this.getXAttributeValue('OriginID');
  }

  set originID(value: string | null) {
    if (!(this.originID === value)) {
      this.setXAttributeValue('OriginID', value);
      this.raisePropertyChanged('OriginID');
    }
  }

  /** Gets and sets the name of the origin of the CAEX document. */
  get originName(): string | null {
    return this.getXAttributeValue('OriginName');
  }

  set originName(value: string | null) {
    if (!(this.originName === value)) {
      this.setXAttributeValue('OriginName', value);
      this.raisePropertyChanged('OriginName');
    }
  }

  /** Gets and sets a unique identifier of the corresponding source project. */
  get originProjectID(): string | null {
    return this.getXAttributeValue('OriginProjectID');
  }

  set originProjectID(value: string | null) {
    if (!(this.originProjectID === value)) {
      this.setXAttributeValue('OriginProjectID', value);
      this.raisePropertyChanged('OriginProjectID');
    }
  }

  /** Gets and sets the title of the corresponding source project. */
  get originProjectTitle(): string | null {
    return this.getXAttributeValue('OriginProjectTitle');
  }

  set originProjectTitle(value: string | null) {
    if (!(this.originProjectTitle === value)) {
      this.setXAttributeValue('OriginProjectTitle', value);
      this.raisePropertyChanged('OriginProjectTitle');
    }
  }

  /** Gets and sets the release information of the origin of the CAEX document. */
  get originRelease(): string | null {
    return this.getXAttributeValue('OriginRelease');
  }

  set originRelease(value: string | null) {
    if (!(this.originRelease === value)) {
      this.setXAttributeValue('OriginRelease', value);
      this.raisePropertyChanged('OriginRelease');
    }
  }

  /** Gets and sets the vendor of the data source of the CAEX document. */
  get originVendor(): string | null {
    return this.getXAttributeValue('OriginVendor');
  }

  set originVendor(value: string | null) {
    if (!(this.originVendor === value)) {
      this.setXAttributeValue('OriginVendor', value);
      this.raisePropertyChanged('OriginVendor');
    }
  }

  /** Gets and sets the vendor's URL of the data source of the CAEX document. */
  get originVendorURL(): string | null {
    return this.getXAttributeValue('OriginVendorURL');
  }

  set originVendorURL(value: string | null) {
    if (!(this.originVendorURL === value)) {
      this.setXAttributeValue('OriginVendorURL', value);
      this.raisePropertyChanged('OriginVendorURL');
    }
  }

  /** Gets and sets the version of the origin of the CAEX document. */
  get originVersion(): string | null {
    return this.getXAttributeValue('OriginVersion');
  }

  set originVersion(value: string | null) {
    if (!(this.originVersion === value)) {
      this.setXAttributeValue('OriginVersion', value);
      this.raisePropertyChanged('OriginVersion');
    }
  }

  /** @internal The constructor function for this type. */
  static get Constructor(): (n: XElement) => SourceDocumentInformationType {
    return (n) => new SourceDocumentInformationType(n);
  }

  /** Initializes a new instance for a 'SourceDocumentInformation' XML node (sets a new OriginID, if empty). */
  constructor(sourceDocumentInformationNode: XElement | null) {
    super(sourceDocumentInformationNode);
    if (isNullOrWhiteSpace(this.originID)) {
      this.originID = T.CAEXObject.newGUID;
    }
  }
}

T.SourceDocumentInformationType = SourceDocumentInformationType;
T.SourceDocumentInformationType_Properties = SourceDocumentInformationType_Properties;
