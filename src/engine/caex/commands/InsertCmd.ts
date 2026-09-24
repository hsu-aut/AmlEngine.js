// Port of Aml.Engine.CAEX.Commands.InsertCmd (internal).

import type { XElement } from '../../../xml/index.js';
import { T } from '../../registry.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CaexCommand } from './CaexCommand.js';
import { CAEXElementChangeMode } from './CAEXElementChangeMode.js';

/** Command inserting an existing element into an owner, at the schema defined position. */
export class InsertCmd extends CaexCommand {
  private readonly _element: XElement;
  private readonly _owner: XElement | null;

  /** @internal */
  get element(): XElement {
    return this._element;
  }

  /** @internal */
  get owner(): XElement | null {
    return this._owner;
  }

  /** @internal */
  constructor(owner: XElement | null, element: XElement) {
    super();
    this._owner = owner;
    this._element = element;
  }

  override execute(): void {
    T.CAEXDocument.amlSchemaManager(this.owner)!.insert(this.owner!, this.element);
    CaexCommand.onCAEXElementChangedEvent(
      this.element?.document ?? null,
      new T.CAEXElementChangeEventArgs(this.element, this.owner, this.caexDocument, CAEXElementChangeMode.Added),
    );
  }

  override unExecute(): void {
    CaexCommand.onCAEXElementChangingEvent(
      this.element?.document ?? null,
      new T.CAEXElementChangeEventArgs(this.element, this.owner, this.caexDocument, CAEXElementChangeMode.Deleting),
    );
    this.element?.remove();
    CaexCommand.onCAEXElementChangedEvent(
      this.owner?.document ?? null,
      new T.CAEXElementChangeEventArgs(this.element, this.owner, this.caexDocument, CAEXElementChangeMode.Deleted),
    );
  }

  /** @internal */
  static insertElement(owner: XElement | null, element: XElement): void {
    if ((owner?.document ?? null) === null) {
      new T.InsertCmd(owner, element).execute();
      return;
    }
    const insertCmd = new T.InsertCmd(owner, element);
    insertCmd.caexDocument = T.CAEXDocument.document(owner);
    const num = ServiceLocator.undoRedoService?.beginTransaction(insertCmd.caexDocument, 'Insert ' + element.name.localName) ?? false;
    insertCmd.execute();
    ServiceLocator.undoRedoService?.pushCommand(insertCmd);
    if (num) {
      ServiceLocator.undoRedoService?.endTransaction(insertCmd.caexDocument);
    }
  }
}

T.InsertCmd = InsertCmd;
