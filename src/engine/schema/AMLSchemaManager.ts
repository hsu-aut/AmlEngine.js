// Port of Aml.Engine.Schema.AMLSchemaManager.

import { XElement, type XAttribute, type XNameLike, type XNamespace } from '../../xml/index.js';
import { T } from '../registry.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { XmlSchemaManager } from './XmlSchemaManager.js';
import type { SchemaData } from './SchemaModel.js';

/**
 * Extends the XmlSchemaManager: methods which create new objects add the properties and values
 * that the AutomationML standard (not the CAEX schema) requires.
 */
export abstract class AMLSchemaManager extends XmlSchemaManager {
  /** Defines the resource path of the assembly. */
  static readonly ResourcePath = 'Aml.Engine.Resources';

  /** Constructor for schema manager (schema data instead of the XSD stream). */
  protected constructor(stream: SchemaData, namespaceUri: XNamespace | string) {
    super(stream, namespaceUri);
  }

  /** Creates the element (see XmlSchemaManager.createElement) and makes it an AML node. */
  override createElement(parentName: XNameLike | null, childName: XNameLike, allAttributes = false): XElement | null {
    const result = super.createElement(parentName, childName, allAttributes);
    this.makeAml(result);
    return result;
  }

  /** Sets the schema version. */
  abstract setSchemaVersion(node: XElement): void;

  /** @internal */
  finalizeSchemaTransformation(element: XElement): void {
    if (element.name.localName === 'AdditionalInformation') {
      return;
    }
    const info = this.xmlSchemaInfo(element.parent?.name ?? null, element.name).info;
    if (info === null) {
      element.remove();
      return;
    }
    const definedAttributes = info.allAttributes.map((a) => a.name);
    const attributes: XAttribute[] = [...element.attributes()];
    for (const item of attributes) {
      if (!item.isNamespaceDeclaration && !definedAttributes.includes(item.name.localName)) {
        item.remove();
      }
    }
    for (const item2 of info.requiredAttributes) {
      if (!(item2.name !== null && element.attribute(item2.name) === null)) {
        continue;
      }
      if (item2.name !== null) {
        element.setAttributeValue(item2.name, item2.defaultValue ?? '');
      }
    }
    for (const item3 of info.required) {
      if (!(element.element(item3) === null)) {
        continue;
      }
      this.insertNew(element, item3);
    }
  }

  /**
   * Makes the node an AML object, if additional properties and values are defined for this node.
   */
  protected makeAml(xmlNode: XElement | null): void {
    if (xmlNode === null) {
      return;
    }
    const localName = xmlNode.name.localName;
    switch (localName) {
      case 'ExternalInterface':
      case 'InternalElement':
        AMLSchemaManager.addUUID(xmlNode);
        return;
      case 'SystemUnitClass':
        AMLSchemaManager.addUUID(xmlNode);
        xmlNode.add(new XElement(this.name('Version'), '1.0.0'));
        return;
      case 'CAEXFile':
        xmlNode.setAttributeValue(this.xmlns.getName('xsi'), 'http://www.w3.org/2001/XMLSchema-instance');
        return;
      case 'InstanceHierarchy':
      case 'InterfaceClassLib':
      case 'AttributeType':
      case 'InterfaceClass':
      case 'RoleClass':
      case 'AttributeTypeLib':
      case 'SystemUnitClassLib':
      case 'RoleClassLib':
        xmlNode.add(new XElement(this.name('Version'), '1.0.0'));
        return;
      default:
        return;
    }
  }

  /** The node gets a UUID. */
  private static addUUID(node: XElement): void {
    node.setAttributeValue('ID', ServiceLocator.idService.generateNewID());
  }
}

T.AMLSchemaManager = AMLSchemaManager;
