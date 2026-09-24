// Port of Aml.Engine.AmlObjects.MimeType.MimeTypeMap (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { ArgumentNullException } from '../../../system/exceptions.js';
import { from, type Enumerable } from '../../../system/linq.js';
import { isNullOrWhiteSpace } from '../../../system/strings.js';
import type { InvariantIgnoreCaseDictionary } from './InvariantIgnoreCaseDictionary.js';

/** Mapping of file extensions to MIME types and back. */
export class MimeTypeMap {
  private constructor() {}

  /** `Lazy<IDictionary<string, List<string>>>` of the C# class: built on first use. */
  private static _mappings: InvariantIgnoreCaseDictionary<string[]> | null = null;

  private static get mappings(): InvariantIgnoreCaseDictionary<string[]> {
    return (MimeTypeMap._mappings ??= MimeTypeMap.buildMappings());
  }

  /**
   * Gets the extensions for the provided MIME type.
   * @param mimeType The MIME type.
   * @returns The list of extensions, or `null` if the MIME type is not known.
   * @throws ArgumentNullException mimeType is null, empty or white space.
   */
  static getExtension(mimeType: string | null): string[] | null {
    if (isNullOrWhiteSpace(mimeType)) {
      throw new ArgumentNullException('mimeType', 'mimeType argument is null or empty.');
    }
    return MimeTypeMap.mappings.tryGetValue(mimeType!).value;
  }

  /**
   * Gets the known extensions (and MIME types) whose mapping list contains the provided MIME type.
   * @param mimeType The MIME type.
   * @throws ArgumentNullException mimeType is null, empty or white space.
   */
  static getKnownExtensions(mimeType: string | null): Enumerable<string> {
    if (!isNullOrWhiteSpace(mimeType)) {
      return from(MimeTypeMap.mappings)
        .where((s) => s.value.includes(mimeType!.toLowerCase()))
        .select((s) => s.key);
    }
    throw new ArgumentNullException('mimeType', 'mimeType argument is null or empty.');
  }

  /**
   * Gets the MIME types for the provided file extension (with or without leading '.').
   * @returns The list of MIME types; an empty list if the extension is not known.
   */
  static getMimeType(extension: string | null): string[] {
    if (isNullOrWhiteSpace(extension)) {
      return [];
    }
    if (!extension!.startsWith('.')) {
      extension = '.' + extension;
    }
    const r = MimeTypeMap.mappings.tryGetValue(extension!);
    if (!r.result) {
      return [];
    }
    return r.value!;
  }

  /**
   * Determines whether the provided file extension denotes an XML text file.
   * @param extension The file extension (with or without leading '.').
   */
  static isXmlText(extension: string): boolean {
    if (!extension.startsWith('.')) {
      extension = '.' + extension;
    }
    if (extension.toLowerCase() === '.xml' && extension.length === 4) {
      return true;
    }
    const hashSet = new Set(MimeTypeMap.getMimeType('.xml'));
    for (const item of MimeTypeMap.getMimeType(extension)) {
      if (hashSet.has(item)) {
        return true;
      }
      if (item.endsWith('xml')) {
        return true;
      }
    }
    return false;
  }

  private static buildMappings(): InvariantIgnoreCaseDictionary<string[]> {
    const mappings = T.MappingList.mappings;
    for (const item of [...mappings]) {
      const text = item.value.length > 0 ? item.value[0] : null;
      if (text != null) {
        const r = mappings.tryGetValue(text);
        if (!r.result) {
          mappings.add(text, [item.key]);
        } else {
          r.value!.push(item.key);
        }
      }
    }
    return mappings;
  }
}
