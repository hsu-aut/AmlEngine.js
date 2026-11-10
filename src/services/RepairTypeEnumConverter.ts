// Port of Aml.Engine.Services.RepairTypeEnumConverter (Aml.Engine.Services 4.3.1).

import '../engine/index.js';
import { RepairTypeEnum } from './RepairTypeEnum.js';

/** Enum.HasFlag: all bits of `flag` are set in `value` (always true for None). */
function hasFlag(value: RepairTypeEnum, flag: RepairTypeEnum): boolean {
  return (value & flag) === flag;
}

/** Extensions for RepairTypeEnum. */
export class RepairTypeEnumConverter {
  private constructor() {}

  /**
   * Converts the specified repair option to a readable string.
   * @param repairOption Option for repairing an element.
   * @returns a readable string describing the repair option
   */
  static repairTypeDescription(repairOption: RepairTypeEnum): string {
    if (hasFlag(repairOption, RepairTypeEnum.GenerateUniqueIDWhenEmpty)) {
      return 'Generate unique ID';
    }
    if (hasFlag(repairOption, RepairTypeEnum.GenerateUniqueIDForDoubles)) {
      return 'Generate unique ID';
    }
    if (hasFlag(repairOption, RepairTypeEnum.GenerateNameWhenEmpty)) {
      return 'Generate new name';
    }
    if (hasFlag(repairOption, RepairTypeEnum.GenerateUniqueName)) {
      return 'Generate new unique name';
    }
    if (hasFlag(repairOption, RepairTypeEnum.RemoveEmptyReference)) {
      return 'Remove reference';
    }
    if (hasFlag(repairOption, RepairTypeEnum.IDReferenceOption)) {
      return 'Remove reference';
    }
    if (hasFlag(repairOption, RepairTypeEnum.PathReferenceOption)) {
      return 'Remove reference';
    }
    if (hasFlag(repairOption, RepairTypeEnum.RemoveAlias)) {
      return 'Remove alias';
    }
    if (!hasFlag(repairOption, RepairTypeEnum.RemoveElement)) {
      if (!hasFlag(repairOption, RepairTypeEnum.RemoveElementNotInScope)) {
        if (!hasFlag(repairOption, RepairTypeEnum.RenameClassPathForDoubles)) {
          if (!hasFlag(repairOption, RepairTypeEnum.CreateSourceDocumentInformation)) {
            if (!hasFlag(repairOption, RepairTypeEnum.SetSchemaVersion)) {
              if (!hasFlag(repairOption, RepairTypeEnum.GenerateValidGUID)) {
                if (!hasFlag(repairOption, RepairTypeEnum.CreateWriterHeader)) {
                  if (!hasFlag(repairOption, RepairTypeEnum.CreateAutomationMLVersion)) {
                    if (!hasFlag(repairOption, RepairTypeEnum.ChangeFileURL)) {
                      if (!hasFlag(repairOption, RepairTypeEnum.RemoveUnresolvedNameReference)) {
                        // Aml.Engine: HasFlag(None) is always true, so every other value (also
                        // GenerateXmlName and CheckAliasInExternalReference) gives "No option" and
                        // repairOption.ToString() is never reached.
                        if (!hasFlag(repairOption, RepairTypeEnum.None)) {
                          return RepairTypeEnum[repairOption] ?? String(repairOption);
                        }
                        return 'No option';
                      }
                      return 'Remove the unresolved reference with this name';
                    }
                    return 'Change file URL to relative path';
                  }
                  return 'Set AutomationML version';
                }
                return 'Generate writer header';
              }
              return 'Generate valid ID';
            }
            return 'Set schema version';
          }
          return 'Generate source document information';
        }
        return 'Generate unique name';
      }
      return 'Remove element';
    }
    return 'Remove element';
  }
}
