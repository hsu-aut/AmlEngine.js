// Port of Aml.Engine.Services.MergeService (Aml.Engine.Services 4.3.1).

import '../engine/index.js';
import { from } from '../system/linq.js';
import { implementsInterface, registerInterfaces } from '../engine/interfaces.js';
import { AmlObjectsExtensions } from '../engine/amlobjects/extensions/AmlObjectsExtensions.js';
import { Version } from '../engine/amlobjects/internal/Version.js';
import { CAEXDocument } from '../engine/caex/CAEXDocument.js';
import { CAEXObject } from '../engine/caex/CAEXObject.js';
import { CAEXWrapper } from '../engine/caex/CAEXWrapper.js';
import { InternalElementType } from '../engine/caex/InternalElementType.js';
import { CAEXFileTypeExtensions } from '../engine/caex/extensions/CAEXFileTypeExtensions.js';
import { CAEXPathBuilder } from '../engine/caex/extensions/CAEXPathBuilder.js';
import { StringExtensions } from '../engine/caex/extensions/StringExtensions.js';
import { QueryResult } from '../engine/services/QueryResult.js';
import { ServiceLocator } from '../engine/services/ServiceLocator.js';
import { CAEXSchemaTransformer } from './CAEXSchemaTransformer.js';
import { ExternalReferenceResolver } from './ExternalReferenceResolver.js';
import { ValidationResults } from './ValidationResults.js';
import { ValidatorService } from './ValidatorService.js';
import type { CAEXSequenceOfCAEXObjects } from '../engine/caex/CAEXSequenceOfCAEXObjects.js';
import type { ExternalReferenceType } from '../engine/caex/ExternalReferenceType.js';
import type { InstanceHierarchyType } from '../engine/caex/InstanceHierarchyType.js';
import type { IAMLService } from '../engine/services/interfaces/IAMLService.js';
import type { IAutoUpdate } from '../engine/services/interfaces/IAutoUpdate.js';
import type { ICAEXReference } from '../engine/services/interfaces/ICAEXReference.js';
import type { IMerge } from '../engine/services/interfaces/IMerge.js';
import type { ISchemaTransform } from '../engine/services/interfaces/ISchemaTransform.js';
import type { IXMLExternalUnload } from '../engine/services/interfaces/IXMLExternalUnload.js';

/**
 * A merge service which merges CAEX documents from different sources into one common document.
 * The libraries of the externally referenced file are added to the target document and all alias
 * references which can be resolved after the merge are updated. A library which also exists in the
 * target document is replaced if the version in the external source is newer, otherwise the
 * existing library is kept. An InstanceHierarchy of the external source that can be identified as
 * an outsourced master InternalElement is put back to its original position.
 */
export class MergeService implements IMerge, IAMLService {
  /** Registers a new instance of a MergeService with the ServiceLocator; returns the service instance. */
  static register(): MergeService {
    const mergeService = new MergeService();
    ServiceLocator.register(mergeService, 'IMerge');
    return mergeService;
  }

  /** Unregisters this service. */
  static unRegister(): void {
    ServiceLocator.unRegister('IMerge');
  }

