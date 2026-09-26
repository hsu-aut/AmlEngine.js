// Port of Aml.Engine.CAEX.Extensions.CAEXPathBuilder (Aml.Engine 4.5.2).
//
// All string operations follow the .NET semantics used by the original: ordinal IndexOf,
// Replace, Split and Trim, exceptions of String.Remove/Substring and of array and list indexers.
// The path scanners work on UTF-16 code units like the C# char loops.

import { XElement, XName } from '../../../xml/index.js';
import { ArgumentException, ArgumentNullException, ArgumentOutOfRangeException, IndexOutOfRangeException } from '../../../system/exceptions.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../../../system/strings.js';
import { cultureEndsWith as compareInfoIsSuffix, cultureStartsWith as compareInfoIsPrefix } from '../../../system/CompareInfo.js';
import { from } from '../../../system/linq.js';
import { CAEXDocument_CAEXSchema } from '../CAEXDocument.js';
import { XmlCAEXSchema } from '../../xmlext/XmlCAEXSchema.js';
import { XmlCAEXAttributes } from '../../xmlext/XmlCAEXAttributes.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { StringExtensions } from './StringExtensions.js';
import { CAEXDocumentExtensions } from './CAEXDocumentExtensions.js';
import type { CAEXDocument } from '../CAEXDocument.js';
import type { CAEXObject } from '../CAEXObject.js';
import type { CAEXFileType } from '../CAEXFileType.js';
import type { ExternalReferenceType } from '../ExternalReferenceType.js';
import type { SystemUnitClassType } from '../SystemUnitClassType.js';
import type { InterfaceClassType } from '../InterfaceClassType.js';

/** Enumeration type specifying possible ID reference types ([Flags]). */
export enum CAEXPathBuilder_IDRefEnum {
  /** ID reference to an attribute */
  AttributeReference = 1,
  /** ID reference to an interface */
  InterfaceReference = 4,
  /** ID reference to an internal element */
  InternalElementReference = 8,
  /** all possible references */
  AllTypes = 0xd,
}

/** Static class supporting the generation and analysis of CAEXPath's. */
export class CAEXPathBuilder {
  private constructor() {}

  /** Enumeration type specifying possible ID reference types. */
  static readonly IDRefEnum = CAEXPathBuilder_IDRefEnum;

  /** The alias separator used after Alias */
  static readonly AliasSeparator = '@';

  /** The separator, used after a document path to reference into the document with a CAEXPath */
  static readonly DocumentFragmentSeparator = '#';

  /** The attribute separator used before attribute hierarchies (not used since CAEX 3.0). */
  static readonly AttributeSeparator = '.';

  /** The interface separator used before an interface (not used since CAEX 3.0). */
  static readonly InterfaceSeparator = ':';

  /** The object separator used between object hierarchies */
  static readonly ObjectSeparator = '/';

  /** The beginning of a path part, used if the object name contains a Path Separator */
  static readonly PathPartBegin = '[';

  /** The escaped PathPartBegin, used in an object name, if it contains this character */
  static readonly PathPartBeginInName = '\\[';

  /** The end of a path part, used if the object name contains a Path Separator */
  static readonly PathPartEnd = ']';

  /** The escaped PathPartEnd, used in an object name, if it contains this character */
  static readonly PathPartEndInName = '\\]';

  private static readonly pathPartBeginChar = '[';

  /** The end of a path part, used if the object name contains a Path Separator */
  private static readonly pathPartEndChar = ']';

  private static readonly pathPartDelimiters: string[] = ['[', ']'];

  private static readonly separatorChars2_15: string[] = ['@', ':', '.', '/'];

  private static readonly separatorChars3_0: string[] = ['@', '/'];

  /** The Path to a CAEX object if it is located in an external document. */
  static externalPath(caexObject: CAEXObject, alias: string | null): string {
    return `${alias ?? ''}@${caexObject.caexPath() ?? ''}`;
  }

  /**
   * Gets the alias name from a reference. If the reference is not a reference with an alias,
   * the return value is the empty string.
   */
  static aliasFromReference(classReference: string | null, schema: CAEXDocument_CAEXSchema = CAEXDocument_CAEXSchema.Unknown): string {
    void schema;
    if (isNullOrWhiteSpace(classReference)) {
      return '';
    }
    const ref = classReference as string;
    const num = ref.indexOf('@');
    if (num >= 1 && num !== ref.length - 1) {
      return ref.substring(0, num);
    }
    return '';
  }

