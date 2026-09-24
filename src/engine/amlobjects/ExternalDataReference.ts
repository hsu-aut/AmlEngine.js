// Port of Aml.Engine.AmlObjects.ExternalDataReference (Aml.Engine 4.5.2): extension methods for
// the modelling of references to external documents (AutomationML BPR "External data reference").

import { T } from '../registry.js';
import { from } from '../../system/linq.js';
import { ArgumentNullException, InvalidOperationException, SystemException } from '../../system/exceptions.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from '../caex/extensions/CAEXDocumentExtensions.js';
import { CAEXFileTypeExtensions } from '../caex/extensions/CAEXFileTypeExtensions.js';
import { InheritanceExtensions } from '../caex/extensions/InheritanceExtensions.js';
import { AMLLibraries } from '../resources/libraries/AMLLibraries.js';
import { AmlObjectsExtensions } from './extensions/AmlObjectsExtensions.js';
import { ListAttribute } from './ListAttribute.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { CAEXFileType } from '../caex/CAEXFileType.js';
import type { InterfaceClassLibType } from '../caex/InterfaceClassLibType.js';
import type { InterfaceClassType } from '../caex/InterfaceClassType.js';
import type { InterfaceFamilyType } from '../caex/InterfaceFamilyType.js';
import type { InternalElementType } from '../caex/InternalElementType.js';
import type { RoleClassLibType } from '../caex/RoleClassLibType.js';
import type { RoleFamilyType } from '../caex/RoleFamilyType.js';
import type { SystemUnitClassType } from '../caex/SystemUnitClassType.js';

/** `new Exception(message)` of .NET (System.Exception). */
function exception(message = "Exception of type 'System.Exception' was thrown."): Error {
  const e = new SystemException(message);
  e.name = 'Exception';
  return e;
}

/** `new NullReferenceException(message)` of .NET. */
function nullReferenceException(message: string): Error {
  const e = new SystemException(message);
  e.name = 'NullReferenceException';
  return e;
}

/** Extension methods for external data references. */
export class ExternalDataReference {
  private constructor() {}

  /** The name of the AutomationMLBPRInterfaceClassLib. */
  static readonly AutomationMLBPRInterfaceClassLibName = 'AutomationMLBPRInterfaceClassLib';

  /** The name of the AutomationMLBPRRoleClassLib. */
  static readonly AutomationMLBPRRoleClassLibName = 'AutomationMLBPRRoleClassLib';

  /** The name of the ExternalDataReference interface class. */
  static readonly ExternalDataReferenceInterfaceClassName = 'ExternalDataReference';

  /** The path of the ExternalDataReference interface class. */
  static readonly ExternalDataReferenceInterfaceClassPath = 'AutomationMLBPRInterfaceClassLib/ExternalDataReference';

  /** The name of the ExternalData role class. */
  static readonly ExternalDataRoleClassName = 'ExternalData';

  /** The path of the ExternalData role class. */
  static readonly ExternalDataRoleClassPath = 'AutomationMLBPRRoleClassLib/ExternalData';

  /** The name of the language attribute. */
  static readonly LanguageAttributeName = 'aml-DocLang';

  /** Adds the AutomationMLBPRInterfaceClassLib to the CAEXFile, if it does not exist. */
  static addAutomationMLBPRInterfaceClassLib(caexFile: CAEXFileType): void {
    if (T.CAEXWrapper.equals(caexFile.interfaceClassLib.item('AutomationMLBPRInterfaceClassLib'), null)) {
      const automationMLLibrary = AMLLibraries.getAutomationMLLibrary(
        'AutomationMLBPRInterfaceClassLib',
        AmlObjectsExtensions.automationMLVersion(caexFile),
        caexFile.caexDocument!.schemaVersionString,
      );
      T.AMLLibraryType.loadExternalLibrary(CAEXBasicObjectExtensions.caexDocument(caexFile)!, automationMLLibrary, (doc: CAEXDocument) =>
        CAEXFileTypeExtensions.importInterfaceClassLib(caexFile, doc.caexFile!.interfaceClassLib.item('AutomationMLBPRInterfaceClassLib')!),
      );
    }
  }

