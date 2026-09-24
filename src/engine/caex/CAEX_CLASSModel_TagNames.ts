// Port of Aml.Engine.CAEX.CAEX_CLASSModel_TagNames (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { XNamespace } from '../../xml/index.js';

/**
 * C# `Type.Name` of the generic wrapper classes (the TS export names differ: generic twins get
 * the suffix `_1`, generic classes without twin keep their name).
 */
const GENERIC_TYPE_NAMES: Record<string, string> = {
  CAEXWrapper_1: 'CAEXWrapper`1',
  BaseElementType: 'BaseElementType`1',
  CAEXLibrary: 'CAEXLibrary`1',
  CaexObjectWithReference: 'CaexObjectWithReference`1',
  AMLLibraryType: 'AMLLibraryType`1',
};

/** Constants for the CAEX tag names and attribute names. */
export class CAEX_CLASSModel_TagNames {
  private constructor() {}

  /** The Name of the CAEX-Element 'AdditionalInformation'. This Element has no special CAEX-Wrapper. */
  static readonly ADDITIONALINFORMATION_STRING = 'AdditionalInformation';

  /** The Name of the CAEX-Attribute 'Alias'. This is a Property in the CAEX-Wrapper `ExternalReferenceType` */
  static readonly ALIAS_ATTRIBUTE = 'Alias';

  /** The Name of the CAEX-Element 'NominalScaledType'. CAEX-Wrapper is `NominalScaledTypeType` */
  static readonly ATTRIBUTE_CONSTRAINT_NOMINAL_STRING = 'NominalScaledType';

  /** The Name of the CAEX-Attribute 'RequiredValue'. This is a Property in the CAEX-Wrapper `NominalScaledTypeType` */
  static readonly ATTRIBUTE_CONSTRAINT_NOMINAL_VALUE_STRING = 'RequiredValue';

  /** The Name of the CAEX-Attribute 'RequiredMaxValue'. This is a Property in the CAEX-Wrapper `OrdinalScaledTypeType` */
  static readonly ATTRIBUTE_CONSTRAINT_ORDINAL_MAX_STRING = 'RequiredMaxValue';

  /** The Name of the CAEX-Attribute 'RequiredMinValue'. This is a Property in the CAEX-Wrapper `OrdinalScaledTypeType` */
  static readonly ATTRIBUTE_CONSTRAINT_ORDINAL_MIN_STRING = 'RequiredMinValue';

  /** The Name of the CAEX-Element 'OrdinalScaledType'. CAEX-Wrapper is `OrdinalScaledTypeType` */
  static readonly ATTRIBUTE_CONSTRAINT_ORDINAL_STRING = 'OrdinalScaledType';

  /** The Name of the CAEX-Attribute 'RequiredValue'. This is a Property in the CAEX-Wrapper `OrdinalScaledTypeType` */
  static readonly ATTRIBUTE_CONSTRAINT_ORDINAL_VALUE_STRING = 'RequiredValue';

  /** The Name of the CAEX-Element 'Constraint'. The CAEX-Wrapper is `AttributeValueRequirementType` */
  static readonly ATTRIBUTE_CONSTRAINT_STRING = 'Constraint';

  /** The Name of the CAEX-Element 'Requirements'. This is a Child of the CAEX-Wrapper `UnknownTypeType` */
  static readonly ATTRIBUTE_CONSTRAINT_UNKNOWN_REQ_STRING = 'Requirements';

  /** The Name of the CAEX-Element 'UnknownType'. The CAEX-Wrapper is `UnknownTypeType` */
  static readonly ATTRIBUTE_CONSTRAINT_UNKNOWN_STRING = 'UnknownType';

  /** The Name of the CAEX-Element 'AttributeDataType' contained in the `AttributeTypeType` */
  static readonly ATTRIBUTE_DATATYPE_STRING = 'AttributeDataType';

  /** The Name of the CAEX-Attribute 'DefaultValue'. This is a Property in the CAEX-Wrapper `AttributeTypeType` */
  static readonly ATTRIBUTE_DEFAULTVALUE_STRING = 'DefaultValue';

  /** The Name of the Attribute 'CorrespondingAttributePath' of the CAEX-Element `RefSemanticType` */
  static readonly ATTRIBUTE_NAME_CORRESPONDING_ATTRIBUTE_PATH = 'CorrespondingAttributePath';

