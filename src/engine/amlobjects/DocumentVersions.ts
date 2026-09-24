// Port of Aml.Engine.AmlObjects.DocumentVersions (Aml.Engine 4.5.2): extension methods for the
// document version information of AutomationML BPR 06, stored in an AdditionalInformation element
// of the CAEXFile (DocumentVersions="Recommendations").

import { T } from '../registry.js';
import { from } from '../../system/linq.js';
import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
  FormatException,
  OverflowException,
} from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { XAttribute, XElement } from '../../xml/index.js';
import { CAEXObjectExtensions } from '../caex/extensions/CAEXObjectExtensions.js';
import { AmlObjectsExtensions } from './extensions/AmlObjectsExtensions.js';
import { Version } from './internal/Version.js';
import type { CAEXFileType } from '../caex/CAEXFileType.js';
import type { DocumentVersionInformation } from './DocumentVersionInformation.js';

/** Extension methods for the document version information of a CAEXFile. */
export class DocumentVersions {
  private constructor() {}

  /** The name of the element of a document version. */
  static readonly DocumentElementName = 'Document';

  /** The name of the attribute with the document identifier. */
  static readonly DocumentIdentifierAttributeName = 'DocumentIdentifier';

  /** The name of the attribute marking the document versions header. */
  static readonly DocumentVersionsAttributeName = 'DocumentVersions';

  /** The value of the attribute marking the document versions header. */
  static readonly DocumentVersionsAttributeValue = 'Recommendations';

  /** The name of the attribute with the version. */
  static readonly VersionAttributeName = 'Version';

  /**
   * Appends (or replaces) the version information of a document
   * (`AppendDocumentVersionInformation(caexFile, documentIdentifier, documentVersion, out error)`
   * or `AppendDocumentVersionInformation(caexFile, versionInformation, out error)`).
   * @returns `result`: `true` if appended; `error`: the error message otherwise.
   */
  static appendDocumentVersionInformation(
    caexFile: CAEXFileType | null,
    documentIdentifier: string | null,
    documentVersion: string | null,
  ): { result: boolean; error: string };
  static appendDocumentVersionInformation(caexFile: CAEXFileType | null, versionInformation: DocumentVersionInformation): { result: boolean; error: string };
  static appendDocumentVersionInformation(
    caexFile: CAEXFileType | null,
    arg1: string | null | DocumentVersionInformation,
    documentVersion?: string | null,
  ): { result: boolean; error: string } {
    if (arg1 instanceof T.DocumentVersionInformation) {
      const versionInformation = arg1;
      return DocumentVersions.appendDocumentVersionInformation(caexFile, versionInformation.documentIdentifier, versionInformation.version);
    }
    const documentIdentifier = arg1 as string | null;
    let error = '';
    if (T.CAEXWrapper.equals(caexFile, null)) {
      error = 'caexFileis null';
      return { result: false, error };
    }
    if (isNullOrEmpty(documentIdentifier)) {
      error = 'Error: No Document Identifier defined';
      return { result: false, error };
    }
    try {
      Version.parse(documentVersion ?? null);
    } catch (e) {
      if (e instanceof ArgumentNullException) {
        error = 'Error: DocumentVersion to be parsed is null.';
        return { result: false, error };
      }
      if (e instanceof ArgumentOutOfRangeException) {
        error = "Error: Negative value in '" + documentVersion + "'.";
        return { result: false, error };
      }
      if (e instanceof ArgumentException) {
        error = "Error: Bad number of components in '" + documentVersion + "'.";
        return { result: false, error };
      }
      if (e instanceof FormatException) {
        error = "Error: Non-integer value in '" + documentVersion + "'.";
        return { result: false, error };
      }
      if (e instanceof OverflowException) {
        error = "Error: Number out of range in '" + documentVersion + "'.";
        return { result: false, error };
      }
      throw e;
    }
    AmlObjectsExtensions.amlFile(caexFile).convertFromDeprecatedDocumentVersion();
    let xElement = DocumentVersions.documentVersionsHeader(caexFile);
    if (xElement == null) {
      xElement = DocumentVersions.createDocumentVersionsHeader(caexFile!);
    } else {
      DocumentVersions.deleteDocumentVersionInformation(caexFile, documentIdentifier);
    }
    const content = new XElement('Document', new XAttribute('Version', documentVersion), new XAttribute('DocumentIdentifier', documentIdentifier));
    xElement.add(content);
    return { result: true, error };
  }

  /** Creates a new document versions header (AdditionalInformation element) in the CAEXFile. */
  static createDocumentVersionsHeader(caexFile: CAEXFileType): XElement {
    const xElement = CAEXObjectExtensions.new_AdditionalInformation(caexFile, false);
    xElement.setAttributeValue('DocumentVersions', 'Recommendations');
    return xElement;
  }

