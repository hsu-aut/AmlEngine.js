// Port of Aml.Engine.Services.Lookup.CAEXNode (Aml.Engine.Services 4.3.1).
//
// Nodes registered under the same key of a table form a chain (NodeWithIdenticalID,
// NodeWithIdenticalName). C# walks these chains recursively. When an element that is already
// registered is added again, the original links a node to itself (CAEXNodeTable.AddNode) and the
// chain becomes cyclic; every later walk of it recurses until the stack overflows. The port walks
// the chains in loops with the same results and side effects in the same order, and throws
// CyclicReferenceException when a node of the chain comes up a second time (src/engine/cycles.ts).

import '../../engine/index.js';
import { implementsInterface } from '../../engine/interfaces.js';
import { LoopGuard } from '../../engine/cycles.js';
import { SystemUnitClassType } from '../../engine/caex/SystemUnitClassType.js';
import { CAEXBasicObjectExtensions } from '../../engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXPathBuilder } from '../../engine/caex/extensions/CAEXPathBuilder.js';
import { XmlCAEXAttributes } from '../../engine/xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../../engine/xmlext/XmlCAEXSchema.js';
import { XmlOperation } from '../../engine/xmlext/XmlOperation.js';
import { NotImplementedException } from '../../system/exceptions.js';
import { Enumerable, List, from } from '../../system/linq.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import type { IObjectWithAttributes } from '../../engine/caex/IObjectWithAttributes.js';
import type { IObjectWithExternalInterface } from '../../engine/caex/IObjectWithExternalInterface.js';
import type { ICAEXWrapper } from '../../engine/caex/ICAEXWrapper.js';
import { CAEXNodeTable } from './CAEXNodeTable.js';
import { ClassTable } from './ClassTable.js';
import { IDReference } from './IDReference.js';
import { PathReference } from './PathReference.js';
import { LookupService } from '../LookupService.js';
import { replaceString, type CAEXNodeReference } from './CAEXNodeReference.js';

/** The kind of key a node is registered with. */
export enum CAEXNode_Identifier {
  ID = 0,
  NAME = 1,
  ANY = 2,
}

/** The subject of the message of a cycle in a chain of nodes. */
function chainName(identifier: CAEXNode_Identifier): string {
  return identifier === CAEXNode_Identifier.ID
    ? 'The lookup table nodes with an identical ID'
    : identifier === CAEXNode_Identifier.NAME
      ? 'The lookup table nodes with an identical name'
      : 'The lookup table nodes';
}

/** A node of a lookup table: an element (or a placeholder for an unresolved key) and the references to it. */
export class CAEXNode {
  static readonly Identifier = CAEXNode_Identifier;

  /** References of attribute mirrors. */
  get attributeReferences(): Enumerable<IDReference> {
    return this.idReferences.where((r) => r.isAttribute);
  }

  private _children: ClassTable | null = null;

  /** The next level of the class hierarchy (the setter is private in C#). */
  get children(): ClassTable | null {
    return this._children;
  }

  /** The registered element; null for a node which is only referenced. */
  element: XElement | null;

  /** References of InternalElement mirrors. */
  get elementMirrors(): Enumerable<IDReference> {
    return this.idReferences.where((r) => r.isInternalElementMirror);
  }

  private _elementReferences: List<CAEXNodeReference> | null = null;

  /** All references to this node (the setter is private in C#). */
  get elementReferences(): List<CAEXNodeReference> | null {
    return this._elementReferences;
  }

  /** The ID references (lazy over the list of references at the time of the call). */
  get idReferences(): Enumerable<IDReference> {
    const list = this._elementReferences;
    return list !== null ? from(list).ofType(IDReference) : Enumerable.empty<IDReference>();
  }

  /** References of ExternalInterface mirrors. */
  get interfaceMirrors(): Enumerable<IDReference> {
    return this.idReferences.where((r) => r.isInterfaceMirror);
  }

  /** References of InternalLinks. */
  get internalLinks(): Enumerable<IDReference> {
    return this.idReferences.where((r) => r.isInternalLinkReference);
  }

  /** The next node registered with the same ID. */
  nodeWithIdenticalID: CAEXNode | null = null;

  /** The next node registered with the same name. */
  nodeWithIdenticalName: CAEXNode | null = null;

  /** The path references (lazy over the list of references at the time of the call). */
  get pathReferences(): Enumerable<CAEXNodeReference> {
    const list = this._elementReferences;
    return list !== null ? from<CAEXNodeReference>(list).ofType(PathReference) : Enumerable.empty<CAEXNodeReference>();
  }

  /** The path references of this node and of all nodes of the class hierarchy below it. */
  get selfAndDescendantPathReferences(): Enumerable<CAEXNodeReference> {
    return this.pathReferences.concat(this._children?.allPathReferences ?? Enumerable.empty<CAEXNodeReference>());
  }

  /** The indexer `this[string name]`: the child node with the name (creates the child table). */
  item(name: string): CAEXNode | null {
    if (this._children === null) {
      this._children = new ClassTable();
    }
    const r = this._children.tryGetValue(name);
    if (r.result) {
      return r.value;
    }
    return null;
  }

