// Port of Aml.Engine.CAEX.Commands.SetElementContentCmd (internal).

import type { XAttribute, XElement, XNode } from '../../../xml/index.js';
import { T } from '../../registry.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CaexCommand } from './CaexCommand.js';
import { CAEXElementChangeMode } from './CAEXElementChangeMode.js';

/** Command replacing the complete content (attributes and nodes) of an element. */
export class SetElementContentCmd extends CaexCommand {
  private readonly _element: XElement;
  private readonly _newValue: unknown;
  private readonly _oldValue: [XAttribute[], XNode[]];

  /** @internal */
  get element(): XElement {
    return this._element;
  }

  /** @internal */
  get newValue(): unknown {
    return this._newValue;
  }

  /** @internal The old attributes and the old descendant nodes (object[2] in C#). */
  get oldValue(): unknown[] {
    return this._oldValue;
  }

  /** @internal */
  constructor(element: XElement, newContent: unknown) {
    super();
    this._newValue = newContent ?? null;
    this._oldValue = [[...element.attributes()], [...element.descendantNodes()]];
    this._element = element;
  }

  override execute(): void {
    // NewValue != OldValue compares object references; OldValue is a fresh array.
    if (this._newValue !== this._oldValue) {
      CaexCommand.onCAEXElementChangingEvent(
        this._element.document,
        new T.CAEXElementChangeEventArgs(this._element, this._element.parent, this.caexDocument, null, null, this._oldValue, this._newValue, CAEXElementChangeMode.ValueChanging),
      );
      this._element.replaceAll(this._newValue);
      CaexCommand.onCAEXElementChangedEvent(
        this._element.document,
        new T.CAEXElementChangeEventArgs(this._element, this._element.parent, this.caexDocument, null, null, this._oldValue, this._newValue, CAEXElementChangeMode.ValueChanged),
      );
    }
  }

  override unExecute(): void {
    if (this._newValue !== this._oldValue) {
      CaexCommand.onCAEXElementChangingEvent(
        this._element.document,
        new T.CAEXElementChangeEventArgs(this._element, this._element.parent, this.caexDocument, null, null, this._newValue, this._oldValue, CAEXElementChangeMode.ValueChanging),
      );
      this._element.replaceAll(this._oldValue);
      CaexCommand.onCAEXElementChangedEvent(
        this._element.document,
        new T.CAEXElementChangeEventArgs(this._element, this._element.parent, this.caexDocument, null, null, this._newValue, this._oldValue, CAEXElementChangeMode.ValueChanged),
      );
    }
  }

  /** @internal */
  static setValue(element: XElement, value: unknown): void {
    if (element.document === null) {
      new T.SetElementContentCmd(element, value).execute();
      return;
    }
    const setElementContentCmd = new T.SetElementContentCmd(element, value);
    setElementContentCmd.caexDocument = T.CAEXDocument.document(element);
    const num = ServiceLocator.undoRedoService?.beginTransaction(setElementContentCmd.caexDocument, 'Set content for ' + element.name.localName) ?? false;
    setElementContentCmd.execute();
    ServiceLocator.undoRedoService?.pushCommand(setElementContentCmd);
    if (num) {
      ServiceLocator.undoRedoService?.endTransaction(setElementContentCmd.caexDocument);
    }
  }
}

T.SetElementContentCmd = SetElementContentCmd;