  /**
   * Deletes the version information of the document.
   * @returns `true` if deleted.
   * @throws ArgumentNullException caexFile is null.
   * @throws ArgumentException documentIdentifier is null or empty.
   */
  static deleteDocumentVersionInformation(caexFile: CAEXFileType | null, documentIdentifier: string | null): boolean {
    if (caexFile == null) {
      throw new ArgumentNullException('caexFile');
    }
    if (isNullOrEmpty(documentIdentifier)) {
      throw new ArgumentException("'documentIdentifier' cannot be null or empty.", 'documentIdentifier');
    }
    AmlObjectsExtensions.amlFile(caexFile).convertFromDeprecatedDocumentVersion();
    const header = DocumentVersions.documentVersionsHeader(caexFile);
    const xElement =
      header == null ? null : from(header.elements('Document')).firstOrDefault((el) => (el.attribute('DocumentIdentifier')?.value ?? null) === documentIdentifier);
    if (xElement == null) {
      return false;
    }
    xElement.remove();
    return true;
  }

  /**
   * Gets the document versions header of the CAEXFile, or `null`.
   * @throws ArgumentNullException caexFile is null.
   */
  static documentVersionsHeader(caexFile: CAEXFileType | null): XElement | null {
    if (caexFile == null) {
      throw new ArgumentNullException('caexFile');
    }
    AmlObjectsExtensions.amlFile(caexFile).convertFromDeprecatedDocumentVersion();
    return (
      from(caexFile.additionalInformation.elementAndValues).firstOrDefault(
        (e) => (e.node.attribute('DocumentVersions')?.value ?? null) === 'Recommendations',
      )?.node ?? null
    );
  }

  /**
   * Gets the version information of all documents (lazy, like the C# iterator: the checks run on
   * the first enumeration).
   * @throws ArgumentNullException caexFile is null.
   */
  static *getAllDocumentVersionInformation(caexFile: CAEXFileType | null): Generator<DocumentVersionInformation> {
    if (caexFile == null) {
      throw new ArgumentNullException('caexFile');
    }
    AmlObjectsExtensions.amlFile(caexFile).convertFromDeprecatedDocumentVersion();
    const xElement = DocumentVersions.documentVersionsHeader(caexFile);
    if (xElement == null) {
      return;
    }
    for (const item of xElement.elements('Document')) {
      const info = new T.DocumentVersionInformation();
      info.documentIdentifier = item.attribute('DocumentIdentifier')?.value ?? null;
      info.version = item.attribute('Version')?.value ?? null;
      yield info;
    }
  }

  /**
   * Gets the version information of the document, or `null`.
   * @throws ArgumentNullException caexFile is null.
   * @throws ArgumentException documentIdentifier is null or empty.
   */
  static getDocumentVersionInformation(caexFile: CAEXFileType | null, documentIdentifier: string | null): DocumentVersionInformation | null {
    if (caexFile == null) {
      throw new ArgumentNullException('caexFile');
    }
    if (isNullOrEmpty(documentIdentifier)) {
      throw new ArgumentException("'documentIdentifier' cannot be null or empty.", 'documentIdentifier');
    }
    AmlObjectsExtensions.amlFile(caexFile).convertFromDeprecatedDocumentVersion();
    const header = DocumentVersions.documentVersionsHeader(caexFile);
    // C#: `from child in header?.Elements("Document") ...` throws ArgumentNullException ("source")
    // when there is no header.
    if (header == null) {
      throw new ArgumentNullException('source');
    }
    return from(header.elements('Document'))
      .where((child) => (child.attribute('DocumentIdentifier')?.value ?? null) === documentIdentifier)
      .select((child) => {
        const info = new T.DocumentVersionInformation();
        info.documentIdentifier = child.attribute('DocumentIdentifier')?.value ?? null;
        info.version = child.attribute('Version')?.value ?? null;
        return info;
      })
      .firstOrDefault();
  }

  /**
   * Replaces the version information of the document with the old identifier. An empty new
   * identifier takes the old one.
   * @returns `result`: `true` if replaced; `error`: the error message of the append.
   * @throws ArgumentNullException caexFile, newDocumentVersionInformation or oldDocumentID is null (or empty).
   */
  static replaceDocumentVersionInformation(
    caexFile: CAEXFileType | null,
    oldDocumentID: string | null,
    newDocumentVersionInformation: DocumentVersionInformation | null,
  ): { result: boolean; error: string } {
    if (caexFile == null) {
      throw new ArgumentNullException('caexFile');
    }
    if (newDocumentVersionInformation == null) {
      throw new ArgumentNullException('newDocumentVersionInformation');
    }
    AmlObjectsExtensions.amlFile(caexFile).convertFromDeprecatedDocumentVersion();
    let error = '';
    if (isNullOrEmpty(oldDocumentID)) {
      throw new ArgumentNullException('oldDocumentID', 'No Document ID defined');
    }
    const num = DocumentVersions.deleteDocumentVersionInformation(caexFile, oldDocumentID);
    if (isNullOrEmpty(newDocumentVersionInformation.documentIdentifier)) {
      newDocumentVersionInformation.documentIdentifier = oldDocumentID;
    }
    if (num) {
      const r = DocumentVersions.appendDocumentVersionInformation(caexFile, newDocumentVersionInformation);
      error = r.error;
      return { result: r.result, error };
    }
    return { result: false, error };
  }
}
