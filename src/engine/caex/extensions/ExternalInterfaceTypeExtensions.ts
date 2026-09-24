// Port of Aml.Engine.CAEX.Extensions.ExternalInterfaceTypeExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { from, type Enumerable } from '../../../system/linq.js';
import { Parse } from '../../../system/index.js';
import { AutomationMLBaseAttributeTypeLib } from '../../amlobjects/AutomationMLBaseAttributeTypeLib.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { QueryResult } from '../../services/QueryResult.js';
import { XmlClassOperation } from '../../xmlext/XmlClassOperation.js';
import { ChangeMode } from '../ChangeMode.js';
import { InheritanceExtensions } from './InheritanceExtensions.js';
import type { AttributeType } from '../AttributeType.js';
import type { AttributeValueRequirementType } from '../AttributeValueRequirementType.js';
import type { ExternalInterfaceType } from '../ExternalInterfaceType.js';
import type { IObjectWithExternalInterface } from '../IObjectWithExternalInterface.js';
import type { InternalElementType } from '../InternalElementType.js';
import type { InternalLinkType } from '../InternalLinkType.js';
import type { SystemUnitClassType } from '../SystemUnitClassType.js';

/** int.MaxValue */
const INT_MAX = 2147483647;

/** Extension methods for ExternalInterfaces (AutomationML cardinality, category and direction). */
export class ExternalInterfaceTypeExtensions {
  private constructor() {}

  /** Determines whether the interface of a class or instance defines a Cardinality attribute. */
  static hasVerifiableCardinality(externalInterface: ExternalInterfaceType): boolean {
    if (externalInterface.associatedObject instanceof T.SystemUnitClassType) {
      return from<AttributeType>(externalInterface.attribute).firstOrDefault((a) => AutomationMLBaseAttributeTypeLib.isCardinality(a)) != null;
    }
    return false;
  }

  /** Determines whether the interface of a class or instance defines a Category attribute. */
  static hasVerifiableCategory(externalInterface: ExternalInterfaceType): boolean {
    if (externalInterface.associatedObject instanceof T.SystemUnitClassType) {
      return from<AttributeType>(externalInterface.attribute).firstOrDefault((a) => AutomationMLBaseAttributeTypeLib.isCategory(a)) != null;
    }
    return false;
  }

  /** Determines whether the interface of a class or instance defines a Direction attribute. */
  static hasVerifiableDirection(externalInterface: ExternalInterfaceType): boolean {
    if (externalInterface.associatedObject instanceof T.SystemUnitClassType) {
      return from<AttributeType>(externalInterface.attribute).firstOrDefault((a) => AutomationMLBaseAttributeTypeLib.isDirection(a)) != null;
    }
    return false;
  }

  /** Gets the allowed directions defined by the constraints of the Direction attribute. */
  static allowedDirections(externalInterface: ExternalInterfaceType): string[] {
    const attributeType = from<AttributeType>(externalInterface.attribute).firstOrDefault((a) => AutomationMLBaseAttributeTypeLib.isDirection(a));
    if (attributeType == null) {
      return [];
    }
    return from<AttributeValueRequirementType>(attributeType.constraint)
      .where((c) => c.nominalScaledType != null)
      .selectMany((c) => c.nominalScaledType.requiredValue as Iterable<string>)
      .toArray();
  }

  /** Determines whether the interface is a master (has mirrors). */
  static isMaster(externalInterface: ExternalInterfaceType): boolean {
    return ServiceLocator.queryService!.isMaster(externalInterface);
  }

  /** Determines whether the interface overrides an inherited interface. */
  static isOverridden(externalInterface: ExternalInterfaceType): boolean {
    return XmlClassOperation.isOverridden(externalInterface.node!);
  }

  /** Determines whether the interface overrides and deletes an inherited interface. */
  static isOverriddenDeleted(externalInterface: ExternalInterfaceType): boolean {
    if (XmlClassOperation.isOverridden(externalInterface.node!)) {
      return externalInterface.changeMode === ChangeMode.Delete;
    }
    return false;
  }

  /** Determines whether the interface is connected by an InternalLink. */
  static isRelated(externalInterface: ExternalInterfaceType): boolean {
    return from<InternalLinkType>(ServiceLocator.queryService!.internalLinksToInterface(externalInterface)).any();
  }