  /** The Name of the Attribute 'FileName' of the CAEX-Element `CAEXFileType` */
  static readonly ATTRIBUTE_NAME_FILENAME = 'FileName';

  /** The Name of the CAEX-Attribute 'RefPartnerSideA'. This is a Property in the CAEX-Wrapper `InternalLinkType` */
  static readonly ATTRIBUTE_NAME_REF_PARTNER_SIDE_A = 'RefPartnerSideA';

  /** The Name of the CAEX-Attribute 'RefPartnerSideB'. This is a Property in the CAEX-Wrapper `InternalLinkType` */
  static readonly ATTRIBUTE_NAME_REF_PARTNER_SIDE_B = 'RefPartnerSideB';

  /** The Name of the CAEX-Attribute 'RefAttributeType'. This is a Property in the CAEX-Wrapper `AttributeTypeType` Applicable since CAEX-Version 3.0 */
  static readonly ATTRIBUTE_NAME_REFATTRIBUTETYPE = 'RefAttributeType';

  /** The Name of the CAEX-Attribute 'RefBaseClassPath'. This is a Property in all Classes that implement `IClassWithBaseClassReference` */
  static readonly ATTRIBUTE_NAME_REFBASECLASSPATH = 'RefBaseClassPath';

  /** The Name of the CAEX-Attribute 'RefBaseRoleClassPath'. This is a Property in `RoleRequirementsType` */
  static readonly ATTRIBUTE_NAME_REFBASEROLECLASSPATH = 'RefBaseRoleClassPath';

  /** The Name of the CAEX-Attribute 'RefBaseSystemUnitPath'. This is a Property in `InternalElementType` */
  static readonly ATTRIBUTE_NAME_REFBASESYSTEMUNITPATH = 'RefBaseSystemUnitPath';

  /** The Name of the CAEX-Attribute 'RefRoleClassPath'. This is a Property in `SupportedRoleClassType` */
  static readonly ATTRIBUTE_NAME_REFROLECLASSPATH = 'RefRoleClassPath';

  /** The Name of the Xml-Schema Location Attribute 'xsi:noNamespaceSchemaLocation' */
  static readonly ATTRIBUTE_NAME_SCHEMA_LOCATION = 'xsi:noNamespaceSchemaLocation';

  /** The Name of the Xml-Schema Version Attribute 'SchemaVersion' of the CAEX-Element `CAEXFileType` */
  static readonly ATTRIBUTE_NAME_SCHEMA_VERSION = 'SchemaVersion';

  /** The Name of the CAEX-Attribute 'RefSemantic'. A Property in `AttributeTypeType`. */
  static readonly ATTRIBUTE_REFSEMANTIC_STRING = 'RefSemantic';

  /** The Name of the CAEX-Attribute 'RoleAttributeName' in an AttributeNameMapping. The CAEX-Wrapper is `AttributeNameMappingType`. */
  static readonly ATTRIBUTE_ROLE_ATTRIBUTE_NAME = 'RoleAttributeName';

  /** The Name of the CAEX-Attribute 'RoleInterfaceID' in an InterfaceIDMapping. The CAEX-Wrapper is `InterfaceIDMappingType`. Applicable since CAEX-Version 3.0 */
  static readonly ATTRIBUTE_ROLE_INTERFACE_ID = 'RoleInterfaceID';

  /** The Name of the CAEX-Attribute 'RoleInterfaceName' in an InterfaceNameMapping. The CAEX-Wrapper is `InterfaceNameMappingType`. Changed to `ATTRIBUTE_ROLE_INTERFACE_ID` in CAEX 3.0 */
  static readonly ATTRIBUTE_ROLE_INTERFACE_NAME = 'RoleInterfaceName';

  /** The Name of the CAEX-Element 'Attribute'. The CAEX-Wrapper is `AttributeType`. */
  static readonly ATTRIBUTE_STRING = 'Attribute';

  /** The Name of the CAEX-Attribute 'SystemUnitAttributeName' in an AttributeNameMapping. The CAEX-Wrapper is `AttributeNameMappingType`. */
  static readonly ATTRIBUTE_SYSTEM_UNIT_ATTRIBUTE_NAME = 'SystemUnitAttributeName';

