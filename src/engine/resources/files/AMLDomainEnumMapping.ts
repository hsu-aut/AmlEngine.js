// Port of Aml.Engine.Resources.Files.AMLDomainEnumMapping (Aml.Engine.Resources 4.2.1).

import { AMLDomainEnum } from './AMLDomainEnum.js';

/**
 * Maps an AMLDomainEnum value to the domain string. Please note, that the domain strings may be
 * different for different AutomationML Editions.
 */
export class AMLDomainEnumMapping {
  private constructor() {}

  /**
   * Gets the domain strings for a domain and an edition. If multiple domain strings are found the
   * various domain strings are separated by ';'.
   * @param domainEnum Model domain.
   * @param amlEdition AutomationML Edition ("AMLEd1" or "AMLEd2").
   * @returns The mapped domain strings separated by ';'.
   */
  static domainString(domainEnum: AMLDomainEnum, amlEdition: string | null): string {
    switch (domainEnum) {
      case AMLDomainEnum.Base:
        if (amlEdition === 'AMLEd1') {
          return 'Base;BPR';
        }
        if (amlEdition === 'AMLEd2') {
          return 'Base';
        }
        break;
      case AMLDomainEnum.Geometry:
        if (amlEdition === 'AMLEd2') {
          return 'Geometry';
        }
        break;
      case AMLDomainEnum.BatchManufacturing:
        if (amlEdition === 'AMLEd1') {
          return 'BMI';
        }
        if (amlEdition === 'AMLEd2') {
          return 'BatchManufacturing';
        }
        break;
      case AMLDomainEnum.ContinuousManufacturing:
        if (amlEdition === 'AMLEd1') {
          return 'CMI';
        }
        if (amlEdition === 'AMLEd2') {
          return 'ContinuousManufacturing';
        }
        break;
      case AMLDomainEnum.ControlIndustry:
        if (amlEdition === 'AMLEd1') {
          return 'CS';
        }
        if (amlEdition === 'AMLEd2') {
          return 'ControlIndustry';
        }
        break;
      case AMLDomainEnum.DiscreteManufacturing:
        if (amlEdition === 'AMLEd1') {
          return 'DMI';
        }
        if (amlEdition === 'AMLEd2') {
          return 'DiscreteManufacturing';
        }
        break;
      case AMLDomainEnum.MaterialHandling:
        return 'MaterialHandling';
      case AMLDomainEnum.MESandERP:
        return 'MESandERP';
      case AMLDomainEnum.AutomationProjectConfiguration:
        return 'ARAPC;AREAPC';
      case AMLDomainEnum.AssetAdministrationShell:
        return 'AssetAdministrationShell';
      case AMLDomainEnum.ControlandCommunicationsLink:
        return 'CC-Link';
      case AMLDomainEnum.Communication:
        return 'Communication';
      case AMLDomainEnum.DriveConfiguration:
        return 'DriveConfigurations';
      case AMLDomainEnum.Logic:
        return 'Logic';
      case AMLDomainEnum.AutomationComponent:
        return 'AutomationComponent';
    }
    return '';
  }
}