  /**
   * Adds the AutomationMLBPRRoleClassLib to the CAEXFile, if it does not exist.
   * @throws ArgumentNullException caexFile is null.
   */
  static addAutomationMLBPRRoleClassLib(caexFile: CAEXFileType | null): void {
    if (T.CAEXWrapper.equals(caexFile, null)) {
      throw new ArgumentNullException('caexFile');
    }
    if (T.CAEXWrapper.equals(caexFile!.roleClassLib.item('AutomationMLBPRRoleClassLib'), null)) {
      const resource =
        AMLLibraries.automationMLBPRRoleClassLib('2.0', caexFile!.caexDocument!.schemaVersionString) ??
        (() => {
          throw exception();
        })();
      T.AMLLibraryType.loadExternalLibrary(CAEXBasicObjectExtensions.caexDocument(caexFile!)!, resource, (doc: CAEXDocument) =>
        CAEXFileTypeExtensions.importRoleClassLib(caexFile!, doc.caexFile!.roleClassLib.item('AutomationMLBPRRoleClassLib')!),
      );
    }
  }

  /**
   * Adds a document element (an InternalElement with the ExternalData role or a role derived from
   * it) to the SystemUnitClass.
   * @returns The document element, or `null` if the role class is not derived from ExternalData.
   */
  static addDocumentElement(
    internalElement: SystemUnitClassType,
    name: string,
    externalDataRoleClassPath = 'AutomationMLBPRRoleClassLib/ExternalData',
  ): InternalElementType | null {
    const cAEXDocument = CAEXBasicObjectExtensions.caexDocument(internalElement)!;
    ExternalDataReference.addExternalDataReferenceLibraries(cAEXDocument.caexFile);
    let roleFamilyType: RoleFamilyType | null = ExternalDataReference.externalDataRoleClass(ExternalDataReference.automationMLBPRRoleClassLib(cAEXDocument.caexFile));
    if (externalDataRoleClassPath !== 'AutomationMLBPRRoleClassLib/ExternalData') {
      const flag = InheritanceExtensions.classIsDerivedFrom(cAEXDocument, externalDataRoleClassPath, 'AutomationMLBPRRoleClassLib/ExternalData', T.RoleFamilyType);
      if (flag == null || !flag) {
        return null;
      }
      roleFamilyType = CAEXBasicObjectExtensions.findReferencedClass(cAEXDocument.caexFile!, externalDataRoleClassPath, T.RoleFamilyType);
    }
    const caexObject = roleFamilyType!.createClassInstance();
    const internalElementType = internalElement.internalElement.append(name);
    internalElementType.roleRequirements.insert(caexObject, false);
    return internalElementType;
  }

  /**
   * Adds a role derived from ExternalData to the InternalElement.
   * @returns `true` if the role has been added.
   * @throws InvalidOperationException the InternalElement is not contained in a CAEXDocument.
   */
  static addDocumentElementRole(internalElement: InternalElementType, externalDataRoleClassPath: string): boolean {
    const cAEXDocument =
      CAEXBasicObjectExtensions.caexDocument(internalElement) ??
      (() => {
        throw new InvalidOperationException('The InternalElement is not contained in a CAEXDocument');
      })();
    ExternalDataReference.addExternalDataReferenceLibraries(cAEXDocument.caexFile);
    if (externalDataRoleClassPath === 'AutomationMLBPRRoleClassLib/ExternalData') {
      return false;
    }
    const flag = InheritanceExtensions.classIsDerivedFrom(cAEXDocument, externalDataRoleClassPath, 'AutomationMLBPRRoleClassLib/ExternalData', T.RoleFamilyType);
    if (flag == null || !flag) {
      return false;
    }
    if (cAEXDocument.schema === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      internalElement.supportedRoleClass.append().refRoleClassPath = externalDataRoleClassPath;
    } else {
      internalElement.roleRequirements.append().refBaseRoleClassPath = externalDataRoleClassPath;
    }
    return true;
  }

  /**
   * Adds a document reference (an ExternalInterface of the ExternalDataReference class or a class
   * derived from it) to the document element.
   * @returns The new interface, or `null`.
   */
  static addDocumentReference(
    documentElement: InternalElementType,
    referenceName: string,
    externalDataReferenceInterfaceClassPath = 'AutomationMLBPRInterfaceClassLib/ExternalDataReference',
  ): InterfaceClassType | null {
    if (!ExternalDataReference.isDocumentElement(documentElement)) {
      return null;
    }
    const cAEXDocument =
      CAEXBasicObjectExtensions.caexDocument(documentElement) ??
      (() => {
        throw nullReferenceException('Element is not contained in a CAEXDocument');
      })();
    ExternalDataReference.addExternalDataReferenceLibraries(cAEXDocument.caexFile);
    let interfaceFamilyType: InterfaceFamilyType | null = ExternalDataReference.externalDataReferenceInterfaceClass(
      ExternalDataReference.automationMLBPRInterfaceClassLib(cAEXDocument.caexFile),
    );
    if (externalDataReferenceInterfaceClassPath !== 'AutomationMLBPRInterfaceClassLib/ExternalDataReference') {
      const flag = InheritanceExtensions.classIsDerivedFrom(
        cAEXDocument,
        externalDataReferenceInterfaceClassPath,
        'AutomationMLBPRInterfaceClassLib/ExternalDataReference',
        T.InterfaceFamilyType,
      );
      if (flag == null || !flag) {
        return null;
      }
      const found = CAEXDocumentExtensions.findByPath(cAEXDocument, externalDataReferenceInterfaceClassPath, true, T.InterfaceFamilyType);
      interfaceFamilyType = found instanceof T.InterfaceFamilyType ? found : null;
    }
    const externalInterfaceType = interfaceFamilyType?.createClassInstance() ?? null;
    if (T.CAEXWrapper.equals(externalInterfaceType, null)) {
      return null;
    }
    externalInterfaceType!.name = referenceName;
    documentElement.externalInterface.insert(externalInterfaceType, false);
    return externalInterfaceType;
  }

