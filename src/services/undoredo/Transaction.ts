// Port of Aml.Engine.Services.UndoRedo.Transaction (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { registerInterfaces } from '../../engine/interfaces.js';
import { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import { InvalidOperationException } from '../../system/exceptions.js';
import type { XDocument } from '../../xml/index.js';
import type { ICAEXCommand } from '../../engine/caex/commands/ICAEXCommand.js';

/**
 * A command that contains a collection of commands, treated as a transaction: if a transaction is
 * undone, all commands in the transaction are undone too.
 *
 * C# derives from List<ICAEXCommand>; the port holds the commands in an array and offers the list
 * members the service uses (`count`, `add`, enumeration). Enumeration fails like the enumerator of
 * List<T> when the list is changed during the enumeration.
 */
export class Transaction implements ICAEXCommand, Iterable<ICAEXCommand> {
  private readonly _items: ICAEXCommand[] = [];

  private _version = 0;

  private readonly _document: XDocument;

  /** The display name of the transaction. */
  readonly displayName: string | null;

  constructor(document: XDocument, name: string | null) {
    this._document = document;
    this.displayName = name;
  }

  /** The CAEX document of the transaction's XDocument. */
  get caexDocument(): CAEXDocument | null {
    return CAEXDocument.document(this._document.root);
  }

  /** Executes the commands in the order they were added. */
  execute(): void {
    for (const item of this) {
      item.execute();
    }
  }

  /** Reverts the commands in reverse order (on a copy of the list). */
  unExecute(): void {
    for (const item of [...this._items].reverse()) {
      item.unExecute();
    }
  }

  /** List<T>.Count. */
  get count(): number {
    return this._items.length;
  }

  /** List<T>.Add. */
  add(item: ICAEXCommand): void {
    this._items.push(item);
    this._version++;
  }

  /** List<T>.GetEnumerator(): fails on the next step after the list was changed. */
  *[Symbol.iterator](): Iterator<ICAEXCommand> {
    const version = this._version;
    let index = 0;
    for (;;) {
      if (version !== this._version) {
        throw new InvalidOperationException('Collection was modified; enumeration operation may not execute.');
      }
      if (index >= this._items.length) {
        return;
      }
      yield this._items[index++];
    }
  }
}

registerInterfaces(Transaction, 'ICAEXCommand');