  /** The setter of the indexer `this[string name]`. */
  setItem(name: string, value: CAEXNode | null): void {
    if (value !== null) {
      if (this._children === null) {
        this._children = new ClassTable();
      }
      this._children.setItem(name, value);
    }
  }

  constructor(element: XElement | null) {
    this.element = element;
  }

  /** Adds a node for the child with the identifier. */
  addNewChildNode(identifier: string, identType: CAEXNode_Identifier, xElement: XElement | null): CAEXNode {
    if (this._children === null) {
      this._children = new ClassTable();
    }
    return this._children.addNewNode(identifier, identType, xElement);
  }

  /** Adds a reference to this node. */
  addReference(reference: CAEXNodeReference): void {
    if (this._elementReferences === null) {
      this._elementReferences = new List<CAEXNodeReference>();
    }
    this._elementReferences.add(reference);
  }

  /**
   * This node and the nodes chained to it with the same ID or name. C# builds the sequence
   * recursively at the call; here the chain is walked at the call, with the same nodes.
   */
  allNodes(ident: CAEXNode_Identifier): Enumerable<CAEXNode> {
    switch (ident) {
      case CAEXNode_Identifier.ID:
      case CAEXNode_Identifier.NAME: {
        const nodes: CAEXNode[] = [];
        const guard = new LoopGuard(chainName(ident));
        for (let node: CAEXNode | null = this; node !== null; node = ident === CAEXNode_Identifier.ID ? node.nodeWithIdenticalID : node.nodeWithIdenticalName) {
          guard.visit(node, node.element);
          nodes.push(node);
        }
        return from(nodes);
      }
      default:
        return Enumerable.empty<CAEXNode>();
    }
  }

  /** Deletes the reference of the element by the attribute here and in the nodes with an identical name. */
  deleteReference(xElement: XElement, attribute: string | null): void {
    // C#: recursive on NodeWithIdenticalName after this node.
    const guard = new LoopGuard(chainName(CAEXNode_Identifier.NAME));
    for (let node: CAEXNode | null = this; node !== null; node = node.nodeWithIdenticalName) {
      guard.visit(node, node.element);
      if (node._elementReferences !== null) {
        const cAEXNodeReference = from(node._elementReferences).firstOrDefault((e) => e.referenceAttributeName === attribute && e.element === xElement);
        if (cAEXNodeReference !== null) {
          LookupService.lookUpService!.onReferenceUpdate(node.element, cAEXNodeReference, cAEXNodeReference.referenceAttributeValue, null);
          node._elementReferences.remove(cAEXNodeReference);
        }
        if (node._elementReferences.count === 0) {
          node._elementReferences = null;
        }
      }
    }
  }

  /**
   * Removes the node of the element from the chain of identical nodes starting here (C# out
   * parameter newRoot: the new first node of the chain). Returns the node of the element, or null.
   */
  getUpdatedNode(xElement: XElement | null, identifier: CAEXNode_Identifier): { result: CAEXNode | null; newRoot: CAEXNode | null } {
    // C#: recursive. The walk goes down the chain to the node of the element (or its end); the
    // links are set on the way back, as the returns of the recursion do.
    const passed: CAEXNode[] = [];
    const guard = new LoopGuard(chainName(identifier));
    let result: CAEXNode | null = null;
    let newRoot: CAEXNode | null = null;
    let node: CAEXNode | null = this;
    while (node !== null) {
      guard.visit(node, node.element);
      if (node.element === xElement) {
        switch (identifier) {
          case CAEXNode_Identifier.ID:
            newRoot = node.nodeWithIdenticalID;
            node.nodeWithIdenticalID = null;
            break;
          case CAEXNode_Identifier.NAME:
            newRoot = node.nodeWithIdenticalName;
            node.nodeWithIdenticalName = null;
            break;
        }
        result = node;
        break;
      }
      passed.push(node);
      node = node.identicalNode(identifier);
    }
    for (let i = passed.length - 1; i >= 0; i--) {
      passed[i]!.setIdenticalNode(identifier, newRoot);
      newRoot = passed[i]!;
    }
    return { result, newRoot };
  }

  /** The last node of the chain of identical nodes. */
  lastAmbiguousNode(identifier: CAEXNode_Identifier): CAEXNode {
    // C#: recursive, NodeWithIdentical...?.LastAmbiguousNode(identifier) ?? this.
    switch (identifier) {
      case CAEXNode_Identifier.ID:
      case CAEXNode_Identifier.NAME: {
        const guard = new LoopGuard(chainName(identifier));
        let node: CAEXNode = this;
        while (true) {
          guard.visit(node, node.element);
          const next = identifier === CAEXNode_Identifier.ID ? node.nodeWithIdenticalID : node.nodeWithIdenticalName;
          if (next === null) {
            return node;
          }
          node = next;
        }
      }
      default:
        return this;
    }
  }

