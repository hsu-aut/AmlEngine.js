// Port of Aml.Engine.Services.Model.AMLEditionEnumExtension (Aml.Engine 4.5.2).

import { AmlObjectsExtensions } from '../../amlobjects/extensions/AmlObjectsExtensions.js';
import { AMLEditionEnum } from './AMLEditionEnum.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';

/** Extension methods for AMLEditionEnum and AutomationML version strings. */
export class AMLEditionEnumExtension {
  private constructor() {}

  /** The edition string ("AMLEd1", "AMLEd2" or "unknown"). */
  static amlEditionString(automationMLEdition: AMLEditionEnum): string {
    switch (automationMLEdition) {
      case AMLEditionEnum.Edition1:
        return 'AMLEd1';
      case AMLEditionEnum.Edition2:
        return 'AMLEd2';
      default:
        return 'unknown';
    }
  }

  /** Checks whether the document belongs to the edition (always true for AllEditions). */
  static isDocumentEdition(automationMLEdition: AMLEditionEnum, document: CAEXDocument): boolean {
    switch (automationMLEdition) {
      case AMLEditionEnum.Edition1:
        return AMLEditionEnumExtension.amlEditionFromVersion(AmlObjectsExtensions.automationMLVersion(document)) === AMLEditionEnum.Edition1;
      case AMLEditionEnum.Edition2:
        return AMLEditionEnumExtension.amlEditionFromVersion(AmlObjectsExtensions.automationMLVersion(document)) === AMLEditionEnum.Edition2;
      default:
        return true;
    }
  }

  /** The edition string of an AutomationML version ("2.0" is "AMLEd1", "2.1" and "2.10" are "AMLEd2"). */
  static amlEditionStringFromVersion(automationMLVersion: string | null): string {
    switch (automationMLVersion) {
      case '2.0':
        return 'AMLEd1';
      case '2.1':
        return 'AMLEd2';
      case '2.10':
        return 'AMLEd2';
      default:
        return 'unknown';
    }
  }

  /** The edition of an AutomationML version (AllEditions for an unknown version). */
  static amlEditionFromVersion(automationMLVersion: string | null): AMLEditionEnum {
    switch (automationMLVersion) {
      case '2.0':
        return AMLEditionEnum.Edition1;
      case '2.1':
        return AMLEditionEnum.Edition2;
      case '2.10':
        return AMLEditionEnum.Edition2;
      default:
        return AMLEditionEnum.AllEditions;
    }
  }

  /** The edition of an edition string (AllEditions for an unknown string). */
  static amlEditionFromEditionString(edition: string | null): AMLEditionEnum {
    if (!(edition === 'AMLEd1')) {
      if (edition === 'AMLEd2') {
        return AMLEditionEnum.Edition2;
      }
      return AMLEditionEnum.AllEditions;
    }
    return AMLEditionEnum.Edition1;
  }
}
