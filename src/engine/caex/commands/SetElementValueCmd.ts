// Port of Aml.Engine.CAEX.Commands.SetElementValueCmd (internal).

import type { XElement } from '../../../xml/index.js';
import { T } from '../../registry.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CaexCommand } from './CaexCommand.js';
import { CAEXElementChangeMode } from './CAEXElementChangeMode.js';

/** Command setting the text value of an element. */
export class SetElementValueCmd extends CaexCommand {
  private readonly _element: XElement;
  private readonly _newValue: string | null;
  private readonly _oldValue: string;

  /** @internal */
  get element(): XElement {
    return this._element;
  }

  /** @internal */
  get newValue(): string | null {
    return this._newValue;
  }

  /** @internal */
  get oldValue(): string {
    return this._oldValue;
  }

  /** @internal */
  constructor(element: XElement, newValue: string | null) {
    super();
    this._newValue = newValue ?? null;
    this._oldValue = element.value;
    this._element = element;
  }

  override execute(): void {
    if (!(this._newValue === this._oldValue)) {
      const text = this._newValue ?? '';
      CaexCommand.onCAEXElementChangingEvent(
        this._element.document,
        new T.CAEXElementChangeEventArgs(
          this._element,
          this._element.parent,
          this.caexDocument,
          null,
          null,
          this._oldValue,
          text,
          CAEXElementChangeMode.ValueChanging | SetElementValueCmd.getChangeMode(this._element, true),
        ),
      );
      this._element.value = text;
      CaexCommand.onCAEXElementChangedEvent(
        this._element.document,
        new T.CAEXElementChangeEventArgs(
          this._element,
          this._element.parent,
          this.caexDocument,
          null,
          null,
          this._oldValue,
          text,
          CAEXElementChangeMode.ValueChanged | SetElementValueCmd.getChangeMode(this._element, false),
        ),
      );
    }
  }

  override unExecute(): void {
    if (!(this._newValue === this._oldValue)) {
      CaexCommand.onCAEXElementChangingEvent(
        this._element.document,
        new T.CAEXElementChangeEventArgs(
          this._element,
          this._element.parent,
          this.caexDocument,
          null,
          null,
          this._newValue,
          this._oldValue,
          CAEXElementChangeMode.ValueChanging | SetElementValueCmd.getChangeMode(this._element, true),
        ),
      );
      this._element.value = this._oldValue;
      CaexCommand.onCAEXElementChangedEvent(
        this._element.document,
        new T.CAEXElementChangeEventArgs(
          this._element,
          this._element.parent,
          this.caexDocument,
          null,
          null,
          this._newValue,
          this._oldValue,
          CAEXElementChangeMode.ValueChanged | SetElementValueCmd.getChangeMode(this._element, false),
        ),
      );
    }
  }

  /** @internal */
  static setValue(element: XElement, value: string | null): void {
    if (element.document === null) {
      new T.SetElementValueCmd(element, value).execute();
      return;
    }
    const setElementValueCmd = new T.SetElementValueCmd(element, value);
    setElementValueCmd.caexDocument = T.CAEXDocument.document(element);
    const num = ServiceLocator.undoRedoService?.beginTransaction(setElementValueCmd.caexDocument, 'Set value for ' + element.name.localName) ?? false;
    setElementValueCmd.execute();
    ServiceLocator.undoRedoService?.pushCommand(setElementValueCmd);
    if (num) {
      ServiceLocator.undoRedoService?.endTransaction(setElementValueCmd.caexDocument);
    }
  }

  private static getChangeMode(element: XElement, isChanging: boolean): CAEXElementChangeMode {
    const localName = element.name.localName;
    if (!(localName === 'NewVersion') && !(localName === 'OldVersion')) {
      return CAEXElementChangeMode.None;
    }
    if (!isChanging) {
      return CAEXElementChangeMode.PathRefChanged;
    }
    return CAEXElementChangeMode.PathRefChanging;
  }
}

T.SetElementValueCmd = SetElementValueCmd;