  /** Builds the Reference-Path which includes all Names of CAEXObjects in the given list of CAEX objects. */
  static caexPath(elements: Iterable<CAEXObject>): string;
  /** Builds the Reference-Path which includes all Names of CAEXObjects in the given list of elements. */
  static caexPath(elementNodes: Iterable<XElement>): string;
  /** Builds the Reference-Path which includes all names of CAEX objects in the given name array. */
  static caexPath(names: (string | null)[], schema: CAEXDocument_CAEXSchema): string;
  static caexPath(...args: unknown[]): string {
    if (args.length >= 2) {
      return CAEXPathBuilder.caexPathOfNames(args[0] as string[], args[1] as CAEXDocument_CAEXSchema);
    }
    const source = args[0] as Iterable<unknown>;
    const obj: unknown[] = Array.isArray(source) ? source : [...source];
    const first = obj.find((x) => x != null);
    if (first instanceof XElement) {
      return CAEXPathBuilder.caexPathOfElements(obj as XElement[]);
    }
    return CAEXPathBuilder.caexPathOfObjects(obj as CAEXObject[]);
  }

  private static caexPathOfObjects(obj: CAEXObject[]): string {
    const list = CAEXPathBuilder.pathParts(obj);
    let num = 0;
    let stringBuilder = '';
    for (const item of obj) {
      const value = CAEXPathBuilder.pathPartSeparator(item);
      if (stringBuilder.length > 0) {
        stringBuilder += value;
      }
      stringBuilder += listAt(list, num);
      num++;
    }
    return stringBuilder;
  }

  private static caexPathOfElements(obj: XElement[]): string {
    const list = CAEXPathBuilder.pathParts(obj);
    let num = 0;
    let stringBuilder = '';
    for (const item of obj) {
      if (!XmlCAEXSchema.isCAEXFile(item)) {
        if (num < list.length && isNullOrWhiteSpace(list[num])) {
          list[num] = ' ';
        }
        const value = CAEXPathBuilder.pathPartSeparator(item);
        if (stringBuilder.length > 0) {
          stringBuilder += value;
        }
        stringBuilder += listAt(list, num) ?? '';
        num++;
      }
    }
    return stringBuilder;
  }

  private static caexPathOfNames(names: (string | null)[], schema: CAEXDocument_CAEXSchema): string {
    let num = 0;
    let stringBuilder = '';
    const mapped = names.map((p) => CAEXPathBuilder.pathPartName(p, schema)) as string[];
    const flag = mapped.some((p) => p.length > 0 && p[0] === '[');
    for (let num2 = 0; num2 < mapped.length; num2++) {
      if (stringBuilder.length > 0) {
        stringBuilder += '/';
      }
      if (arrAt(mapped, num).length !== 0) {
        if (flag && mapped[num][0] !== '[') {
          mapped[num] = '[' + mapped[num] + ']';
        }
        stringBuilder += mapped[num];
        num++;
      }
    }
    return stringBuilder;
  }

  /** Determines whether the specified path can be normalized because it contains path part delimiters. */
  static canNormalize(path: string): boolean {
    if (path == null) {
      // Enumerable.Any(null, ...)
      throw new ArgumentNullException('source');
    }
    for (let i = 0; i < path.length; i++) {
      const currentChar = path[i];
      if (currentChar === CAEXPathBuilder.pathPartDelimiters[0] || currentChar === CAEXPathBuilder.pathPartDelimiters[1]) {
        return true;
      }
    }
    return false;
  }

  /** Changes the alias name in a path reference. */
  static changeAlias(caexPath: string | null, newAlias: string | null, oldAlias: string | null = null): string {
    const value = CAEXPathBuilder.removeAlias(caexPath, oldAlias);
    return `${newAlias ?? ''}@${value ?? ''}`;
  }

  /** Changes the first occurrence of the provided oldPathStart to the newPathStart. */
  static changePathStart(caexPath: string, oldPathStart: string, newPathStart: string | null): string {
    const text = csRemove(caexPath, 0, oldPathStart.length);
    return (newPathStart ?? '') + text;
  }

  /** Determines whether the specified name contains path separator chars. */
  static containsPathSeparatorChars(name: string | null, document: CAEXDocument | null): boolean {
    if (!isNullOrEmpty(name)) {
      return CAEXPathBuilder.containsPathSeparator(
        name,
        CAEXPathBuilder.separatorChars(document?.schema ?? CAEXDocument_CAEXSchema.CAEX3_0),
      );
    }
    return false;
  }

  /**
   * Checks, if the provided reference is a reference to an attribute of an ExternalInterface,
   * using the ID of an ExternalInterface. Returns the normalized ID (`result`) and whether a
   * valid ID is used (`isIdReference`). Only GUIDs are recognized.
   */
  static externalInterfaceIDInAttributeReference(
    reference: string,
    cAEXDocument: CAEXDocument | null,
  ): { result: string; isIdReference: boolean } {
    const array = CAEXPathBuilder.pathNameArray(reference, cAEXDocument?.schema ?? CAEXDocument_CAEXSchema.CAEX3_0);
    let text = '';
    if (CAEXPathBuilder.isReferenceWithAlias(reference, cAEXDocument?.schema ?? CAEXDocument_CAEXSchema.CAEX3_0) && array.length > 2) {
      text = array[1];
    } else if (array.length > 1) {
      text = array[0];
    }
    const isIdReference = !isNullOrEmpty(text) && StringExtensions.isGUID(text, true);
    return { result: StringExtensions.normalizedGUID(text), isIdReference };
  }

