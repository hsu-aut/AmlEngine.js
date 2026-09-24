// Port of Aml.Engine.CAEX.Commands.MoveCmd (internal, primary constructor).

import type { XElement, XNode } from '../../../xml/index.js';
import { T } from '../../registry.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CaexCommand } from './CaexCommand.js';
import { CAEXElementChangeMode } from './CAEXElementChangeMode.js';

/** Command moving an element before or after a sibling. */
export class MoveCmd extends CaexCommand {
  private readonly _movedElement: XElement;
  private readonly _sibling: XElement;
  private readonly _afterSibling: boolean;

  private readonly _next: XNode | null;
  private readonly _parent: XElement | null;
  private readonly _previous: XNode | null;

  constructor(movedElement: XElement, sibling: XElement, afterSibling: boolean) {
    super();
    this._movedElement = movedElement;
    this._sibling = sibling;
    this._afterSibling = afterSibling;
    this._next = movedElement.nextNode;
    this._parent = movedElement.parent;
    this._previous = movedElement.previousNode;
  }

  override execute(): void {
    const movedElement = this._movedElement;
    CaexCommand.onCAEXElementChangingEvent(
      movedElement.document,
      new T.CAEXElementChangeEventArgs(movedElement, movedElement.parent, this.caexDocument, CAEXElementChangeMode.Moving),
    );
    movedElement.remove();
    if (this._afterSibling) {
      this._sibling.addAfterSelf(movedElement);
    } else {
      this._sibling.addBeforeSelf(movedElement);
    }
    CaexCommand.onCAEXElementChangedEvent(
      movedElement.document,
      new T.CAEXElementChangeEventArgs(movedElement, movedElement.parent, this.caexDocument, CAEXElementChangeMode.Moved),
    );
  }

  override unExecute(): void {
    const movedElement = this._movedElement;
    CaexCommand.onCAEXElementChangingEvent(
      movedElement.document,
      new T.CAEXElementChangeEventArgs(movedElement, movedElement.parent, this.caexDocument, CAEXElementChangeMode.Moving),
    );
    movedElement.remove();
    if (this._previous !== null) {
      this._previous.addAfterSelf(movedElement);
    } else if (this._next !== null) {
      this._next.addBeforeSelf(movedElement);
    } else {
      this._parent!.add(movedElement);
    }
    CaexCommand.onCAEXElementChangedEvent(
      movedElement.document,
      new T.CAEXElementChangeEventArgs(movedElement, movedElement.parent, this.caexDocument, CAEXElementChangeMode.Moved),
    );
  }

  /** @internal */
  static move(movedElement: XElement, sibling: XElement, afterSibling: boolean): void {
    const moveCmd = new T.MoveCmd(movedElement, sibling, afterSibling);
    moveCmd.caexDocument = T.CAEXDocument.document(movedElement);
    const num = ServiceLocator.undoRedoService?.beginTransaction(moveCmd.caexDocument, 'Move ' + movedElement.name.localName) ?? false;
    moveCmd.execute();
    ServiceLocator.undoRedoService?.pushCommand(moveCmd);
    if (num) {
      ServiceLocator.undoRedoService?.endTransaction(moveCmd.caexDocument);
    }
  }
}

T.MoveCmd = MoveCmd;
