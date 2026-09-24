// Port of Aml.Engine.CAEX.Commands.SetAttributeValueCmd (internal).

import type { XElement, XName } from '../../../xml/index.js';
import type { CAEXDocument } from '../CAEXDocument.js';
import { T } from '../../registry.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CAEXPathBuilder } from '../extensions/CAEXPathBuilder.js';
import { XmlCAEXSchema } from '../../xmlext/XmlCAEXSchema.js';
import { CaexCommand } from './CaexCommand.js';
import { CAEXElementChangeMode } from './CAEXElementChangeMode.js';

const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Command setting (or removing, for a null value) the value of an attribute. */
export class SetAttributeValueCmd extends CaexCommand {
  private readonly _changeModes: CAEXElementChangeMode;

  private readonly _name: XName;
  private _newValue: unknown;
  private _oldValue: unknown;
  private readonly _owner: XElement;

  /**
   * C# compares NewValue and OldValue with `!=` on object, i.e. by reference. The only case in
   * which the two are the same reference in practice is the interned "" literal that the
   * constructor assigns to both. These flags record that case (see port notes).
   */
  private _newIsFallback = false;
  private _oldIsFallback = false;

  /** @internal */
  get name(): XName {
    return this._name;
  }

  /** @internal */
  get newValue(): unknown {
    return this._newValue;
  }

  /** @internal */
  get oldValue(): unknown {
    return this._oldValue;
  }

  /** @internal */
  get owner(): XElement {
    return this._owner;
  }

  /** @internal */
  constructor(element: XElement, attributeName: XName, attributeValue: unknown) {
    super();
    this._owner = element;
    this._name = attributeName;
    this._newValue = attributeValue ?? null;
    this._oldValue = this._owner.attribute(attributeName)?.value ?? null;
    if (
      (this._newValue === null || this._oldValue === null) &&
      T.CAEXDocument.amlSchemaManager(this._owner)!.isRequiredAttribute(this._owner.parent?.name ?? null, this._owner.name, this._name.localName)
    ) {
      if (this._newValue === null) {
        this._newValue = '';
        this._newIsFallback = true;
      }
      if (this._oldValue === null) {
        this._oldValue = '';
        this._oldIsFallback = true;
      }
    }
    this._changeModes = this.changeModes(T.CAEXDocument.document(element));
  }

  /** `NewValue != OldValue` with C# object reference semantics (see the fallback flags). */
  private valuesDiffer(): boolean {
    if (this._newValue === null && this._oldValue === null) return false;
    if (this._newIsFallback && this._oldIsFallback) return false;
    return true;
  }

  override execute(): void {
    if (this.valuesDiffer()) {
      this.raiseChangingEvent(asString(this._oldValue), asString(this._newValue));
      this._owner.setAttributeValue(this._name, this._newValue);
      this.raiseChangedEvent(asString(this._oldValue), asString(this._newValue));
    }
  }

  override unExecute(): void {
    if (this.valuesDiffer()) {
      this.raiseChangingEvent(asString(this._newValue), asString(this._oldValue));
      this._owner.setAttributeValue(this._name, this._oldValue);
      this.raiseChangedEvent(asString(this._newValue), asString(this._oldValue));
    }
  }

  /** @internal */
  static setValue(element: XElement, attributeName: XName, attributeValue: unknown): void {
    if (element.document === null) {
      new T.SetAttributeValueCmd(element, attributeName, attributeValue).execute();
      return;
    }
    const setAttributeValueCmd = new T.SetAttributeValueCmd(element, attributeName, attributeValue);
    setAttributeValueCmd.caexDocument = T.CAEXDocument.document(element);
    const num = ServiceLocator.undoRedoService?.beginTransaction(setAttributeValueCmd.caexDocument, 'Set ' + attributeName.toString()) ?? false;
    setAttributeValueCmd.execute();
    ServiceLocator.undoRedoService?.pushCommand(setAttributeValueCmd);
    if (num) {
      ServiceLocator.undoRedoService?.endTransaction(setAttributeValueCmd.caexDocument);
    }
  }