  /** Sets the next node of the chain of identical nodes. */
  setIdenticalNode(identifier: CAEXNode_Identifier, node: CAEXNode | null): void {
    switch (identifier) {
      case CAEXNode_Identifier.ID:
        this.nodeWithIdenticalID = node;
        break;
      case CAEXNode_Identifier.NAME:
        this.nodeWithIdenticalName = node;
        break;
    }
  }

  /** Updates the ID references to this node after a change of the ID. */
  updateIDReferences(oldID: string | null, newID: string | null): void {
    if (this._elementReferences === null) {
      return;
    }
    for (const item of from(this._elementReferences).ofType(IDReference).toList()) {
      let referencedElement = this.element;
      if (XmlCAEXAttributes.caexidOfElement(this.element) !== newID) {
        if (item.isInternalLinkReference) {
          referencedElement = this.referencedExternalInterface(item);
        } else if (item.isAttribute) {
          referencedElement = this.referencedAttribute(item);
        }
      }
      if (!item.update(referencedElement, oldID, newID)) {
        this._elementReferences!.remove(item);
      }
    }
  }

  /** Updates the path references to this node and to the nodes below it after a change of the name. */
  updatePathReferences(oldName: string | null, newName: string | null): void {
    if (this._elementReferences !== null) {
      for (const item of from(this._elementReferences).ofType(PathReference).toList()) {
        if (!item.update(this.element, oldName, newName)) {
          this._elementReferences!.remove(item);
        }
      }
    }
    if (this._children === null) {
      return;
    }
    for (const value of this._children.values()) {
      value.updatePathReferences(oldName, newName);
    }
  }

  /** Updates the attribute mirror references after a change of the path of a master attribute. */
  updateAttributeReferences(oldPath: string | null, newPath: string | null): void {
    const obj = XmlOperation.createCAEXWrapper(this.element);
    const val = implementsInterface(obj, 'IObjectWithAttributes') ? (obj as unknown as IObjectWithAttributes) : null;
    let referencedElement = this.element;
    for (const item of this.attributeReferences.toList()) {
      if (!isNullOrEmpty(newPath) && oldPath !== null) {
        const r = CAEXPathBuilder.attributePathInAttributeReference(
          replaceString(item.referenceAttributeValue!, oldPath, newPath),
          CAEXBasicObjectExtensions.caexDocument(val as unknown as ICAEXWrapper),
        );
        if (r.isAttributeReference && val !== null) {
          const obj2 = val.attribute.item(r.result);
          referencedElement = obj2 !== null ? obj2.node : null;
        }
      }
      if (!item.updateAttributeReference(referencedElement, oldPath, newPath)) {
        this._elementReferences?.remove(item);
      }
    }
  }

  private referencedAttribute(attributeReference: IDReference): XElement | null {
    const referenceAttributeValue = attributeReference.referenceAttributeValue;
    const element = this.element;
    const r = CAEXPathBuilder.attributePathInAttributeReference(referenceAttributeValue, element !== null ? XmlCAEXSchema.caexDocument(element) : null);
    if (r.isAttributeReference) {
      const element2 = this.element;
      const obj = element2 !== null ? XmlOperation.createCAEXWrapper(element2) : null;
      const obj2 = obj instanceof SystemUnitClassType ? obj : null;
      if (obj2 === null) {
        return null;
      }
      const obj3 = obj2.attribute.item(r.result);
      if (obj3 === null) {
        return null;
      }
      return obj3.node;
    }
    return this.element;
  }

  private referencedExternalInterface(internalLinkReference: IDReference): XElement | null {
    const element = this.element;
    if (element !== null && !XmlCAEXSchema.isExternalInterface(element)) {
      const text = CAEXPathBuilder.externalInterfaceNameInInternalLinkReference(internalLinkReference.referenceAttributeValue).result;
      const obj = XmlOperation.createCAEXWrapper(this.element);
      const obj2 = implementsInterface(obj, 'IObjectWithExternalInterface') ? (obj as unknown as IObjectWithExternalInterface) : null;
      const obj3 = obj2 !== null ? obj2.externalInterface.item(text) : null;
      if (obj3 === null) {
        return null;
      }
      return obj3.node;
    }
    return this.element;
  }

  /** Updates the InternalLink references after a change of the name of an ExternalInterface. */
  updateInterfaceReferences(oldName: string | null, newName: string | null): void {
    for (const item of this.internalLinks.toList()) {
      if (!item.updateInternalLinkReference(this.referencedExternalInterface(item), oldName, newName)) {
        this._elementReferences?.remove(item);
      }
    }
  }

  private identicalNode(identifier: CAEXNode_Identifier): CAEXNode | null {
    switch (identifier) {
      case CAEXNode_Identifier.ID:
        return this.nodeWithIdenticalID;
      case CAEXNode_Identifier.NAME:
        return this.nodeWithIdenticalName;
      case CAEXNode_Identifier.ANY:
        return this;
      default:
        throw new NotImplementedException();
    }
  }
}

CAEXNodeTable.nodeType = CAEXNode;