  /**
   * Gets the ID of the master parent instance from a reference defined in an Attribute mirror
   * object in the specified CAEX document (CAEX 3.0).
   */
  static instanceIDInAttributeReference(
    reference: string | null,
    document: CAEXDocument | null,
  ): { result: string; isAttributeReference: boolean } {
    let isAttributeReference = false;
    if (isNullOrEmpty(reference)) {
      return { result: '', isAttributeReference };
    }
    const array = CAEXPathBuilder.pathNameArrayWithSeparator(reference, CAEXDocument_CAEXSchema.CAEX3_0, true);
    if (CAEXPathBuilder.isAlias(arrAt(array, 0))) {
      const alias = trimEndChars(array[0], ['@']);
      let cAEXDocument = document;
      if (document != null) {
        const externalReferenceType: ExternalReferenceType | null = CAEXDocumentExtensions.externalReferenceFromAlias(document, alias);
        if (externalReferenceType == null) {
          return { result: '', isAttributeReference };
        }
        cAEXDocument = externalReferenceType.externalDocument ?? null;
        if (cAEXDocument == null) {
          return { result: '', isAttributeReference };
        }
      }
      if (CAEXPathBuilder.isValidAttributeReferenceID(arrAt(array, 1), cAEXDocument)) {
        isAttributeReference = true;
        return { result: array[1], isAttributeReference };
      }
    } else if (!CAEXPathBuilder.isAlias(array[0]) && CAEXPathBuilder.isValidAttributeReferenceID(array[0], document)) {
      isAttributeReference = true;
      return { result: array[0], isAttributeReference };
    }
    isAttributeReference = false;
    return { result: '', isAttributeReference };
  }

  /** Gets the InternalElement ID from a reference defined in an InternalLink object (CAEX 2.15). */
  static internalElementIDInInternalLinkReference(reference: string | null): { result: string; isInterfaceReference: boolean } {
    let isInterfaceReference = false;
    if (isNullOrEmpty(reference)) {
      return { result: '', isInterfaceReference };
    }
    if (!(isInterfaceReference = CAEXPathBuilder.isInterfaceReference(reference))) {
      return { result: '', isInterfaceReference };
    }
    const array = CAEXPathBuilder.pathNameArray(reference, CAEXDocument_CAEXSchema.CAEX2_15);
    let result = '';
    if (CAEXPathBuilder.isReferenceWithAlias(reference, CAEXDocument_CAEXSchema.CAEX2_15) && array.length === 3) {
      result = array[1];
    } else if (array.length === 2) {
      result = array[0];
    }
    return { result, isInterfaceReference };
  }

  /** Builds the reference Path for an Interface-Reference in an InternalLink. */
  static internalLinkReferencePath(systemUnitClass: SystemUnitClassType, interfaceClass: InterfaceClassType): string | null;
  /** Gets the reference path for an Interface-Reference in an InternalLink. */
  static internalLinkReferencePath(interfaceParent: XElement, externalInterface: XElement): string | null;
  static internalLinkReferencePath(
    a: SystemUnitClassType | XElement,
    b: InterfaceClassType | XElement,
  ): string | null {
    if (a instanceof XElement || b instanceof XElement) {
      return CAEXPathBuilder.internalLinkReferencePathOfNodes(a as XElement, b as XElement);
    }
    return CAEXPathBuilder.internalLinkReferencePathOfNodes((a as SystemUnitClassType).node!, (b as InterfaceClassType).node!);
  }

  private static internalLinkReferencePathOfNodes(interfaceParent: XElement, externalInterface: XElement): string | null {
    if (XmlCAEXSchema.caexSchema(externalInterface) !== CAEXDocument_CAEXSchema.CAEX2_15) {
      return XmlCAEXAttributes.caexidOfElement(externalInterface);
    }
    let text = CAEXPathBuilder.pathPart(interfaceParent, true);
    const text2 = CAEXPathBuilder.pathPart(externalInterface) as string;
    if (text2.length <= 0) {
      return (text ?? '') + ':' + text2;
    }
    if (text2[0] === '[') {
      text = '[' + (text ?? '');
    }
    if (text2[text2.length - 1] === ']' && !cultureEndsWith(text2, '\\]')) {
      text = (text ?? '') + ']';
    }
    return (text ?? '') + ':' + text2;
  }

  /** Determines whether the specified part of a path is an alias. */
  static isAlias(pathPart: string | null): boolean {
    if (!isNullOrEmpty(pathPart)) {
      return pathPart[pathPart.length - 1] === '@';
    }
    return false;
  }