  /** The Name of the CAEX-Attribute 'SystemUnitInterfaceID' in an InterfaceIDMapping. The CAEX-Wrapper is `InterfaceIDMappingType`. Applicable since CAEX-Version 3.0 */
  static readonly ATTRIBUTE_SYSTEM_UNIT_INTERFACE_ID = 'SystemUnitInterfaceID';

  /** The Name of the CAEX-Attribute 'SystemUnitInterfaceName' in an InterfaceNameMapping. The CAEX-Wrapper is `InterfaceNameMappingType`. Changed to `ATTRIBUTE_SYSTEM_UNIT_INTERFACE_ID` in CAEX 3.0 */
  static readonly ATTRIBUTE_SYSTEM_UNIT_INTERFACE_NAME = 'SystemUnitInterfaceName';

  /** The Name of the CAEX-Attribute 'Unit' of the CAEX-Element `AttributeTypeType` */
  static readonly ATTRIBUTE_UNIT_STRING = 'Unit';

  /** The Name of the CAEX-Element 'AttributeValueRequirement'. This is a Property in the CAEX-Wrapper `AttributeValueRequirementType` */
  static readonly ATTRIBUTE_VALUE_REQUIREMENT_STRING = 'AttributeValueRequirement';

  /** The Name of the CAEX-Attribute 'Value'. A Property in the CAEX-Wrapper `AttributeTypeType`. */
  static readonly ATTRIBUTE_VALUE_STRING = 'Value';

  /** The TypeName of the CAEX-Element 'AttributeType'. The CAEX-Wrapper is `AttributeFamilyType`  for the Type. Applicable since CAEX-Version 3.0 */
  static readonly ATTRIBUTEFAMILYTYPE_STRING = 'AttributeFamilyType';

  /** The TypeName of the CAEX-Element 'AttributeType'. The CAEX-Wrappers are `AttributeTypeType`. Applicable since CAEX-Version 3.0 */
  static readonly ATTRIBUTETYPE_STRING = 'AttributeType';

  /** The TypeName of the CAEX-Element 'AttributeTypeLib'. The CAEX-Wrappers are `AttributeTypeLibType`. Applicable since CAEX-Version 3.0 */
  static readonly ATTRIBUTETYPELIB_STRING = 'AttributeTypeLib';

  /** The Name of the CAEX-Element 'CAEXFile'. The CAEX-Wrapper is `CAEXFileType`. */
  static readonly CAEX_FILE = 'CAEXFile';

  /** The Type Name of any CAEXBasicObject. The CAEX-Wrapper is `CAEXBasicObject`. */
  static readonly CAEXBASICOBJECT = 'CAEXBasicObject';

  /** The Type Name of any CAEXObject. The CAEX-Wrapper is `CAEXObject`. */
  static readonly CAEXOBJECT = 'CAEXObject';

  /** The Name of the CAEX-Attribute 'ChangeMode'. This is an attribute of any `CAEXBasicObject`. */
  static readonly CHANGEMODE_ATTRIBUTE = 'ChangeMode';

  /** The Name of the CAEX-Element 'Copyright'. This is an element in any Header `CAEXBasicObject`. */
  static readonly COPYRIGHT_STRING = 'Copyright';

  /** The Name of the CAEX-Element 'Copyright'. This is an element in any Header `CAEXBasicObject`. */
  static readonly DESCRIPTION_STRING = 'Description';

  /** The Name of the CAEX-Element 'ExternalInterface'. The CAEX-Wrapper is `ExternalInterfaceType`. */
  static readonly EXTERNALINTERFACE_STRING = 'ExternalInterface';

  /** The Name of the CAEX-Element 'ExternalReference'. The CAEX-Wrapper is `ExternalReferenceType`. */
  static readonly EXTERNALREFERENCE_STRING = 'ExternalReference';

  /** The Name of the CAEX-Attribute 'ID'. This is defined for every `CAEXObject`. */
  static readonly ID_ATTRIBUTE = 'ID';

  /** The Name of the CAEX-Element 'InstanceHierarchy'. CAEX-Wrapper is `InstanceHierarchyType`. */
  static readonly INSTANCEHIERARCHY_STRING = 'InstanceHierarchy';

  /** The Name of the CAEX-Element 'InterfaceClass'. The CAEX-Wrappers are `InterfaceClassType` and `InterfaceFamilyType` */
  static readonly INTERFACECLASS_STRING = 'InterfaceClass';

