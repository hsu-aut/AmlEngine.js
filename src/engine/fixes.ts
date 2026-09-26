// Not part of Aml.Engine: optional corrections of data errors of the original.
//
// By default the port behaves like Aml.Engine 4.5.2, including its errors, so that it writes and
// reads documents exactly like the AutomationML Editor and the other tools built on the original.
// The errors below lose or corrupt data; each can be corrected on its own, per document (or per
// container), or for all documents through the default. docs/fixes.md describes each error, its
// correction and how the correction is checked against the original.

import { ArgumentException } from '../system/exceptions.js';
import { XNode } from '../xml/index.js';
import { T } from './registry.js';

/** The data errors of Aml.Engine that can be corrected. */
export const ALL_FIXES = [
  /** xs:base64Binary values are written unencoded, but read base64 decoded. */
  'base64Binary',
  /** xs:gDay and xs:gMonth values do not read back as the number that was written. */
  'datePartValues',
  /** xs:boolean from a number (1, 0) or from "1"/"0" is written as false. */
  'booleanFromNumber',
  /** The Reference setter writes the name of the referenced class instead of its path. */
  'referenceSetter',
  /** The AutomationMLVersion setter (CAEX 3.0) does not change an existing SuperiorStandardVersion. */
  'automationMLVersionSetter',
  /** InternalLink references (CAEX 2.15) to an element without ID lose the ID they create. */
  'internalLinkPartnerId',
  /** Undo of an element content change inserts nested nodes twice. */
  'undoElementContent',
  /** Streaming skips an element that directly follows a matched element. */
  'streamingAdjacentElements',
  /** RelinkPart(oldUri, newUri) keeps the relationships of other parts on the old URI. */
  'relinkPartRelationships',
  /** Converting a document to CAEX 3.0 keeps the CAEX 2.15 AutomationMLVersion information. */
  'conversionAutomationMLVersion',
] as const;

/** A data error of Aml.Engine that can be corrected (see ALL_FIXES and docs/fixes.md). */
export type Fix = (typeof ALL_FIXES)[number];

/** A selection of corrections: a list of names, 'all' or 'none'. */
export type FixSelection = Iterable<Fix> | 'all' | 'none';

/** Set once any correction is selected anywhere: until then no lookup is needed. */
let inUse = false;

/** The corrections of a selection; throws for an unknown name. */
export function fixSet(selection: FixSelection): ReadonlySet<Fix> {
  let set: Set<Fix>;
  if (selection === 'all') {
    set = new Set(ALL_FIXES);
  } else if (selection === 'none') {
    set = new Set();
  } else {
    set = new Set<Fix>();
    for (const f of selection) {
      if (!(ALL_FIXES as readonly string[]).includes(f)) {
        throw new ArgumentException(`Unknown fix '${String(f)}'; the fixes are ${ALL_FIXES.join(', ')}.`, 'selection');
      }
      set.add(f);
    }
  }
  if (set.size > 0) inUse = true;
  return set;
}

let defaults: ReadonlySet<Fix> = new Set();

/** The corrections of documents and containers without their own selection. */
export class Fixes {
  private constructor() {}

  /** The corrections of documents and containers without their own selection (none at first). */
  static get default(): ReadonlySet<Fix> {
    return defaults;
  }

  static set default(selection: FixSelection) {
    defaults = fixSet(selection);
  }

  /**
   * Whether a correction applies: the selection of the document of `context` (a document, a node
   * of a document or a wrapper), else the default.
   */
  static enabled(fix: Fix, context: unknown = null): boolean {
    if (!inUse) return false;
    return (Fixes.of(context) ?? defaults).has(fix);
  }

  /** The own selection of `context` (a document or container) or of the document of a node or wrapper, or null. */
  private static of(context: unknown): ReadonlySet<Fix> | null {
    if (context === null || context === undefined || typeof context !== 'object') return null;
    if ('fixes' in context) return (context as { fixes: ReadonlySet<Fix> | null }).fixes ?? null;
    if (context instanceof XNode || context instanceof T.CAEXWrapper) {
      return T.CAEXDocument.document(context as XNode)?.fixes ?? null;
    }
    return null;
  }
}
