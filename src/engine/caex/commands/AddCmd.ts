// Port of Aml.Engine.CAEX.Commands.AddCmd (internal).

import type { XElement } from '../../../xml/index.js';
import { T } from '../../registry.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CaexCommand } from './CaexCommand.js';
import { CAEXElementChangeMode } from './CAEXElementChangeMode.js';

/** Command adding an element as a sibling of another element. */
export class AddCmd extends CaexCommand {
  /** @internal */
  element: XElement | null;

  private readonly _isAfter: boolean;

  private readonly _sibling: XElement | null;

  /** @internal */
  get isAfter(): boolean {
    return this._isAfter;
  }

  /** @internal */
  get sibling(): XElement | null {
    return this._sibling;
  }

  /** @internal */
  constructor(sibling: XElement | null, element: XElement | null, isAfter: boolean) {
    super();
    this._sibling = sibling;
    this.element = element;
    this._isAfter = isAfter;
  }

  override execute(): void {
    AddCmd.cmdExecution(this.sibling!, this.element!, this.isAfter);
    CaexCommand.onCAEXElementChangedEvent(
      this.element?.document ?? null,
      new T.CAEXElementChangeEventArgs(this.element, this.element?.parent ?? null, this.caexDocument, CAEXElementChangeMode.Added),
    );
  }

  override unExecute(): void {
    const parent = this.element!.parent;
    CaexCommand.onCAEXElementChangingEvent(
      this.element?.document ?? null,
      new T.CAEXElementChangeEventArgs(this.element, parent, this.caexDocument, CAEXElementChangeMode.Deleting),
    );
    this.element?.remove();
    CaexCommand.onCAEXElementChangedEvent(
      parent?.document ?? null,
      new T.CAEXElementChangeEventArgs(this.element, parent, this.caexDocument, CAEXElementChangeMode.Deleted),
    );
  }

  /** @internal */
  static addSibling(sibling: XElement, element: XElement, isAfter: boolean): void {
    if (sibling.document === null) {
      new T.AddCmd(sibling, element, isAfter).execute();
      return;
    }
    const addCmd = new T.AddCmd(sibling, element, isAfter);
    addCmd.caexDocument = T.CAEXDocument.document(sibling);
    const num = ServiceLocator.undoRedoService?.beginTransaction(addCmd.caexDocument, 'Add ' + element.name.localName) ?? false;
    addCmd.execute();
    ServiceLocator.undoRedoService?.pushCommand(addCmd);
    if (num) {
      ServiceLocator.undoRedoService?.endTransaction(addCmd.caexDocument);
    }
  }

  private static cmdExecution(sibling: XElement, element: XElement, isAfter: boolean): void {
    if (isAfter) {
      sibling.addAfterSelf(element);
    } else {
      sibling.addBeforeSelf(element);
    }
  }
}

T.AddCmd = AddCmd;