  /** Gets the values of the Category attributes. */
  static categories(externalInterface: ExternalInterfaceType): (string | null)[] {
    return from<AttributeType>(externalInterface.attribute)
      .where((a) => AutomationMLBaseAttributeTypeLib.isCategory(a))
      .select((a) => a.value)
      .toArray();
  }

  /** Gets the value of the Direction attribute. */
  static direction(externalInterface: ExternalInterfaceType): string | null {
    return from<AttributeType>(externalInterface.attribute).firstOrDefault((a) => AutomationMLBaseAttributeTypeLib.isDirection(a))?.value ?? null;
  }

  /** Gets the maximal cardinality (MaxOccur of the Cardinality attribute; 'n' and '0' mean unbounded). */
  static maxCardinality(externalInterface: ExternalInterfaceType): number | null {
    const attributeType = from<AttributeType>(externalInterface.attribute).firstOrDefault((a) => AutomationMLBaseAttributeTypeLib.isCardinality(a));
    if (attributeType == null) {
      return null;
    }
    const text = attributeType.attribute.item('MaxOccur')?.value ?? null;
    switch (text) {
      case 'n':
      case '0':
        return INT_MAX;
      case null:
        break;
      default: {
        const result = Parse.tryParseInt32(text);
        if (result !== null) {
          return result;
        }
        break;
      }
    }
    return INT_MAX;
  }

  /** Determines whether more InternalLinks are connected than the maximal cardinality allows. */
  static maxCardinalityViolation(externalInterface: ExternalInterfaceType): boolean {
    if (!ExternalInterfaceTypeExtensions.hasVerifiableCardinality(externalInterface)) {
      return false;
    }
    const num = ExternalInterfaceTypeExtensions.maxCardinality(externalInterface);
    if (num !== null) {
      return from<InternalLinkType>(QueryResult.internalLinksToInterface(externalInterface)).count() > num;
    }
    return false;
  }

  /** Gets the minimal cardinality (MinOccur of the Cardinality attribute, default 0). */
  static minCardinality(externalInterface: ExternalInterfaceType): number | null {
    const attributeType = from<AttributeType>(externalInterface.attribute).firstOrDefault((a) => AutomationMLBaseAttributeTypeLib.isCardinality(a));
    if (attributeType == null) {
      return null;
    }
    const text = attributeType.attribute.item('MinOccur')?.value ?? null;
    if (text === null) {
      return 0;
    }
    const result = Parse.tryParseInt32(text);
    return result !== null ? result : 0;
  }

  /** Determines whether fewer InternalLinks are connected than the minimal cardinality requires (not for classes). */
  static minCardinalityViolation(externalInterface: ExternalInterfaceType): boolean {
    if (!ExternalInterfaceTypeExtensions.hasVerifiableCardinality(externalInterface)) {
      return false;
    }
    const num = ExternalInterfaceTypeExtensions.minCardinality(externalInterface);
    if (num === null) {
      return false;
    }
    const num2 = from<InternalLinkType>(QueryResult.internalLinksToInterface(externalInterface)).count();
    if (!(externalInterface.associatedObject instanceof T.SystemUnitFamilyType)) {
      return num2 < num;
    }
    return false;
  }

  /**
   * Determines whether a linked interface has an incompatible direction. `requiredDirections`
   * gets the directions a partner must have.
   */
  static directionViolation(externalInterface: ExternalInterfaceType): { result: boolean; requiredDirections: string[] } {
    let requiredDirections: string[] = [];
    if (!ExternalInterfaceTypeExtensions.hasVerifiableDirection(externalInterface)) {
      return { result: false, requiredDirections };
    }
    const text = ExternalInterfaceTypeExtensions.direction(externalInterface);
    if (text === null) {
      return { result: false, requiredDirections };
    }
    if (text === 'InOut') {
      return { result: false, requiredDirections };
    }
    if (text === 'In') {
      requiredDirections = ['Out', 'InOut'];
    } else {
      requiredDirections = ['In', 'InOut'];
    }
    const isViolation = (linkInterface: ExternalInterfaceType | null, required: string[]): boolean => {
      if (T.CAEXWrapper.equals(linkInterface, externalInterface)) {
        return false;
      }
      if (
        ExternalInterfaceTypeExtensions.hasVerifiableDirection(linkInterface!) &&
        !required.includes(ExternalInterfaceTypeExtensions.direction(linkInterface!) as string)
      ) {
        return true;
      }
      return false;
    };
    const list: (ExternalInterfaceType | null)[] = [];
    for (const item of QueryResult.internalLinksToInterface(externalInterface) as Iterable<InternalLinkType>) {
      if (isViolation(item.aInterface, requiredDirections)) {
        list.push(item.aInterface);
      }
      if (isViolation(item.bInterface, requiredDirections)) {
        list.push(item.bInterface);
      }
    }
    return { result: list.length > 0, requiredDirections };
  }

