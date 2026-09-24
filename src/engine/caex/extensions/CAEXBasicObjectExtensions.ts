// Port of Aml.Engine.CAEX.Extensions.CAEXBasicObjectExtensions (Aml.Engine 4.5.2).
//
// Generic methods whose type parameter matters at run time take the class constructor as an
// additional parameter (see docs/PORTING.md). XLinq axis results handed to a CAEXEnumerable are
// wrapped so that they can be enumerated repeatedly, like the deferred IEnumerable of .NET.

import { T } from '../../registry.js';
import { implementsInterface } from '../../interfaces.js';
import { ArgumentException, ArgumentNullException } from '../../../system/exceptions.js';
import { Enumerable, HashSet, from } from '../../../system/linq.js';
import type { XElement } from '../../../xml/index.js';
import { CAEX_CLASSModel_TagNames } from '../CAEX_CLASSModel_TagNames.js';
import { XmlCAEXSchema } from '../../xmlext/XmlCAEXSchema.js';
import { XmlOperation } from '../../xmlext/XmlOperation.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { AmlObjectsExtensions } from '../../amlobjects/extensions/AmlObjectsExtensions.js';
import { AMLEditionEnumExtension } from '../../services/model/AMLEditionEnumExtension.js';
import { CAEXDocumentExtensions } from './CAEXDocumentExtensions.js';
import type { AMLSchemaManager } from '../../schema/AMLSchemaManager.js';
import type { CAEXBasicObject } from '../CAEXBasicObject.js';
import type { CAEXDocument, CAEXDocument_CAEXSchema } from '../CAEXDocument.js';
import type { CAEXFileType } from '../CAEXFileType.js';
import type { CAEXObject } from '../CAEXObject.js';
import type { CAEXWrapper } from '../CAEXWrapper.js';
import type { CopyrightType } from '../CopyrightType.js';
import type { DescriptionType } from '../DescriptionType.js';
import type { ICAEXBasicObject } from '../ICAEXBasicObject.js';
import type { ICAEXLibrary } from '../ICAEXLibrary.js';
import type { ICAEXWrapper } from '../ICAEXWrapper.js';
import type { RevisionType } from '../RevisionType.js';
import type { VersionType } from '../VersionType.js';
import type { ICAEXReference } from '../../services/interfaces/ICAEXReference.js';

type Ctor<R = unknown> = abstract new (...args: never[]) => R;

/** Extension methods for CAEX objects. */
export class CAEXBasicObjectExtensions {
  private constructor() {}

  /** Gets all libraries, referenced by the CAEX object or any of its descendants (by path or by ID). */
  static allLibraryReferences(caexObject: CAEXBasicObject): ICAEXLibrary[] {
    const lookup = ServiceLocator.queryService!.allElementsWithCAEXPathReference(caexObject, '', true) as Iterable<
      Iterable<ICAEXReference> & { key: string }
    >;
    const hashSet = new HashSet<ICAEXLibrary>();
    for (const item3 of lookup) {
      const found = CAEXDocumentExtensions.findByPath(CAEXBasicObjectExtensions.caexDocument(caexObject), item3.key);
      const item = found == null ? null : CAEXBasicObjectExtensions.library(found);
      if (implementsInterface(item, 'ICAEXLibrary')) {
        hashSet.add(item as unknown as ICAEXLibrary);
      }
    }
    const lookup2 = ServiceLocator.queryService!.allElementsWithIDReference(caexObject) as Iterable<Iterable<ICAEXReference> & { key: string }>;
    for (const item4 of lookup2) {
      const found = CAEXDocumentExtensions.findByID(CAEXBasicObjectExtensions.caexDocument(caexObject), item4.key);
      const item2 = found == null ? null : CAEXBasicObjectExtensions.library(found);
      if (implementsInterface(item2, 'ICAEXLibrary')) {
        hashSet.add(item2 as unknown as ICAEXLibrary);
      }
    }
    return [...hashSet];
  }

  /** Gets the AML schema manager of the document of the CAEX object (or of its node). */
  static amlSchemaManager(caexObject: ICAEXWrapper): AMLSchemaManager {
    if (caexObject != null) {
      if (CAEXBasicObjectExtensions.caexDocument(caexObject) == null) {
        return XmlCAEXSchema.schemaManager(caexObject.node!);
      }
      return CAEXBasicObjectExtensions.caexDocument(caexObject)!.schemaManager;
    }
    throw new ArgumentNullException('caexObject');
  }

