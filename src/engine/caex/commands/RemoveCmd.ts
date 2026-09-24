// Port of Aml.Engine.CAEX.Commands.RemoveCmd (internal).

import type { XElement } from '../../../xml/index.js';
import { from } from '../../../system/linq.js';
import { T } from '../../registry.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CaexCommand } from './CaexCommand.js';
import { CAEXElementChangeMode } from './CAEXElementChangeMode.js';

/** Command removing an element from its parent. */
export class RemoveCmd extends CaexCommand {
  private readonly _element: XElement;
  private readonly _owner: XElement | null;
  private readonly _siblingAfter: XElement | null;
  private readonly _siblingBefore: XElement | null;

  /** @internal */
  get element(): XElement {
    return this._element;
  }

  /** @internal */
  get owner(): XElement | null {
    return this._owner;
  }

  /** @internal */
  get siblingAfter(): XElement | null {
    return this._siblingAfter;
  }

  /** @internal */
  get siblingBefore(): XElement | null {
    return this._siblingBefore;
  }

  /** @internal */
  constructor(element: XElement) {
    super();
    this._owner = element.parent;
    this._element = element;
    this._siblingBefore = from(element.elementsBeforeSelf()).lastOrDefault() ?? null;
    this._siblingAfter = from(element.elementsAfterSelf()).firstOrDefault() ?? null;
  }

  override execute(): void {
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

  override unExecute(): void {
    if (this.element.document !== null) {
      this.element.remove();
    }
    if ((this.siblingBefore?.parent ?? null) !== null) {
      this.siblingBefore!.addAfterSelf(this.element);
    } else if ((this.siblingAfter?.parent ?? null) !== null) {
      this.siblingAfter!.addBeforeSelf(this.element);
    } else {
      this.owner!.add(this.element);
    }
    CaexCommand.onCAEXElementChangedEvent(
      this.element?.document ?? null,
      new T.CAEXElementChangeEventArgs(this.element, this.owner, this.caexDocument, CAEXElementChangeMode.Added),
    );
  }

  /** @internal */
  static removeElement(element: XElement | null): void {
    if ((element?.parent ?? null) !== null) {
      const removeCmd = new T.RemoveCmd(element!);
      removeCmd.caexDocument = T.CAEXDocument.document(element);
      const num = ServiceLocator.undoRedoService?.beginTransaction(removeCmd.caexDocument, 'Remove ' + element!.name.localName) ?? false;
      removeCmd.execute();
      ServiceLocator.undoRedoService?.pushCommand(removeCmd);
      if (num) {
        ServiceLocator.undoRedoService?.endTransaction(removeCmd.caexDocument);
      }
    }
  }
}

T.RemoveCmd = RemoveCmd;