  /**
   * Determines, if the path is an Attribute reference. This method is able to distinguish if a
   * UUID is combined with a CAEX path (CAEX 3.0).
   */
  static isAttributeReference(document: CAEXDocument | null, attributeReference: string | null): boolean {
    if (isNullOrEmpty(attributeReference)) {
      return false;
    }
    const array = CAEXPathBuilder.pathNameArrayWithSeparator(attributeReference, CAEXDocument_CAEXSchema.CAEX3_0, true);
    return CAEXPathBuilder.isValidAttributeReferenceID(
      CAEXPathBuilder.isAlias(arrAt(array, 0)) ? arrAt(array, 1) : arrAt(array, 0),
      document,
    );
  }

  /** Determines whether the specified object reference is an alias reference to an ID in the specified document. */
  static isIDReferenceWithAlias(
    objectRefrence: string | null,
    document: CAEXDocument | null,
    referenceType: CAEXPathBuilder_IDRefEnum = CAEXPathBuilder_IDRefEnum.AllTypes,
  ): boolean {
    if (isNullOrEmpty(objectRefrence)) {
      return false;
    }
    const array = CAEXPathBuilder.pathNameArrayWithSeparator(objectRefrence, document?.schema ?? CAEXDocument_CAEXSchema.CAEX3_0);
    if (!CAEXPathBuilder.isAlias(arrAt(array, 0))) {
      return false;
    }
    switch (array.length) {
      case 2:
        return true;
      case 3:
        return (referenceType & CAEXPathBuilder_IDRefEnum.InterfaceReference) !== 0
          ? CAEXPathBuilder.isInterfaceReference(csRemove(objectRefrence, 0, array[0].length)) ||
              ((referenceType & CAEXPathBuilder_IDRefEnum.AttributeReference) !== 0 &&
                CAEXPathBuilder.isAttributeReference(document, csRemove(objectRefrence, 0, array[0].length)))
          : (referenceType & CAEXPathBuilder_IDRefEnum.AttributeReference) !== 0 &&
              CAEXPathBuilder.isAttributeReference(document, csRemove(objectRefrence, 0, array[0].length));
      default:
        return false;
    }
  }

  /**
   * Determines, if the path is build using an interface separator (CAEX 2.15). This method is
   * able to distinguish if an interface separator char is used in an interface name and is escaped.
   */
  static isInterfaceReference(classReference: string | null): boolean {
    const text = CAEXPathBuilder.pathNameWithSeparator(classReference, CAEXDocument_CAEXSchema.CAEX2_15);
    if (!isNullOrEmpty(text)) {
      return text[text.length - 1] === ':';
    }
    return false;
  }

  /** Determines whether the specified classReference is an alias reference to the provided AutomationML class path. */
  static isObjectReferenceWithAlias(classReference: string | null, automationMlClassPath: string, schema: CAEXDocument_CAEXSchema): boolean {
    const text = CAEXPathBuilder.aliasFromReference(classReference, schema);
    if (!isNullOrEmpty(text)) {
      return cultureStartsWith(csRemove(classReference as string, 0, text.length + 1), automationMlClassPath);
    }
    return false;
  }

  /** Determines whether the specified reference is defined with an alias separator. */
  static isReferenceWithAlias(classReference: string | null, schema: CAEXDocument_CAEXSchema): boolean {
    if (isNullOrWhiteSpace(classReference)) {
      return false;
    }
    const text = CAEXPathBuilder.pathNameWithSeparator(classReference, schema, true);
    if (!isNullOrEmpty(text)) {
      return text[text.length - 1] === '@';
    }
    return false;
  }

  /** Determines whether the ID is valid to be used in an attribute mirror reference. */
  static isValidAttributeReferenceID(idString: string | null, document: CAEXDocument | null): boolean {
    if (document == null) {
      return false;
    }
    return CAEXPathBuilder.isValidID(idString, document);
  }

  /**
   * Determines whether the specified string can represent an ID. Only strings that can not be
   * a library name, an alias or a path are accepted.
   */
  static isValidID(idString: string | null, document: CAEXDocument | null = null): boolean {
    if (isNullOrEmpty(idString)) {
      return false;
    }
    const cAEXFileType: CAEXFileType | null = document?.caexFile ?? null;
    if (
      !idString.includes('/') &&
      !CAEXPathBuilder.isReservedLibname(idString) &&
      (cAEXFileType == null || from(cAEXFileType.node!.elements()).all((lib: XElement) => (lib.attribute('Name')?.value ?? null) !== idString))
    ) {
      if (!(cAEXFileType == null)) {
        return from<ExternalReferenceType>(cAEXFileType.externalReference).all((lib) => (lib.alias ?? '') + '@' !== idString);
      }
      return true;
    }
    return false;
  }

