// Port of Aml.Engine.Services.Interfaces.IUniqueName (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { XElement } from '../../../xml/index.js';
import type { IAMLService } from './IAMLService.js';
import type { ISuspendable } from './ISuspendable.js';

/** Service creating unique CAEX names. */
export interface IUniqueName extends IAMLService, ISuspendable {
  isUniqueCAEXName(element: XElement): boolean;
  registerDefault(elementTagName: string, defaultName: string): void;
  /**
   * C# overloads UniqueCAEXName(XElement sequence, tagName), (XElement sequence, tagName,
   * defaultName) and (IEnumerable<XElement> sequence, tagName, defaultName).
   */
  uniqueCAEXName(sequence: XElement | Iterable<XElement>, elementTagName: string, defaultName?: string): string;
}

registerInterfaceBases('IUniqueName', 'IAMLService', 'ISuspendable');
