// Port of Aml.Engine.CAEX.CAEXTypeDictionary (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { KeyNotFoundException } from '../../system/exceptions.js';
import type { XElement } from '../../xml/index.js';
import { newException, type CAEXWrapper } from './CAEXWrapper.js';
import { CAEX_CLASSModel_TagNames } from './CAEX_CLASSModel_TagNames.js';

/**
 * Dictionary of the CAEX wrapper types by type name (C# `Dictionary<string, Type>`; here a Map of
 * class constructors), with creator functions for the CAEX tag names. The instance is built on
 * first use from the registry (C#: from the exported types of the assembly).
 */
export class CAEXTypeDictionary extends Map<string, Function> {
  private readonly _creators = new Map<string, (e: XElement) => CAEXWrapper>();

  private static _instance: CAEXTypeDictionary | null = null;

  /** Gets the dictionary instance. */
  static get instance(): CAEXTypeDictionary {
    if (CAEXTypeDictionary._instance === null) {
      CAEXTypeDictionary._instance = new CAEXTypeDictionary();
      CAEXTypeDictionary.initialize(CAEXTypeDictionary._instance);
    }
    return CAEXTypeDictionary._instance;
  }

  /**
   * Indexer getter `this[caexTagName]`: the wrapper type for the CAEX tag name. Throws
   * KeyNotFoundException if none exists.
   */
  item(caexTagName: string): Function {
    const key = CAEXTypeDictionary.key(caexTagName);
    const t = super.get(key);
    if (t === undefined) {
      throw new KeyNotFoundException(`The given key '${key}' was not present in the dictionary.`);
    }
    return t;
  }

  /** Indexer setter (private in C#). */
  private setItem(caexTagName: string, value: Function): void {
    super.set(caexTagName, value);
  }

  /** Static constructor of C#. */
  private static initialize(instance: CAEXTypeDictionary): void {
    let exportedTypes: [string, Function][];
    try {
      exportedTypes = CAEXTypeDictionary.exportedWrapperTypes();
    } catch (innerException) {
      throw newException('Error while loading CAEX types', innerException);
    }
    const Key = CAEXTypeDictionary.key;
    for (const [name, type] of exportedTypes) {
      instance.setItem(name, type);
      const creators = instance._creators;
      if (name === Key('CAEXFile')) {
        creators.set(name, (n) => new T.CAEXFileType(n));
      } else if (name === Key('InstanceHierarchy')) {
        creators.set(name, (n) => new T.InstanceHierarchyType(n));
      } else if (name === Key('InternalElement')) {
        creators.set(name, (n) => new T.InternalElementType(n));
      } else if (name === Key('RoleClass')) {
        creators.set(name, (n) => new T.RoleFamilyType(n));
      } else if (name === Key('SourceDocumentInformation')) {
        creators.set(name, (n) => new T.SourceDocumentInformationType(n));
      } else if (name === Key('SourceObjectInformation')) {
        creators.set(name, (n) => new T.SourceObjectInformationType(n));
      } else if (name === Key('RoleClassLib')) {
        creators.set(name, (n) => new T.RoleClassLibType(n));
      } else if (name === Key('SystemUnitClass')) {
        creators.set(name, (n) => new T.SystemUnitFamilyType(n));
      } else if (name === Key('SystemUnitClassLib')) {
        creators.set(name, (n) => new T.SystemUnitClassLibType(n));
      } else if (name === Key('InterfaceClassLib')) {
        creators.set(name, (n) => new T.InterfaceClassLibType(n));
      } else if (name === Key('AttributeTypeLib')) {
        creators.set(name, (n) => new T.AttributeTypeLibType(n));
      } else if (name === Key('AttributeFamilyType')) {
        creators.set(name, (n) => new T.AttributeFamilyType(n));
      } else if (name === Key('AttributeType')) {
        creators.set(name, (n) => new T.AttributeFamilyType(n));
      } else if (name === Key('InterfaceClass')) {
        creators.set(name, (n) => new T.InterfaceFamilyType(n));
      } else if (name === Key('ExternalReference')) {
        creators.set(name, (n) => new T.ExternalReferenceType(n));
      } else if (name === Key('InternalLink')) {
        creators.set(name, (n) => new T.InternalLinkType(n));
      } else if (name === Key('ExternalInterface')) {
        creators.set(name, (n) => new T.ExternalInterfaceType(n));
      } else if (name === Key('RoleRequirements')) {
        creators.set(name, (n) => new T.RoleRequirementsType(n));
      } else if (name === Key('SupportedRoleClass')) {
        creators.set(name, (n) => new T.SupportedRoleClassType(n));
      } else if (name === Key('MappingObject')) {
        creators.set(name, (n) => new T.MappingType(n));
      } else if (name === Key('Attribute')) {
        creators.set(name, (n) => new T.AttributeType(n));
      } else if (name === Key('Revision')) {
        creators.set(name, (n) => new T.RevisionType(n));
      } else if (name === Key('InterfaceNameMapping')) {
        creators.set(name, (n) => new T.InterfaceNameMappingType(n));
      } else if (name === Key('InterfaceIDMapping')) {
        creators.set(name, (n) => new T.InterfaceIDMappingType(n));
      } else if (name === Key('AttributeNameMapping')) {
        creators.set(name, (n) => new T.AttributeNameMappingType(n));
      } else if (name === Key('OrdinalScaledType')) {
        creators.set(name, (n) => new T.OrdinalScaledTypeType(n));
      } else if (name === Key('NominalScaledType')) {
        creators.set(name, (n) => new T.NominalScaledTypeType(n));
      } else if (name === Key('UnknownType')) {
        creators.set(name, (n) => new T.UnknownTypeType(n));
      } else if (name === Key('AttributeValueRequirement')) {
        creators.set(name, (n) => new T.AttributeValueRequirementType(n));
      } else if (name === Key('RefSemantic')) {
        creators.set(name, (n) => new T.RefSemanticType(n));
      } else if (name === Key('InterfaceFamilyType')) {
        creators.set(name, (n) => new T.InterfaceFamilyType(n));
      } else if (name === Key('RoleFamilyType')) {
        creators.set(name, (n) => new T.RoleFamilyType(n));
      } else if (name === Key('SystemUnitFamilyType')) {
        creators.set(name, (n) => new T.SystemUnitFamilyType(n));
      }
    }
  }

