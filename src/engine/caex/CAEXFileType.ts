// Port of Aml.Engine.CAEX.CAEXFileType.

import type { XElement } from '../../xml/index.js';
import { XmlConvert, XmlDateTimeSerializationMode } from '../../system/index.js';
import { T } from '../registry.js';
import { CAEXBasicObject } from './CAEXBasicObject.js';
import type { AttributeTypeLibType } from './AttributeTypeLibType.js';
import type { CAEXObject } from './CAEXObject.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { CAEXSequenceOfCAEXObjects } from './CAEXSequenceOfCAEXObjects.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ExternalReferenceType } from './ExternalReferenceType.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { InstanceHierarchyType } from './InstanceHierarchyType.js';
import type { InterfaceClassLibType } from './InterfaceClassLibType.js';
import type { RoleClassLibType } from './RoleClassLibType.js';
import type { SourceDocumentInformationType, SourceDocumentInformationType_Properties } from './SourceDocumentInformationType.js';
import type { SystemUnitClassLibType } from './SystemUnitClassLibType.js';
import type { ValueSequence } from './ValueSequence.js';

/**
 * `caexObject is CAEXLibrary<TLibItem>`: the item type of a CAEXLibrary is not known at run time
 * in JS, so it is taken from the wrapper class, or else from the tag name of the library node
 * (see port notes).
 */
function isLibraryOf(caexObject: CAEXWrapper | null, libraryClass: abstract new (...args: never[]) => unknown, tagName: string): boolean {
  if (caexObject instanceof libraryClass) return true;
  return caexObject instanceof T.CAEXLibrary && caexObject.node?.name.localName === tagName;
}

/** Wrapper for the CAEX element 'CAEXFile', the root element of any CAEX document. */
export class CAEXFileType extends CAEXBasicObject implements Iterable<CAEXObject> {
  private _attributeTypeLib: CAEXSequenceOfCAEXObjects<AttributeTypeLibType> | null = null;

  private _externalReference: CAEXSequence<ExternalReferenceType> | null = null;

  private _instanceHierarchy: CAEXSequenceOfCAEXObjects<InstanceHierarchyType> | null = null;

  private _interfaceClassLib: CAEXSequenceOfCAEXObjects<InterfaceClassLibType> | null = null;

  private _roleClassLib: CAEXSequenceOfCAEXObjects<RoleClassLibType> | null = null;

  private _sourceDocumentInformation: CAEXSequence<SourceDocumentInformationType> | null = null;

  private _superiorStandardVersion: ValueSequence<string> | null = null;

  private _systemUnitClassLib: CAEXSequenceOfCAEXObjects<SystemUnitClassLibType> | null = null;

  /** Gets the collection of AttributeTypeLib objects contained in the CAEXFile. */
  get attributeTypeLib(): CAEXSequenceOfCAEXObjects<AttributeTypeLibType> {
    return (this._attributeTypeLib ??= new T.CAEXSequenceOfCAEXObjects<AttributeTypeLibType>(
      this.node,
      'AttributeTypeLib',
      T.AttributeTypeLibType.Constructor,
      () => this,
    ));
  }

  /** Gets the collection of ExternalReference objects contained in the CAEXFile. */
  get externalReference(): CAEXSequence<ExternalReferenceType> {
    return (this._externalReference ??= new T.CAEXSequence<ExternalReferenceType>(this.node, 'ExternalReference', T.ExternalReferenceType.Constructor, () => this));
  }

  /** Gets and sets the FileName attribute of the CAEXFile. */
  get fileName(): string | null {
    return this.getXAttributeValue('FileName');
  }

  set fileName(value: string | null) {
    if (!(this.fileName === value)) {
      this.setXAttributeValue('FileName', value);
      this.raisePropertyChanged('FileName');
    }
  }

  /** Gets the collection of InstanceHierarchy objects contained in the CAEXFile. */
  get instanceHierarchy(): CAEXSequenceOfCAEXObjects<InstanceHierarchyType> {
    return (this._instanceHierarchy ??= new T.CAEXSequenceOfCAEXObjects<InstanceHierarchyType>(
      this.node,
      'InstanceHierarchy',
      T.InstanceHierarchyType.Constructor,
      () => this,
    ));
  }

  /** Gets the collection of InterfaceClassLib objects contained in the CAEXFile. */
  get interfaceClassLib(): CAEXSequenceOfCAEXObjects<InterfaceClassLibType> {
    return (this._interfaceClassLib ??= new T.CAEXSequenceOfCAEXObjects<InterfaceClassLibType>(
      this.node,
      'InterfaceClassLib',
      T.InterfaceClassLibType.Constructor,
      () => this,
    ));
  }

  /** Determines if this XML element is part of an existing XML document. */
  override get isDeleted(): boolean {
    return (this.node?.document ?? null) === null;
  }

