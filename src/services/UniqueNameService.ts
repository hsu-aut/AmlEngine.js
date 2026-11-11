// Port of Aml.Engine.Services.UniqueNameService (Aml.Engine.Services 4.3.1).

import '../engine/index.js';
import { registerInterfaces } from '../engine/interfaces.js';
import { CAEXTypeDictionary } from '../engine/caex/CAEXTypeDictionary.js';
import { CAEX_CLASSModel_TagNames } from '../engine/caex/CAEX_CLASSModel_TagNames.js';
import { ServiceLocator } from '../engine/services/ServiceLocator.js';
import { XmlCAEXAttributes } from '../engine/xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../engine/xmlext/XmlCAEXSchema.js';
import { AggregateException, ArgumentNullException, parseInt32 } from '../system/index.js';
import { Dictionary, from } from '../system/linq.js';
import { isNullOrEmpty } from '../system/strings.js';
import { XElement } from '../xml/index.js';
import type { IUniqueName } from '../engine/services/interfaces/IUniqueName.js';

/** `s.TrimEnd('0', ..., '9')`. */
function trimEndDigits(s: string): string {
  return s.replace(/[0-9]+$/, '');
}

/**
 * Unique name service. The names of CAEX objects in a sequence of elements should all be unique.
 * If a unique name service is registered, the engine calls it for a unique name whenever a new
 * element is added to a sequence which requires unique names for its members. The generated name
 * is the default name for the element followed by a number.
 */
export class UniqueNameService implements IUniqueName {
  private readonly _defaultNames = new Dictionary<string, string>();

  private _isSuspended = false;

  private constructor() {
    for (const item of from(CAEXTypeDictionary.instance).select(([, type]) => CAEX_CLASSModel_TagNames.tagName(type))) {
      this._defaultNames.setItem(item, item);
    }
  }

  /** Registers a new instance with the ServiceLocator of the engine. */
  static register(): IUniqueName {
    const uniqueNameService = new UniqueNameService();
    ServiceLocator.register(uniqueNameService, 'IUniqueName');
    return uniqueNameService;
  }

  /** Unregisters the registered unique name service. */
  static unRegister(): void {
    ServiceLocator.unRegister('IUniqueName');
  }

  /**
   * Determines whether the element has a name that is unique in the sequence of equal elements of
   * its parent.
   */
  isUniqueCAEXName(element: XElement): boolean {
    if (element.parent === null) {
      return true;
    }
    const att = element.attribute('Name');
    const name = att!.value;
    return (
      from(UniqueNameService.elementCollectionWithUniqueName(element))
        .select((e) => e.attribute('Name'))
        .firstOrDefault((e) => e!.value === name && e !== att) === null
    );
  }

  private static elementCollectionWithUniqueName(caexNode: XElement): Iterable<XElement> {
    if (caexNode.parent === null) {
      return [];
    }
    if (XmlCAEXSchema.isCAEXClass(caexNode.parent, true)) {
      if (XmlCAEXSchema.isAttributeOrType(caexNode)) {
        return from(caexNode.parent.elements(caexNode.parent.name)).concat(caexNode.parent.elements(caexNode.name));
      }
      if (XmlCAEXSchema.isCAEXClass(caexNode, true)) {
        return from(caexNode.parent.elements(XmlCAEXSchema.xName(caexNode, 'Attribute'))).concat(caexNode.parent.elements(caexNode.name));
      }
    }
    return caexNode.parent.elements(caexNode.name);
  }

  /** Registers the default name for all CAEX objects with the element name. */
  registerDefault(elementName: string, defaultName: string): void {
    this._defaultNames.setItem(elementName, defaultName);
  }

  /** Resumes the unique name service. */
  resume(): void {
    this._isSuspended = false;
  }

  /** Suspends the unique name service. */
  suspend(): void {
    this._isSuspended = true;
  }

