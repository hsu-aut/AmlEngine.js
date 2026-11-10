// Port of Aml.Engine.Resources.Files.AMLLibraryModel (Aml.Engine.Resources 4.2.1).
// String concatenation and interpolation of C# turn null into "".

import { AMLLibraryTypeEnum } from './AMLLibraryTypeEnum.js';

/** The meta model used to name libraries. */
export class AMLLibraryModel {
  private constructor() {}

  /**
   * Builds a library name according to the library naming conventions using the provided identifiers.
   * @param producer Identifies the producer.
   * @param domain Identifies the model domain.
   * @param libType The library type.
   * @param extension Optional extension.
   */
  static libraryName(producer: string | null, domain: string | null, libType: AMLLibraryTypeEnum, extension: string | null = null): string {
    const p = producer ?? '';
    const d = domain ?? '';
    switch (libType) {
      case AMLLibraryTypeEnum.AttributeType:
        if (extension == null) {
          return p + '_' + d + '_AttributeTypeLib';
        }
        if (extension != null) {
          return `${p}_${d}_${extension}_AttributeTypeLib`;
        }
        break;
      case AMLLibraryTypeEnum.RoleClass:
        if (extension == null) {
          return p + '_' + d + '_RoleClassLib';
        }
        if (extension != null) {
          return `${p}_${d}_${extension}_RoleClassLib`;
        }
        break;
      case AMLLibraryTypeEnum.InterfaceClass:
        if (extension == null) {
          return p + '_' + d + '_InterfaceClassLib';
        }
        if (extension != null) {
          return `${p}_${d}_${extension}_InterfaceClassLib`;
        }
        break;
      case AMLLibraryTypeEnum.SystemUnitClass:
        if (extension == null) {
          return p + '_' + d + '_SystemUnitClassLib';
        }
        if (extension != null) {
          return `${p}_${d}_${extension}_SystemUnitClassLib`;
        }
        break;
    }
    return '';
  }
}
