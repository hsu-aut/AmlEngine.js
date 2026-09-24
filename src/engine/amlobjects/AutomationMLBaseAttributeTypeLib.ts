// Port of Aml.Engine.AmlObjects.AutomationMLBaseAttributeTypeLib (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { InheritanceExtensions } from '../caex/extensions/InheritanceExtensions.js';
import type { AutomationMLBaseAttributeTypeLibType } from './AutomationMLBaseAttributeTypeLibType.js';
import type { AttributeTypeType } from '../caex/AttributeTypeType.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';

/** Constants and extension methods for the AutomationMLBaseAttributeTypeLib (CAEX 3.0). */
export class AutomationMLBaseAttributeTypeLib {
  private constructor() {}

  /** Name of the standard AssociatedExternalValue AttributeType. */
  static readonly AssociatedExternalValueAttribute = 'AssociatedExternalValue';

  /** The AssociatedExternalValueAttribute AttributeType path. */
  static readonly AssociatedExternalValue = 'AutomationMLBaseAttributeTypeLib/AssociatedExternalValue';

  /** Name of the standard AssociatedFacet AttributeType. */
  static readonly AssociatedFacetAttribute = 'AssociatedFacet';

  /** The AssociatedFacetAttribute AttributeType path. */
  static readonly AssociatedFacet = 'AutomationMLBaseAttributeTypeLib/AssociatedFacet';

  /** The 'AutomationMLBaseAttributeTypeLib' library name */
  static readonly AutomationMLBaseAttributeTypeLibName = 'AutomationMLBaseAttributeTypeLib';

  /** Name of the standard Cardinality AttributeType. */
  static readonly CardinalityAttribute = 'Cardinality';

  /** The CardinalityAttribute AttributeType path. */
  static readonly Cardinality = 'AutomationMLBaseAttributeTypeLib/Cardinality';

  /** Name of the standard Category AttributeType. */
  static readonly CategoryAttribute = 'Category';

  /** The CategoryAttribute AttributeType path. */
  static readonly Category = 'AutomationMLBaseAttributeTypeLib/Category';

  /** Name of the standard Direction AttributeType. */
  static readonly DirectionAttribute = 'Direction';

  /** The DirectionAttribute AttributeType path. */
  static readonly Direction = 'AutomationMLBaseAttributeTypeLib/Direction';

  /** Name of the standard DocLang AttributeType. */
  static readonly DocLangAttribute = 'DocLang';

  /** The DocLangAttribute AttributeType path. */
  static readonly DocLang = 'AutomationMLBaseAttributeTypeLib/DocLang';

  /** Name of the standard Frame AttributeType. */
  static readonly FrameAttribute = 'Frame';

  /** The FrameAttribute AttributeType path. */
  static readonly Frame = 'AutomationMLBaseAttributeTypeLib/Frame';

  /** Name of the standard ListType AttributeType */
  static readonly ListTypeAttribute = 'ListType';

  /** The ListTypeAttribute AttributeType path. */
  static readonly ListType = 'AutomationMLBaseAttributeTypeLib/ListType';

  /** Name of the standard LocalizedAttribute AttributeType */
  static readonly LocalizedAttributeAttribute = 'LocalizedAttribute';

  /** The LocalizedAttributeAttribute AttributeType path. */
  static readonly LocalizedAttribute = 'AutomationMLBaseAttributeTypeLib/LocalizedAttribute';

  /** The maximum occurrence attribute for a cardinality attribute type */
  static readonly MaxOccurrenceAttribute = 'MaxOccur';

  /** Name of the standard MimeType Attribute Type */
  static readonly MIMETypeAttribute = 'MIMEType';

  /** The MIMETypeAttribute AttributeType path */
  static readonly MIMEType = 'AutomationMLBaseAttributeTypeLib/MIMEType';

  /** The minimum occurrence attribute for a cardinality attribute type */
  static readonly MinOccurrenceAttribute = 'MinOccur';

  /** Name of the standard OrderedListType AttributeType */
  static readonly OrderedListTypeAttribute = 'OrderedListType';

  /** The OrderedListTypeAttribute AttributeType path. */
  static readonly OrderedListType = 'AutomationMLBaseAttributeTypeLib/OrderedListType';

  /** Name of the standard refURI AttributeType */
  static readonly RefURIAttribute = 'refURI';

  /** The RefURIAttribute AttributeType path. */
  static readonly RefURI = 'AutomationMLBaseAttributeTypeLib/refURI';

  /**
   * Gets the AutomationMLBaseAttributeTypeLib from the provided document. If the document doesn't contain the required library it will be automatically imported from an embedded resource.
   */
  static addAutomationMLBaseAttributeTypeLib(caexDocument: CAEXDocument): AutomationMLBaseAttributeTypeLibType | null {
    return T.AutomationMLBaseAttributeTypeLibType.attributeTypeLib(caexDocument);
  }

  /**
   * Determines whether the specified attribute is a reference to a AssociatedExternalValue standard attribute Type or any derived type of the standard attribute type.
   */
  static isAssociatedExternalValue(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/AssociatedExternalValue');
  }

  /**
   * Determines whether the specified attribute is a reference to a AssociatedFacet standard attribute Type or any derived type of the standard attribute type.
   */
  static isAssociatedFacet(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/AssociatedFacet');
  }

  /**
   * Determines whether the specified attribute is a reference to a Cardinality standard attribute Type or any derived type of the standard attribute type.
   */
  static isCardinality(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/Cardinality');
  }

  /**
   * Determines whether the specified attribute is a reference to a Category standard attribute Type or any derived type of the standard attribute type.
   */
  static isCategory(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/Category');
  }

  /**
   * Determines whether the specified attribute is a reference to a Direction standard attribute Type or any derived type of the standard attribute type.
   */
  static isDirection(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/Direction');
  }

  /**
   * Determines whether the specified attribute is a reference to a DocLang standard attribute Type or any derived type of the standard attribute type.
   */
  static isDocLang(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/DocLang');
  }

  /**
   * Determines whether the specified attribute is a reference to a Frame standard attribute Type or any derived type of the standard attribute type.
   */
  static isFrame(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/Frame');
  }

  /**
   * Determines whether the specified attribute is a reference to a ListType standard attribute Type or any derived type of the standard attribute type.
   */
  static isListType(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/ListType');
  }

  /**
   * Determines whether the specified attribute is a reference to a LocalizedAttribute standard attribute Type or any derived type of the standard attribute type.
   */
  static isLocalizedAttribute(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/LocalizedAttribute');
  }

  /**
   * Determines whether the specified attribute is a reference to a MIMEType standard attribute Type or any derived type of the standard attribute type.
   */
  static isMIMEType(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/MIMEType');
  }

  /**
   * Determines whether the specified attribute is a reference to a OrderedListType standard attribute Type or any derived type of the standard attribute type.
   */
  static isOrderedListType(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/OrderedListType');
  }

  /**
   * Determines whether the specified attribute is a reference to a RefURI standard attribute Type or any derived type of the standard attribute type.
   */
  static isRefUri(attribute: AttributeTypeType): boolean {
    return InheritanceExtensions.isDerivedFromAttributeType(attribute, 'AutomationMLBaseAttributeTypeLib/refURI');
  }
}
