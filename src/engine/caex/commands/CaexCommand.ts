// Port of Aml.Engine.CAEX.Commands.CaexCommand.

import type { XDocument } from '../../../xml/index.js';
import type { CAEXDocument } from '../CAEXDocument.js';
import type { CAEXElementChangeEventArgs } from './CAEXElementChangeEventArgs.js';
import type { ICAEXCommand } from './ICAEXCommand.js';
import { T } from '../../registry.js';
import { registerInterfaces } from '../../interfaces.js';
import type { IEvent, WeakEventSource } from './WeakEventSource.js';

/** Base class of all CAEX commands. */
export abstract class CaexCommand implements ICAEXCommand {
  private static _changedSource: WeakEventSource<CAEXElementChangeEventArgs> | null = null;

  private static _changingSource: WeakEventSource<CAEXElementChangeEventArgs> | null = null;

  /** @internal (static readonly, created on first use) */
  static get changedSource(): WeakEventSource<CAEXElementChangeEventArgs> {
    return (CaexCommand._changedSource ??= new T.WeakEventSource<CAEXElementChangeEventArgs>());
  }

  /** @internal (static readonly, created on first use) */
  static get changingSource(): WeakEventSource<CAEXElementChangeEventArgs> {
    return (CaexCommand._changingSource ??= new T.WeakEventSource<CAEXElementChangeEventArgs>());
  }

  /** @internal Suppresses all change events when set. */
  static isSilent = false;

  /** The CAEX document the command is applied to (internal set). */
  caexDocument: CAEXDocument | null = null;

  /** The display name of the command (never assigned in the engine). */
  get displayName(): string | null {
    return null;
  }

  /** The XDocument of the command (never assigned in the engine). */
  get xDocument(): XDocument | null {
    return null;
  }

  /** Event raised after a CAEX element has been changed. */
  static get caexElementChangedEvent(): IEvent<CAEXElementChangeEventArgs> {
    return {
      subscribe: (h) => CaexCommand.changedSource.subscribe(h),
      unsubscribe: (h) => CaexCommand.changedSource.unsubscribe(h),
    };
  }

  /** Event raised before a CAEX element will be changed. */
  static get caexElementChangingEvent(): IEvent<CAEXElementChangeEventArgs> {
    return {
      subscribe: (h) => CaexCommand.changingSource.subscribe(h),
      unsubscribe: (h) => CaexCommand.changingSource.unsubscribe(h),
    };
  }

  /** Raises the changed event. */
  static onCAEXElementChangedEvent(document: XDocument | null, args: CAEXElementChangeEventArgs): void {
    if (document !== null && !CaexCommand.isSilent) {
      CaexCommand.changedSource.raise(document, args);
      args.caexDocument?.commands.raiseChange(args);
    }
  }

  /** Raises the changing event. */
  static onCAEXElementChangingEvent(document: XDocument | null, args: CAEXElementChangeEventArgs): void {
    if (document !== null && !CaexCommand.isSilent) {
      CaexCommand.changingSource.raise(document, args);
      args.caexDocument?.commands.raiseChanging(args);
    }
  }

  /** Executes the command. */
  abstract execute(): void;

  /** Reverts the command. */
  abstract unExecute(): void;
}

registerInterfaces(CaexCommand, 'ICAEXCommand');
T.CaexCommand = CaexCommand;
