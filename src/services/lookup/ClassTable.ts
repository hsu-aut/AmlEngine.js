// Port of Aml.Engine.Services.Lookup.ClassTable (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { implementsInterface } from '../../engine/interfaces.js';
import { RecursionGuard } from '../../engine/cycles.js';
import { CAEXDocument_CAEXSchema } from '../../engine/caex/CAEXDocument.js';
import { CAEXPathBuilder } from '../../engine/caex/extensions/CAEXPathBuilder.js';
import { toLookup, type ILookup } from '../../engine/services/EmptyLookup.js';
import { XmlCAEXAttributes } from '../../engine/xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../../engine/xmlext/XmlCAEXSchema.js';
import { XmlOperation } from '../../engine/xmlext/XmlOperation.js';
import { ArgumentOutOfRangeException, IndexOutOfRangeException } from '../../system/exceptions.js';
import { Enumerable, from } from '../../system/linq.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import type { CAEXBasicObject } from '../../engine/caex/CAEXBasicObject.js';
import type { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import type { CAEXObject } from '../../engine/caex/CAEXObject.js';
import type { IClassWithBaseClassReference } from '../../engine/caex/IClassWithBaseClassReference.js';
import type { CAEXReference } from '../../engine/services/CAEXReference.js';
import type { ICAEXReference } from '../../engine/services/interfaces/ICAEXReference.js';
import { CAEXNodeTable } from './CAEXNodeTable.js';
import { CAEXNode_Identifier, type CAEXNode } from './CAEXNode.js';
import { ReferenceElement } from './ReferenceElement.js';
import type { CAEXNodeReference } from './CAEXNodeReference.js';

/** C# `array[..^1]`: all but the last item; an empty array throws as RuntimeHelpers.GetSubArray. */
function allButLast(array: readonly string[]): string[] {
  if (array.length === 0) {
    throw new ArgumentOutOfRangeException('length');
  }
  return array.slice(0, -1);
}

/** C# `array[i]` with the bounds check of an array. */
function at(array: readonly string[], index: number): string {
  if (index < 0 || index >= array.length) {
    throw new IndexOutOfRangeException();
  }
  return array[index]!;
}

/** Cyclic class references: AllClassReferencesDeep calls itself with the same class path. */
const classReferencesGuard = new RecursionGuard('The base class references');

/**
 * The class table is a registry of all CAEX classes using the name of the class as a key and the
 * next node level of the class hierarchy in children collections as properties of a registered
 * class node.
 */
export class ClassTable extends CAEXNodeTable {
  /** Nodes with references removed by Delete (static in C#). */
  static deletedNodesWithReference: CAEXNode[] = [];

  /** The path references of all nodes of the table and of the class hierarchy below them. */
  get allPathReferences(): Enumerable<CAEXNodeReference> {
    return new Enumerable(() => this.values()).selectMany((c) => c.selfAndDescendantPathReferences);
  }

  /**
   * Indexers: `this[string key]` of the dictionary, and `this[string[] pathParts, int index]`,
   * the node of the path from the part at the index on (through the child tables), or null.
   */
  override item(key: string): CAEXNode;
  override item(pathParts: readonly string[], index: number): CAEXNode | null;
  override item(keyOrParts: string | readonly string[], index?: number): CAEXNode | null {
    if (typeof keyOrParts === 'string') {
      return super.item(keyOrParts);
    }
    const pathParts = keyOrParts;
    const i = index!;
    const r = this.tryGetValue(at(pathParts, i));
    if (r.result) {
      if (i + 1 !== pathParts.length) {
        return r.value!.children?.item(pathParts, i + 1) ?? null;
      }
      return r.value;
    }
    return null;
  }

  /** C# constructors ClassTable(CAEXDocument document) and ClassTable() (no document). */
  constructor(document: CAEXDocument | null = null) {
    super(document);
  }

  /** Adds the class with the path (and the nodes of its parents, if they are missing). */
  addPathElement(path: string, xElement: XElement | null): CAEXNode {
    const document = this.document;
    const array = CAEXPathBuilder.pathNameArray(path, document !== null ? document.schema : CAEXDocument_CAEXSchema.Unknown, false);
    const subArray = allButLast(array);
    if (subArray.length !== 0) {
      let cAEXNode = this.item(subArray, 0) ?? this.addPathElement(subArray.join('/'), null);
      if (cAEXNode.nodeWithIdenticalName !== null) {
        for (const item of cAEXNode.allNodes(CAEXNode_Identifier.NAME)) {
          if ((xElement?.parent ?? null) === item.element) {
            cAEXNode = item;
            break;
          }
        }
      }
      return cAEXNode.addNewChildNode(at(array, array.length - 1), CAEXNode_Identifier.NAME, xElement);
    }
    return this.addNewNode(at(array, array.length - 1), CAEXNode_Identifier.NAME, xElement);
  }

  /**
   * C# overloads: AllClasses(), all classes of the table and of the class hierarchy below it, and
   * AllClasses(CAEXBasicObject caexRoot), the class elements below the root by CAEX path.
   */
  allClasses(): Enumerable<IClassWithBaseClassReference>;
  allClasses(caexRoot: CAEXBasicObject): ILookup<string, ICAEXReference>;
  allClasses(caexRoot?: CAEXBasicObject): Enumerable<IClassWithBaseClassReference> | ILookup<string, ICAEXReference> {
    if (caexRoot === undefined) {
      let enumerable: Enumerable<IClassWithBaseClassReference> = Enumerable.empty<IClassWithBaseClassReference>();
      for (const value of this.values()) {
        const obj = XmlOperation.createCAEXWrapper(value.element);
        const val = implementsInterface(obj, 'IClassWithBaseClassReference') ? (obj as unknown as IClassWithBaseClassReference) : null;
        if (val !== null) {
          enumerable = enumerable.concat([val]);
        }
        enumerable = enumerable.concat(value.children?.allClasses() ?? Enumerable.empty<IClassWithBaseClassReference>());
      }
      return enumerable;
    }
    const root = CAEXNodeTable.root(caexRoot);
    return toLookup(
      from(this.nodeGroups(null, CAEXNode_Identifier.NAME))
        .select(([key, value]) => ({
          key,
          elements: from(value)
            .where((e) => CAEXNodeTable.isDescendant(e.element, root, true))
            .select((e) => new ReferenceElement(e.element, e.element?.name.localName ?? null)),
        }))
        .selectMany((descendant) => descendant.elements.select((element) => ({ key: descendant.key, element }))),
      (p) => p.key,
      (p) => p.element as ICAEXReference,
    );
  }

  /** Gets all path references to the CAEX object. */
  allPathReferencesToObject(caexObject: CAEXObject): Enumerable<ICAEXReference> {
    const cAEXNode = this.findByPath(caexObject.caexPath());
    if (cAEXNode === null) {
      return Enumerable.empty<ICAEXReference>();
    }
    return cAEXNode.pathReferences.cast<ICAEXReference>();
  }

  /** The node of the path or, if there is none, the node which holds the reference of the element under another key. */
  fíndByReference(path: string, xElement: XElement, attributeName: string | null): CAEXNode | null {
    const cAEXNode = this.findByPath(path);
    if (cAEXNode !== null) {
      return cAEXNode;
    }
    for (const [key, value] of this) {
      const cAEXNodeReference = value.pathReferences.firstOrDefault((r) => r.referenceAttributeName === attributeName && r.element === xElement);
      if (cAEXNodeReference !== null && cAEXNodeReference.referenceName !== key) {
        return value;
      }
    }
    return null;
  }

  /** Deletes the node of the element at the path (the parts from the first on). */
  delete(xElement: XElement, pathParts: readonly string[]): void {
    const array = pathParts.slice(1);
    const key = at(pathParts, 0);
    const r = this.tryGetValue(key);
    if (!r.result) {
      return;
    }
    let value: CAEXNode | null = r.value;
    if (array.length === 0) {
      const u = value!.getUpdatedNode(xElement, CAEXNode_Identifier.NAME);
      value = u.result;
      value?.updatePathReferences(null, null);
      if (u.newRoot === null) {
        this.remove(key);
        if (value !== null) {
          const elementReferences = value.elementReferences;
          if (elementReferences !== null && elementReferences.length > 0) {
            ClassTable.deletedNodesWithReference.push(value);
          }
        }
      } else {
        this.setItem(key, u.newRoot);
      }
      return;
    }
    for (const item of value!.allNodes(CAEXNode_Identifier.NAME)) {
      item.children?.delete(xElement, array);
    }
  }

  /** The references to the class path from the root and its descendants. */
  descendantPathReferencesToPath(caexRoot: CAEXBasicObject, classPath: string | null, elementName: string | null, onlyClasses: boolean): Enumerable<CAEXReference> {
    const root = CAEXNodeTable.root(caexRoot);
    return this.pathReferencesToPathByFilter(classPath, elementName, onlyClasses).where((e) => CAEXNodeTable.isDescendant(e.element, root, true));
  }

  /** Gets path references of all nodes and their descendants which are selected by the provided predicate. */
  filteredPathReferences(predicate: (e: XElement) => boolean): Enumerable<CAEXNodeReference> {
    return this.allPathReferences.where((p) => predicate(p.element));
  }

  /** The path a reference value refers to: the path of the parent class, if the value is its name. */
  static getPath(xElement: XElement, value: string | null): string {
    if (!isNullOrEmpty(value)) {
      const parent = xElement.parent;
      if (value === (parent !== null ? XmlCAEXAttributes.caexNameOfElement(parent) : null)) {
        const parent2 = xElement.parent;
        if (parent2 !== null && XmlCAEXSchema.isCAEXClass(parent2, false)) {
          return XmlCAEXAttributes.caexPath(xElement.parent!);
        }
      }
    }
    if (!isNullOrWhiteSpace(value)) {
      return value!;
    }
    return ' ';
  }

  /** Finds a CAEX node by its path. */
  findByPath(caexPath: string | null): CAEXNode | null {
    if (isNullOrWhiteSpace(caexPath)) {
      caexPath = ' ';
    }
    const text = caexPath!;
    const document = this.document;
    const pathParts = CAEXPathBuilder.pathNameArray(text, document !== null ? document.schema : CAEXDocument_CAEXSchema.Unknown, false);
    return this.item(pathParts, 0);
  }

  /** The path references from the elements below (or including) the object, optionally with the element name. */
  pathReferencesByFilter(caexObject: CAEXBasicObject, elementName: string | null, includeSelf: boolean): Enumerable<CAEXNodeReference> {
    const root = CAEXNodeTable.root(caexObject);
    if (!isNullOrEmpty(elementName)) {
      return this.filteredPathReferences((e) => CAEXNodeTable.isDecendantWithName(e, root, elementName, includeSelf));
    }
    return this.filteredPathReferences((e) => CAEXNodeTable.isDescendant(e, root, includeSelf));
  }

  /** The references to the class path (only from classes, if onlyClasses). */
  pathReferencesToPathByFilter(classPath: string | null, elementName: string | null, onlyClasses: boolean): Enumerable<CAEXReference> {
    const document = this.document;
    // C# PathNameArray(null) fails with a NullReferenceException.
    const cAEXNode = this.item(CAEXPathBuilder.pathNameArray(classPath!, document !== null ? document.schema : CAEXDocument_CAEXSchema.Unknown, false), 0);
    if (cAEXNode === null || (!isNullOrEmpty(elementName) && (cAEXNode.element?.name.localName ?? null) !== elementName)) {
      return Enumerable.empty<CAEXReference>();
    }
    if (onlyClasses) {
      return cAEXNode.pathReferences.where((r) => {
        const element = r.element;
        return element !== null && XmlCAEXSchema.isCAEXClass(element, false);
      }).cast<CAEXReference>();
    }
    return cAEXNode.pathReferences.cast<CAEXReference>();
  }

  /**
   * The objects referencing the class path and, recursively, the objects referencing these
   * classes. The recursion runs at the call; the first level is enumerated lazily.
   */
  allClassReferencesDeep(classPath: string | null, elementName: string | null, onlyClasses: boolean): Enumerable<CAEXBasicObject | null> {
    // Aml.Engine: cyclic class references recurse until the stack overflows; the port throws
    // CyclicReferenceException when a call for the same path is still running.
    return classReferencesGuard.run([this, classPath, elementName, onlyClasses], this.findByPath(classPath)?.element ?? null, () => {
      let enumerable: Enumerable<CAEXBasicObject | null> = this.pathReferencesToPathByFilter(classPath, elementName, onlyClasses).select((r) => r.caexObject);
      for (const item of enumerable) {
        if (!(!implementsInterface(item, 'IClassWithBaseClassReference') && onlyClasses)) {
          const val = implementsInterface(item, 'IClassWithBaseClassReference') ? (item as unknown as IClassWithBaseClassReference) : null;
          if (val !== null) {
            enumerable = enumerable.concat(this.allClassReferencesDeep((val as unknown as CAEXObject).caexPath(), elementName, onlyClasses));
          }
        }
      }
      return enumerable;
    });
  }

  /**
   * A node of this table has changed its name. The registration of the node is changed. The path
   * references to the node are updated.
   */
  updatedPathReferences(oldName: string, newName: string, xElement: XElement): void {
    const r = this.tryGetValue(oldName);
    if (r.result) {
      const u = r.value!.getUpdatedNode(xElement, CAEXNode_Identifier.NAME);
      let node = u.result;
      if (u.newRoot === null) {
        this.remove(oldName);
      } else {
        this.setItem(oldName, u.newRoot);
      }
      if (node !== null) {
        node = this.addNode(newName, CAEXNode_Identifier.NAME, node).node;
        node.updatePathReferences(oldName, newName);
      }
    }
  }
}