  /**
   * Adds the libraries for external data references: the BPR libraries in CAEX 2.15, the
   * AutomationMLInterfaceClassLib in CAEX 3.0.
   * @throws ArgumentNullException caexFile is null.
   */
  static addExternalDataReferenceLibraries(caexFile: CAEXFileType | null): void {
    if (T.CAEXWrapper.equals(caexFile, null)) {
      throw new ArgumentNullException('caexFile');
    }
    if (CAEXBasicObjectExtensions.caexSchema(caexFile!) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      ExternalDataReference.addAutomationMLBPRRoleClassLib(caexFile);
      ExternalDataReference.addAutomationMLBPRInterfaceClassLib(caexFile!);
    } else {
      T.AutomationMLInterfaceClassLibType.interfaceClassLib(caexFile!.caexDocument!);
    }
  }

  /**
   * Adds a language to the document element (attribute 'aml-DocLang'; a list attribute for more
   * than one language).
   * @throws ArgumentNullException internalElement is null.
   */
  static addLanguage(internalElement: InternalElementType | null, language: string | null): void {
    if (T.CAEXWrapper.equals(internalElement, null)) {
      throw new ArgumentNullException('internalElement');
    }
    let attributeType = internalElement!.attribute.item('aml-DocLang');
    if (T.CAEXWrapper.equals(attributeType, null)) {
      attributeType = internalElement!.attribute.append('aml-DocLang');
      attributeType.attributeDataType = T.XsdDataTypes.languageType;
      attributeType.value = language;
    } else {
      ListAttribute.convertToListAttribute(attributeType!, 'language');
      ListAttribute.addListItem(attributeType!, T.XsdDataTypes.languageType, 'language')!.value = language;
    }
  }

  /**
   * Gets the AutomationMLBPRInterfaceClassLib of the CAEXFile, or `null`.
   * @throws ArgumentNullException caexFile is null.
   */
  static automationMLBPRInterfaceClassLib(caexFile: CAEXFileType | null): InterfaceClassLibType | null {
    if (!T.CAEXWrapper.equals(caexFile, null)) {
      return caexFile!.interfaceClassLib.item('AutomationMLBPRInterfaceClassLib');
    }
    throw new ArgumentNullException('caexFile');
  }

  /**
   * Gets the AutomationMLBPRRoleClassLib of the CAEXFile, or `null`.
   * @throws ArgumentNullException caexFile is null.
   */
  static automationMLBPRRoleClassLib(caexFile: CAEXFileType | null): RoleClassLibType | null {
    if (!T.CAEXWrapper.equals(caexFile, null)) {
      return caexFile!.roleClassLib.item('AutomationMLBPRRoleClassLib');
    }
    throw new ArgumentNullException('caexFile');
  }

  /**
   * Gets the document elements (children with the ExternalData role) of the SystemUnitClass.
   * @throws ArgumentNullException internalElement is null.
   */
  static documentElements(internalElement: SystemUnitClassType | null): Iterable<InternalElementType> {
    if (!T.CAEXWrapper.equals(internalElement, null)) {
      return from(internalElement!.internalElement).where((child) => ExternalDataReference.isDocumentElement(child));
    }
    throw new ArgumentNullException('internalElement');
  }

