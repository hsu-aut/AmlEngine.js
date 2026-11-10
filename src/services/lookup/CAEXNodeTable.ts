// Port of Aml.Engine.Services.Lookup.CAEXNodeTable (Aml.Engine.Services 4.3.1).
//
// CAEXNodeTable is the base class of ClassTable and IDTable and creates CAEXNodes; CAEXNode in
// turn creates ClassTables. A static import of CAEXNode.ts here would evaluate ClassTable before
// this class whenever this module is loaded first, so CAEXNode.ts assigns itself to
// `CAEXNodeTable.nodeType` when it is loaded, and this module only imports engine modules.

import '../../engine/index.js';
import { CAEXFileType } from '../../engine/caex/CAEXFileType.js';
import { XmlClassOperation } from '../../engine/xmlext/XmlClassOperation.js';
import { Dictionary } from '../../system/linq.js';
import type { XElement } from '../../xml/index.js';
import type { CAEXBasicObject } from '../../engine/caex/CAEXBasicObject.js';
import type { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import type { CAEXNode, CAEXNode_Identifier } from './CAEXNode.js';

/** Representation of CAEXNodes in a dictionary, using the node name or ID as a key. */
export class CAEXNodeTable extends Dictionary<string, CAEXNode> {
  /** @internal The class CAEXNode, set by CAEXNode.ts (see the module comment). */
  static nodeType: typeof CAEXNode;

  readonly document: CAEXDocument | null;

  constructor(document: CAEXDocument | null) {
    super();
    this.document = document;
  }

  /** The element has the local name and is a descendant of the root (any element, if root is null). */
  static isDecendantWithName(xElement: XElement, root: XElement | null, elementName: string | null, includeSelf: boolean): boolean {
    if (root !== null) {
      if (xElement.name.localName === elementName) {
        return XmlClassOperation.isDescendant(xElement, root, includeSelf);
      }
      return false;
    }
    return xElement.name.localName === elementName;
  }

  /** The element is a descendant of the root (true for any element, if root is null). */
  static isDescendant(xElement: XElement | null, root: XElement | null, includeSelf: boolean): boolean {
    if (root !== null) {
      if (xElement !== null) {
        return XmlClassOperation.isDescendant(xElement, root, includeSelf);
      }
      return false;
    }
    return true;
  }

  /** The root element of a query: null for the CAEXFile (the whole document). */
  static root(caexObject: CAEXBasicObject): XElement | null {
    if (!(caexObject instanceof CAEXFileType)) {
      return caexObject.node;
    }
    return null;
  }

  /**
   * Adds a new node with the provided identifier to the node table. If already a node is
   * registered using the same identifier, an ambiguous node is created. Returns the added node.
   */
  addNewNode(identifier: string, identType: CAEXNode_Identifier, xElement: XElement | null): CAEXNode {
    const r = this.tryGetValue(identifier);
    let value = r.value;
    if (r.result && (value!.element === null || value!.element === xElement)) {
      value!.element = xElement;
      return value!;
    }
    value = new CAEXNodeTable.nodeType(xElement);
    value = this.addNode(identifier, identType, value).node;
    return value;
  }

  /**
   * Adds a node with the provided identifier to the node table. If already a node is registered
   * using the same identifier, an ambiguous node is created. C# `ref CAEXNode node`: the result
   * is the node registered for it (the existing placeholder node, if there is one).
   */
  addNode(identifier: string, identType: CAEXNode_Identifier, node: CAEXNode): { node: CAEXNode } {
    const r = this.tryGetValue(identifier);
    if (r.result) {
      const value = r.value!;
      if (value.element === null) {
        value.element = node.element;
        node = value;
      } else {
        // Aml.Engine: a node that is already in the chain (an element registered again, as after
        // a move) is linked to the end of its own chain, which makes the chain cyclic; the next
        // walk of it does not return (the port throws CyclicReferenceException, see CAEXNode.ts).
        value.lastAmbiguousNode(identType).setIdenticalNode(identType, node);
      }
    } else {
      this.setItem(identifier, node);
    }
    return { node };
  }

  /**
   * The nodes of the table by key ("parent/child" paths for the class hierarchy below, if the
   * identifier is NAME), in the order of the tables.
   */
  nodeGroups(name: string | null, id: CAEXNode_Identifier): Dictionary<string, Iterable<CAEXNode>> {
    const dictionary = new Dictionary<string, Iterable<CAEXNode>>();
    for (const [key, value] of this) {
      const text = name === null ? key : name + '/' + key;
      dictionary.add(text, value.allNodes(id));
      if (id !== CAEXNodeTable.nodeType.Identifier.NAME || value.children === null) {
        continue;
      }
      for (const [itemKey, itemValue] of value.children.nodeGroups(text, id)) {
        dictionary.add(itemKey, itemValue);
      }
    }
    return dictionary;
  }
}
