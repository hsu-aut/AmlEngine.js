// Port of Aml.Engine.Services.Interfaces.IClassRepository (Aml.Engine 4.5.2).

import type { CAEXObject } from '../../caex/CAEXObject.js';
import type { ClassRepositoryEnum } from '../../resources/catalogue/ClassRepositoryEnum.js';

/** Aml.Engine.Resources.Catalogue.StringComparisonAlgorithmEnum (assembly Aml.Engine.Resources, not ported). */
export type StringComparisonAlgorithmEnum = number;
/** Aml.Engine.Resources.Catalogue.ClassRepositoryItem (assembly Aml.Engine.Resources, not ported). */
export type ClassRepositoryItem = unknown;

/** A repository of classes, used to search similar classes. */
export interface IClassRepository {
  readonly repositoryType: ClassRepositoryEnum;
  readonly fileName: string | null;
  stringComparisonAlgorithm: StringComparisonAlgorithmEnum;
  addClasses(caexObject: CAEXObject): boolean;
  searchSimilar(className: string, maxCost: number): ClassRepositoryItem[];
}