  private changeModes(document: CAEXDocument | null): CAEXElementChangeMode {
    switch (this._name.localName) {
      case 'ID':
        return CAEXElementChangeMode.IDChanged | CAEXElementChangeMode.IDChanging;
      case 'Name': {
        let cAEXElementChangeMode = CAEXElementChangeMode.NameChanged | CAEXElementChangeMode.NameChanging;
        if (XmlCAEXSchema.isBasicAttribute(this._owner) || XmlCAEXSchema.isExternalInterface(this._owner) || XmlCAEXSchema.isInternalElement(this._owner)) {
          cAEXElementChangeMode |= CAEXElementChangeMode.NameRefChanged | CAEXElementChangeMode.NameRefChanging;
        }
        return cAEXElementChangeMode;
      }
      case 'RefRoleClassPath':
      case 'RefBaseRoleClassPath':
        return CAEXElementChangeMode.PathRefChanged | CAEXElementChangeMode.PathRefChanging;
      case 'RefAttributeType': {
        const isAttributeReference = CAEXPathBuilder.instanceIDInAttributeReference(asString(this._oldValue), document).isAttributeReference;
        const isAttributeReference2 = CAEXPathBuilder.instanceIDInAttributeReference(asString(this._newValue), document).isAttributeReference;
        if (!(isAttributeReference || isAttributeReference2)) {
          return CAEXElementChangeMode.PathRefChanged | CAEXElementChangeMode.PathRefChanging;
        }
        return CAEXElementChangeMode.IDRefChanged | CAEXElementChangeMode.IDRefChanging;
      }
      case 'RefBaseClassPath':
        if (XmlCAEXSchema.isExternalInterface(this._owner)) {
          const idString3 = asString(this._oldValue);
          const idString4 = asString(this._newValue);
          if ((idString3 === null || !CAEXPathBuilder.isValidID(idString3, document)) && (idString4 === null || !CAEXPathBuilder.isValidID(idString4, document))) {
            return CAEXElementChangeMode.PathRefChanged | CAEXElementChangeMode.PathRefChanging;
          }
          return CAEXElementChangeMode.IDRefChanged | CAEXElementChangeMode.IDRefChanging;
        }
        return CAEXElementChangeMode.PathRefChanged | CAEXElementChangeMode.PathRefChanging;
      case 'RoleAttributeName':
      case 'RoleInterfaceName':
      case 'SystemUnitAttributeName':
      case 'SystemUnitInterfaceName':
        return CAEXElementChangeMode.NameRefChanged | CAEXElementChangeMode.NameRefChanging;
      case 'RefPartnerSideA':
      case 'RefPartnerSideB': {
        let cAEXElementChangeMode2 = CAEXElementChangeMode.IDRefChanged | CAEXElementChangeMode.IDRefChanging;
        if (XmlCAEXSchema.caexSchema(this._owner) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
          cAEXElementChangeMode2 |= CAEXElementChangeMode.NameRefChanged | CAEXElementChangeMode.NameRefChanging;
        }
        return cAEXElementChangeMode2;
      }
      case 'RoleInterfaceID':
      case 'SystemUnitInterfaceID':
        return CAEXElementChangeMode.IDRefChanged | CAEXElementChangeMode.IDRefChanging;
      case 'RefBaseSystemUnitPath': {
        const idString = asString(this._oldValue);
        const idString2 = asString(this._newValue);
        if ((idString !== null && CAEXPathBuilder.isValidID(idString, document)) || (idString2 !== null && CAEXPathBuilder.isValidID(idString2, document))) {
          return CAEXElementChangeMode.IDRefChanged | CAEXElementChangeMode.IDRefChanging;
        }
        return CAEXElementChangeMode.PathRefChanged | CAEXElementChangeMode.PathRefChanging;
      }
      default:
        return CAEXElementChangeMode.ValueChanged;
    }
  }

  private raiseChangedEvent(oldValue: string | null, newValue: string | null): void {
    if (this.caexDocument !== null) {
      const cAEXElementChangeMode = this._changeModes & CAEXElementChangeMode.ChangedEvent;
      if (cAEXElementChangeMode !== CAEXElementChangeMode.None) {
        CaexCommand.onCAEXElementChangedEvent(
          this._owner?.document ?? null,
          new T.CAEXElementChangeEventArgs(
            this._owner,
            this._owner?.parent ?? null,
            this.caexDocument,
            this._owner?.attribute(this._name) ?? null,
            this._name.localName,
            oldValue,
            newValue,
            cAEXElementChangeMode,
          ),
        );
      }
    }
  }

  private raiseChangingEvent(oldValue: string | null, newValue: string | null): void {
    if (this.caexDocument !== null && oldValue !== null) {
      const cAEXElementChangeMode = this._changeModes & CAEXElementChangeMode.ChangingEvent;
      if (cAEXElementChangeMode !== CAEXElementChangeMode.None) {
        CaexCommand.onCAEXElementChangingEvent(
          this._owner?.document ?? null,
          new T.CAEXElementChangeEventArgs(
            this._owner,
            this._owner?.parent ?? null,
            this.caexDocument,
            this._owner?.attribute(this._name) ?? null,
            this._name.localName,
            oldValue,
            newValue,
            cAEXElementChangeMode,
          ),
        );
      }
    }
  }
}

T.SetAttributeValueCmd = SetAttributeValueCmd;
