// Port of Aml.Engine.CAEX.Commands.InsertNewCmd (internal).

import type { XElement, XName } from '../../../xml/index.js';
import { T } from '../../registry.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CaexCommand } from './CaexCommand.js';
import { CAEXElementChangeMode } from './CAEXElementChangeMode.js';

/** Command creating a new schema conform element and inserting it into an owner. */
export class InsertNewCmd extends CaexCommand {
  private _element: XElement | null = null;
  private readonly _name: XName;
  private readonly _owner: XElement;

  /** @internal */
  get element(): XElement | null {
    return this._element;
  }

  /** @internal */
  get name(): XName {
    return this._name;
  }

  /** @internal */
  get owner(): XElement {
    return this._owner;
  }

  /** @internal */
  constructor(owner: XElement, elementName: XName) {
    super();
    this._owner = owner;
    this._name = elementName;
  }

  override execute(): void {
    if (this._element === null) {
      this._element = T.CAEXDocument.amlSchemaManager(this.owner)!.insertNew(this.owner, this.name);
    } else {
      T.CAEXDocument.amlSchemaManager(this.owner)!.insert(this.owner, this._element);
    }
    CaexCommand.onCAEXElementChangedEvent(
      this._element?.document ?? null,
      new T.CAEXElementChangeEventArgs(this._element, this.owner, this.caexDocument, CAEXElementChangeMode.Added),
    );
  }

  override unExecute(): void {
    CaexCommand.onCAEXElementChangingEvent(
      this._element?.document ?? null,
      new T.CAEXElementChangeEventArgs(this._element, this.owner, this.caexDocument, CAEXElementChangeMode.Deleting),
    );
    this._element?.remove();
    CaexCommand.onCAEXElementChangedEvent(
      this.owner?.document ?? null,
      new T.CAEXElementChangeEventArgs(this._element, this.owner, this.caexDocument, CAEXElementChangeMode.Deleted),
    );
  }

  /** @internal */
  static insertNewElement(owner: XElement, elementName: XName): XElement | null {
    if (owner.document === null) {
      const insertNewCmd = new T.InsertNewCmd(owner, elementName);
      insertNewCmd.execute();
      return insertNewCmd.element;
    }
    const insertNewCmd2 = new T.InsertNewCmd(owner, elementName);
    insertNewCmd2.caexDocument = T.CAEXDocument.document(owner);
    const num = ServiceLocator.undoRedoService?.beginTransaction(insertNewCmd2.caexDocument, 'Insert new ' + elementName.localName) ?? false;
    insertNewCmd2.execute();
    ServiceLocator.undoRedoService?.pushCommand(insertNewCmd2);
    if (num) {
      ServiceLocator.undoRedoService?.endTransaction(insertNewCmd2.caexDocument);
    }
    return insertNewCmd2.element;
  }
}

T.InsertNewCmd = InsertNewCmd;
