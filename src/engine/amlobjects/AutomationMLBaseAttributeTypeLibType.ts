// Port of Aml.Engine.AmlObjects.AutomationMLBaseAttributeTypeLibType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { InvalidOperationException } from '../../system/exceptions.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { CAEXFileTypeExtensions } from '../caex/extensions/CAEXFileTypeExtensions.js';
import { AMLLibraries } from '../resources/libraries/AMLLibraries.js';
import { AMLLibraryType } from './AMLLibraryType.js';
import { AmlObjectsExtensions } from './extensions/AmlObjectsExtensions.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from '../caex/CAEXSequenceOfCAEXObjectsWithReference.js';
import type { AttributeFamilyType } from '../caex/AttributeFamilyType.js';
import type { XElement } from '../../xml/index.js';

/** The AutomationMLBaseAttributeTypeLib (CAEX 3.0 only) with access to its standardized attribute types. */
export class AutomationMLBaseAttributeTypeLibType extends AMLLibraryType<AttributeFamilyType> {
  /** Gets the class 'AutomationMLBaseAttributeTypeLib/AssociatedExternalValue'. */
  get associatedExternalValue(): AttributeFamilyType | null {
    return this.automationMLClass('AutomationMLBaseAttributeTypeLib/AssociatedExternalValue');
  }

  /** Gets the class 'AutomationMLBaseAttributeTypeLib/AssociatedFacet'. */
  get associatedFacet(): AttributeFamilyType | null {
    return this.automationMLClass('AutomationMLBaseAttributeTypeLib/AssociatedFacet');
  }

  /** Gets the AttributeType objects of the library. */
  get attributeType(): CAEXSequenceOfCAEXObjectsWithReference<AttributeFamilyType> {
    return this.libraryElements;
  }

  /** Gets the class 'AutomationMLBaseAttributeTypeLib/Cardinality'. */
  get cardinality(): AttributeFamilyType | null {
    return this.automationMLClass('AutomationMLBaseAttributeTypeLib/Cardinality');
  }

  /** Gets the class 'AutomationMLBaseAttributeTypeLib/Category'. */
  get category(): AttributeFamilyType | null {
    return this.automationMLClass('AutomationMLBaseAttributeTypeLib/Category');
  }

  /** Gets the class 'AutomationMLBaseAttributeTypeLib/Direction'. */
  get direction(): AttributeFamilyType | null {
    return this.automationMLClass('AutomationMLBaseAttributeTypeLib/Direction');
  }

  /** Gets the class 'AutomationMLBaseAttributeTypeLib/ListType'. */
  get listType(): AttributeFamilyType | null {
    return this.automationMLClass('AutomationMLBaseAttributeTypeLib/ListType');
  }

  /** Gets the class 'AutomationMLBaseAttributeTypeLib/LocalizedAttribute'. */
  get localizedAttribute(): AttributeFamilyType | null {
    return this.automationMLClass('AutomationMLBaseAttributeTypeLib/LocalizedAttribute');
  }

  /** Gets the class 'AutomationMLBaseAttributeTypeLib/MIMEType'. */
  get mimeType(): AttributeFamilyType | null {
    return this.automationMLClass('AutomationMLBaseAttributeTypeLib/MIMEType');
  }

  /** Gets the class 'AutomationMLBaseAttributeTypeLib/OrderedListType'. */
  get orderedListType(): AttributeFamilyType | null {
    return this.automationMLClass('AutomationMLBaseAttributeTypeLib/OrderedListType');
  }

  /** Gets the class 'AutomationMLBaseAttributeTypeLib/refURI'. */
  get refURI(): AttributeFamilyType | null {
    return this.automationMLClass('AutomationMLBaseAttributeTypeLib/refURI');
  }

  /** @internal Initializes a new instance for the library node. */
  constructor(attributeTypeLib: XElement | null) {
    super(attributeTypeLib, T.AttributeFamilyType);
    if (XmlCAEXSchema.caexSchema(attributeTypeLib!) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      throw new InvalidOperationException('AutomationMLBaseAttributeTypeLib is only available for CAEX Schema 3.0');
    }
    this.createElementSequence = (o: XElement) => new T.CAEXSequenceOfCAEXObjectsWithReference<AttributeFamilyType>(o, 'AttributeType', T.AttributeFamilyType.Constructor, () => this);
  }

  /**
   * Gets the AutomationMLBaseAttributeTypeLib of the document; if it does not exist, it is loaded from the embedded
   * AutomationML library resource and imported into the document.
   */
  static attributeTypeLib(document: CAEXDocument): AutomationMLBaseAttributeTypeLibType | null {
    if (document.schema === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return null;
    }
    const libType = document.caexFile!.attributeTypeLib.item('AutomationMLBaseAttributeTypeLib');
    if (!T.CAEXWrapper.equals(libType, null)) {
      return new AutomationMLBaseAttributeTypeLibType(libType!.node);
    }
    const stream = AMLLibraries.getAutomationMLLibrary('AutomationMLBaseAttributeTypeLib', AmlObjectsExtensions.automationMLVersion(document), document.schemaVersionString);
    const imported = AMLLibraryType.loadExternalLibrary(document, stream, (doc: CAEXDocument) =>
      CAEXFileTypeExtensions.importAttributeTypeLib(document.caexFile!, doc.caexFile!.attributeTypeLib.item('AutomationMLBaseAttributeTypeLib')!),
    );
    return new AutomationMLBaseAttributeTypeLibType(imported instanceof T.AttributeTypeLibType ? imported.node : null);
  }

  /** Determines whether the library is loaded in the document. */
  static isLoaded(document: CAEXDocument | null): boolean {
    return document != null && !T.CAEXWrapper.equals(document.caexFile!.attributeTypeLib.item('AutomationMLBaseAttributeTypeLib'), null);
  }
}

registerInterfaces(AutomationMLBaseAttributeTypeLibType, 'IAttributeTypeContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.AutomationMLBaseAttributeTypeLibType = AutomationMLBaseAttributeTypeLibType;