  /** Determines whether a linked interface has no common category. */
  static categoryViolation(externalInterface: ExternalInterfaceType): boolean {
    if (!ExternalInterfaceTypeExtensions.hasVerifiableCategory(externalInterface)) {
      return false;
    }
    const categories = ExternalInterfaceTypeExtensions.categories(externalInterface);
    if (categories.length === 0) {
      return false;
    }
    const isViolation = (linkInterface: ExternalInterfaceType | null): boolean => {
      if (T.CAEXWrapper.equals(linkInterface, externalInterface)) {
        return false;
      }
      if (
        ExternalInterfaceTypeExtensions.hasVerifiableCategory(linkInterface!) &&
        !from(ExternalInterfaceTypeExtensions.categories(linkInterface!)).intersect(categories).any()
      ) {
        return true;
      }
      return false;
    };
    const list: (ExternalInterfaceType | null)[] = [];
    for (const item of QueryResult.internalLinksToInterface(externalInterface) as Iterable<InternalLinkType>) {
      if (isViolation(item.aInterface)) {
        list.push(item.aInterface);
      }
      if (isViolation(item.bInterface)) {
        list.push(item.bInterface);
      }
    }
    return list.length > 0;
  }

  /** Gets the interfaces derived from the provided interface class. */
  static ofInterfaceClass(objectWithExternalInterface: IObjectWithExternalInterface, interfaceClassPath: string | null): Enumerable<ExternalInterfaceType> {
    return from<ExternalInterfaceType>(objectWithExternalInterface.externalInterface).where((e) =>
      InheritanceExtensions.isDerivedFromInterfaceClass(e, interfaceClassPath),
    );
  }

  /** Gets the interfaces connected to the interface by InternalLinks. */
  static relatedExternalInterfaces(externalInterface: ExternalInterfaceType): Enumerable<ExternalInterfaceType | null> {
    return from<InternalLinkType>(ServiceLocator.queryService!.internalLinksToInterface(externalInterface)).select((il) =>
      !T.CAEXWrapper.equals(il.relatedObjects?.aInterface ?? null, externalInterface)
        ? (il.relatedObjects?.aInterface ?? null)
        : (il.relatedObjects?.bInterface ?? null),
    );
  }

  /** Gets the owners of the interfaces connected to the interface by InternalLinks. */
  static relatedInstances(externalInterface: ExternalInterfaceType): Enumerable<SystemUnitClassType | null> {
    return from<InternalLinkType>(ServiceLocator.queryService!.internalLinksToInterface(externalInterface)).select((il) =>
      !T.CAEXWrapper.equals(il.relatedObjects.aInterface, externalInterface) ? il.relatedObjects.aSystemUnitClass : il.relatedObjects.bSystemUnitClass,
    );
  }

  /** Gets the connected InternalElements with a reference to the provided role class (inheritance regarded). */
  static relatedInternalElementsWithRoleReference(externalInterface: ExternalInterfaceType, roleClassPath: string | null): Enumerable<InternalElementType> {
    return from<InternalLinkType>(ServiceLocator.queryService!.internalLinksToInterface(externalInterface))
      .select((il) =>
        !T.CAEXWrapper.equals(il.relatedObjects.aInterface, externalInterface) ? il.relatedObjects.aSystemUnitClass : il.relatedObjects.bSystemUnitClass,
      )
      .ofType<InternalElementType>((x: unknown): x is InternalElementType => x instanceof T.InternalElementType)
      .where((ie) => ie.hasRoleClassReference(roleClassPath, true));
  }
}