  /** The Name of the CAEX-Element 'InterfaceClassLib'. The CAEX-Wrapper is `InterfaceClassLibType`. */
  static readonly INTERFACECLASSLIB_STRING = 'InterfaceClassLib';

  /** The TypeName of the CAEX-Element 'InterfaceClass'. The CAEX-Wrappers are `InterfaceClassType` and `InterfaceFamilyType`  for the Type. */
  static readonly INTERFACEFAMILYTYPE_STRING = 'InterfaceFamilyType';

  /** The Name of the CAEX-Element 'InternalElement'. The CAEX-Wrapper is `InternalElementType`. */
  static readonly INTERNALELEMENT_STRING = 'InternalElement';

  /** The Name of the CAEX-Element 'InternalLink'. The CAEX-Wrapper is `InternalLinkType`. */
  static readonly INTERNALLINK_STRING = 'InternalLink';

  /** The Name of the CAEX-Attribute 'LastWritingDateTime' defined in `SourceDocumentInformationType` Applicable since CAEX-Version 3.0 */
  static readonly LASTWRITINGDATETIME_ATTRIBUTE = 'LastWritingDateTime';

  /** The Name of the CAEX-Element 'AttributeNameMapping'. The CAEX-Wrapper is `AttributeNameMappingType`. */
  static readonly MAPPINGOBJECT_ATTRIBUTENAME_STRING = 'AttributeNameMapping';

  /** The Name of the CAEX-Element 'InterfaceIDMapping'. The CAEX-Wrapper is `InterfaceIDMappingType`. Applicable since CAEX-Version 3.0 */
  static readonly MAPPINGOBJECT_INTERFACEID_STRING = 'InterfaceIDMapping';

  /** The Name of the CAEX-Element 'InterfaceNameMapping'. The CAEX-Wrapper is `InterfaceNameMappingType`. Changed to `MAPPINGOBJECT_INTERFACEID_STRING` since CAEX-Version 3.0 */
  static readonly MAPPINGOBJECT_INTERFACENAME_STRING = 'InterfaceNameMapping';

  /** The Name of the CAEX-Element 'MappingObject'. The CAEX-Wrapper is `MappingType`. */
  static readonly MAPPINGOBJECT_STRING = 'MappingObject';

  /** The Name of the Type of the CAEX-Element 'MappingObject'. The CAEX-Wrapper is `MappingType`. */
  static readonly MAPPINGTYPE_STRING = 'MappingType';

  /** The Name of the additional AutomationML-CaexFile-Attribute 'AutomationMLVersion'. Deprecated since CAEX-Version 3.0 */
  static readonly META_ATTRIBUTE_NAME_AUTOMATIONMLVERSION = 'AutomationMLVersion';

  /** The meta attribute name document identifier is used to identify `META_ATTRIBUTE_NAME_DOCUMENTVERSION`. */
  static readonly META_ATTRIBUTE_NAME_DOCUMENTIDENTIFIER = 'DocumentIdentifier';

  /** The meta attribute name document version is used to identify `DocumentVersions` defined in the `ADDITIONALINFORMATION_STRING` of a `CAEX_FILE`. */
  static readonly META_ATTRIBUTE_NAME_DOCUMENTVERSION = 'DocumentVersion';

  /** The Name of the additional AutomationML-CaexFile-Element 'WriterHeader'. Deprecated since CAEX-Version 3.0 */
  static readonly META_WRITERHEADER_STRING = 'WriterHeader';

  /** The meta WriterID string */
  static readonly META_WRITERID_STRING = 'WriterID';

  /** The meta WriterName string */
  static readonly META_WRITERNAME_STRING = 'WriterName';

  /** The meta WriterProjectID string */
  static readonly META_WRITERPROJECTID_STRING = 'WriterProjectID';

  /** The meta WriterProjectTitle string */
  static readonly META_WRITERPROJECTTITLE_STRING = 'WriterProjectTitle';

  /** The meta WriterRelease string */
  static readonly META_WRITERRELEASE_STRING = 'WriterRelease';

  /** The meta WriterVendor string */
  static readonly META_WRITERVENDOR_STRING = 'WriterVendor';

  /** The meta WriterVendorURL string */
  static readonly META_WRITERVENDORURL_STRING = 'WriterVendorURL';

