// Port of Aml.Engine.Services.UndoRedoService (Aml.Engine.Services 4.3.1).

import '../engine/index.js';
import { registerInterfaces } from '../engine/interfaces.js';
import { ServiceLocator } from '../engine/services/ServiceLocator.js';
import { DateTime, EventSource, InvalidOperationException, PropertyChangedEventArgs } from '../system/index.js';
import { from } from '../system/linq.js';
import { DocumentReferenceDictionary } from './generique/DocumentReferenceDictionary.js';
import { MultiDocumentTransaction } from './undoredo/MultiDocumentTransaction.js';
import { Transaction } from './undoredo/Transaction.js';
import type { XDocument } from '../xml/index.js';
import type { CAEXDocument } from '../engine/caex/CAEXDocument.js';
import type { ICAEXCommand } from '../engine/caex/commands/ICAEXCommand.js';
import type { IUndoRedo } from '../engine/services/interfaces/IUndoRedo.js';
import type { IXMLDocumentRegistry } from '../engine/services/interfaces/IXMLDocumentRegistry.js';
import type { XDocumentWrapper } from '../engine/xml/XDocumentWrapper.js';

/**
 * System.Collections.Generic.Stack<T> as far as the service uses it: `pop` and `peek` throw on an
 * empty stack, enumeration starts at the top and fails on the next step after the stack was
 * changed (like the enumerator of .NET).
 */
class Stack<T> implements Iterable<T> {
  private readonly _array: T[] = [];

  private _version = 0;

  get count(): number {
    return this._array.length;
  }

  push(item: T): void {
    this._array.push(item);
    this._version++;
  }

  pop(): T {
    if (this._array.length === 0) {
      throw new InvalidOperationException('Stack empty.');
    }
    this._version++;
    return this._array.pop()!;
  }

  peek(): T {
    if (this._array.length === 0) {
      throw new InvalidOperationException('Stack empty.');
    }
    return this._array[this._array.length - 1];
  }

  clear(): void {
    this._array.length = 0;
    this._version++;
  }

  *[Symbol.iterator](): Iterator<T> {
    const version = this._version;
    let index = this._array.length - 1;
    for (;;) {
      if (version !== this._version) {
        throw new InvalidOperationException('Collection was modified; enumeration operation may not execute.');
      }
      if (index < 0) {
        return;
      }
      yield this._array[index--];
    }
  }
}

/** A stack entry, the C# tuple `(ICAEXCommand Command, string TimeStamp)`. */
interface StackEntry {
  readonly command: ICAEXCommand;
  readonly timeStamp: string;
}

/** A paused document, the C# tuple `(int Count, Stack<...>[] Stack)`. */
interface PausedStacks {
  readonly count: number;
  readonly stack: Stack<StackEntry>[] | null;
}

/**
 * Undo and redo service. When this service is registered, changes in an AutomationML document can
 * be reversed. A sequence of actions can be grouped into transactions which then can be reversed
 * within a single undo operation. The engine locates a registered UndoRedoService and notifies it
 * of any change made to a document. The service manages individual stacks for each loaded CAEX
 * document.
 */
export class UndoRedoService implements IUndoRedo, IXMLDocumentRegistry {
  private static readonly redoCommandStackNr = 1;

  private static readonly transactionStackNr = 2;

  private static readonly undoCommandStackNr = 0;

  private readonly _documentStacks = new DocumentReferenceDictionary<Stack<StackEntry>[]>();

  private readonly _documentStacksPaused = new DocumentReferenceDictionary<PausedStacks>(
    Object.freeze({ count: 0, stack: null }),
  );

  private _isUndoInProgress = false;

  private _paused = false;

  /** `DateTime.Now.ToLongTimeString()` (invariant culture: "HH:mm:ss"). */
  private static get timestamp(): string {
    return DateTime.now.toString('T');
  }

  private _propertyChanged: EventSource<PropertyChangedEventArgs> | null = null;

  /** Occurs when a property value changes (raised for "CanUndo" and "CanRedo"). */
  get propertyChanged(): EventSource<PropertyChangedEventArgs> {
    return (this._propertyChanged ??= new EventSource<PropertyChangedEventArgs>());
  }

  private constructor() {
    this._documentStacks.createNew = (_d: CAEXDocument) => [new Stack<StackEntry>(), new Stack<StackEntry>(), new Stack<StackEntry>()];
  }

