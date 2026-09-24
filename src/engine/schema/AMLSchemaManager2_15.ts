// Port of Aml.Engine.Schema.AMLSchemaManager2_15.

import { XAttribute, XElement, XNamespace, XName } from '../../xml/index.js';
import { T } from '../registry.js';
import { AMLSchemaManager } from './AMLSchemaManager.js';
import { unpackSchema, type SchemaData } from './SchemaModel.js';
import caex215 from './data/caex215.js';
import { CAEX_ClassModel_V2_15_xsd } from './data/xsd.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
function syncModule<M>(name: string): M | null {
  return ((globalThis as any).process?.getBuiltinModule?.(name) as M | undefined) ?? null;
}

/** Path.Combine(folderPath, fileName). */
function combine(folderPath: string, fileName: string, sep: string): string {
  if (folderPath === null || folderPath === undefined) throw new TypeError('path1');
  if (folderPath.length === 0) return fileName;
  const last = folderPath[folderPath.length - 1];
  if (last === '/' || last === '\\' || (sep === '\\' && last === ':')) return folderPath + fileName;
  return folderPath + sep + fileName;
}

/** Singleton schema manager for the CAEX schema version 2.15 used in AutomationML. */
export class AMLSchemaManager2_15 extends AMLSchemaManager {
  private static readonly AmlEngineResourcesCaexClassmodel215 = 'Aml.Engine.Resources.CAEX_ClassModel_V2.15.xsd';

  private static _instance: AMLSchemaManager2_15 | null = null;

  /** Gets the static default schema manager instance for CAEX 2.15. */
  static get instance(): AMLSchemaManager2_15 {
    return AMLSchemaManager2_15._instance ?? (AMLSchemaManager2_15._instance = AMLSchemaManager2_15.createInstance());
  }

  /** The schema location attribute (xsi:noNamespaceSchemaLocation). */
  override get schemaLocation(): XName {
    return this.xsi.getName('noNamespaceSchemaLocation');
  }

  /** Singleton private constructor reading the (compiled) schema. */
  private constructor(stream: SchemaData) {
    super(stream, '');
  }

  /** Sets the schema version. */
  override setSchemaVersion(node: XElement): void {
    if (node.name.localName === 'CAEXFile') {
      node.setAttributeValue('SchemaVersion', '2.15');
    }
  }

  /** @internal Adjusts the name of the element and the names of its attributes to the schema. */
  static adjustNameToSchema(element: XElement): void {
    if (element.name.namespace !== XNamespace.None) {
      element.name = XNamespace.None.getName(element.name.localName);
    }
    let any = false;
    for (const a of element.attributes()) {
      if (a.isNamespaceDeclaration || a.name.namespace !== XNamespace.None) {
        any = true;
        break;
      }
    }
    if (any) {
      const content = (function* () {
        for (const attr of element.attributes()) {
          yield !attr.isNamespaceDeclaration
            ? !(attr.name.namespace !== XNamespace.None)
              ? attr
              : new XAttribute(XNamespace.None.getName(attr.name.localName), attr.value)
            : null;
        }
      })();
      element.replaceAttributes(content);
    }
  }

  /**
   * @internal Extracts the schema to a file in the folder; returns the file name, or null if the
   * file could not be written (Node only).
   */
  static extractSchemaToFile(folderPath: string): string | null {
    try {
      const fs = syncModule<typeof import('node:fs')>('node:fs');
      const path = syncModule<typeof import('node:path')>('node:path');
      if (fs === null || path === null) throw new Error('no file system');
      const text = combine(folderPath, 'CAEX_ClassModel_V2.15.xsd', path.sep);
      fs.writeFileSync(text, new TextEncoder().encode(CAEX_ClassModel_V2_15_xsd));
      return text;
    } catch {
      return null;
    }
  }

  /** @internal Adjusts the CAEXFile element to this schema (schema transformation). */
  adjustCAEXFileToSchema(caexFileNode: XElement): void {
    AMLSchemaManager2_15.adjustNameToSchema(caexFileNode);
    this.makeAml(caexFileNode);
  }

  /**
   * @internal If no schema location is set in the root, a relative schema location is set and the
   * schema file is extracted to the folder.
   */
  override setSchemaLocation(root: XElement, folderPath: string): void {
    if ((root.attribute(this.xsi.getName('noNamespaceSchemaLocation'))?.value ?? null) === null) {
      AMLSchemaManager2_15.extractSchemaToFile(folderPath);
      root.setAttributeValue(this.xsi.getName('noNamespaceSchemaLocation'), 'CAEX_ClassModel_V2.15.xsd');
    }
  }

  /** Makes newly created elements AutomationML objects (adds properties not defined in CAEX). */
  protected override makeAml(node: XElement | null): void {
    if (node !== null) {
      if (node.name.localName === 'CAEXFile') {
        node.setAttributeValue('SchemaVersion', '2.15');
        this.addNew(node, 'AdditionalInformation', new XAttribute('AutomationMLVersion', '2.0'));
      }
      super.makeAml(node);
    }
  }

  /** Creates the singleton instance of the schema manager. */
  private static createInstance(): AMLSchemaManager2_15 {
    void AMLSchemaManager2_15.AmlEngineResourcesCaexClassmodel215;
    AMLSchemaManager2_15._instance = new AMLSchemaManager2_15(unpackSchema(caex215));
    return AMLSchemaManager2_15._instance;
  }
}

T.AMLSchemaManager2_15 = AMLSchemaManager2_15;