  /**
   * Creates a unique CAEX name for a child with the tag name in the sequence: the default name
   * (registered for the tag name, or the given one) extended by a number above the highest number
   * in use. C# overloads UniqueCAEXName(XElement sequence, elementTagName),
   * (XElement sequence, elementTagName, defaultName) and
   * (IEnumerable<XElement> sequence, elementTagName, defaultName); a null sequence takes an XElement
   * overload.
   * @throws ArgumentNullException elementTagName
   */
  uniqueCAEXName(sequence: XElement | Iterable<XElement> | null, elementTagName: string, defaultName?: string | null): string {
    if (defaultName === undefined) {
      return this.uniqueCAEXNameOfElement(sequence as XElement | null, elementTagName);
    }
    if (sequence === null || sequence instanceof XElement) {
      return this.uniqueCAEXNameOfElementWithDefault(sequence, elementTagName, defaultName);
    }
    return this.uniqueCAEXNameOfSequence(sequence, elementTagName, defaultName);
  }

  /** UniqueCAEXName(XElement sequence, string elementTagName). */
  private uniqueCAEXNameOfElement(sequence: XElement | null, elementTagName: string): string {
    if (this._isSuspended) {
      return elementTagName;
    }
    if (isNullOrEmpty(elementTagName)) {
      throw new ArgumentNullException('elementTagName');
    }
    let value = this._defaultNames.tryGetValue(elementTagName).value;
    if (isNullOrEmpty(value)) {
      value = elementTagName;
    }
    return this.uniqueCAEXNameOfElementWithDefault(sequence, elementTagName, value);
  }

  /** UniqueCAEXName(XElement sequence, string elementTagName, string defaultName). */
  private uniqueCAEXNameOfElementWithDefault(sequence: XElement | null, elementTagName: string, defaultName: string | null): string {
    if (isNullOrEmpty(defaultName)) {
      defaultName = elementTagName;
    }
    if (this._isSuspended) {
      return defaultName;
    }
    if (sequence === null) {
      return defaultName;
    }
    const xName = XmlCAEXSchema.xName(sequence, elementTagName);
    if (xName === null) {
      return defaultName;
    }
    if (sequence.element(xName) === null) {
      return defaultName;
    }
    let first: Iterable<XElement> = [];
    if (XmlCAEXSchema.isCAEXClass(sequence, true)) {
      if (elementTagName === 'Attribute') {
        first = sequence.elements(sequence.name);
      } else if (xName === sequence.name) {
        first = sequence.elements(XmlCAEXSchema.xName(sequence, 'Attribute'));
      }
    }
    first = from(first).concat(sequence.elements(xName));
    return this.uniqueCAEXNameOfSequence(first, elementTagName, defaultName);
  }

  /**
   * UniqueCAEXName(IEnumerable<XElement> sequence, string elementTagName, string defaultName). C#
   * computes the highest number with PLINQ; the port runs the same query sequentially (the maximum
   * and the uniqueness flag do not depend on the order) and wraps an exception of the query in an
   * AggregateException, as PLINQ does.
   */
  private uniqueCAEXNameOfSequence(sequence: Iterable<XElement>, elementTagName: string, defaultName: string | null): string {
    if (this._isSuspended) {
      return defaultName as string;
    }
    if (isNullOrEmpty(elementTagName)) {
      throw new ArgumentNullException('elementTagName');
    }
    if (isNullOrEmpty(defaultName)) {
      defaultName = elementTagName;
    }
    const list = from(sequence).toList();
    if (list.length === 0) {
      return defaultName;
    }
    const strippedDefaultName = trimEndDigits(defaultName);
    let isUnique = true;
    let num: number;
    try {
      num = from(list).max((element: XElement) => {
        let text: string;
        if ((text = XmlCAEXAttributes.caexNameOfElement(element)) === defaultName) {
          isUnique = false;
        }
        const text2 = trimEndDigits(text);
        if (text2 !== strippedDefaultName) {
          return 0;
        }
        let result = 0;
        const text3 = text.substring(text2.length);
        if (text3.length > 0) {
          result = parseInt32(text3);
        }
        return result;
      });
    } catch (e) {
      throw new AggregateException(e);
    }
    if (!isUnique) {
      // int addition in C# (unchecked): int.MaxValue + 1 wraps around.
      return strippedDefaultName + ((num + 1) | 0);
    }
    return defaultName;
  }
}

registerInterfaces(UniqueNameService as unknown as abstract new () => unknown, 'IUniqueName', 'IAMLService', 'ISuspendable');