  /** The meta WriterVersion string */
  static readonly META_WRITERVERSION_STRING = 'WriterVersion';

  /** The Name of the CAEX-Attribute 'Name'. This is an Element in every `CAEXObject`. */
  static readonly NAME_ATTRIBUTE = 'Name';

  /** The Name of the CAEX-Attribute 'OriginID'. This is an Element in every `SourceDocumentInformationType` . Applicable since CAEX-Version 3.0 */
  static readonly ORIGINID_ATTRIBUTE = 'OriginID';

  /** The Name of the CAEX-Attribute 'OriginName'. This is an Element in every `SourceDocumentInformationType`. */
  static readonly ORIGINNAME_ATTRIBUTE = 'OriginName';

  /** The Name of the CAEX-Attribute 'OriginProjectID'. This is an Element in every `SourceDocumentInformationType`. Applicable since CAEX-Version 3.0 */
  static readonly ORIGINPROJECTID_ATTRIBUTE = 'OriginProjectID';

  /** The Name of the CAEX-Attribute 'OriginProjectTitle'. This is an Element in every `SourceDocumentInformationType`. Applicable since CAEX-Version 3.0 */
  static readonly ORIGINPROJECTTITLE_ATTRIBUTE = 'OriginProjectTitle';

  /** The Name of the CAEX-Attribute 'OriginRelease'. This is an Element in every `SourceDocumentInformationType`. Applicable since CAEX-Version 3.0 */
  static readonly ORIGINRELEASE_ATTRIBUTE = 'OriginRelease';

  /** The Name of the CAEX-Attribute 'OriginVendor'. This is an Element in every `SourceDocumentInformationType`. Applicable since CAEX-Version 3.0 */
  static readonly ORIGINVENDOR_ATTRIBUTE = 'OriginVendor';

  /** The Name of the CAEX-Attribute 'OriginVendorURL'. This is an Element in every `SourceDocumentInformationType`. Applicable since CAEX-Version 3.0 */
  static readonly ORIGINVENDORURL_ATTRIBUTE = 'OriginVendorURL';

  /** The Name of the CAEX-Attribute 'OriginVersion'. This is an Element in every `SourceDocumentInformationType`. */
  static readonly ORIGINVERSION_ATTRIBUTE = 'OriginVersion';

  /** The Name of the CAEX-Attribute 'Path'. This is defined in `ExternalReferenceType` */
  static readonly PATH_ATTRIBUTE = 'Path';

  /** The Name of the CAEX-Element 'RefSemantic'. This is a CAEX-Element with the CAEX-Wrapper `REF_SEMANTIC_TYPE` */
  static readonly REF_SEMANTIC_TYPE = 'RefSemantic';

  /** The Name of the CAEX-Element 'AuthorName'. This is an element in `RevisionType`. */
  static readonly REVISION_AUTHOR_NAME = 'AuthorName';

  /** The Name of the CAEX-Element 'Comment'. This is an element in `RevisionType`. */
  static readonly REVISION_COMMENT = 'Comment';

  /** The Name of the CAEX-Element 'RevisionDate'. This is an element in `RevisionType`. */
  static readonly REVISION_DATE_STRING = 'RevisionDate';

  /** The Name of the CAEX-Element 'NewVersion'. This is an element in `RevisionType`. */
  static readonly REVISION_NEWVERSION_STRING = 'NewVersion';

  /** The Name of the CAEX-Element 'OldVersion'. This is an element in `RevisionType`. */
  static readonly REVISION_OLDVERSION_STRING = 'OldVersion';

  /** The Name of the CAEX-Element 'Revision'. The CAEX-Wrapper is `RevisionType`. */
  static readonly REVISION_STRING = 'Revision';

  /** The Name of the CAEX-Element 'RoleClass'. The CAEX-Wrappers are `RoleClassType` and `RoleFamilyType`. */
  static readonly ROLECLASS_STRING = 'RoleClass';

  /** The Name of the CAEX-Element 'RoleClassLib'. The CAEX-Wrapper is `RoleClassLibType`. */
  static readonly ROLECLASSLIB_STRING = 'RoleClassLib';

  /** The TypeName of the CAEX-Element 'RoleClass'. The CAEX-Wrappers are `RoleClassType` and `RoleFamilyType` for the Type. */
  static readonly ROLEFAMILYTYPE_STRING = 'RoleFamilyType';

