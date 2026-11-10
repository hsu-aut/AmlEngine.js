// Port of Aml.Engine.Services.UndoRedo.MultiDocumentTransaction (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { Transaction } from './Transaction.js';
import type { XDocument } from '../../xml/index.js';

/**
 * A transaction relating multiple documents: if it is undone, the related transaction of the other
 * document is undone too.
 */
export class MultiDocumentTransaction extends Transaction {
  /** The transaction of the related document (internal set). */
  relatedTransaction: Transaction | null = null;

  constructor(document: XDocument, name: string | null) {
    super(document, name);
  }

  override execute(): void {
    super.execute();
    this.relatedTransaction?.execute();
  }

  override unExecute(): void {
    super.unExecute();
    this.relatedTransaction?.unExecute();
  }
}
