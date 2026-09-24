// Port of Aml.Engine.Schema.AMLSchemaManager3_0.

import { XElement, XNamespace, type XName } from '../../xml/index.js';
import { from } from '../../system/linq.js';
import { T } from '../registry.js';
import { AMLSchemaManager } from './AMLSchemaManager.js';
import { unpackSchema, type SchemaData } from './SchemaModel.js';
import caex30 from './data/caex30.js';
import { CAEX_ClassModel_V3_0_xsd } from './data/xsd.js';

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

/** Singleton schema manager for the CAEX schema version 3.0 used in AutomationML. */
export class AMLSchemaManager3_0 extends AMLSchemaManager {
  private static readonly AmlEngineResourcesCaexClassmodel30 = 'Aml.Engine.Resources.CAEX_ClassModel_V.3.0.xsd';

  private static _instance: AMLSchemaManager3_0 | null = null;

  /** The namespace defined for CAEX version 3.0 (http://www.dke.de/CAEX). */
  static get caexNamespace(): XNamespace {
    return XNamespace.get('http://www.dke.de/CAEX');
  }

  /** Gets the static default schema manager instance for CAEX 3.0. */
  static get instance(): AMLSchemaManager3_0 {
    return AMLSchemaManager3_0._instance ?? (AMLSchemaManager3_0._instance = AMLSchemaManager3_0.createInstance());
  }

  /** Gets the schema location attribute (xsi:schemaLocation). */
  override get schemaLocation(): XName {
    return this.xsi.getName('schemaLocation');
  }

  /** @internal */
  static isRestrictedAccess = false;

  /** Singleton private constructor reading the (compiled) schema. */
  private constructor(stream: SchemaData) {
    super(stream, AMLSchemaManager3_0.caexNamespace.namespaceName);
    AMLSchemaManager3_0.isRestrictedAccess = false;
  }

  /** Sets the schema version. */
  override setSchemaVersion(node: XElement): void {
    if (!(node.name.localName !== 'CAEXFile')) {
      node.setAttributeValue('SchemaVersion', '3.0');
    }
  }

  /** @internal Adds the CAEX namespace to the name of the element. */
  static adjustNameToSchema(element: XElement): void {
    if (element.name.namespace !== AMLSchemaManager3_0.caexNamespace) {
      element.name = AMLSchemaManager3_0.caexNamespace.getName(element.name.localName);
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
      const text = combine(folderPath, 'CAEX_ClassModel_V.3.0.xsd', path.sep);
      fs.writeFileSync(text, new TextEncoder().encode(CAEX_ClassModel_V3_0_xsd));
      return text;
    } catch {
      return null;
    }
  }

  /** @internal Adjusts the CAEXFile element to this schema (schema transformation). */
  adjustCAEXFileToSchema(caexFileNode: XElement): void {
    caexFileNode.removeAttributes();
    caexFileNode.name = AMLSchemaManager3_0.caexNamespace.getName(caexFileNode.name.localName);
    this.makeAml(caexFileNode);
    this.insertNew(caexFileNode, this.name('SourceDocumentInformation'));
    from(caexFileNode.elements('AdditionalInformation')).firstOrDefault((a) => a.attribute('AutomationMLVersion') !== null)?.remove();
  }

  /**
   * @internal If no schema location is set in the root, a schema location with a relative path is
   * set and the schema file is extracted to the folder.
   */
  override setSchemaLocation(root: XElement, folderPath: string): void {
    if ((root.attribute(this.xsi.getName('schemaLocation'))?.value ?? null) === null) {
      const value = XNamespace.get('http://www.dke.de/CAEX CAEX_ClassModel_V.3.0.xsd');
      AMLSchemaManager3_0.extractSchemaToFile(folderPath);
      root.setAttributeValue(this.xsi.getName('schemaLocation'), value.namespaceName);
    }
  }

  /** Makes newly created elements AutomationML objects (adds properties not defined in CAEX). */
  protected override makeAml(node: XElement | null): void {
    if (node !== null) {
      super.makeAml(node);
      if (!(node.name.localName !== 'CAEXFile')) {
        node.setAttributeValue('xmlns', AMLSchemaManager3_0.caexNamespace.namespaceName);
        node.setAttributeValue('SchemaVersion', '3.0');
        this.insert(node, new XElement(this.name('SuperiorStandardVersion'), 'AutomationML 2.1'));
      }
    }
  }

  /** Creates the singleton instance of the schema manager. */
  private static createInstance(): AMLSchemaManager3_0 {
    void AMLSchemaManager3_0.AmlEngineResourcesCaexClassmodel30;
    AMLSchemaManager3_0._instance = new AMLSchemaManager3_0(unpackSchema(caex30));
    return AMLSchemaManager3_0._instance;
  }
}

T.AMLSchemaManager3_0 = AMLSchemaManager3_0;
