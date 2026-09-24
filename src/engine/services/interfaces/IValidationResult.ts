// Port of Aml.Engine.Services.Interfaces.IValidationResult (Aml.Engine 4.5.2).

import type { XElement } from '../../../xml/index.js';

/** Result of a validation. */
export interface IValidationResult {
  readonly element: XElement | null;
  readonly repairResult: string | null;
  validationInformation: string | null;
}