  /**
   * C# overloads:
   * - `Merge(document, externalReference, Stream externalSource, out mergeProtocol, autoTransform = false)`:
   *   merges the external reference into the document; the source is loaded from the external
   *   source stream (the bytes of the stream).
   * - `Merge(document, externalReference, out mergeProtocol, autoTransform = false)`: merges the
   *   external reference into the document; the source is loaded by the external reference resolver.
   *
   * If `autoTransform` is set, the service performs a schema transformation if necessary. `result`
   * is `true` if the merge was successful.
   */
  merge(
    document: CAEXDocument,
    externalReference: ExternalReferenceType,
    externalSourceOrAutoTransform?: Uint8Array | boolean | null,
    autoTransform = false,
  ): { result: boolean; mergeProtocol: string[] } {
    if (typeof externalSourceOrAutoTransform !== 'boolean' && externalSourceOrAutoTransform !== undefined) {
      // Merge(document, externalReference, externalSource, out mergeProtocol, autoTransform)
      const externalSource = externalSourceOrAutoTransform;
      let val: CAEXDocument | null = CAEXDocument.loadFromStream(externalSource, false);
      if ((val !== null ? val.schema : null) === (document != null ? document.schema : null)) {
        return MergeService.merge(document, val, externalReference);
      }
      if (!autoTransform) {
        return {
          result: false,
          mergeProtocol: ['External source has a different CAEX schema version.', 'Please transform the current document to the same schema version.'],
        };
      }
      let flag = false;
      let val2 = ServiceLocator.getService<ISchemaTransform>('ISchemaTransform');
      if (val2 === null) {
        val2 = CAEXSchemaTransformer.register();
        flag = true;
      }
      if (document != null) {
        val = val2.transformTo(val, document.schema);
      }
      if (flag) {
        CAEXSchemaTransformer.unRegister();
      }
      return MergeService.merge(document, val!, externalReference);
    }

    // Merge(document, externalReference, out mergeProtocol, autoTransform)
    autoTransform = externalSourceOrAutoTransform ?? false;
    // The class is the type argument; its constructor is private, so it is passed as a constructor type.
    const externalReferenceResolver = ServiceLocator.beginService(
      () => ExternalReferenceResolver.register(),
      ExternalReferenceResolver as unknown as abstract new () => unknown,
    ).service;
    const loaded = MergeService.loadExternalSource(document, externalReference, autoTransform);
    const source = loaded.source;
    let mergeProtocol = loaded.mergeProtocol;
    const val = source;
    try {
      let result = false;
      if (loaded.result) {
        const merged = MergeService.merge(document, source!, externalReference);
        mergeProtocol = merged.mergeProtocol;
        result = merged.result;
      }
      ServiceLocator.endService(() => ExternalReferenceResolver.unRegister(), externalReferenceResolver);
      return { result, mergeProtocol: mergeProtocol! };
    } finally {
      val?.dispose();
    }
  }

  /** The private static `Merge(document, source, externalReference, out mergeProtocol)`. */
  private static merge(
    document: CAEXDocument,
    source: CAEXDocument,
    externalReference: ExternalReferenceType,
  ): { result: boolean; mergeProtocol: string[] } {
    let mergeProtocol: string[] = [];
    const list: string[] = [];
    if (!MergeService.importLibraries(document, source, list)) {
      return { result: false, mergeProtocol };
    }
    if (!MergeService.importInstanceHierarchies(document, source, externalReference.alias, list)) {
      return { result: false, mergeProtocol };
    }
    if (!MergeService.importExternals(document, source, list)) {
      return { result: false, mergeProtocol };
    }
    const externalReferenceResolverService = ServiceLocator.externalReferenceResolverService;
    const obj = implementsInterface(externalReferenceResolverService, 'IXMLExternalUnload') ? externalReferenceResolverService : null;
    if (obj !== null) {
      (obj as unknown as IXMLExternalUnload).unloadExternalDocument(externalReference);
    }
    externalReference.alias = '';
    const service = ServiceLocator.getService<IAutoUpdate>('IAutoUpdate');
    if (service !== null && service.isAutoUpdateEnabled) {
      service.isAutoUpdateEnabled = false;
      externalReference.remove(false);
      service.isAutoUpdateEnabled = true;
    } else {
      externalReference.remove(false);
    }
    MergeService.validate(document);
    mergeProtocol = [...list];
    return { result: true, mergeProtocol };
  }

  private static findMasterMirrors(aliasMirrors: Iterable<ICAEXReference>, instanceHierarchy: InstanceHierarchyType): ICAEXReference[] {
    return from(aliasMirrors)
      .where((m) =>
        MergeService.idsEqual(
          CAEXPathBuilder.removeAlias(m.caexObject!.getXAttributeValue(m.referenceAttributeName!), null),
          instanceHierarchy.internalElement.item(0)!.id,
        ),
      )
      .where((m) => {
        const cAEXParent = m.caexObject!.caexParent;
        const val = cAEXParent instanceof InternalElementType ? cAEXParent : null;
        return CAEXWrapper.equals(val, null) || !AmlObjectsExtensions.isAMLGroup(val!);
      })
      .toList();
  }

