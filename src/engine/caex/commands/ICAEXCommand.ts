// Port of Aml.Engine.CAEX.Commands.ICAEXCommand.

import type { CAEXDocument } from '../CAEXDocument.js';

/** Interface for undoable CAEX commands. */
export interface ICAEXCommand {
  /** The CAEX document the command is applied to. */
  readonly caexDocument: CAEXDocument | null;

  /** The display name of the command. */
  readonly displayName: string | null;

  /** Executes the command. */
  execute(): void;

  /** Reverts the command. */
  unExecute(): void;
}
