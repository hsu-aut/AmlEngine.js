// Port of Aml.Engine.Resources.Catalogue.ClassRepositoryEnumExtension (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { ClassRepositoryEnum } from './ClassRepositoryEnum.js';
import type { CAEXObject } from '../../caex/CAEXObject.js';

/** Extension methods for ClassRepositoryEnum. */
export class ClassRepositoryEnumExtension {
  private constructor() {}

  /** The file name of the repository ("InterfaceClass.json" etc., "" for Undefined). */
  static classRepositoryFileName(repositoryType: ClassRepositoryEnum): string {
    switch (repositoryType) {
      case ClassRepositoryEnum.InterfaceClassRepository:
        return 'InterfaceClass.json';
      case ClassRepositoryEnum.SystemUnitClassRepository:
        return 'SystemUnitClass.json';
      case ClassRepositoryEnum.AttributeTypeRepository:
        return 'AttributeType.json';
      case ClassRepositoryEnum.RoleClassRepository:
        return 'RoleClass.json';
      default:
        return '';
    }
  }

  /** The repository kind of a library or class. */
  static classRepository(libraryOrClass: CAEXObject | null): ClassRepositoryEnum {
    if (!(libraryOrClass instanceof T.InterfaceFamilyType)) {
      if (!(libraryOrClass instanceof T.InterfaceClassLibType)) {
        if (!(libraryOrClass instanceof T.SystemUnitFamilyType)) {
          if (!(libraryOrClass instanceof T.SystemUnitClassLibType)) {
            if (!(libraryOrClass instanceof T.AttributeFamilyType)) {
              if (!(libraryOrClass instanceof T.AttributeTypeLibType)) {
                if (!(libraryOrClass instanceof T.RoleFamilyType)) {
                  if (libraryOrClass instanceof T.RoleClassLibType) {
                    return ClassRepositoryEnum.RoleClassRepository;
                  }
                  return ClassRepositoryEnum.Undefined;
                }
                return ClassRepositoryEnum.RoleClassRepository;
              }
              return ClassRepositoryEnum.AttributeTypeRepository;
            }
            return ClassRepositoryEnum.AttributeTypeRepository;
          }
          return ClassRepositoryEnum.SystemUnitClassRepository;
        }
        return ClassRepositoryEnum.SystemUnitClassRepository;
      }
      return ClassRepositoryEnum.InterfaceClassRepository;
    }
    return ClassRepositoryEnum.InterfaceClassRepository;
  }

  /** The repository kind of a library or class type (exact type match, like `Type ==` in C#). */
  static classRepositoryFromType(libraryOrClassType: unknown): ClassRepositoryEnum {
    if (!(libraryOrClassType === T.RoleFamilyType) && !(libraryOrClassType === T.RoleClassLibType)) {
      if (!(libraryOrClassType === T.AttributeFamilyType) && !(libraryOrClassType === T.AttributeTypeLibType)) {
        if (!(libraryOrClassType === T.InterfaceFamilyType) && !(libraryOrClassType === T.InterfaceClassLibType)) {
          if (!(libraryOrClassType === T.SystemUnitFamilyType) && !(libraryOrClassType === T.SystemUnitClassLibType)) {
            return ClassRepositoryEnum.Undefined;
          }
          return ClassRepositoryEnum.SystemUnitClassRepository;
        }
        return ClassRepositoryEnum.InterfaceClassRepository;
      }
      return ClassRepositoryEnum.AttributeTypeRepository;
    }
    return ClassRepositoryEnum.RoleClassRepository;
  }
}
