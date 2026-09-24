// Port of Aml.Engine.CAEX.Extensions.CAEXElementFactory (Aml.Engine 4.5.2).

import { ArgumentNullException, NotSupportedException } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { CAEX_CLASSModel_TagNames } from '../CAEX_CLASSModel_TagNames.js';
import { XmlOperation } from '../../xmlext/XmlOperation.js';
import type { CAEXDocument } from '../CAEXDocument.js';
import type { CAEXWrapper } from '../CAEXWrapper.js';

type Ctor<R> = abstract new (...args: never[]) => R;

/** Factory creating new, unattached CAEX objects for a document. */
export class CAEXElementFactory {
  private constructor() {}

  /** Creates a new CAEX object of the provided wrapper type (C# Create&lt;T&gt;). */
  static create<W extends CAEXWrapper>(document: CAEXDocument, type: Ctor<W>): W | null;
  /** Creates a new CAEX object for the provided CAEX tag name. */
  static create(document: CAEXDocument, caexTagName: string | null): CAEXWrapper | null;
  static create(document: CAEXDocument, typeOrTagName: Ctor<CAEXWrapper> | string | null): CAEXWrapper | null {
    if (typeof typeOrTagName === 'function') {
      return CAEXElementFactory.createOfType(document, typeOrTagName);
    }
    return CAEXElementFactory.createOfTagName(document, typeOrTagName);
  }

  private static createOfType<W extends CAEXWrapper>(document: CAEXDocument, type: Ctor<W>): W | null {
    const text = CAEX_CLASSModel_TagNames.tagName(type);
    if (isNullOrEmpty(text)) {
      throw new NotSupportedException("Don't know how to create " + type.name);
    }
    if (document == null) {
      throw new ArgumentNullException('document');
    }
    const childName = document.xName(text);
    const element = document.schemaManager.createElement(null, childName);
    const wrapper = element == null ? null : XmlOperation.createCAEXWrapper(element);
    const val = wrapper instanceof type ? (wrapper as W) : null;
    if (val != null && val.caexDocument == null) {
      val.associatedCAEXDocument = document;
    }
    return val;
  }

  private static createOfTagName(document: CAEXDocument, caexTagName: string | null): CAEXWrapper | null {
    if (document == null) {
      throw new ArgumentNullException('document');
    }
    if (isNullOrEmpty(caexTagName)) {
      throw new NotSupportedException("Don't know how to create " + (caexTagName ?? ''));
    }
    const childName = document.xName(caexTagName);
    const element = document.schemaManager.createElement(null, childName);
    return element == null ? null : XmlOperation.createCAEXWrapper(element);
  }
}