  /**
   * Normalization of a CAEXPath. A normalized path is freed of all path part delimiters '[' and
   * ']' in case that there is no path part name containing a path separator character.
   */
  static normalizePath(path: string | null, schema: CAEXDocument_CAEXSchema): { result: string | null; isNormalized: boolean } {
    let isNormalized = false;
    if (isNullOrWhiteSpace(path)) {
      return { result: path, isNormalized };
    }
    const p = path as string;
    if (!CAEXPathBuilder.canNormalize(p)) {
      return { result: p, isNormalized };
    }
    const array = CAEXPathBuilder.pathNameArray(p, schema, true);
    let text = p;
    if (array.some((n) => CAEXPathBuilder.containsPathSeparator(n, CAEXPathBuilder.separatorChars(schema)))) {
      return { result: p, isNormalized };
    }
    for (const text2 of array) {
      if (text2.length > 0 && text2[0] === '[') {
        const newValue = trimChars(text2, CAEXPathBuilder.pathPartDelimiters);
        text = replaceOrdinal(text, text2, newValue);
      }
    }
    isNormalized = text.length !== p.length;
    return { result: text, isNormalized };
  }

  /**
   * Returns the Path Part object names of a CAEX Path. Square brackets enclosing a path part are
   * removed unless keepPathPartBrackets is set.
   */
  static pathNameArray(path: string, schema: CAEXDocument_CAEXSchema, keepPathPartBrackets = false): string[] {
    const array: string[] = new Array<string>(path.length);
    let num = -1;
    const list: string[] = [];
    let flag = false;
    const func = schema === CAEXDocument_CAEXSchema.CAEX2_15 ? isSeparator2_15 : isSeparator3_0;
    for (let i = 0; i < path.length; i++) {
      const c = path[i];
      const num2 = num;
      if (num2 < 0) {
        if (num2 === -1 && !flag && c === '[') {
          if (keepPathPartBrackets) {
            array[++num] = c;
          }
          flag = true;
          continue;
        }
      } else if (c === '[' || c === ']') {
        if (array[num] === '\\') {
          array[num] = c;
          continue;
        }
        if (keepPathPartBrackets) {
          array[++num] = c;
        }
        flag = false;
        continue;
      }
      if (func(c)) {
        if (flag) {
          array[++num] = c;
          continue;
        }
        list.push(newString(array, num + 1));
        num = -1;
      } else {
        array[++num] = c;
      }
    }
    if (num >= 0) {
      list.push(newString(array, num + 1));
    }
    return list;
  }

  /** Returns the Path Part object names of a CAEX Path with the Separator Char at the Names End. */
  static pathNameArrayWithSeparator(path: string | null, schema: CAEXDocument_CAEXSchema, onlyAlias = false): string[] {
    return CAEXPathBuilder.pathNameListWithSeparator(path, schema, onlyAlias).slice();
  }

  /** Returns the Path Part object names of a CAEX Path with the Separator Char at the Names End. */
  static pathNameListWithSeparator(path: string | null, schema: CAEXDocument_CAEXSchema, onlyAliasSeparator = false): string[] {
    const list: string[] = [];
    if (isNullOrEmpty(path)) {
      return list;
    }
    const array: string[] = new Array<string>(path.length);
    // C#: short num, ushort loop counter (the wrap around is reproduced).
    let num = -1;
    let flag = false;
    const func = schema === CAEXDocument_CAEXSchema.CAEX2_15 ? isSeparator2_15 : isSeparator3_0;
    // Paths longer than 65535 characters: the counter wraps and the loop reads the path again
    // from the start. Each pass depends only on the state at its start; once that state repeats,
    // the original loops forever. The port throws then.
    const passes = path.length > 0xffff ? new Set<string>() : null;
    for (let num2 = 0; num2 < path.length; num2 = (num2 + 1) & 0xffff) {
      if (num2 === 0 && passes !== null) {
        const state = `${num}|${flag}|${num >= 0 ? array.slice(0, num + 1).join('') : ''}`;
        if (passes.has(state)) {
          throw new ArgumentException(`The path has ${path.length} characters; Aml.Engine does not return for paths longer than 65535 characters.`, 'path');
        }
        passes.add(state);
      }
      const c = path[num2];
      const num3 = num;
      if (num3 < 0) {
        if (num3 === -1 && !flag && c === '[') {
          flag = true;
          continue;
        }
      } else if (c === '[' || c === ']') {
        if (charArrayGet(array, num) === '\\') {
          charArraySet(array, num, c);
        } else {
          flag = false;
        }
        continue;
      }
      if (func(c)) {
        if (flag) {
          num = toShort(num + 1);
          charArraySet(array, num, c);
        } else if (onlyAliasSeparator && c !== '@') {
          list.push(newString(array, num + 1));
          num = -1;
        } else if (num >= 0) {
          num = toShort(num + 1);
          charArraySet(array, num, c);
          list.push(newString(array, num + 1));
          num = -1;
        }
      } else {
        num = toShort(num + 1);
        charArraySet(array, num, c);
      }
    }
    if (num >= 0) {
      list.push(newString(array, num + 1));
    }
    return list;
  }

