// Port of Aml.Engine.AmlObjects.AMLFile (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from } from '../../system/linq.js';
import { DateTime, XmlConvert, XmlDateTimeSerializationMode } from '../../system/index.js';
import { ArgumentException, ArgumentNullException, ArgumentOutOfRangeException, FormatException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { XAttribute, XElement, XName } from '../../xml/index.js';
import { CAEXFileType } from '../caex/CAEXFileType.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXObjectExtensions } from '../caex/extensions/CAEXObjectExtensions.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { DocumentVersions } from './DocumentVersions.js';
import { Version } from './internal/Version.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { SourceDocumentInformationType_Properties } from '../caex/SourceDocumentInformationType.js';
import type { ValueSequence } from '../caex/ValueSequence.js';
import type { DocumentVersionInformation } from './DocumentVersionInformation.js';
import type { MetaInformation } from './MetaInformation.js';

/** The version of the Aml.Engine assembly (`typeof(MetaInformation).Assembly.GetName().Version`). */
const ENGINE_ASSEMBLY_VERSION = '4.5.2.0';

/**
 * The CAEXFile of an AutomationML document, with access to the AutomationML specific header
 * information (AutomationML version, meta information of the writing tool, document versions).
 */
export class AMLFile extends CAEXFileType {
  /** The name of the AutomationML standard in the SuperiorStandardVersion. */
  static readonly AutomationML = 'AutomationML';

  private _documentVersion: ValueSequence<DocumentVersionInformation> | null = null;

  private _genericAdditionalInformation: ValueSequence<unknown> | null = null;

  private static readonly separator: readonly string[] = [' '];

  /**
   * Gets or sets the AutomationML version (CAEX 2.15: attribute AutomationMLVersion of an
   * AdditionalInformation element; CAEX 3.0: SuperiorStandardVersion "AutomationML x.y"). A value
   * which is no version is ignored; a version above MaximalAMLVersion is limited to it.
   */
  get automationMLVersion(): string | null {
    if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return (
        from(this.additionalInformation.elements)
          .firstOrDefault((c) => c.attribute('AutomationMLVersion') != null)
          ?.attribute('AutomationMLVersion')?.value ?? null
      );
    }
    const text = from(this.superiorStandardVersion).firstOrDefault((c) => c!.startsWith('AutomationML'));
    if (isNullOrEmpty(text)) {
      return '';
    }
    const text2 = text!;
    const num = 'AutomationML'.length + 1;
    if (num > text2.length) {
      throw new ArgumentOutOfRangeException('startIndex', 'startIndex cannot be larger than length of string.');
    }
    return text2.substring(num, text2.length);
  }

  set automationMLVersion(value: string | null) {
    let result = Version.tryParse(value);
    if (result == null) {
      return;
    }
    if (Version.greaterThan(result, this.maximalAMLVersion)) {
      result = this.maximalAMLVersion;
    }
    if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      (
        from(this.additionalInformation.elements).firstOrDefault((c) => c.attribute('AutomationMLVersion') != null) ??
        CAEXObjectExtensions.new_AdditionalInformation(this)
      ).setAttributeValue('AutomationMLVersion', result.toString());
      return;
    }
    const elementValue = from(this.superiorStandardVersion.elementAndValues).firstOrDefault((c) => c.value!.startsWith('AutomationML'));
    if (elementValue == null) {
      this.superiorStandardVersion.append('AutomationML ' + result.toString());
    } else {
      // C# assigns the public field ElementValue.Value only; the XML is not changed.
      elementValue.value = 'AutomationML ' + result.toString();
    }
  }

  /** Gets the document version information (AdditionalInformation DocumentVersions="Recommendations"). */
  get documentVersion(): ValueSequence<DocumentVersionInformation> {
    if (this._documentVersion != null) {
      return this._documentVersion;
    }
    const xElement = DocumentVersions.documentVersionsHeader(this);
    this._documentVersion =
      xElement != null
        ? new T.ValueSequence<DocumentVersionInformation>(xElement, 'Document', (_e: XElement) => true, 'other')
        : new T.ValueSequence<DocumentVersionInformation>(
            () => DocumentVersions.createDocumentVersionsHeader(this),
            this.xName('Document').toString(),
            (_e: XElement) => true,
            'other',
          );
    this._documentVersion.elementName = XName.get('Document');
    this._documentVersion.valueConverter.setConverters(
      (arg) => AMLFile.convertFromDocumentVersion(arg)!,
      (arg) => AMLFile.convertToDocumentVersion(arg),
    );
    return this._documentVersion;
  }

  /** Gets the generic AdditionalInformation elements (no AutomationML version, document versions or writer header). */
  get genericAdditionalInformation(): ValueSequence<unknown> {
    return (this._genericAdditionalInformation ??= new T.ValueSequence<unknown>(this.node, 'AdditionalInformation', (e: XElement) =>
      this.isGenericAdditionalInformation(e),
    ));
  }

  /** Gets the maximal AutomationML version for the CAEX schema of this file (2.0 for CAEX 2.15, 2.1 for CAEX 3.0). */
  get maximalAMLVersion(): Version {
    if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return new Version('2.1');
    }
    return new Version('2.0');
  }

  /** Gets the WriterHeader elements (AdditionalInformation) as MetaInformation values. */
  get writerHeader(): ValueSequence<MetaInformation> {
    const valueSequence = new T.ValueSequence<MetaInformation>(
      this.node,
      'AdditionalInformation',
      (e: XElement) => e.element(this.xName('WriterHeader')) != null,
      'other',
    );
    valueSequence.valueConverter.setConverters(
      (arg) => this.convertFromMeta(arg),
      (arg) => this.convertToMeta(arg),
    );
    return valueSequence;
  }

  /** @internal The deprecated document version elements (AdditionalInformation with the attribute DocumentVersions). */
  get documentVersionDeprecated(): ValueSequence<DocumentVersionInformation | null> {
    const valueSequence = new T.ValueSequence<DocumentVersionInformation | null>(
      this.node,
      'AdditionalInformation',
      (e: XElement) => e.attribute('DocumentVersions') != null,
      'other',
    );
    valueSequence.valueConverter.setConverters(
      (arg) => AMLFile.convertFromDocumentVersion(arg),
      (arg) => this.convertToDocumentVersionDeprecated(arg!),
    );
    return valueSequence;
  }

  /**
   * Initializes a new instance.
   * @param node The CAEXFile node.
   */
  constructor(node: XElement | null) {
    super(node);
  }

  /** Determines whether the element is an AdditionalInformation element with the AutomationML version. */
  static isAutomationMLVersion(element: XElement): boolean {
    if (XmlCAEXSchema.isAdditionalInformation(element)) {
      return element.attribute('AutomationMLVersion') != null;
    }
    return false;
  }

  /** Determines whether the element is an AdditionalInformation element with document versions. */
  static isDocumentVersion(element: XElement): boolean {
    if (XmlCAEXSchema.isAdditionalInformation(element)) {
      return element.attribute('DocumentVersions') != null;
    }
    return false;
  }

  /** Removes all meta information (SourceDocumentInformation and WriterHeader elements). */
  clearMetaInformation(): void {
    if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      this.sourceDocumentInformation.remove();
    }
    this.writerHeader.remove();
  }

  /**
   * Deletes the meta information of the writer.
   * @returns `true` if deleted (always `true` for CAEX 3.0).
   */
  deleteMetaInformation(writerID: string | null): boolean {
    if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      from(this.sourceDocumentInformation)
        .firstOrDefault((s) => s.originID === writerID)
        ?.remove();
      return true;
    }
    const elementValue = from(this.writerHeader.elementAndValues).firstOrDefault((w) => w.value.writerID === writerID);
    if (elementValue == null) {
      return false;
    }
    T.RemoveCmd.removeElement(elementValue.node);
    return true;
  }

  /**
   * Gets the meta information of all writers (`GetMetaInformation()`), or of the writer with the
   * ID (`GetMetaInformation(string writerID)`, `null` if there is none).
   * @throws ArgumentException writerID is null or empty.
   */
  getMetaInformation(): Iterable<MetaInformation>;
  getMetaInformation(writerID: string | null): MetaInformation | null;
  getMetaInformation(...args: [] | [string | null]): Iterable<MetaInformation> | MetaInformation | null {
    if (args.length === 0) {
      if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
        return this.writerHeader;
      }
      return from(this.sourceDocumentInformation)
        .select((s) => new T.MetaInformation(s))
        .concat(this.writerHeader);
    }
    const writerID = args[0];
    if (isNullOrEmpty(writerID)) {
      throw new ArgumentException('writerID should not be empty');
    }
    if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return from(this.writerHeader).firstOrDefault((w) => w.writerID === writerID);
    }
    const sourceDocumentInformationType = from(this.sourceDocumentInformation).firstOrDefault((s) => s.originID === writerID);
    if (!T.CAEXWrapper.equals(sourceDocumentInformationType, null)) {
      return new T.MetaInformation(sourceDocumentInformationType!);
    }
    return null;
  }

  /** Determines whether the element is a generic AdditionalInformation element. */
  isGenericAdditionalInformation(element: XElement): boolean {
    if (XmlCAEXSchema.isAdditionalInformation(element) && !AMLFile.isAutomationMLVersion(element) && !AMLFile.isDocumentVersion(element)) {
      return !this.isWriterHeader(element);
    }
    return false;
  }

  /**
   * Determines whether the string is a valid AutomationML version for this file (not above
   * MaximalAMLVersion); for CAEX 3.0 the last blank separated part is checked ("AutomationML 2.1").
   */
  isValidAutomationMLVersion(amlVersion: string): boolean {
    if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      const result = Version.tryParse(amlVersion);
      if (result != null) {
        return Version.lessThanOrEqual(result, this.maximalAMLVersion);
      }
      return false;
    }
    const array = amlVersion.split(AMLFile.separator[0]!).filter((s) => s.length > 0);
    if (array.length !== 0) {
      const last =
        array.length > 0
          ? array[array.length - 1]!
          : (() => {
              throw new ArgumentOutOfRangeException(amlVersion);
            })();
      const result2 = Version.tryParse(last);
      if (result2 != null) {
        return Version.lessThanOrEqual(result2, this.maximalAMLVersion);
      }
    }
    return false;
  }

  /** Determines whether the element is an AdditionalInformation element with a WriterHeader. */
  isWriterHeader(element: XElement): boolean {
    if (XmlCAEXSchema.isAdditionalInformation(element)) {
      return element.element(this.xName('WriterHeader')) != null;
    }
    return false;
  }

  /**
   * Replaces the meta information of the writer with the old ID by the new meta information (sets
   * it if there is no old ID).
   * @returns `true` if replaced.
   */
  replaceMetaInformation(oldWriterID: string | null, newMetainformation: MetaInformation): boolean {
    const num = ServiceLocator.undoRedoService?.beginTransaction(CAEXBasicObjectExtensions.caexDocument(this), 'Replace MetaInformation') ?? false;
    let flag: boolean;
    if (isNullOrEmpty(oldWriterID)) {
      this.setMetaInformation(newMetainformation);
      flag = true;
    } else {
      flag = this.deleteMetaInformation(oldWriterID);
      if (flag) {
        this.setMetaInformation(newMetainformation);
      }
    }
    if (num) {
      ServiceLocator.undoRedoService?.endTransaction(CAEXBasicObjectExtensions.caexDocument(this));
    }
    return flag;
  }

  /** Creates an AMLFile for the CAEXFile of the document. */
  static create(document: CAEXDocument): AMLFile {
    return new AMLFile(document.caexFile!.node);
  }

  /**
   * Sets the meta information of a writer (`SetMetaInformation(writerName, writerID, writerVendor,
   * writerVendorURL, writerVersion, writerRelease, lastWritingDateTime, writerProjectTitle,
   * writerProjectID)` or `SetMetaInformation(MetaInformation)`). For CAEX 3.0 a
   * SourceDocumentInformation element is set.
   * @throws ArgumentNullException metaInformation is null.
   */
  setMetaInformation(metaInformation: MetaInformation | null): void;
  setMetaInformation(
    writerName: string | null,
    writerID: string | null,
    writerVendor: string | null,
    writerVendorURL: string | null,
    writerVersion: string | null,
    writerRelease: string | null,
    lastWritingDateTime: string | null,
    writerProjectTitle: string | null,
    writerProjectID: string | null,
  ): void;
  setMetaInformation(...args: unknown[]): void {
    if (args.length === 1) {
      const metaInformation = args[0] as MetaInformation | null;
      if (metaInformation == null) {
        throw new ArgumentNullException('metaInformation');
      }
      this.setMetaInformation(
        metaInformation.writerName,
        metaInformation.writerID,
        metaInformation.writerVendor,
        metaInformation.writerVendorURL,
        metaInformation.writerVersion,
        metaInformation.writerRelease,
        metaInformation.lastWritingDateTime,
        metaInformation.writerProjectTitle,
        metaInformation.writerProjectID,
      );
      return;
    }
    const [writerName, writerID, writerVendor, writerVendorURL, writerVersion, writerRelease, lastWritingDateTime, writerProjectTitle, writerProjectID] =
      args as (string | null)[];
    if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      this.setSourceDocumentInformation(
        writerName ?? null,
        writerID ?? null,
        writerVendor ?? null,
        writerVendorURL ?? null,
        writerVersion ?? null,
        writerRelease ?? null,
        lastWritingDateTime == null ? DateTime.minValue : AMLFile.parseDateTime(lastWritingDateTime),
        writerProjectTitle ?? null,
        writerProjectID ?? null,
      );
      return;
    }
    const flag = ServiceLocator.undoRedoService?.beginTransaction(CAEXBasicObjectExtensions.caexDocument(this), 'Set MetaInformation') ?? false;
    if (!isNullOrEmpty(writerID ?? null)) {
      this.deleteMetaInformation(writerID ?? null);
    }
    this.additionalInformation.append(
      new XElement(
        'WriterHeader',
        new XElement('WriterName', writerName),
        new XElement('WriterID', writerID),
        new XElement('WriterVendor', writerVendor),
        new XElement('WriterVendorURL', writerVendorURL),
        new XElement('WriterVersion', writerVersion),
        new XElement('WriterRelease', writerRelease),
        new XElement('LastWritingDateTime', lastWritingDateTime),
        new XElement('WriterProjectTitle', writerProjectTitle),
        new XElement('WriterProjectID', writerProjectID),
      ),
    );
    if (flag) {
      ServiceLocator.undoRedoService?.endTransaction(CAEXBasicObjectExtensions.caexDocument(this));
    }
  }

  /** Sets the meta information of the AutomationML e.V. for the AutomationML standard libraries. */
  setMetaInformationStandardAutomationMLLibrary(): void {
    this.clearMetaInformation();
    const metaInformation = new T.MetaInformation();
    metaInformation.writerID = 'AutomationML e.V.';
    metaInformation.writerName = 'AutomationML e.V.';
    metaInformation.writerVendor = 'AutomationML e.V.';
    metaInformation.writerVendorURL = 'www.AutomationML.org';
    metaInformation.writerVersion = '2.1';
    metaInformation.writerRelease = ENGINE_ASSEMBLY_VERSION;
    metaInformation.writerProjectTitle = 'AutomationML Standard Libraries';
    metaInformation.writerProjectID = 'AutomationML Standard Libraries';
    metaInformation.lastWritingDateTime = DateTime.now.toString('s');
    this.setMetaInformation(metaInformation);
  }

  /**
   * Sets the SourceDocumentInformation of a writer (`SetSourceDocumentInformation(originName,
   * originID, originVendor, originVendorURL, originVersion, originRelease, lastWritingDateTime,
   * originProjectTitle, originProjectID)` or `SetSourceDocumentInformation(Properties)`). For
   * CAEX 2.15 a WriterHeader is set.
   * @throws ArgumentNullException properties is null.
   * @throws ArgumentException the origin ID is null or empty.
   */
  setSourceDocumentInformation(properties: SourceDocumentInformationType_Properties | null): void;
  setSourceDocumentInformation(
    originName: string | null,
    originID: string | null,
    originVendor: string | null,
    originVendorURL: string | null,
    originVersion: string | null,
    originRelease: string | null,
    lastWritingDateTime: DateTime,
    originProjectTitle: string | null,
    originProjectID: string | null,
  ): void;
  setSourceDocumentInformation(...args: unknown[]): void {
    if (args.length === 1) {
      this.setSourceDocumentInformationFromProperties(args[0] as SourceDocumentInformationType_Properties | null);
      return;
    }
    const originName = args[0] as string | null;
    const originID = args[1] as string | null;
    const originVendor = args[2] as string | null;
    const originVendorURL = args[3] as string | null;
    const originVersion = args[4] as string | null;
    const originRelease = args[5] as string | null;
    const lastWritingDateTime = args[6] as DateTime;
    const originProjectTitle = args[7] as string | null;
    const originProjectID = args[8] as string | null;
    if (isNullOrEmpty(originID)) {
      throw new ArgumentException('originID should not be empty');
    }
    if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      this.setMetaInformation(
        originName,
        originID,
        originVendor,
        originVendorURL,
        originVersion,
        originRelease,
        XmlConvert.toString(lastWritingDateTime, XmlDateTimeSerializationMode.Local),
        originProjectTitle,
        originProjectID,
      );
      return;
    }
    const flag = ServiceLocator.undoRedoService?.beginTransaction(CAEXBasicObjectExtensions.caexDocument(this), 'Set SourceDocument information') ?? false;
    const obj =
      from(this.sourceDocumentInformation).firstOrDefault((s) => s.originID === originID) ??
      this.sourceDocumentInformation.append(['OriginID', originID]);
    obj.originName = originName;
    obj.originProjectID = originProjectID;
    obj.originProjectTitle = originProjectTitle;
    obj.originRelease = originRelease;
    obj.originVendor = originVendor;
    obj.originVendorURL = originVendorURL;
    obj.originVersion = originVersion;
    obj.lastWritingDateTime = lastWritingDateTime;
    if (flag) {
      ServiceLocator.undoRedoService?.endTransaction(CAEXBasicObjectExtensions.caexDocument(this));
    }
  }

  private setSourceDocumentInformationFromProperties(properties: SourceDocumentInformationType_Properties | null): void {
    if (properties == null) {
      throw new ArgumentNullException('properties');
    }
    if (isNullOrEmpty(properties.originID)) {
      throw new ArgumentException('OriginID should not be empty');
    }
    if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      this.setMetaInformation(
        properties.originName,
        properties.originID,
        properties.originVendor,
        properties.originVendorURL,
        properties.originVersion,
        properties.originRelease,
        XmlConvert.toString(properties.lastWritingDateTime, XmlDateTimeSerializationMode.Local),
        properties.originProjectTitle,
        properties.originProjectID,
      );
      return;
    }
    const num = ServiceLocator.undoRedoService?.beginTransaction(CAEXBasicObjectExtensions.caexDocument(this), 'Set SourceDocument information') ?? false;
    const sourceDocumentInformationType = from(this.sourceDocumentInformation).firstOrDefault((s) => s.originID === properties.originID);
    if (T.CAEXWrapper.equals(sourceDocumentInformationType, null)) {
      this.addSourceDocumentInformation(properties);
    } else {
      sourceDocumentInformationType!.originName = properties.originName;
      sourceDocumentInformationType!.originProjectID = properties.originProjectID;
      sourceDocumentInformationType!.originProjectTitle = properties.originProjectTitle;
      sourceDocumentInformationType!.originRelease = properties.originRelease;
      sourceDocumentInformationType!.originVendor = properties.originVendor;
      sourceDocumentInformationType!.originVendorURL = properties.originVendorURL;
      sourceDocumentInformationType!.originVersion = properties.originVersion;
      sourceDocumentInformationType!.lastWritingDateTime = properties.lastWritingDateTime;
    }
    if (num) {
      ServiceLocator.undoRedoService?.endTransaction(CAEXBasicObjectExtensions.caexDocument(this));
    }
  }

  /** @internal Converts deprecated document version elements (one AdditionalInformation per document) into the current form. */
  convertFromDeprecatedDocumentVersion(): void {
    const list = from(this.documentVersionDeprecated).toList();
    if (list.length === 1 || list.every((e) => e == null)) {
      return;
    }
    for (const item of from(this.additionalInformation.elementAndValues)
      .where((e) => (e.node.attribute('DocumentVersions')?.value ?? null) === 'Recommendations')
      .toList()
      .slice(1)) {
      item.node.remove();
    }
    for (const item2 of list) {
      this.documentVersion.append(item2!);
    }
  }

  /** DateTime.Parse (current culture; see src/system DateTime.tryParse). */
  private static parseDateTime(s: string): DateTime {
    const result = DateTime.tryParse(s);
    if (result == null) {
      throw new FormatException(`String '${s}' was not recognized as a valid DateTime.`);
    }
    return result;
  }

  private static convertFromDocumentVersion(arg: XElement): DocumentVersionInformation | null {
    if (!T.DocumentVersionInformation.isValidDocumentNode(arg)) {
      return null;
    }
    return new T.DocumentVersionInformation(arg);
  }

  private convertFromMeta(arg: XElement): MetaInformation {
    return new T.MetaInformation(arg.element(this.xName('WriterHeader'))!);
  }

  private static convertToDocumentVersion(arg: DocumentVersionInformation): unknown {
    return AMLFile.documentVersionInformationContent(arg);
  }

  private convertToDocumentVersionDeprecated(arg: DocumentVersionInformation): unknown {
    return this.documentVersionInformationContentDeprecated(arg);
  }

  private convertToMeta(arg: MetaInformation): unknown {
    return this.metaDataContent(arg);
  }

  private static documentVersionInformationContent(version: DocumentVersionInformation): unknown[] {
    return [new XAttribute('DocumentIdentifier', version.documentIdentifier ?? ''), new XAttribute('Version', version.version ?? '1.0')];
  }

  private documentVersionInformationContentDeprecated(version: DocumentVersionInformation): unknown[] {
    return [
      new XAttribute('DocumentVersions', 'Recommendations'),
      new XElement(
        this.xName('Document'),
        new XAttribute('DocumentIdentifier', version.documentIdentifier ?? ''),
        new XAttribute('Version', version.version ?? '1.0'),
      ),
    ];
  }

  private metaDataContent(metaInformation: MetaInformation): XElement {
    return new XElement(
      this.xName('WriterHeader'),
      new XElement(this.xName('WriterName'), metaInformation.writerName),
      new XElement(this.xName('WriterID'), metaInformation.writerID),
      new XElement(this.xName('WriterVendor'), metaInformation.writerVendor),
      new XElement(this.xName('WriterVendorURL'), metaInformation.writerVendorURL),
      new XElement(this.xName('WriterVersion'), metaInformation.writerVersion),
      new XElement(this.xName('WriterRelease'), metaInformation.writerRelease),
      new XElement(this.xName('LastWritingDateTime'), metaInformation.lastWritingDateTime),
      new XElement(this.xName('WriterProjectTitle'), metaInformation.writerProjectTitle),
      new XElement(this.xName('WriterProjectID'), metaInformation.writerProjectID),
    );
  }
}

T.AMLFile = AMLFile;
