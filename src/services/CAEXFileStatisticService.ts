// Port of Aml.Engine.Services.CAEXFileStatisticService (Aml.Engine.Services 4.3.1).

import '../engine/index.js';
import { registerInterfaces } from '../engine/interfaces.js';
import { ServiceLocator } from '../engine/services/ServiceLocator.js';
import { XmlCAEXSchema } from '../engine/xmlext/XmlCAEXSchema.js';
import { isNullOrEmpty } from '../system/strings.js';
import { from } from '../system/linq.js';
import type { XNode } from '../xml/index.js';
import type { CAEXFileType } from '../engine/caex/CAEXFileType.js';
import type { IStatistic } from '../engine/services/interfaces/IStatistic.js';

/** Calculates statistics for a CAEX document. */
export class CAEXFileStatisticService implements IStatistic {
  /** Registers a new instance with the ServiceLocator of the engine. */
  static register(): CAEXFileStatisticService {
    const cAEXFileStatisticService = new CAEXFileStatisticService();
    ServiceLocator.register(cAEXFileStatisticService, 'IStatistic');
    return cAEXFileStatisticService;
  }

  /** Unregisters this service. */
  static unRegister(): void {
    ServiceLocator.unRegister('IStatistic');
  }

  /** Counts all objects (the sum of the other counts, without the type references). */
  numberOfAllObjects(caexFile: CAEXFileType): number {
    return (
      this.numberOfAttributes(caexFile) +
      this.numberOfAttributeTypes(caexFile) +
      this.numberOfInterfaceClasses(caexFile) +
      this.numberOfInterfaceInstances(caexFile) +
      this.numberOfInternalElements(caexFile) +
      this.numberOfLinks(caexFile) +
      this.numberOfRoleClasses(caexFile) +
      this.numberOfSystemUnitClasses(caexFile) +
      this.numberOfRoleClassReferences(caexFile)
    );
  }

  /** Counts all Attribute elements. */
  numberOfAttributes(caexFile: CAEXFileType): number {
    return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'Attribute'))).count();
  }

  /** Counts all attribute type references with a value. */
  numberOfAttributeTypeReferences(caexFile: CAEXFileType): number {
    // Aml.Engine: counts elements named RefAttributeType; in CAEX it is an XML attribute, so the
    // count is 0 for valid documents.
    return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'RefAttributeType'))).count((a) => !isNullOrEmpty(a.value));
  }

  /**
   * Counts all AttributeType elements, or those which meet the condition (C# overloads
   * NumberOfAttributeTypes(caexFile) and (caexFile, Predicate<XNode> condition)).
   */
  numberOfAttributeTypes(caexFile: CAEXFileType, condition?: ((node: XNode) => boolean) | null): number {
    if (condition === undefined) {
      return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'AttributeType'))).count();
    }
    return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'AttributeType'))).count((n) => condition!(n));
  }

  /**
   * Counts all InterfaceClass elements, or those which meet the condition (C# overloads
   * NumberOfInterfaceClasses(caexFile) and (caexFile, Predicate<XNode> condition)).
   */
  numberOfInterfaceClasses(caexFile: CAEXFileType, condition?: ((node: XNode) => boolean) | null): number {
    if (condition === undefined) {
      return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'InterfaceClass'))).count();
    }
    return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'InterfaceClass'))).count((n) => condition!(n));
  }

  /** Counts all ExternalInterface elements. */
  numberOfInterfaceInstances(caexFile: CAEXFileType): number {
    return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'ExternalInterface'))).count();
  }

  /** Counts all InternalElement elements. */
  numberOfInternalElements(caexFile: CAEXFileType): number {
    return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'InternalElement'))).count();
  }

  /** Counts all InternalLink elements. */
  numberOfLinks(caexFile: CAEXFileType): number {
    return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'InternalLink'))).count();
  }

  /**
   * Counts all RoleClass elements, or those which meet the condition (C# overloads
   * NumberOfRoleClasses(caexFile) and (caexFile, Predicate<XNode> condition)).
   */
  numberOfRoleClasses(caexFile: CAEXFileType, condition?: ((node: XNode) => boolean) | null): number {
    if (condition === undefined) {
      return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'RoleClass'))).count();
    }
    return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'RoleClass'))).count((n) => condition!(n));
  }

  /** Counts all role class references (RoleRequirements and SupportedRoleClass elements). */
  numberOfRoleClassReferences(caexFile: CAEXFileType): number {
    return (
      from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'RoleRequirements'))).count() +
      from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'SupportedRoleClass'))).count()
    );
  }

  /**
   * Counts all SystemUnitClass elements, or those which meet the condition (C# overloads
   * NumberOfSystemUnitClasses(caexFile) and (caexFile, Predicate<XNode> condition)).
   */
  numberOfSystemUnitClasses(caexFile: CAEXFileType, condition?: ((node: XNode) => boolean) | null): number {
    if (condition === undefined) {
      return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'SystemUnitClass'))).count();
    }
    return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'SystemUnitClass'))).count((n) => condition!(n));
  }

  /** Counts all system unit class references with a value. */
  numberOfSystemUnitClassReferences(caexFile: CAEXFileType): number {
    // Aml.Engine: counts elements named RefBaseSystemUnitPath; in CAEX it is an XML attribute, so
    // the count is 0 for valid documents.
    return from(caexFile.node!.descendants(XmlCAEXSchema.xName(caexFile.node, 'RefBaseSystemUnitPath'))).count(
      (a) => !isNullOrEmpty(a.value),
    );
  }
}

registerInterfaces(CAEXFileStatisticService, 'IStatistic', 'IAMLService');