  /**
   * Gets the ancestors of the CAEX object. With a type (C# Ancestors&lt;T&gt;), only the ancestors
   * with the CAEX tag of that type.
   */
  static ancestors<W extends CAEXWrapper>(caexObject: ICAEXWrapper, includeSelf: boolean, type: Ctor<W>): Iterable<W>;
  static ancestors<W extends CAEXWrapper>(caexObject: ICAEXWrapper, type: Ctor<W>): Iterable<W>;
  static ancestors(caexObject: ICAEXWrapper, includeSelf?: boolean): Iterable<CAEXBasicObject>;
  static ancestors(caexObject: ICAEXWrapper, ...args: unknown[]): Iterable<unknown> {
    const { flag: includeSelf, type } = boolAndType(args, false);
    if (type != null) {
      if (caexObject == null) {
        throw new ArgumentNullException('caexObject');
      }
      const xName = (caexObject as unknown as CAEXWrapper).xName(CAEX_CLASSModel_TagNames.tagName(type));
      if (!(xName == null)) {
        const node = caexObject.node;
        if (!includeSelf) {
          return new T.CAEXEnumerable(axis(node, (n) => n.ancestors(xName)), type);
        }
        return new T.CAEXEnumerable(axis(node, (n) => n.ancestorsAndSelf(xName)), type);
      }
      throw new ArgumentException("The provided type hasn't an identifiable CAEX element");
    }
    if (caexObject != null) {
      const node = caexObject.node;
      return includeSelf
        ? new T.CAEXEnumerable<CAEXBasicObject>(axis(node, (n) => n.ancestorsAndSelf()), T.CAEXBasicObject)
        : new T.CAEXEnumerable<CAEXBasicObject>(axis(node, (n) => n.ancestors()), T.CAEXBasicObject);
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Determines whether the object has revisions describing an old version. */
  static hasOldVersion(caexObject: CAEXBasicObject): boolean {
    if (caexObject.revision.exists) {
      return from<RevisionType>(caexObject.revision).any((r) => r.isNewVersion);
    }
    return false;
  }

  /** Determines whether the library is an extended version of another library. */
  static isExtendedVersion(caexLibrary: ICAEXLibrary): boolean {
    if (caexLibrary.revision.exists) {
      return from<RevisionType>(caexLibrary.revision).any((r) => r.isExtension);
    }
    return false;
  }

  /** Gets the AutomationML edition string of the document of the CAEX object. */
  static automationMLEdition(caexObject: CAEXBasicObject | null): string | null {
    if (caexObject != null) {
      const document = caexObject.caexDocument;
      if (document == null) {
        return null;
      }
      return AMLEditionEnumExtension.amlEditionStringFromVersion(AmlObjectsExtensions.automationMLVersion(document));
    }
    return '';
  }

  /** Determines whether the object has revisions describing a new version. */
  static hasNewVersion(caexObject: CAEXBasicObject): boolean {
    if (caexObject.revision.exists) {
      return from<RevisionType>(caexObject.revision).any((r) => !isNullOrEmptyString(r.newVersion));
    }
    return false;
  }

  /** Gets the CAEX document of the CAEX object (CAEXDocument.Document(node)). */
  static caexDocument(caexObject: ICAEXWrapper): CAEXDocument | null {
    if (caexObject != null) {
      return T.CAEXDocument.document(caexObject.node) ?? null;
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Gets the CAEXFile of the document of the CAEX object. */
  static caexFile(caexObject: ICAEXWrapper): CAEXFileType | null {
    if (caexObject != null) {
      return CAEXBasicObjectExtensions.caexDocument(caexObject)?.caexFile ?? null;
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Gets the CAEX schema version of the CAEX object. */
  static caexSchema(caexObject: ICAEXWrapper): CAEXDocument_CAEXSchema {
    if (caexObject != null) {
      return XmlCAEXSchema.caexSchema(caexObject.node!);
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Creates the CAEX wrapper for the XML node, if it is of the provided type (null otherwise). */
  static createCaexWrapper<W extends CAEXWrapper>(xmlNode: XElement | null, type?: Ctor<W> | null): W | null {
    const wrapper = xmlNode == null ? null : XmlOperation.createCAEXWrapper(xmlNode);
    if (type == null) {
      return wrapper as W | null;
    }
    return wrapper instanceof type ? (wrapper as W) : null;
  }

  /**
   * Gets the descendants of the CAEX object: all (no type), those with the CAEX tag of the
   * provided type (C# Descendants&lt;T&gt;() and Descendants(Type)), optionally including self.
   */
  static descendants<W extends CAEXWrapper>(caexObject: ICAEXWrapper, includeSelf: boolean, type: Ctor<W>): Iterable<W>;
  static descendants<W extends CAEXWrapper>(caexObject: ICAEXWrapper, type: Ctor<W>, includeSelf?: boolean): Iterable<W>;
  static descendants(caexObject: CAEXWrapper): Iterable<CAEXBasicObject>;
  static descendants(caexObject: ICAEXWrapper, ...args: unknown[]): Iterable<unknown> {
    const { flag: includeSelf, type } = boolAndType(args, false);
    if (type == null) {
      // Descendants(this CAEXWrapper)
      if (!(caexObject == null)) {
        const node = caexObject.node;
        return new T.CAEXEnumerable<CAEXBasicObject>(axis(node, (n) => n.descendants()), T.CAEXBasicObject);
      }
      throw new ArgumentNullException('caexObject');
    }
    // Descendants<T>(this CAEXWrapper) = Descendants<T>(includeSelf: false),
    // Descendants(this CAEXWrapper, Type) and Descendants<T>(this ICAEXWrapper, bool).
    if (caexObject == null) {
      throw new ArgumentNullException('caexObject');
    }
    const xName = (caexObject as unknown as CAEXWrapper).xName(CAEX_CLASSModel_TagNames.tagName(type));
    if (!(xName == null)) {
      const node = caexObject.node;
      return new T.CAEXEnumerable(
        !includeSelf ? axis(node, (n) => n.descendants(xName)) : axis(node, (n) => n.descendantsAndSelf(xName)),
        type,
      );
    }
    throw new ArgumentException("The provided type hasn't an identifiable CAEX element");
  }

  /** Finds the CAEX object with the provided ID in the document of the CAEX object, if it is of the provided type. */
  static findCaexObjectFromId<R extends CAEXBasicObject>(caexObject: ICAEXWrapper, id: string | null, type?: Ctor<R> | null): R | null {
    if (caexObject != null) {
      return asType(ServiceLocator.queryService!.findByID(CAEXBasicObjectExtensions.caexDocument(caexObject), id), type);
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Finds the class with the provided CAEX path (the parent, if its name equals the path). */
  static findReferencedClass<R extends CAEXBasicObject>(caexObject: ICAEXWrapper, caexPath: string | null, type?: Ctor<R> | null): R | null {
    if (caexObject != null) {
      let cAEXObject: CAEXObject | null = null;
      if (
        !(caexObject.caexParent != null) ||
        !((cAEXObject = asCAEXObject(caexObject.caexParent)) != null) ||
        !(cAEXObject.name === caexPath)
      ) {
        return asType(
          ServiceLocator.queryService!.findByPath(CAEXBasicObjectExtensions.caexDocument(caexObject), caexPath, true, type ?? null),
          type,
        );
      }
      return asType(cAEXObject, type);
    }
    throw new ArgumentNullException('caexObject');
  }

  /**
   * Gets the first ancestor: of the provided wrapper type (C# FirstAncestor&lt;T&gt;), with the
   * provided CAEX tag name, or satisfying the predicate.
   */
  static firstAncestor<W extends CAEXWrapper>(caexObject: ICAEXWrapper, type: Ctor<W>): W | null;
  static firstAncestor(caexObject: ICAEXWrapper, tagName: string): CAEXWrapper | null;
  static firstAncestor(caexObject: ICAEXWrapper, predicate: (wrapper: ICAEXWrapper) => boolean): CAEXWrapper | null;
  static firstAncestor(caexObject: ICAEXWrapper, arg: unknown): CAEXWrapper | null {
    if (isWrapperClass(arg)) {
      if (caexObject == null) {
        throw new ArgumentNullException('caexObject');
      }
      const name = XmlCAEXSchema.xName(caexObject.node, CAEX_CLASSModel_TagNames.tagName(arg));
      return CAEXBasicObjectExtensions.createCaexWrapper(from(caexObject.node!.ancestors(name)).firstOrDefault(), arg);
    }
    if (typeof arg === 'function') {
      const predicate = arg as (wrapper: ICAEXWrapper) => boolean;
      if (caexObject != null) {
        const found = from(caexObject.node!.ancestors()).firstOrDefault((ancestor) => predicate(XmlOperation.createCAEXWrapper(ancestor)!));
        return found == null ? null : XmlOperation.createCAEXWrapper(found);
      }
      throw new ArgumentNullException('caexObject');
    }
    if (caexObject == null) {
      throw new ArgumentNullException('caexObject');
    }
    const name = XmlCAEXSchema.xName(caexObject.node, arg as string);
    const found = from(caexObject.node!.ancestors(name)).firstOrDefault();
    return found == null ? null : XmlOperation.createCAEXWrapper(found);
  }

  /**
   * Gets the CAEX parent, if it is of the provided type. `type` is a class constructor or, for a
   * C# interface type argument, the interface name.
   */
  static getParent<R>(caexObject: ICAEXWrapper, type?: Ctor<R> | string | null): R | null {
    if (caexObject != null) {
      const parent = caexObject.caexParent;
      if (type == null) {
        return (parent ?? null) as R | null;
      }
      if (typeof type === 'string') {
        return implementsInterface(parent, type) ? (parent as R) : null;
      }
      return parent instanceof type ? (parent as R) : null;
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Gets the library, containing the CAEX object (the object itself, if it is a library). */
  static library(caexObject: ICAEXWrapper): CAEXObject | null {
    if (caexObject != null) {
      if (!XmlCAEXSchema.isLibrary(caexObject.node!)) {
        const node = caexObject.node;
        if (node == null) {
          return null;
        }
        const found = from(node.ancestors()).firstOrDefault((n: XElement) => XmlCAEXSchema.isLibrary(n));
        const wrapper = found == null ? null : XmlOperation.createCAEXWrapper(found);
        return wrapper instanceof T.CAEXObject ? wrapper : null;
      }
      return caexObject instanceof T.CAEXObject ? caexObject : null;
    }
    throw new ArgumentNullException('caexObject');
  }

  /**
   * Gets the name of a CAEX object or the tag name of other CAEX wrappers. C# Name(); renamed
   * because a static `name` would collide with Function.prototype.name.
   */
  static name_(caexObject: ICAEXWrapper | null): string | null {
    if (!(caexObject instanceof T.CAEXObject)) {
      return caexObject?.tagName ?? null;
    }
    return caexObject.name;
  }

  /** Creates the Copyright element, if it doesn't exist. */
  static new_Copyright(caexObject: ICAEXBasicObject): CopyrightType {
    if (!caexObject.copyrightElement.exists) {
      return new T.CopyrightType(
        T.AddNewCmd.addNewElement(caexObject.node!, (caexObject as unknown as CAEXWrapper).xName('Copyright'), null),
      );
    }
    return caexObject.copyrightElement;
  }

  /** Creates the Description element, if it doesn't exist. */
  static new_Description(caexObject: CAEXBasicObject): DescriptionType {
    if (!caexObject.descriptionElement.exists) {
      return new T.DescriptionType(T.AddNewCmd.addNewElement(caexObject.node!, caexObject.xName('Description'), null));
    }
    return caexObject.descriptionElement;
  }

  /** Creates the Version element, if it doesn't exist. */
  static new_Version(caexObject: ICAEXBasicObject): VersionType {
    if (!caexObject.versionElement.exists) {
      return new T.VersionType(
        T.AddNewCmd.addNewElement(caexObject.node!, (caexObject as unknown as CAEXWrapper).xName('Version'), null),
      );
    }
    return caexObject.versionElement;
  }
}

// ---- private helpers ------------------------------------------------------------------------

function isNullOrEmptyString(s: string | null | undefined): boolean {
  return s === null || s === undefined || s.length === 0;
}

/**
 * `node?.Axis(...)` as a re-iterable deferred sequence (null when the node is null, which
 * CAEXEnumerable treats as empty).
 */
function axis(node: XElement | null | undefined, select: (n: XElement) => Iterator<XElement>): Iterable<XElement> | null {
  if (node == null) {
    return null;
  }
  return new Enumerable<XElement>(() => select(node));
}

/** Engine wrapper classes (CAEXWrapper or derived), as opposed to predicates. */
function isWrapperClass(f: unknown): f is Ctor<CAEXWrapper> {
  if (typeof f !== 'function') return false;
  const proto = (f as { prototype?: unknown }).prototype;
  if (proto == null || typeof proto !== 'object') return false;
  return f === T.CAEXWrapper || proto instanceof T.CAEXWrapper;
}

/** Splits optional (bool, type) arguments given in either order. */
function boolAndType(args: unknown[], defaultFlag: boolean): { flag: boolean; type: Ctor<CAEXWrapper> | null } {
  let flag = defaultFlag;
  let type: Ctor<CAEXWrapper> | null = null;
  for (const a of args) {
    if (typeof a === 'boolean') {
      flag = a;
    } else if (typeof a === 'function') {
      type = a as Ctor<CAEXWrapper>;
    }
  }
  return { flag, type };
}

function asCAEXObject(x: unknown): CAEXObject | null {
  return x instanceof T.CAEXObject ? x : null;
}

/** `x as T` (no type: no filtering). */
function asType<R>(x: unknown, type: Ctor<R> | null | undefined): R | null {
  if (x == null) return null;
  if (type == null) return x as R;
  return x instanceof type ? (x as R) : null;
}

