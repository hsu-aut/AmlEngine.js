// Port of Aml.Engine.AmlObjects.AutomationMLLogicInterfaceClassLibType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { CAEXFileTypeExtensions } from '../caex/extensions/CAEXFileTypeExtensions.js';
import { AMLLibraries } from '../resources/libraries/AMLLibraries.js';
import { AMLLibraryType } from './AMLLibraryType.js';
import { AmlObjectsExtensions } from './extensions/AmlObjectsExtensions.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from '../caex/CAEXSequenceOfCAEXObjectsWithReference.js';
import type { InterfaceFamilyType } from '../caex/InterfaceFamilyType.js';
import type { XElement } from '../../xml/index.js';

/** The AutomationMLLogicInterfaceClassLib with access to its interface classes. */
export class AutomationMLLogicInterfaceClassLibType extends AMLLibraryType<InterfaceFamilyType> {
  /** Gets the InterfaceClass objects of the library. */
  get interfaceClass(): CAEXSequenceOfCAEXObjectsWithReference<InterfaceFamilyType> {
    return this.libraryElements;
  }

  /** @internal Initializes a new instance for the library node. */
  constructor(roleClassLib: XElement | null) {
    super(roleClassLib, T.InterfaceFamilyType);
    this.createElementSequence = (o: XElement) => new T.CAEXSequenceOfCAEXObjectsWithReference<InterfaceFamilyType>(o, 'InterfaceClass', T.InterfaceFamilyType.Constructor, () => this);
  }

  /**
   * Gets the AutomationMLLogicInterfaceClassLib of the document; if it does not exist, it is loaded from the embedded
   * AutomationML library resource and imported into the document.
   */
  static interfaceClassLib(document: CAEXDocument): AutomationMLLogicInterfaceClassLibType | null {
    const libType = document.caexFile!.interfaceClassLib.item('AutomationMLLogicInterfaceClassLib');
    if (!T.CAEXWrapper.equals(libType, null)) {
      return new AutomationMLLogicInterfaceClassLibType(libType!.node);
    }
    const stream = AMLLibraries.getAutomationMLLibrary('AutomationMLLogicInterfaceClassLib', AmlObjectsExtensions.automationMLVersion(document), document.schemaVersionString);
    if (stream == null) {
      return null;
    }
    const imported = AMLLibraryType.loadExternalLibrary(document, stream, (doc: CAEXDocument) =>
      CAEXFileTypeExtensions.importInterfaceClassLib(document.caexFile!, doc.caexFile!.interfaceClassLib.item('AutomationMLLogicInterfaceClassLib')!),
    );
    return new AutomationMLLogicInterfaceClassLibType(imported instanceof T.InterfaceClassLibType ? imported.node : null);
  }

  /** Determines whether the library is loaded in the document. */
  static isLoaded(document: CAEXDocument | null): boolean {
    return document != null && !T.CAEXWrapper.equals(document.caexFile!.interfaceClassLib.item('AutomationMLLogicInterfaceClassLib'), null);
  }
}

registerInterfaces(AutomationMLLogicInterfaceClassLibType, 'IInterfaceClassContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.AutomationMLLogicInterfaceClassLibType = AutomationMLLogicInterfaceClassLibType;
