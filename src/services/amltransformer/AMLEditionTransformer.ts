// Port of Aml.Engine.Services.AMLTransformer.AMLEditionTransformer (Aml.Engine.Services 4.3.1).
//
// TransformToEdition is synchronous in C# and blocks twice on the library service:
// `LoadLibraryCatalogAsync(...).Result` in ExchangeExtenals and `LoadClassRepositoryAsync(...).Result`
// in PrepareAttributeTypeLibrary. JavaScript cannot block on a Promise. The C# body is therefore
// written once, as generators that yield each of these loads (`yield` stands where C# has
// `.Result`):
// - `transformToEdition` (IAMLEditionTransform) runs the steps without waiting. As long as no load
//   is needed (no external references or no LibraryCatalogData; no attributes, other than nested
//   ones, in class libraries or no ClassCatalogData) it behaves exactly as the C# method. At the first load it throws NotSupportedException, which points to
//   `transformToEditionAsync`.
// - `transformToEditionAsync` (not in C#) runs the same steps and awaits each load.

import '../../engine/index.js';
import { NotSupportedException, IndexOutOfRangeException } from '../../system/exceptions.js';
import { cultureEndsWith, cultureStartsWith } from '../../system/CompareInfo.js';
import { Dictionary, from } from '../../system/linq.js';
import { isNullOrEmpty, isNullOrWhiteSpace, toLowerInvariant } from '../../system/strings.js';
import { registerInterfaces } from '../../engine/interfaces.js';
import { AttributeType } from '../../engine/caex/AttributeType.js';
import { AttributeTypeLibType } from '../../engine/caex/AttributeTypeLibType.js';
import { CAEXDocument_CAEXSchema } from '../../engine/caex/CAEXDocument.js';
import { CAEXObject } from '../../engine/caex/CAEXObject.js';
import { CAEXWrapper } from '../../engine/caex/CAEXWrapper.js';
import { InstanceHierarchyType } from '../../engine/caex/InstanceHierarchyType.js';
import { CAEXBasicObjectExtensions } from '../../engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { ClassRepositoryEnum } from '../../engine/resources/catalogue/ClassRepositoryEnum.js';
import { SignedLibraryVersionExtensions } from '../../engine/resources/catalogue/SignedLibraryVersionExtensions.js';
import { StringComparisonAlgorithmEnum } from '../../engine/resources/catalogue/StringComparisonAlgorithmEnum.js';
import { AMLFileContentType } from '../../engine/resources/files/AMLFileContentType.js';
import { AMLFileMetaModel } from '../../engine/resources/files/AMLFileMetaModel.js';
import { SemanticVersion } from '../../engine/resources/files/SemanticVersion.js';
import { ServiceLocator } from '../../engine/services/ServiceLocator.js';
import { AMLEditionEnumExtension } from '../../engine/services/model/AMLEditionEnumExtension.js';
import { XmlCAEXSchema } from '../../engine/xmlext/XmlCAEXSchema.js';
import { XmlOperation } from '../../engine/xmlext/XmlOperation.js';
import { CAEXSchemaTransformer } from '../CAEXSchemaTransformer.js';
import { ExternalReferenceResolver_NoSynchronizationContextScope } from '../ExternalReferenceResolver.js';
import type { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import type { ClassRepositoryItem } from '../../engine/resources/catalogue/ClassRepositoryItem.js';
import type { PublicLibraryCatalog, PublicLibraryCatalog_Library } from '../../engine/resources/catalogue/PublicLibraryCatalog.js';
import type { IAMLEditionTransform } from '../../engine/services/interfaces/IAMLEditionTransform.js';
import type { IAMLLibraryService } from '../../engine/services/interfaces/IAMLLibraryService.js';
import type { IClassRepository } from '../../engine/services/interfaces/IClassRepository.js';
import type { ISchemaTransform } from '../../engine/services/interfaces/ISchemaTransform.js';
import type { AMLEditionEnum } from '../../engine/services/model/AMLEditionEnum.js';

/** The logging action of a transformation. */
type Logger = (transform: IAMLEditionTransform, message: string) => void;

/** A load the C# code waits for with `.Result`. */
interface PendingLoad {
  /** What is loaded (for the message of the synchronous call). */
  readonly what: string;
  /** Starts the load. */
  readonly start: () => Promise<unknown>;
}

/** Steps of a method that waits for loads: each load is yielded, its result is sent back. */
type Steps<R> = Generator<PendingLoad, R, unknown>;

/** Runs the steps without waiting; a load throws NotSupportedException (after the finally blocks of the steps). */
function runSynchronously<R>(steps: Steps<R>): R {
  const next = steps.next();
  if (next.done) {
    return next.value;
  }
  const error = new NotSupportedException(
    `Loading the ${next.value.what} synchronously is not possible in JavaScript; use AMLEditionTransformer.transformToEditionAsync.`,
  );
  steps.throw(error);
  throw error;
}

/** Runs the steps and awaits each load; a failed load is thrown at the place of the load. */
async function runAsynchronously<R>(steps: Steps<R>): Promise<R> {
  let next = steps.next();
  while (!next.done) {
    let result: unknown;
    try {
      result = await next.value.start();
    } catch (e) {
      next = steps.throw(e);
      continue;
    }
    next = steps.next(result);
  }
  return next.value;
}

/** Transforms AutomationML Edition 1 to Edition 2. */
export class AMLEditionTransformer implements IAMLEditionTransform {
  private _logger: Logger | null = null;

  private _libraryCatalog: PublicLibraryCatalog | null = null;

  /** @internal Internal in C#: instances are created by `register()`. */
  constructor() {}

  /** Creates an edition transformer and registers it as IAMLEditionTransform; returns it. */
  static register(): AMLEditionTransformer {
    const aMLEditionTransformer = new AMLEditionTransformer();
    ServiceLocator.register<IAMLEditionTransform>(aMLEditionTransformer, 'IAMLEditionTransform');
    return aMLEditionTransformer;
  }

  /** Unregisters the IAMLEditionTransform service. */
  static unRegister(): void {
    ServiceLocator.unRegister('IAMLEditionTransform');
  }

  /** Checks whether a logged message is an error message. */
  isError(message: string): boolean {
    return cultureStartsWith(message, 'ERROR');
  }

  /**
   * Transforms the document to the next edition of AutomationML (upward only): a CAEX schema
   * transformation, the replacement of external references by documents of the new edition and
   * attribute types for the attributes of classes (referenced from libraries or added to a new
   * AttributeTypeLib). Returns the transformed document, or the unchanged document if it is not
   * a CAEX 2.15 document.
   *
   * Throws NotSupportedException where the C# method would wait for the library catalog or the
   * class repository of `libService`; use `transformToEditionAsync` then.
   */
  transformToEdition(libService: IAMLLibraryService, document: CAEXDocument, edition: AMLEditionEnum, logger: Logger | null): CAEXDocument {
    return runSynchronously(this.transformToEditionSteps(libService, document, edition, logger));
  }

  /**
   * Not in C#: `transformToEdition` with the same steps, awaiting the library catalog and the
   * class repository of `libService`.
   */
  async transformToEditionAsync(
    libService: IAMLLibraryService,
    document: CAEXDocument,
    edition: AMLEditionEnum,
    logger: Logger | null,
  ): Promise<CAEXDocument> {
    return runAsynchronously(this.transformToEditionSteps(libService, document, edition, logger));
  }

  /** The body of C# TransformToEdition. */
  private *transformToEditionSteps(
    libService: IAMLLibraryService,
    document: CAEXDocument,
    edition: AMLEditionEnum,
    logger: Logger | null,
  ): Steps<CAEXDocument> {
    this._logger = logger;
    let flag = false;
    if (document.schema === CAEXDocument_CAEXSchema.CAEX2_15) {
      flag = true;
      const val = ServiceLocator.beginService<ISchemaTransform>(CAEXSchemaTransformer.register, 'ISchemaTransform').service;
      const val2 = val.transformTo(document, CAEXDocument_CAEXSchema.CAEX3_0)!;
      ServiceLocator.endService(CAEXSchemaTransformer.unRegister, val);
      yield* this.exchangeExtenals(libService, val2, edition);
      for (const item of val2.caexFile!.node!.descendants()) {
        if (XmlCAEXSchema.isCAEXClass(item, true)) {
          const val3 = XmlOperation.createCAEXWrapper(item) as CAEXObject;
          if (isNullOrWhiteSpace(val3.id)) {
            val3.id = CAEXObject.newGUID;
          }
          if (isNullOrWhiteSpace(val3.version)) {
            val3.version = '1.0.0';
          }
        }
      }
      if (flag) {
        yield* this.prepareAttributeTypeLibrary(libService, val2, edition);
      }
      return val2;
    }
    return document;
  }

  private *exchangeExtenals(libService: IAMLLibraryService, transformedDocument: CAEXDocument, edition: AMLEditionEnum): Steps<void> {
    if (transformedDocument.caexFile!.externalReference.count === 0) {
      return;
    }
    if (libService.serverProfile!.libraryCatalogData == null) {
      this._logger?.(this, 'ERROR: External references could not be replaced; no library catalog available.');
      return;
    }
    const scope = ExternalReferenceResolver_NoSynchronizationContextScope.enter();
    try {
      // C#: libService.LoadLibraryCatalogAsync(libService.ServerProfile.LibraryCatalogData).Result
      this._libraryCatalog = (yield {
        what: 'library catalog',
        start: () => libService.loadLibraryCatalogAsync(libService.serverProfile!.libraryCatalogData!),
      }) as PublicLibraryCatalog | null;
    } finally {
      scope.dispose();
    }
    if (this._libraryCatalog == null) {
      this._logger?.(this, 'ERROR: External references could not be replaced; access to library catalog is not possible.');
      return;
    }
    for (const item of transformedDocument.caexFile!.externalReference) {
      if (!item.isVersionReference) {
        const documentLinkForNewEdition = this.getDocumentLinkForNewEdition(item.path, edition);
        if (!isNullOrEmpty(documentLinkForNewEdition)) {
          this._logger?.(this, `ExternalReference ${item.path ?? ''} replaced.\n\tPath to new edition ${documentLinkForNewEdition}.`);
          item.path = documentLinkForNewEdition;
        }
      }
    }
  }

  private getDocumentLinkForNewEdition(path: string | null, edition: AMLEditionEnum): string {
    if (this._libraryCatalog == null) {
      return '';
    }
    const list: PublicLibraryCatalog_Library[] = [];
    for (const libraryType of this._libraryCatalog.libraryTypes!) {
      for (const library of libraryType.libraries!) {
        for (const version of library.versions!) {
          if (
            from(version.allDownloadLinks)
              .where((l) => l.linkAddress === path)
              .any()
          ) {
            list.push(library);
          }
        }
      }
    }
    if (list.length === 0) {
      this._logger?.(this, 'ERROR: No suitable edition found for external reference ' + (path ?? '') + '.');
      return '';
    }
    const source = from(list).selectMany((l) => from(l.versions).where((v) => AMLEditionEnumExtension.amlEditionFromEditionString(v.amlEdition) === edition));
    if (!source.any()) {
      this._logger?.(this, 'ERROR: No suitable edition found for external reference ' + (path ?? '') + '.');
      return '';
    }
    for (const item2 of source.groupBy((l) => SignedLibraryVersionExtensions.libraryName(l))) {
      const val = item2.orderByDescending((l) => l.semanticVersion).firstOrDefault();
      if (val != null) {
        // FirstOrDefault of a tuple sequence: default (null, null) if no link ends with ".aml".
        const item = from(val.allDownloadLinks).firstOrDefault((l) => cultureEndsWith(l.linkAddress, '.aml'))?.linkAddress ?? null;
        if (item != null) {
          return item;
        }
      }
    }
    this._logger?.(this, 'ERROR: No suitable edition found for external reference ' + (path ?? '') + '.');
    return '';
  }

  private *prepareAttributeTypeLibrary(libService: IAMLLibraryService, transformedDocument: CAEXDocument, _edition: AMLEditionEnum): Steps<void> {
    const dictionary = new Dictionary<string, AttributeType[]>();
    for (const item of transformedDocument.caexFile!) {
      if (item instanceof AttributeTypeLibType || item instanceof InstanceHierarchyType) {
        continue;
      }
      for (const item2 of CAEXBasicObjectExtensions.descendants(item, AttributeType)) {
        if (!(item2.caexParent instanceof AttributeType)) {
          const key = toLowerInvariant(item2.name!);
          const found = dictionary.tryGetValue(key);
          let value = found.value;
          if (!found.result) {
            value = [];
            dictionary.setItem(key, value);
          }
          value!.push(item2);
        }
      }
    }
    if (dictionary.count === 0) {
      return;
    }
    if (libService.serverProfile!.classCatalogData == null) {
      this._logger?.(this, 'ERROR: AttributeType references are not assignable; No attribute type catalog available.');
      return;
    }
    let val: IClassRepository | null = null;
    const scope = ExternalReferenceResolver_NoSynchronizationContextScope.enter();
    try {
      // C#: libService.LoadClassRepositoryAsync(libService.ServerProfile.ClassCatalogData, AttributeTypeRepository).Result
      val = (yield {
        what: 'class repository',
        start: () => libService.loadClassRepositoryAsync(libService.serverProfile!.classCatalogData!, ClassRepositoryEnum.AttributeTypeRepository),
      }) as IClassRepository | null;
    } finally {
      scope.dispose();
    }
    if (val == null) {
      this._logger?.(this, 'ERROR: AttributeType references are not assignable; No attribute type catalog available.');
      return;
    }
    val.stringComparisonAlgorithm = StringComparisonAlgorithmEnum.CharacterComparison;
    for (const [, value] of dictionary) {
      const val2 = value[0]!;
      const val3 = from(val.searchSimilar(val2.name!, val2.name!.length) as Iterable<ClassRepositoryItem>)
        .where((v) => v.amlEdition === 'AMLEd2')
        .orderByDescending((v) => SemanticVersion.parse(v.libraryVersion))
        .firstOrDefault();
      if (val3 != null) {
        this.referenceExternalAttributeType(transformedDocument, val3, value);
      } else {
        this.createAttributeTypeForReference(transformedDocument, value);
      }
    }
  }

  private createAttributeTypeForReference(transformedDocument: CAEXDocument, attributeTypes: AttributeType[]): void {
    const obj = from(transformedDocument.attributeTypeLib).firstOrDefault() ?? transformedDocument.attributeTypeLib.append('Transformed_AttributeTypeLib');
    let val = attributeTypes[0]!.createAttributeType();
    val = obj.attributeType.insert(val, false, false)!;
    const name = val.name!;
    val.name = lowerFirstChar(name);
    this._logger?.(this, 'Attribute Type ' + (val.name ?? '') + ' created.');
    val.version = '1.0.0';
    val.id = CAEXObject.newGUID;
    for (const attributeType of attributeTypes) {
      attributeType.attributeTypeReference = val;
    }
  }

  private documentPath(transformedDocument: CAEXDocument, classItem: ClassRepositoryItem): string | null {
    if (this._libraryCatalog == null) {
      return '';
    }
    const val = this._libraryCatalog.item('AttributeTypeLib');
    if (val == null) {
      return '';
    }
    const val2 = val.item(classItem.libraryName);
    if (val2 == null) {
      return '';
    }
    const val3 = val2.item(classItem.libraryVersion, transformedDocument.schemaVersionString);
    if (val3 == null) {
      return '';
    }
    // FirstOrDefault of a tuple sequence: default (null, null) if no link ends with ".aml".
    return from(val3.allDownloadLinks).firstOrDefault((l) => cultureEndsWith(l.linkAddress, '.aml'))?.linkAddress ?? null;
  }

  private referenceExternalAttributeType(transformedDocument: CAEXDocument, latestVersion: ClassRepositoryItem, attributeTypes: AttributeType[]): void {
    const referencePath = this.documentPath(transformedDocument, latestVersion);
    if (!isNullOrEmpty(referencePath)) {
      let val = from(transformedDocument.caexFile!.externalReference).firstOrDefault((e) => e.path === referencePath);
      if (CAEXWrapper.equals(val, null)) {
        const val2 = new AMLFileMetaModel(referencePath, AMLFileContentType.LibraryFile);
        val = transformedDocument.caexFile!.externalReference.append();
        val.path = referencePath;
        val.alias = val2.aliasNameFromParts;
        this._logger?.(this, 'Insert ExternalReference to ' + referencePath + '.');
      }
      const text = `${val!.alias ?? ''}@${latestVersion.caexPath ?? ''}`;
      this._logger?.(this, 'Insert AttributeType reference to ' + text + '.');
      for (const attributeType of attributeTypes) {
        attributeType.refAttributeType = text;
      }
      return;
    }
    this._logger?.(this, 'ERROR: No library found for attribute type ' + (latestVersion.caexPath ?? '') + '.');
  }
}

registerInterfaces(AMLEditionTransformer, 'IAMLEditionTransform', 'IAMLService');

/** `char.ToLower(name[0]) + name.Remove(0, 1)`: IndexOutOfRangeException for an empty name. */
function lowerFirstChar(name: string): string {
  if (name.length === 0) {
    throw new IndexOutOfRangeException();
  }
  return toLowerInvariant(name[0]!) + name.substring(1);
}
