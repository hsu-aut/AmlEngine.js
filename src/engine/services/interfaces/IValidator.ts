// Port of Aml.Engine.Services.Interfaces.IValidator (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { CAEXObject } from '../../caex/CAEXObject.js';
import type { AutomationMLContainer } from '../../amlobjects/AutomationMLContainer.js';
import type { IAMLService } from './IAMLService.js';
import type { IValidationResult } from './IValidationResult.js';

/** Validator for IDs and names. */
export interface IValidator extends IAMLService {
  idValidation(caexObject: CAEXObject, ID: string | null): { isValid: boolean; message: string | null };
  nameValidation(caexObject: CAEXObject, name: string | null): { isValid: boolean; message: string | null };
}

/** Validator of documents with a specific result type (C# IValidator<RESULTTYPE>). */
export interface IValidator_1<RESULTTYPE extends IValidationResult> extends IValidator, IAMLService {
  repair(validation: RESULTTYPE): boolean;
  validateAliasReferences(document: CAEXDocument, generateLongDescription?: boolean): Iterable<RESULTTYPE>;
  /** C# overloads ValidateAll(document, generateLongDescription) and ValidateAll(document, container, generateLongDescription). */
  validateAll(document: CAEXDocument, containerOrGenerateLongDescription?: AutomationMLContainer | boolean, generateLongDescription?: boolean): Iterable<RESULTTYPE>;
}

registerInterfaceBases('IValidator', 'IAMLService');
registerInterfaceBases('IValidator_1', 'IValidator', 'IAMLService');