  private static idsEqual(id1: string | null, id2: string | null): boolean {
    return StringExtensions.normalizedGUID(id1) === StringExtensions.normalizedGUID(id2);
  }

  private static replaceMirrorWithInstanceHierarchyContent(firstMirror: ICAEXReference, instanceHierarchy: InstanceHierarchyType): void {
    const cAEXParent = firstMirror.caexObject!.caexParent;
    const obj = cAEXParent instanceof CAEXObject ? cAEXParent : null;
    if (!CAEXWrapper.equals(obj, null)) {
      obj!.insert(instanceHierarchy.internalElement.item(0), true, false);
    }
    firstMirror.caexObject!.remove(false);
  }

  /** Gets the external libraries from the source which should be imported into the target. */
  private static externalLibrariesForImport<T extends CAEXObject>(
    target: CAEXSequenceOfCAEXObjects<T>,
    source: Iterable<T>,
    protocol: string[],
  ): T[] {
    const list: T[] = [];
    for (const library of source) {
      const val = from<T>(target).firstOrDefault((lib) => lib.name === library.name);
      if (!CAEXWrapper.equals(val, null)) {
        let result: Version | null;
        let result2: Version | null;
        // Aml.Engine: both versions are parsed from the library of the external source (the
        // version of the existing library is never read), so they are always equal and an
        // existing library is never replaced.
        if ((result = Version.tryParse(library.version)) !== null && (result2 = Version.tryParse(library.version)) !== null) {
          if (Version.greaterThan(result, result2)) {
            protocol.push(
              (val!.name ?? '') +
                ' with version ' +
                result2.toString() +
                ' has been replaced with version ' +
                result.toString() +
                ' from the external source.',
            );
            val!.remove(false);
            list.push(library);
          } else {
            protocol.push((library.name ?? '') + ' with version ' + result.toString() + ' has not been imported. An identical or newer version already exists.');
          }
        } else {
          protocol.push((library.name ?? '') + ' has not been imported. Version could not been identified!');
        }
      } else {
        list.push(library);
      }
    }
    return list;
  }

  private static importExternals(document: CAEXDocument, source: CAEXDocument, protocol: string[]): boolean {
    for (const externalReference of source.caexFile!.externalReference) {
      if (from(document.caexFile!.externalReference).any((e) => e.path === externalReference.path)) {
        continue;
      }
      if (!CAEXWrapper.equals(from(document.caexFile!.externalReference).firstOrDefault((e) => e.alias === externalReference.alias), null)) {
        const obj = externalReference;
        obj.alias = (obj.alias ?? '') + '_2';
      }
      if (
        !(externalReference.path === document.caexFile!.fileName) &&
        from(ServiceLocator.queryService.elementsWithAliasReference(document.caexFile!, externalReference.alias!, '')).toList().length !== 0
      ) {
        protocol.push(`ExternalReference Alias:${externalReference.alias ?? ''} Path:${externalReference.path ?? ''} added!`);
        const val = CAEXFileTypeExtensions.new_ExternalReference(document.caexFile!, externalReference.path, externalReference.alias);
        if (externalReference.isVersionReference) {
          val.makeVersionReference(null);
        }
      }
    }
    return true;
  }