  /**
   * `typeof(CAEXBasicObject).Assembly.GetExportedTypes()` filtered by
   * `typeof(CAEXWrapper).IsAssignableFrom(type)`: every registered class derived from (or equal
   * to) CAEXWrapper, with its C# type name. The order is the registry order.
   */
  private static exportedWrapperTypes(): [string, Function][] {
    const wrapper = T.CAEXWrapper as Function;
    const result: [string, Function][] = [];
    for (const value of Object.values(T as unknown as Record<string, unknown>)) {
      if (typeof value !== 'function') continue;
      if (value !== wrapper && !(value.prototype instanceof wrapper)) continue;
      result.push([CAEX_CLASSModel_TagNames.typeName(value), value]);
    }
    return result;
  }

  private constructor() {
    super();
  }

  /** Determines whether a type exists for the CAEX tag name. */
  containsKey(caexTagName: string): boolean {
    return super.has(CAEXTypeDictionary.key(caexTagName));
  }

  /** Gets the creator function for the element name; `{ result, creatorFunc }` (C# out parameter). */
  tryGetCreator(elementName: string): { result: boolean; creatorFunc: ((e: XElement) => CAEXWrapper) | null } {
    const creatorFunc = this._creators.get(CAEXTypeDictionary.key(elementName));
    return { result: creatorFunc !== undefined, creatorFunc: creatorFunc ?? null };
  }

  /** Gets the type for the CAEX tag name; `{ result, t }` (C# out parameter). */
  tryGetValue(caexTagName: string): { result: boolean; t: Function | null } {
    const t = super.get(CAEXTypeDictionary.key(caexTagName));
    return { result: t !== undefined, t: t ?? null };
  }

  private static key(caexTagName: string): string {
    if (caexTagName.includes('Family')) {
      return caexTagName;
    }
    return caexTagName === 'MappingObject'
      ? 'MappingType'
      : !(caexTagName === 'Constraint')
        ? caexTagName + 'Type'
        : 'AttributeValueRequirementType';
  }
}

T.CAEXTypeDictionary = CAEXTypeDictionary;