  /** The Name of the CAEX-Element 'RoleRequirements'. The CAEX-Wrapper is `RoleRequirementsType`. */
  static readonly ROLEREQUIREMENTS_STRING = 'RoleRequirements';

  /** The Name of the CAEX-Element 'SourceDocumentInformation'. CAEX-Wrapper is `SourceDocumentInformationType`. Applicable since CAEX-Version 3.0 */
  static readonly SOURCEDOCUMENTINFORMATION_STRING = 'SourceDocumentInformation';

  /** The Name of the CAEX-Element 'SourceObjectInformation'. CAEX-Wrapper is `SourceObjectInformationType`. Applicable since CAEX-Version 3.0 */
  static readonly SOURCEOBJECTINFORMATION_STRING = 'SourceObjectInformation';

  /** The Name of the CAEX-Attribute 'SourceObjID'. This Attribute is defined in `SourceObjectInformationType`. Applicable since CAEX-Version 3.0 */
  static readonly SOURCEOBJID_ATTRIBUTE = 'SourceObjID';

  /** The TypeName of the CAEX-Element 'SuperiorStandardVersion'. Applicable since CAEX-Version 3.0 */
  static readonly SUPERIORSTANDARDVERSION_STRING = 'SuperiorStandardVersion';

  /** The Name of the CAEX-Element 'SupportedRoleClass'. The CAEX-Wrapper is `SupportedRoleClassType`. */
  static readonly SUPPORTEDROLECLASS_STRING = 'SupportedRoleClass';

  /** The Name of the CAEX-Element 'SystemUnitClass'. The CAEX-Wrappers are `SystemUnitClassType` and `SystemUnitFamilyType`. */
  static readonly SYSTEMUNITCLASS_STRING = 'SystemUnitClass';

  /** The Name of the CAEX-Element 'SystemUnitClassLib'. The CAEX-Wrapper is `SystemUnitClassLibType`. */
  static readonly SYSTEMUNITCLASSLIB_STRING = 'SystemUnitClassLib';

  /** The TypeName of the CAEX-Element 'SystemUnitClass'. The CAEX-Wrappers are `SystemUnitClassType` and `SystemUnitFamilyType` for the Type. */
  static readonly SYSTEMUNITFAMILYTYPE_STRING = 'SystemUnitFamilyType';

  /** The Name of the CAEX-Element 'Version'. This may be defined in every `CAEXBasicObject`. */
  static readonly VERSION_STRING = 'Version';

  /** The CAEX namespace. */
  static readonly CAEX_NAMESPACE: XNamespace = XNamespace.get('http://www.dke.de/CAEX');

  /**
   * @internal C# `Type.Name` of a class: its export name in the registry (bundlers may rename
   * classes, so `ctor.name` is only the fallback for unregistered classes).
   */
  static typeName(type: Function): string {
    for (const [exportName, value] of Object.entries(T as unknown as Record<string, unknown>)) {
      if (value === type) return GENERIC_TYPE_NAMES[exportName] ?? exportName;
    }
    return type.name;
  }

  /**
   * Gets the CAEX tag name for the wrapper class (C# `TagName(Type)`, which uses `Type.Name`, see
   * `typeName`).
   * @param caexWrapperType The wrapper class.
   */
  static tagName(caexWrapperType: Function | null): string {
    if (caexWrapperType == null) {
      throw new ArgumentNullException('caexWrapperType');
    }
    const text = CAEX_CLASSModel_TagNames.trimEnd(CAEX_CLASSModel_TagNames.typeName(caexWrapperType), 'Type')!;
    if (!text.endsWith('Family')) {
      if (!('Mapping' === text)) {
        if (!(text === 'AttributeValueRequirement')) {
          return text;
        }
        return 'Constraint';
      }
      return 'MappingObject';
    }
    if (!'AttributeFamilyType'.startsWith(text)) {
      return text.replaceAll('Family', 'Class');
    }
    return 'AttributeType';
  }

  /** @internal Removes the suffix from the input string, if the input ends with it. */
  static trimEnd(input: string | null, suffixToRemove: string | null): string | null {
    if (input == null || suffixToRemove == null || !input.endsWith(suffixToRemove)) {
      return input;
    }
    const length = suffixToRemove.length;
    return input.substring(0, input.length - length);
  }
}