  /** Registers a new instance with the ServiceLocator of the engine. */
  static register(): UndoRedoService {
    const undoRedoService = new UndoRedoService();
    ServiceLocator.register(undoRedoService, 'IUndoRedo');
    return undoRedoService;
  }

  /** Unregisters this service. */
  static unRegister(): void {
    ServiceLocator.unRegister('IUndoRedo');
  }

  /**
   * Begins a new transaction. All changes made to the document inside a transaction are treated as
   * a single operation.
   * @param document The document to which the transaction is associated.
   * @param name A friendly name for the transaction.
   * @param relatedDocument Another document, if the transaction will modify this document, too.
   * @returns If the transaction started.
   */
  beginTransaction(document: CAEXDocument | null, name: string | null = '', relatedDocument: CAEXDocument | null = null): boolean {
    if (document == null || this._isUndoInProgress || this._paused) {
      return false;
    }
    if (relatedDocument == null) {
      return this.beginTransactionOfDocument(document, name) !== null;
    }
    const orLoadStacks = this.getOrLoadStacks(document.xDocument);
    if (orLoadStacks === null) {
      return false;
    }
    const item = new MultiDocumentTransaction(document.xDocument!, name);
    item.relatedTransaction = this.beginTransactionOfDocument(relatedDocument, name);
    orLoadStacks[UndoRedoService.transactionStackNr].push({ command: item, timeStamp: UndoRedoService.timestamp });
    return true;
  }

  /** Determines if the service can redo a command of the document. */
  canRedo(document: CAEXDocument | null): boolean {
    const orLoadStacks = this.getOrLoadStacks(document!.xDocument);
    if (orLoadStacks === null) {
      return false;
    }
    return orLoadStacks[UndoRedoService.redoCommandStackNr].count > 0;
  }

  /** Determines if the service can undo a command of the document. */
  canUndo(document: CAEXDocument | null): boolean {
    const orLoadStacks = this.getOrLoadStacks(document!.xDocument);
    if (orLoadStacks === null) {
      return false;
    }
    return orLoadStacks[UndoRedoService.undoCommandStackNr].count > 0;
  }

  /** Clears the stacks managed for the document. */
  clearStacks(document: CAEXDocument | null): void {
    if (document != null) {
      this._documentStacks.remove(document.xDocument!);
    }
  }

  /**
   * Ends the current transaction of the document.
   * @returns If the transaction ended.
   * @throws InvalidOperationException No matching Transaction Begin.
   */
  endTransaction(document: CAEXDocument | null): boolean {
    if (document == null || this._paused) {
      return false;
    }
    const orLoadStacks = this.getOrLoadStacks(document.xDocument);
    if (orLoadStacks === null) {
      return false;
    }
    if (orLoadStacks[UndoRedoService.transactionStackNr].count === 0) {
      throw new InvalidOperationException('No matching Transaction Begin');
    }
    const popped = orLoadStacks[UndoRedoService.transactionStackNr].pop().command;
    let transaction = popped instanceof Transaction ? popped : null;
    if (transaction === null || transaction.count === 0) {
      return false;
    }
    if (transaction instanceof MultiDocumentTransaction) {
      // Aml.Engine: pops a second transaction from the stack of this document (the related one was
      // pushed on the stack of the related document); throws "Stack empty." if there is none, and
      // the commands of the multi document transaction are not put on the undo stack.
      const popped2 = orLoadStacks[UndoRedoService.transactionStackNr].pop().command;
      transaction = popped2 instanceof Transaction ? popped2 : null;
    }
    orLoadStacks[UndoRedoService.redoCommandStackNr].clear();
    const peeked =
      orLoadStacks[UndoRedoService.transactionStackNr].count > 0 ? orLoadStacks[UndoRedoService.transactionStackNr].peek().command : null;
    const transaction2 = peeked instanceof Transaction ? peeked : null;
    if (transaction2 === null) {
      orLoadStacks[UndoRedoService.undoCommandStackNr].push({ command: transaction!, timeStamp: UndoRedoService.timestamp });
    } else {
      transaction2.add(transaction!);
    }
    this._propertyChanged?.raise(this, new PropertyChangedEventArgs('CanUndo'));
    this._propertyChanged?.raise(this, new PropertyChangedEventArgs('CanRedo'));
    return true;
  }