  /** Gets a value indicating whether this instance contains no libraries and no instance hierarchy. */
  get isEmpty(): boolean {
    const node = this.node;
    if (node === null) {
      return false;
    }
    let count = 0;
    for (const e of node.elements()) {
      switch (e.name.localName) {
        case 'InstanceHierarchy':
        case 'RoleClassLib':
        case 'SystemUnitClassLib':
        case 'InterfaceClassLib':
        case 'AttributeTypeLib':
          count++;
          break;
        default:
          break;
      }
    }
    return count === 0;
  }

  /** Gets the collection of RoleClassLib objects contained in the CAEXFile. */
  get roleClassLib(): CAEXSequenceOfCAEXObjects<RoleClassLibType> {
    return (this._roleClassLib ??= new T.CAEXSequenceOfCAEXObjects<RoleClassLibType>(this.node, 'RoleClassLib', T.RoleClassLibType.Constructor, () => this));
  }

  /** Gets and sets the SchemaLocation attribute of the CAEXFile. */
  get schemaLocation(): string | null {
    return this.getXAttributeValue(T.CAEXDocument.amlSchemaManager(this)!.schemaLocation);
  }

  set schemaLocation(value: string | null) {
    if (!(this.schemaLocation === value)) {
      this.setXAttributeValue(T.CAEXDocument.amlSchemaManager(this)!.schemaLocation, value);
      this.raisePropertyChanged('SchemaLocation');
    }
  }

  /** Gets and sets the SchemaVersion attribute of the CAEXFile. */
  get schemaVersion(): string | null {
    return this.getXAttributeValue('SchemaVersion');
  }

  set schemaVersion(value: string | null) {
    if (!(this.schemaVersion === value)) {
      this.setXAttributeValue('SchemaVersion', value);
      this.raisePropertyChanged('SchemaVersion');
    }
  }

  /** Gets the collection of SourceDocumentInformation objects contained in the CAEXFile. */
  get sourceDocumentInformation(): CAEXSequence<SourceDocumentInformationType> {
    return (this._sourceDocumentInformation ??= new T.CAEXSequence<SourceDocumentInformationType>(
      this.node,
      'SourceDocumentInformation',
      T.SourceDocumentInformationType.Constructor,
      () => this,
    ));
  }

  /** Gets the collection of SuperiorStandardVersion values (strings) of the CAEXFile. */
  get superiorStandardVersion(): ValueSequence<string> {
    return (this._superiorStandardVersion ??= new T.ValueSequence<string>(this.node, 'SuperiorStandardVersion', () => this));
  }

  /** Gets the collection of SystemUnitClassLib objects contained in the CAEXFile. */
  get systemUnitClassLib(): CAEXSequenceOfCAEXObjects<SystemUnitClassLibType> {
    return (this._systemUnitClassLib ??= new T.CAEXSequenceOfCAEXObjects<SystemUnitClassLibType>(
      this.node,
      'SystemUnitClassLib',
      T.SystemUnitClassLibType.Constructor,
      () => this,
    ));
  }

  /** @internal The constructor function for this type. */
  static get Constructor(): (n: XElement) => CAEXFileType {
    return (n) => new CAEXFileType(n);
  }

  /** Initializes a new wrapper of the 'CAEXFile' element. */
  constructor(caexFileNode: XElement | null) {
    super(caexFileNode);
  }

  /** Adds the provided source document information to the AML file. */
  addSourceDocumentInformation(properties: SourceDocumentInformationType_Properties): SourceDocumentInformationType {
    return this.sourceDocumentInformation.append(
      ['OriginID', properties.originID],
      ['OriginName', properties.originName],
      ['OriginProjectID', properties.originProjectID],
      ['OriginProjectTitle', properties.originProjectTitle],
      ['OriginRelease', properties.originRelease],
      ['OriginVendorURL', properties.originVendorURL],
      ['OriginVendor', properties.originVendor],
      ['OriginVersion', properties.originVersion],
      ['LastWritingDateTime', XmlConvert.toString(properties.lastWritingDateTime, XmlDateTimeSerializationMode.Local)],
    );
  }

  /** Gets the CAEXSequence owned by this object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return caexObject instanceof T.ExternalReferenceType
      ? this.externalReference
      : caexObject instanceof T.InstanceHierarchyType
        ? this.instanceHierarchy
        : caexObject instanceof T.InterfaceClassLibType
          ? this.interfaceClassLib
          : caexObject instanceof T.RoleClassLibType
            ? this.roleClassLib
            : caexObject instanceof T.SystemUnitClassLibType
              ? this.systemUnitClassLib
              : !(caexObject instanceof T.AttributeTypeLibType)
                ? super.caexSequence(caexObject)
                : this.attributeTypeLib;
  }

  /** Enumerates all libraries (and instance hierarchies) of the CAEX file. */
  [Symbol.iterator](): Iterator<CAEXObject> {
    const first: Iterable<CAEXObject> = this.instanceHierarchy;
    const first2: Iterable<CAEXObject> = this.systemUnitClassLib;
    const first3: Iterable<CAEXObject> = this.roleClassLib;
    const first4: Iterable<CAEXObject> = this.interfaceClassLib;
    const second: Iterable<CAEXObject> = this.attributeTypeLib;
    return (function* () {
      yield* first;
      yield* first2;
      yield* first3;
      yield* first4;
      yield* second;
    })();
  }

