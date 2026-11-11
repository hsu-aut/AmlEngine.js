// Port of Aml.Engine.Services.Lookup.AliasTable (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { implementsInterface } from '../../engine/interfaces.js';
import { CAEXWrapper } from '../../engine/caex/CAEXWrapper.js';
import { CAEXDocumentExtensions } from '../../engine/caex/extensions/CAEXDocumentExtensions.js';
import { InheritanceExtensions } from '../../engine/caex/extensions/InheritanceExtensions.js';
import { XmlCAEXSchema } from '../../engine/xmlext/XmlCAEXSchema.js';
import { Dictionary, Enumerable, List, from } from '../../system/linq.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import type { CAEXBasicObject } from '../../engine/caex/CAEXBasicObject.js';
import type { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import type { IClassWithBaseClassReference } from '../../engine/caex/IClassWithBaseClassReference.js';
import type { CAEXReference } from '../../engine/services/CAEXReference.js';
import { AliasReference } from './AliasReference.js';
import { CAEXNode_Identifier } from './CAEXNode.js';
import { CAEXNodeTable } from './CAEXNodeTable.js';
import { LookupService } from '../LookupService.js';
import type { CAEXNodeReference } from './CAEXNodeReference.js';

/** The Alias table is a registry of all alias references using the alias name as a key. */
export class AliasTable extends Dictionary<string, List<AliasReference>> {
  /** All alias references. */
  get aliasReferences(): Enumerable<AliasReference> {
    return new Enumerable(() => this.values()).selectMany((s) => s);
  }

  readonly document: CAEXDocument;

  constructor(document: CAEXDocument) {
    super();
    this.document = document;
  }

  /** Registers the alias reference of the element by the attribute. */
  addAliasReference(alias: string, identifier: CAEXNode_Identifier, xElement: XElement, attribute: string | null): void {
    const aliasReference = new AliasReference(xElement, attribute);
    aliasReference.identifier = identifier;
    let value = this.tryGetValue(alias).value;
    if (value === null) {
      value = new List<AliasReference>();
      this.setItem(alias, value);
    }
    if (!from(value).any((r) => r.element === xElement && r.referenceAttributeName === attribute)) {
      value.add(aliasReference);
    }
    if (LookupService.lookUpService!.supportsUpdate(aliasReference)) {
      const lookUpService = LookupService.lookUpService!;
      const obj = LookupService.lookUpService!.findByPath(XmlCAEXSchema.caexDocument(xElement), aliasReference.referenceAttributeValue);
      lookUpService.onReferenceUpdate(obj !== null ? obj.node : null, aliasReference, null, aliasReference.referenceAttributeValue);
    }
  }

  /** The alias references from the elements below (or including) the object, by alias. */
  aliasReferencesByFilter(caexObject: CAEXBasicObject, elementName: string | null, includeSelf: boolean): Enumerable<{ key: string; reference: AliasReference }> {
    const root = CAEXNodeTable.root(caexObject);
    const source = from(this).selectMany(([key, value]) => from(value).select((y) => ({ key, reference: y })));
    if (!isNullOrEmpty(elementName)) {
      return source.where((r) => CAEXNodeTable.isDecendantWithName(r.reference.element, root, elementName, includeSelf));
    }
    return source.where((r) => CAEXNodeTable.isDescendant(r.reference.element, root, includeSelf));
  }

  /**
   * Gets the alias references which reference the provided class (identified by the classPath)
   * or any derived class according to the provided filter properties (lazy, like the C# iterator).
   */
  allReferencesToDerivedExternalClasses(classPath: string | null, elementName: string | null, onlyClasses: boolean): Enumerable<CAEXReference> {
    return new Enumerable(() => this.allReferencesToDerivedExternalClassesIterator(classPath, elementName, onlyClasses));
  }

  private *allReferencesToDerivedExternalClassesIterator(classPath: string | null, elementName: string | null, onlyClasses: boolean): Generator<CAEXReference> {
    const enumerable = this.allPathReferences()
      .select((aliasReference2) => ({
        aliasReference: aliasReference2,
        refClass: CAEXDocumentExtensions.findByPath(this.document, aliasReference2.referenceAttributeValue, true, null),
      }))
      .select((t) => ({ aliasReference: t.aliasReference, refClass: t.refClass }));
    for (const { aliasReference, refClass: val } of enumerable) {
      if (
        !CAEXWrapper.equals(val, null) &&
        (isNullOrEmpty(elementName) || !(val!.tagName !== elementName)) &&
        (!onlyClasses || XmlCAEXSchema.isCAEXClass(aliasReference.element, false))
      ) {
        const val2 = implementsInterface(val, 'IClassWithBaseClassReference') ? (val as unknown as IClassWithBaseClassReference) : null;
        if (val2 !== null && InheritanceExtensions.classIsDerivedFrom(val2, classPath) === true) {
          yield aliasReference;
        }
      }
    }
  }

  /** The alias references with the alias (any alias, if null or empty) from the elements below the object. */
  elementsWithAliasReference(
    caexObject: CAEXBasicObject,
    alias: string | null,
    identifier: CAEXNode_Identifier = CAEXNode_Identifier.ANY,
    elementName: string | null = '',
  ): Enumerable<CAEXNodeReference> {
    const root = CAEXNodeTable.root(caexObject);
    let source: Enumerable<AliasReference>;
    if (isNullOrEmpty(alias)) {
      // C#: a new List filled with AddRange, wrapped in a read only list (a copy of the tables)
      const list = new List<AliasReference>();
      list.addRange(from(this).selectMany(([, v]) => v));
      source = from(list);
    } else {
      const value = this.tryGetValue(alias).value;
      if (value === null) {
        return Enumerable.empty<CAEXNodeReference>();
      }
      source = from(value);
    }
    if (identifier !== CAEXNode_Identifier.ANY) {
      source = source.where((a) => a.identifier === identifier);
    }
    if (isNullOrEmpty(elementName)) {
      return source.where((r) => CAEXNodeTable.isDescendant(r.element, root, false)).cast<CAEXNodeReference>();
    }
    return source.where((r) => CAEXNodeTable.isDecendantWithName(r.element, root, elementName, false)).cast<CAEXNodeReference>();
  }

  /** Removes the element with the provided alias reference from the alias table. */
  removeFromAliasTable(alias: string, xElement: XElement, oldReference: string | null): void {
    const value = this.tryGetValue(alias).value;
    if (value === null) {
      return;
    }
    const aliasReference = from(value).firstOrDefault((a) => a.element === xElement);
    if (aliasReference !== null) {
      value.remove(aliasReference);
      if (LookupService.lookUpService!.supportsUpdate(aliasReference)) {
        const lookUpService = LookupService.lookUpService!;
        const obj = LookupService.lookUpService!.findByPath(XmlCAEXSchema.caexDocument(xElement), aliasReference.referenceAttributeValue);
        lookUpService.onReferenceUpdate(obj !== null ? obj.node : null, aliasReference, oldReference, aliasReference.referenceAttributeValue);
      }
    }
    if (value.count === 0) {
      this.remove(alias);
    }
  }

  /** An alias has changed (or its external reference has been deleted): the references are updated. */
  updateAliasReferences(oldAlias: string | null, newAlias: string | null, deleteReferences = false): void {
    const value = oldAlias === null ? null : this.tryGetValue(oldAlias).value;
    if (oldAlias === null || value === null) {
      return;
    }
    if (newAlias === null && !deleteReferences) {
      newAlias = '';
    }
    for (const item of value) {
      if (newAlias !== null) {
        item.update(item.element, oldAlias, newAlias);
      }
    }
    this.remove(oldAlias);
    if (!deleteReferences && newAlias !== null) {
      const value2 = this.tryGetValue(newAlias).value;
      if (value2 !== null) {
        value2.addRange(value);
      } else {
        this.setItem(newAlias, value);
      }
    }
  }

  private allPathReferences(): Enumerable<AliasReference> {
    return from(this).selectMany(([, v]) => from(v).where((a) => a.isPathReference));
  }
}
