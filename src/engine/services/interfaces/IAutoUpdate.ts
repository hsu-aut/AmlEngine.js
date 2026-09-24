// Port of Aml.Engine.Services.Interfaces.IAutoUpdate (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { EventSource } from '../../../system/index.js';
import type { IAMLService } from './IAMLService.js';
import type { UpdateEventArgs } from './UpdateEventArgs.js';

/** Service updating references automatically when referenced objects change. */
export interface IAutoUpdate extends IAMLService {
  isAutoUpdateEnabled: boolean;
  /** Raised when a reference has been updated. */
  readonly referenceUpdated: EventSource<UpdateEventArgs>;
}

registerInterfaceBases('IAutoUpdate', 'IAMLService');