  /**
   * Gets the time of the most recently executed command of the document (the time stamp parsed as
   * DateTime: today's date with that time).
   * @param undo If true, the last undo operation is considered; otherwise the last redo operation.
   */
  lastModificationDate(document: CAEXDocument | null, undo = true): DateTime {
    if (this.canUndo(document) && undo) {
      const orLoadStacks = this.getOrLoadStacks(document!.xDocument);
      return (
        DateTime.tryParse(orLoadStacks !== null ? orLoadStacks[UndoRedoService.undoCommandStackNr].peek().timeStamp : null) ??
        DateTime.minValue
      );
    }
    if (!this.canRedo(document) || undo) {
      return DateTime.minValue;
    }
    const orLoadStacks2 = this.getOrLoadStacks(document!.xDocument);
    return (
      DateTime.tryParse(orLoadStacks2 !== null ? orLoadStacks2[UndoRedoService.redoCommandStackNr].peek().timeStamp : null) ??
      DateTime.minValue
    );
  }

  /**
   * Requests not to record changes of the document. If no document is given, no changes are
   * recorded at all.
   */
  pause(document: CAEXDocument | null = null): void {
    if (document == null) {
      this._paused = true;
      return;
    }
    const orLoadStacks = this.getOrLoadStacks(document.xDocument);
    if (orLoadStacks !== null) {
      this._documentStacks.remove(document.xDocument!);
    }
    if (!this._documentStacksPaused.isLoaded(document.xDocument!)) {
      this._documentStacksPaused.setItem(document.xDocument!, { count: 1, stack: orLoadStacks });
      return;
    }
    const tuple = this._documentStacksPaused.item(document.xDocument!);
    this._documentStacksPaused.setItem(document.xDocument!, { count: tuple.count + 1, stack: tuple.stack });
  }

  /** Pushes a command on the undo stack (or into the open transaction) of its document. */
  pushCommand(cmd: ICAEXCommand): void {
    if (cmd.caexDocument == null || this._isUndoInProgress || this._paused) {
      return;
    }
    const orLoadStacks = this.getOrLoadStacks(cmd.caexDocument!.xDocument);
    if (orLoadStacks !== null) {
      if (orLoadStacks[UndoRedoService.transactionStackNr].count > 0) {
        (orLoadStacks[UndoRedoService.transactionStackNr].peek().command as Transaction).add(cmd);
      } else {
        orLoadStacks[UndoRedoService.undoCommandStackNr].push({ command: cmd, timeStamp: UndoRedoService.timestamp });
      }
      orLoadStacks[UndoRedoService.redoCommandStackNr].clear();
      this._propertyChanged?.raise(this, new PropertyChangedEventArgs('CanUndo'));
      this._propertyChanged?.raise(this, new PropertyChangedEventArgs('CanRedo'));
    }
  }

  /** Executes the last undone operation of the document again. */
  redo(document: CAEXDocument | null): void {
    if (document != null && this.canRedo(document)) {
      const orLoadStacks = this.getOrLoadStacks(document.xDocument);
      if (orLoadStacks !== null) {
        const item = orLoadStacks[UndoRedoService.redoCommandStackNr].pop();
        item.command.execute();
        orLoadStacks[UndoRedoService.undoCommandStackNr].push(item);
        this._propertyChanged?.raise(this, new PropertyChangedEventArgs('CanUndo'));
        this._propertyChanged?.raise(this, new PropertyChangedEventArgs('CanRedo'));
      }
    }
  }

  /**
   * Gets the command names of all redo actions of the document (most recent first), or null if the
   * document is paused. Lazy, like the C# Select over the stack.
   */
  redoActions(document: CAEXDocument | null): Iterable<string> {
    const orLoadStacks = this.getOrLoadStacks(document!.xDocument);
    if (orLoadStacks === null) {
      return null!;
    }
    // Aml.Engine: the fallback is the type name of the tuple, not of the command.
    return from(orLoadStacks[UndoRedoService.redoCommandStackNr]).select((cmd) => cmd.command.displayName ?? 'ValueTuple`2');
  }

