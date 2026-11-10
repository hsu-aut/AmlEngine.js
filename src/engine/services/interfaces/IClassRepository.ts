// Port of Aml.Engine.Services.Interfaces.IClassRepository (Aml.Engine 4.5.2).

import type { CAEXObject } from '../../caex/CAEXObject.js';
import type { ClassRepositoryEnum } from '../../resources/catalogue/ClassRepositoryEnum.js';
import type { ClassRepositoryItem } from '../../resources/catalogue/ClassRepositoryItem.js';
import type { StringComparisonAlgorithmEnum } from '../../resources/catalogue/StringComparisonAlgorithmEnum.js';

/** A repository of classes, used to search similar classes. */
export interface IClassRepository {
  readonly repositoryType: ClassRepositoryEnum;
  readonly fileName: string | null;
  stringComparisonAlgorithm: StringComparisonAlgorithmEnum;
  addClasses(caexObject: CAEXObject): boolean;
  searchSimilar(className: string, maxCost: number): ClassRepositoryItem[];
}