  /** Retrieves the file name including full path of the CAEX document. @deprecated Use filePath of CAEXDocument. */
  getFileNamePath(): string | null {
    return this.caexDocument?.filePath ?? null;
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!(caexObject instanceof T.ExternalReferenceType)) {
      if (!(caexObject instanceof T.InstanceHierarchyType)) {
        if (!isLibraryOf(caexObject, T.InterfaceClassLibType, 'InterfaceClassLib')) {
          if (!isLibraryOf(caexObject, T.RoleClassLibType, 'RoleClassLib')) {
            if (!isLibraryOf(caexObject, T.SystemUnitClassLibType, 'SystemUnitClassLib')) {
              if (isLibraryOf(caexObject, T.AttributeTypeLibType, 'AttributeTypeLib')) {
                return this.attributeTypeLib.import(new T.AttributeTypeLibType(caexObject!.node), name, withSubclasses);
              }
              return super.import(caexObject, name, withSubclasses);
            }
            return this.systemUnitClassLib.import(new T.SystemUnitClassLibType(caexObject!.node), name, withSubclasses);
          }
          return this.roleClassLib.import(new T.RoleClassLibType(caexObject!.node), name, withSubclasses);
        }
        return this.interfaceClassLib.import(new T.InterfaceClassLibType(caexObject!.node), name, withSubclasses);
      }
      return this.instanceHierarchy.import(caexObject, name, withSubclasses);
    }
    return this.externalReference.import(caexObject, name, withSubclasses);
  }

  /**
   * Inserts the CAEX object into its associated sequence: insert(caexObject, asFirst = true,
   * asIs = false) or insert(pos, caexObject).
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(a: CAEXWrapper | number | null, b?: boolean | CAEXWrapper | null, c?: boolean): boolean {
    if (typeof a === 'number') {
      return this.insertAtPosition(a, b as CAEXWrapper | null);
    }
    const caexObject = a;
    const asFirst = (b as boolean | undefined) ?? true;
    const asIs = c ?? false;
    if (!(caexObject instanceof T.ExternalReferenceType)) {
      if (!(caexObject instanceof T.InstanceHierarchyType)) {
        if (!isLibraryOf(caexObject, T.InterfaceClassLibType, 'InterfaceClassLib')) {
          if (!isLibraryOf(caexObject, T.RoleClassLibType, 'RoleClassLib')) {
            if (!isLibraryOf(caexObject, T.SystemUnitClassLibType, 'SystemUnitClassLib')) {
              if (isLibraryOf(caexObject, T.AttributeTypeLibType, 'AttributeTypeLib')) {
                return this.attributeTypeLib.insert(new T.AttributeTypeLibType(caexObject!.node), asFirst, asIs) !== null;
              }
              return super.insert(caexObject, asFirst, asIs);
            }
            return this.systemUnitClassLib.insert(new T.SystemUnitClassLibType(caexObject!.node), asFirst, asIs) !== null;
          }
          return this.roleClassLib.insert(new T.RoleClassLibType(caexObject!.node), asFirst, asIs) !== null;
        }
        return this.interfaceClassLib.insert(new T.InterfaceClassLibType(caexObject!.node), asFirst, asIs) !== null;
      }
      return this.instanceHierarchy.insert(caexObject, asFirst, asIs) !== null;
    }
    return this.externalReference.insert(caexObject, asFirst, asIs) !== null;
  }

  /** Insert(int pos, CAEXWrapper caexObject). */
  private insertAtPosition(pos: number, caexObject: CAEXWrapper | null): boolean {
    if (!(caexObject instanceof T.ExternalReferenceType)) {
      if (!(caexObject instanceof T.InstanceHierarchyType)) {
        if (!(caexObject instanceof T.InterfaceClassLibType)) {
          if (!(caexObject instanceof T.RoleClassLibType)) {
            if (!(caexObject instanceof T.SystemUnitClassLibType)) {
              if (caexObject instanceof T.AttributeTypeLibType) {
                return this.attributeTypeLib.insertAt(pos, caexObject) !== null;
              }
              return super.insert(pos, caexObject);
            }
            return this.systemUnitClassLib.insertAt(pos, caexObject) !== null;
          }
          return this.roleClassLib.insertAt(pos, caexObject) !== null;
        }
        return this.interfaceClassLib.insertAt(pos, caexObject) !== null;
      }
      return this.instanceHierarchy.insertAt(pos, caexObject) !== null;
    }
    return this.externalReference.insertAt(pos, caexObject) !== null;
  }
}

T.CAEXFileType = CAEXFileType;