  /** Clears the undo and redo stacks of all registered documents. */
  removeCommands(): void {
    for (const [key, value] of this._documentStacks) {
      this._documentStacksPaused.remove(key);
      this.clearStack(value);
    }
    this._propertyChanged?.raise(this, new PropertyChangedEventArgs('CanUndo'));
    this._propertyChanged?.raise(this, new PropertyChangedEventArgs('CanRedo'));
  }

  /**
   * Removes the XML document from the registry of the service (called by the engine when the
   * document is unloaded). Undo and redo stacks of the document are deleted.
   */
  removeDocument(document: XDocumentWrapper): void {
    this._documentStacks.removeFromTable(document.xDocument, (s) => this.clearStack(s));
    this._documentStacksPaused.removeFromTable(document.xDocument, (s) => this.clearStackPaused(s));
  }

  /** Requests to resume recording changes of the document (of all documents, if none is given). */
  resume(document: CAEXDocument | null = null): void {
    if (document == null) {
      this._paused = false;
      return;
    }
    const orLoadValue = this._documentStacksPaused.getOrLoadValue(document.xDocument);
    if (orLoadValue.stack !== null) {
      if (orLoadValue.count === 1) {
        this._documentStacks.setItem(document.xDocument!, orLoadValue.stack);
        this._documentStacksPaused.remove(document.xDocument!);
      } else {
        this._documentStacksPaused.setItem(document.xDocument!, { count: orLoadValue.count - 1, stack: orLoadValue.stack });
      }
    }
  }

  /** Reverses the last action of the document. */
  undo(document: CAEXDocument | null): void {
    if (document != null && this.canUndo(document)) {
      const orLoadStacks = this.getOrLoadStacks(document.xDocument);
      if (orLoadStacks !== null) {
        const item = orLoadStacks[UndoRedoService.undoCommandStackNr].pop();
        this._isUndoInProgress = true;
        // Aml.Engine: no try/finally; if UnExecute throws, the service stays in the undo state and
        // records no further commands.
        item.command.unExecute();
        this._isUndoInProgress = false;
        orLoadStacks[UndoRedoService.redoCommandStackNr].push(item);
        this._propertyChanged?.raise(this, new PropertyChangedEventArgs('CanUndo'));
        this._propertyChanged?.raise(this, new PropertyChangedEventArgs('CanRedo'));
      }
    }
  }

  /**
   * Gets the command names of all undo actions of the document (most recent first), or null if the
   * document is paused. Lazy, like the C# Select over the stack.
   */
  undoActions(document: CAEXDocument | null): Iterable<string> {
    const orLoadStacks = this.getOrLoadStacks(document!.xDocument);
    if (orLoadStacks === null) {
      return null!;
    }
    // Aml.Engine: the fallback is the type name of the tuple, not of the command.
    return from(orLoadStacks[UndoRedoService.undoCommandStackNr]).select((cmd) => cmd.command.displayName ?? 'ValueTuple`2');
  }

  /** The private C# overload BeginTransaction(CAEXDocument, string), returning the transaction. */
  private beginTransactionOfDocument(document: CAEXDocument | null, name: string | null = ''): Transaction | null {
    if (document == null || this._isUndoInProgress || this._paused) {
      return null;
    }
    const orLoadStacks = this.getOrLoadStacks(document.xDocument);
    if (orLoadStacks === null) {
      return null;
    }
    const transaction = new Transaction(document.xDocument!, name);
    orLoadStacks[UndoRedoService.transactionStackNr].push({ command: transaction, timeStamp: UndoRedoService.timestamp });
    return transaction;
  }

  private clearStack(stack: Stack<StackEntry>[]): void {
    for (let i = 0; i < stack.length; i++) {
      stack[i].clear();
    }
  }

  private clearStackPaused(stack: PausedStacks): void {
    // Aml.Engine: a document paused without stacks has a null entry, which fails here.
    this.clearStack(stack.stack!);
  }

  private getOrLoadStacks(doc: XDocument | null): Stack<StackEntry>[] | null {
    if (doc == null) {
      return null;
    }
    if (!this._documentStacksPaused.isLoaded(doc)) {
      return this._documentStacks.getOrLoadValue(doc);
    }
    return null;
  }
}

registerInterfaces(
  UndoRedoService as unknown as abstract new () => unknown,
  'IUndoRedo',
  'IAMLService',
  'INotifyPropertyChanged',
  'IXMLDocumentRegistry',
);