  /**
   * Builds the Path Part for a CAEX object (or its XML node) from its name (alias for an
   * ExternalReference) or, with useId, from its ID. Names containing path separators are
   * enclosed in square brackets; brackets in names are escaped with '\'.
   */
  static pathPart(element: CAEXObject | XElement, useId = false): string | null {
    if (!(element instanceof XElement)) {
      return CAEXPathBuilder.pathPartOfNode(element.node!, useId);
    }
    return CAEXPathBuilder.pathPartOfNode(element, useId);
  }

  private static pathPartOfNode(element: XElement, useId: boolean): string | null {
    if (!useId) {
      if (!XmlCAEXSchema.isExternalReference(element)) {
        return CAEXPathBuilder.pathPartName(element.attribute('Name')?.value ?? '', XmlCAEXSchema.caexSchema(element));
      }
      return CAEXPathBuilder.pathPartName(element.attribute('Alias')?.value ?? '', XmlCAEXSchema.caexSchema(element));
    }
    let text: string | null = element.attribute('ID')?.value ?? null;
    if (isNullOrEmpty(text)) {
      element.setAttributeValue('ID', ServiceLocator.idService!.generateNewID());
    } else if (text[0] === '{') {
      element.setAttributeValue('ID', (text = trimChars(text, ['{', '}'])));
    }
    return text;
  }

  /**
   * Transforms a name to a path Part (special characters are escaped). Since CAEX 3.0 the path
   * separator characters '.' and ':' are eliminated.
   */
  static pathPartName(name: string | null, schema: CAEXDocument_CAEXSchema): string | null {
    if (isNullOrWhiteSpace(name)) {
      return name;
    }
    let n = name as string;
    if (indexOfAny(n, CAEXPathBuilder.pathPartDelimiters) >= 0) {
      n = replaceOrdinal(replaceOrdinal(n, '[', '\\['), ']', '\\]');
    }
    if (indexOfAny(n, CAEXPathBuilder.separatorChars(schema)) < 0) {
      return n;
    }
    return '[' + n + ']';
  }

  /** Returns the Path Part object names of a CAEX Path (see pathNameArray). */
  static pathPartObjectNames(path: string, schema: CAEXDocument_CAEXSchema, keepPathPartBrackets = false): Iterable<string> {
    return CAEXPathBuilder.pathNameArray(path, schema, keepPathPartBrackets);
  }

  /** Returns the Path Part object names of a CAEX Path with the Separator Char at the Names End. */
  static pathPartObjectNamesWithSeparator(path: string | null, schema: CAEXDocument_CAEXSchema, onlyAlias = false): Iterable<string> {
    return CAEXPathBuilder.pathNameArrayWithSeparator(path, schema, onlyAlias);
  }

  /**
   * Returns the Path part separator for an element, which should be put before that element in
   * a Path. Since CAEX 3.0 it is always the ObjectSeparator.
   */
  static pathPartSeparator(element: CAEXObject | XElement): string {
    if (!(element instanceof XElement)) {
      return CAEXPathBuilder.pathPartSeparatorOfNode(element.node!);
    }
    return CAEXPathBuilder.pathPartSeparatorOfNode(element);
  }

  private static pathPartSeparatorOfNode(element: XElement): string {
    if (XmlCAEXSchema.caexSchema(element) !== CAEXDocument_CAEXSchema.CAEX2_15) {
      return '/';
    }
    let result: string;
    if (element.name === XName.get('Attribute')) {
      result = '.';
    } else {
      let c: string;
      if (element.name !== XName.get('ExternalInterface')) {
        c = '/';
      } else {
        let flag: boolean;
        switch (element.parent?.name.localName) {
          case 'InternalElement':
          case 'SystemUnitClass':
          case 'RoleClass':
            flag = true;
            break;
          default:
            flag = false;
            break;
        }
        c = flag ? ':' : '/';
      }
      result = c;
    }
    return result;
  }

  /** Removes the alias from the provided path if the path is a reference with an alias. */
  static removeAlias(path: string | null, alias: string | null = null): string | null {
    if (alias == null) {
      alias = CAEXPathBuilder.aliasFromReference(path, CAEXDocument_CAEXSchema.CAEX2_15);
    }
    if (!isNullOrEmpty(alias)) {
      return csRemove(path as string, 0, alias.length + 1);
    }
    return path;
  }

  /** Gets the defined Separator characters according to the provided schema version. */
  static separatorChars(schema: CAEXDocument_CAEXSchema): string[] {
    if (schema !== CAEXDocument_CAEXSchema.CAEX2_15) {
      return CAEXPathBuilder.separatorChars3_0;
    }
    return CAEXPathBuilder.separatorChars2_15;
  }

