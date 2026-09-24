// Port of Aml.Engine.Services.Interfaces.IStatistic (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { CAEXFileType } from '../../caex/CAEXFileType.js';
import type { IAMLService } from './IAMLService.js';

/** Service counting objects of a CAEX file. */
export interface IStatistic extends IAMLService {
  numberOfAllObjects(caexFile: CAEXFileType): number;
  numberOfAttributes(caexFile: CAEXFileType): number;
  numberOfAttributeTypeReferences(caexFile: CAEXFileType): number;
  numberOfAttributeTypes(caexFile: CAEXFileType): number;
  numberOfInterfaceClasses(caexFile: CAEXFileType): number;
  numberOfInterfaceInstances(caexFile: CAEXFileType): number;
  numberOfInternalElements(caexFile: CAEXFileType): number;
  numberOfLinks(caexFile: CAEXFileType): number;
  numberOfRoleClasses(caexFile: CAEXFileType): number;
  numberOfRoleClassReferences(caexFile: CAEXFileType): number;
  numberOfSystemUnitClasses(caexFile: CAEXFileType): number;
  numberOfSystemUnitClassReferences(caexFile: CAEXFileType): number;
}

registerInterfaceBases('IStatistic', 'IAMLService');
