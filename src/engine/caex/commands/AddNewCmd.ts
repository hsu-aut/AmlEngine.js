// Port of Aml.Engine.CAEX.Commands.AddNewCmd (internal).

import type { XElement, XName } from '../../../xml/index.js';
import { T } from '../../registry.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { AddCmd } from './AddCmd.js';
import { CaexCommand } from './CaexCommand.js';
import { CAEXElementChangeMode } from './CAEXElementChangeMode.js';

/** Command creating a new element and adding it to an owner or after a sibling. */
export class AddNewCmd extends AddCmd {
  private readonly _executeAction: () => XElement | null;
  private readonly _content: unknown;
  private readonly _name: XName;
  private readonly _ownerOrSibling: XElement;

  /** The action creating or re-inserting the element. */
  get executeAction(): () => XElement | null {
    return this._executeAction;
  }

  /** @internal */
  get content(): unknown {
    return this._content;
  }

  /** @internal */
  get name(): XName {
    return this._name;
  }

  /** @internal */
  get ownerOrSibling(): XElement {
    return this._ownerOrSibling;
  }

  /** @internal */
  constructor(ownerOrSibling: XElement, elementName: XName, content: unknown, isSibling = false) {
    super(ownerOrSibling, null, true);
    this._ownerOrSibling = ownerOrSibling;
    this._name = elementName;
    this._content = content;
    this._executeAction = isSibling
      ? () => {
          if (this.element === null) {
            this.element = T.CAEXDocument.amlSchemaManager(this.ownerOrSibling)!.addNewAfterSelf(this.ownerOrSibling, this.name, this.content);
          } else {
            this.ownerOrSibling.addAfterSelf(this.element);
          }
          return this.element;
        }
      : () => {
          if (this.element === null) {
            this.element = T.CAEXDocument.amlSchemaManager(this.ownerOrSibling)!.addNew(this.ownerOrSibling, this.name, this.content);
          } else {
            T.CAEXDocument.amlSchemaManager(this.ownerOrSibling)!.insert(this.ownerOrSibling, this.element);
          }
          return this.element;
        };
  }

  override execute(): void {
    this.executeAction();
    if (this.element !== null) {
      CaexCommand.onCAEXElementChangedEvent(
        this.element.document,
        new T.CAEXElementChangeEventArgs(this.element, this.element.parent, this.caexDocument, CAEXElementChangeMode.Added),
      );
    }
  }

  /** @internal */
  static addNewElement(ownerOrSibling: XElement, elementName: XName, content: unknown, isSibling = false): XElement | null {
    if (ownerOrSibling.document === null) {
      const addNewCmd = new T.AddNewCmd(ownerOrSibling, elementName, content, isSibling);
      addNewCmd.execute();
      return addNewCmd.element;
    }
    const addNewCmd2 = new T.AddNewCmd(ownerOrSibling, elementName, content, isSibling);
    addNewCmd2.caexDocument = T.CAEXDocument.document(ownerOrSibling);
    const num = ServiceLocator.undoRedoService?.beginTransaction(addNewCmd2.caexDocument, 'Add new ' + elementName.localName) ?? false;
    addNewCmd2.execute();
    ServiceLocator.undoRedoService?.pushCommand(addNewCmd2);
    if (num) {
      ServiceLocator.undoRedoService?.endTransaction(addNewCmd2.caexDocument);
    }
    return addNewCmd2.element;
  }
}

T.AddNewCmd = AddNewCmd;