  /**
   * Gets the Attribute Path from a reference defined in a mirror Attribute object in the
   * specified CAEX document (CAEX 3.0). Internal in C#.
   */
  static attributePathInAttributeReference(
    reference: string | null,
    document: CAEXDocument | null,
  ): { result: string[]; isAttributeReference: boolean } {
    let isAttributeReference = false;
    if (isNullOrEmpty(reference)) {
      return { result: [], isAttributeReference };
    }
    const array = CAEXPathBuilder.pathNameArrayWithSeparator(reference, CAEXDocument_CAEXSchema.CAEX3_0, true);
    isAttributeReference = true;
    if (CAEXPathBuilder.isAlias(arrAt(array, 0)) && CAEXPathBuilder.isValidAttributeReferenceID(arrAt(array, 1), document)) {
      return { result: array.slice(2), isAttributeReference };
    }
    if (CAEXPathBuilder.isValidAttributeReferenceID(array[0], document)) {
      return { result: array.slice(1), isAttributeReference };
    }
    isAttributeReference = false;
    return { result: [], isAttributeReference };
  }

  /** Gets the ExternalInterface Name from a reference defined in an InternalLink object (CAEX 2.15). Internal in C#. */
  static externalInterfaceNameInInternalLinkReference(reference: string | null): { result: string; isInterfaceReference: boolean } {
    let isInterfaceReference = false;
    if (isNullOrEmpty(reference)) {
      return { result: '', isInterfaceReference };
    }
    if (!(isInterfaceReference = CAEXPathBuilder.isInterfaceReference(reference))) {
      return { result: '', isInterfaceReference };
    }
    const names = CAEXPathBuilder.pathNameArray(reference, CAEXDocument_CAEXSchema.CAEX2_15);
    return { result: arrAt(names, names.length - 1), isInterfaceReference };
  }

  /** Joins attribute path parts ('.' for CAEX 2.15, '/' otherwise); null for no parts. Internal in C#. */
  static makeAttributePath(parts: Iterable<string | null>, schema: CAEXDocument_CAEXSchema): string | null {
    const array = [...parts];
    if (array.length === 0) {
      return null;
    }
    return array.map((p) => p ?? '').join(schema === CAEXDocument_CAEXSchema.CAEX2_15 ? '.' : '/');
  }

  private static containsPathSeparator(name: string, separatorChars: string[]): boolean {
    return indexOfAny(name, separatorChars) >= 0;
  }

  private static isReservedLibname(idString: string): boolean {
    switch (idString) {
      case 'AutomationMLBaseAttributeTypeLib':
      case 'AutomationMLBaseRoleClassLib':
      case 'AutomationMLInterfaceClassLib':
        return true;
      default:
        return false;
    }
  }

  private static pathNameWithSeparator(path: string | null, schema: CAEXDocument_CAEXSchema, onlyAlias = false): string {
    if (isNullOrEmpty(path)) {
      return '';
    }
    const array: string[] = new Array<string>(path.length);
    let num = -1;
    let flag = false;
    const func = schema === CAEXDocument_CAEXSchema.CAEX2_15 ? isSeparator2_15 : isSeparator3_0;
    for (let i = 0; i < path.length; i++) {
      const c = path[i];
      const num2 = num;
      if (num2 < 0) {
        if (num2 === -1 && !flag && c === '[') {
          flag = true;
          continue;
        }
      } else if (c === '[' || c === ']') {
        if (array[num] === '\\') {
          array[num] = c;
        } else {
          flag = false;
        }
        continue;
      }
      if (func(c)) {
        if (flag) {
          array[++num] = c;
          continue;
        }
        if (onlyAlias && c !== '@') {
          return newString(array, num + 1);
        }
        if (num >= 0) {
          array[++num] = c;
          return newString(array, num + 1);
        }
      } else {
        array[++num] = c;
      }
    }
    if (num < 0) {
      return '';
    }
    return newString(array, num + 1);
  }

  /** PathParts(IEnumerable&lt;CAEXObject&gt;) and PathParts(IEnumerable&lt;XElement&gt;). */
  private static pathParts(elements: CAEXObject[] | XElement[]): string[] {
    const first = (elements as unknown[]).find((x) => x != null);
    if (first instanceof XElement) {
      return CAEXPathBuilder.pathPartsOfNodes(elements as XElement[]);
    }
    return CAEXPathBuilder.pathPartsOfObjects(elements as CAEXObject[]);
  }

  private static pathPartsOfObjects(elements: CAEXObject[]): string[] {
    const list: string[] = [];
    let flag = false;
    for (const element of elements) {
      const text = CAEXPathBuilder.pathPart(element);
      if (!isNullOrEmpty(text)) {
        list.push(text);
        if (text[0] === '[') {
          flag = true;
        }
      }
    }
    if (!flag) {
      return list;
    }
    for (let i = 0; i < list.length; i++) {
      if (charAt(list[i], 0) !== '[') {
        list[i] = '[' + list[i];
      }
      const text2 = list[i];
      if (charAt(text2, text2.length - 1) !== ']') {
        list[i] += ']';
      }
    }
    return list;
  }