  private static importInstanceHierarchies(document: CAEXDocument, source: CAEXDocument, alias: string | null, protocol: string[]): boolean {
    const list = [
      ...MergeService.externalLibrariesForImport<InstanceHierarchyType>(
        document.caexFile!.instanceHierarchy,
        source.caexFile!.instanceHierarchy,
        protocol,
      ),
    ];
    if (!(list.length > 0)) {
      return true;
    }
    // Aml.Engine: the mirrors are searched in the source document, not in the document (where
    // Split leaves them); a found mirror is replaced in the source and its InstanceHierarchy is
    // not imported.
    const aliasMirrors = from(QueryResult.elementsWithAliasReference(source, alias!))
      .where((a) => a.caexObject instanceof InternalElementType)
      .toList();
    for (const item of list) {
      if (item.internalElement.count === 1) {
        const list2 = MergeService.findMasterMirrors(aliasMirrors, item);
        if (list2.length === 1) {
          const val = from(list2).first();
          protocol.push('Mirror ' + ((val.caexObject as CAEXObject).name ?? '') + ' replaced with ' + (item.internalElement.item(0)!.name ?? ''));
          MergeService.replaceMirrorWithInstanceHierarchyContent(val, item);
          continue;
        }
      }
      CAEXFileTypeExtensions.importInstanceHierarchy(document.caexFile!, item);
    }
    return true;
  }

  private static importLibraries(document: CAEXDocument, source: CAEXDocument, protocol: string[]): boolean {
    const enumerable = MergeService.externalLibrariesForImport(document.caexFile!.systemUnitClassLib, source.caexFile!.systemUnitClassLib, protocol);
    const enumerable2 = MergeService.externalLibrariesForImport(document.caexFile!.roleClassLib, source.caexFile!.roleClassLib, protocol);
    const enumerable3 = MergeService.externalLibrariesForImport(document.caexFile!.interfaceClassLib, source.caexFile!.interfaceClassLib, protocol);
    for (const item of MergeService.externalLibrariesForImport(document.caexFile!.attributeTypeLib, source.caexFile!.attributeTypeLib, protocol)) {
      CAEXFileTypeExtensions.importAttributeTypeLib(document.caexFile!, item);
    }
    for (const item2 of enumerable3) {
      CAEXFileTypeExtensions.importInterfaceClassLib(document.caexFile!, item2);
    }
    for (const item3 of enumerable2) {
      CAEXFileTypeExtensions.importRoleClassLib(document.caexFile!, item3);
    }
    for (const item4 of enumerable) {
      CAEXFileTypeExtensions.importSystemUnitClassLib(document.caexFile!, item4);
    }
    return true;
  }

  /**
   * Tries to load the external source which is defined in the external reference (`out source`,
   * `out mergeProtocol`); `result` is `true` if loaded.
   */
  private static loadExternalSource(
    document: CAEXDocument,
    externalReference: ExternalReferenceType,
    autoTransform: boolean,
  ): { result: boolean; source: CAEXDocument | null; mergeProtocol: string[] | null } {
    const tuple = ServiceLocator.externalReferenceResolverService!.loadOrGetReferencedDocument(externalReference);
    let source = tuple.document;
    if (source === null) {
      return { result: false, source, mergeProtocol: [tuple.message as string] };
    }
    let result: Version | null;
    let result2: Version | null;
    if ((result = Version.tryParse(document.schemaVersionString)) !== null && (result2 = Version.tryParse(source.schemaVersionString)) !== null) {
      if (!result.equals(result2)) {
        if (!autoTransform) {
          return {
            result: false,
            source,
            mergeProtocol: ['External source has a different CAEX schema version.', 'Please transform the current document to the same schema version.'],
          };
        }
        let flag = false;
        let val = ServiceLocator.getService<ISchemaTransform>('ISchemaTransform');
        if (val === null) {
          val = CAEXSchemaTransformer.register();
          flag = true;
        }
        const val2 = val.transformTo(source, document.schema);
        source = val2;
        if (flag) {
          CAEXSchemaTransformer.unRegister();
        }
      }
      return { result: true, source, mergeProtocol: null };
    }
    return { result: false, source, mergeProtocol: ["Couldn't identify schema version from files."] };
  }

  private static validate(document: CAEXDocument): void {
    const validator = ServiceLocator.beginService(() => ValidatorService.register(), ValidatorService).service;
    from(ValidationResults.repairable(validator.validateAliasReferences(document)))
      .toList()
      .forEach((e) => {
        validator.repair(e);
      });
    ServiceLocator.endService(() => ValidatorService.unRegister(), validator);
  }
}

registerInterfaces(MergeService, 'IMerge', 'IAMLService');