  /**
   * Gets the ExternalDataReference interface class from the AutomationMLBPRInterfaceClassLib
   * (`ExternalDataReferenceInterfaceClass(InterfaceClassLibType)`) or of the CAEXFile
   * (`ExternalDataReferenceInterfaceClass(CAEXFileType)`; in CAEX 3.0 from the
   * AutomationMLInterfaceClassLib).
   */
  static externalDataReferenceInterfaceClass(arg: InterfaceClassLibType | CAEXFileType | null): InterfaceFamilyType | null {
    if (arg instanceof T.CAEXFileType) {
      const caexFile = arg;
      if (T.CAEXWrapper.equals(caexFile, null)) {
        throw new ArgumentNullException('caexFile');
      }
      if (caexFile.caexDocument!.schema === T.CAEXDocument.CAEXSchema.CAEX2_15) {
        ExternalDataReference.addAutomationMLBPRInterfaceClassLib(caexFile);
        return ExternalDataReference.externalDataReferenceInterfaceClass(ExternalDataReference.automationMLBPRInterfaceClassLib(caexFile));
      }
      return T.AutomationMLInterfaceClassLibType.interfaceClassLib(caexFile.caexDocument!)!.automationMLClass(
        'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/ExternalDataReference',
      );
    }
    const automationMLBPRInterfaceClassLib = arg as InterfaceClassLibType | null;
    if (T.CAEXWrapper.equals(automationMLBPRInterfaceClassLib, null)) {
      throw new ArgumentNullException('automationMLBPRInterfaceClassLib');
    }
    const interfaceFamilyType =
      automationMLBPRInterfaceClassLib!.interfaceClass.item('ExternalDataReference') ??
      (() => {
        throw nullReferenceException("Couldn't locate the ExternalDataReference InterfaceClass!");
      })();
    if (T.CAEXWrapper.equals(interfaceFamilyType.baseClass, null)) {
      ExternalDataReference.addAutomationMLBPRInterfaceClassLib(CAEXBasicObjectExtensions.caexFile(interfaceFamilyType)!);
    }
    return interfaceFamilyType;
  }

  /**
   * Gets the ExternalData role class from the AutomationMLBPRRoleClassLib
   * (`ExternalDataRoleClass(RoleClassLibType)`) or of the CAEXFile
   * (`ExternalDataRoleClass(CAEXFileType)`, adds the library if needed).
   */
  static externalDataRoleClass(arg: RoleClassLibType | CAEXFileType | null): RoleFamilyType {
    if (arg instanceof T.CAEXFileType) {
      const caexFile = arg;
      if (T.CAEXWrapper.equals(caexFile, null)) {
        throw new ArgumentNullException('caexFile');
      }
      ExternalDataReference.addAutomationMLBPRRoleClassLib(caexFile);
      return ExternalDataReference.externalDataRoleClass(ExternalDataReference.automationMLBPRRoleClassLib(caexFile));
    }
    const automationMLBPRRoleClassLib = arg as RoleClassLibType;
    const roleFamilyType =
      automationMLBPRRoleClassLib.roleClass.item('ExternalData') ??
      (() => {
        throw nullReferenceException("Couldn't locate the ExternalData role class");
      })();
    if (T.CAEXWrapper.equals(roleFamilyType.baseClass, null)) {
      ExternalDataReference.addAutomationMLBPRRoleClassLib(CAEXBasicObjectExtensions.caexFile(roleFamilyType));
    }
    return roleFamilyType;
  }

  /**
   * Gets the languages of the document element.
   * @throws ArgumentNullException documentElement is null.
   */
  static getLanguages(documentElement: InternalElementType | null): Iterable<string | null> {
    if (T.CAEXWrapper.equals(documentElement, null)) {
      throw new ArgumentNullException('documentElement');
    }
    if (!ExternalDataReference.isDocumentElement(documentElement!)) {
      return [];
    }
    const attributeType = documentElement!.attribute.item('aml-DocLang');
    if (T.CAEXWrapper.equals(attributeType, null)) {
      return [];
    }
    const list: (string | null)[] = [];
    if (ListAttribute.isListAttribute(attributeType!)) {
      list.push(...ListAttribute.listItemValues(attributeType!));
    } else {
      list.push(attributeType!.value);
    }
    return list;
  }

  /** Determines whether the InternalElement has the ExternalData role (or a role derived from it). */
  static isDocumentElement(documentElement: InternalElementType): boolean {
    if (
      !documentElement.roleRequirements.exists ||
      !from(documentElement.roleRequirements).any((rrq) => InheritanceExtensions.isDerivedFromRoleClass(rrq, 'AutomationMLBPRRoleClassLib/ExternalData'))
    ) {
      if (documentElement.supportedRoleClass.exists) {
        return from(documentElement.supportedRoleClass).any((rrq) =>
          InheritanceExtensions.isDerivedFromRoleClass(rrq, 'AutomationMLBPRRoleClassLib/ExternalData'),
        );
      }
      return false;
    }
    return true;
  }
}