  private static pathPartsOfNodes(elements: XElement[]): string[] {
    const list: string[] = [];
    let flag = false;
    for (const element of elements) {
      if (!XmlCAEXSchema.isCAEXFile(element)) {
        const text = CAEXPathBuilder.pathPart(element) as string;
        list.push(text);
        if (!isNullOrWhiteSpace(text) && text[0] === '[') {
          flag = true;
        }
      }
    }
    if (!flag) {
      return list;
    }
    for (let i = 0; i < list.length; i++) {
      if (charAt(list[i], 0) !== '[') {
        list[i] = '[' + list[i];
      }
      const text2 = list[i];
      if (charAt(text2, text2.length - 1) !== ']') {
        list[i] += ']';
      }
    }
    return list;
  }
}

// ---- private helpers (C# semantics) -----------------------------------------------------------

/** Determines whether the specified part character is a separator (CAEX 2.15). */
function isSeparator2_15(partChar: string): boolean {
  switch (partChar) {
    case '.':
    case '/':
    case ':':
    case '@':
      return true;
    default:
      return false;
  }
}

/** Determines whether the specified part character is a separator (CAEX 3.0). */
function isSeparator3_0(partChar: string): boolean {
  if (partChar === '/' || partChar === '@') {
    return true;
  }
  return false;
}

/** new string(char[] value, 0, length) */
function newString(array: string[], length: number): string {
  if (length < 0 || length > array.length) throw new ArgumentOutOfRangeException('length');
  let s = '';
  for (let i = 0; i < length; i++) s += array[i] ?? '\0';
  return s;
}

/** C# short arithmetic (wraps at 16 bits). */
function toShort(v: number): number {
  return (v << 16) >> 16;
}

function charArrayGet(array: string[], index: number): string {
  if (index < 0 || index >= array.length) throw new IndexOutOfRangeException();
  return array[index] ?? '\0';
}

function charArraySet(array: string[], index: number, c: string): void {
  if (index < 0 || index >= array.length) throw new IndexOutOfRangeException();
  array[index] = c;
}

/** string indexer: throws IndexOutOfRangeException outside the string. */
function charAt(s: string, index: number): string {
  if (index < 0 || index >= s.length) throw new IndexOutOfRangeException();
  return s[index];
}

/** array indexer: throws IndexOutOfRangeException outside the array. */
function arrAt<E>(array: E[], index: number): E {
  if (index < 0 || index >= array.length) throw new IndexOutOfRangeException();
  return array[index];
}

/** List&lt;T&gt; indexer. */
function listAt<E>(list: E[], index: number): E {
  if (index < 0 || index >= list.length) {
    throw new ArgumentOutOfRangeException('index', 'Index was out of range. Must be non-negative and less than the size of the collection.');
  }
  return list[index];
}

/** string.Remove(startIndex, count). */
function csRemove(s: string, startIndex: number, count: number): string {
  if (startIndex < 0) throw new ArgumentOutOfRangeException('startIndex', 'StartIndex cannot be less than zero.');
  if (count < 0) throw new ArgumentOutOfRangeException('count', 'Count cannot be less than zero.');
  if (count > s.length - startIndex) throw new ArgumentOutOfRangeException('count', 'Index and count must refer to a location within the string.');
  return s.substring(0, startIndex) + s.substring(startIndex + count);
}

/** string.IndexOfAny(char[]). */
function indexOfAny(s: string, chars: string[]): number {
  for (let i = 0; i < s.length; i++) if (chars.includes(s[i])) return i;
  return -1;
}

/** string.Replace(string, string), ordinal. */
function replaceOrdinal(s: string, oldValue: string, newValue: string | null): string {
  if (oldValue === null) throw new ArgumentNullException('oldValue');
  if (oldValue.length === 0) throw new ArgumentException('String cannot be of zero length.', 'oldValue');
  return s.split(oldValue).join(newValue ?? '');
}

/** string.Trim(params char[]). */
function trimChars(s: string, chars: string[]): string {
  let start = 0;
  let end = s.length;
  while (start < end && chars.includes(s[start])) start++;
  while (end > start && chars.includes(s[end - 1])) end--;
  return s.substring(start, end);
}

/** string.TrimEnd(params char[]). */
function trimEndChars(s: string, chars: string[]): string {
  let end = s.length;
  while (end > 0 && chars.includes(s[end - 1])) end--;
  return s.substring(0, end);
}

/**
 * string.StartsWith(string) is culture sensitive in .NET (see src/system/CompareInfo.ts).
 */
function cultureStartsWith(s: string, value: string | null): boolean {
  if (value === null) throw new ArgumentNullException('value');
  return compareInfoIsPrefix(s, value);
}

/** string.EndsWith(string), culture sensitive in .NET (see cultureStartsWith). */
function cultureEndsWith(s: string, value: string | null): boolean {
  if (value === null) throw new ArgumentNullException('value');
  return compareInfoIsSuffix(s, value);
}
