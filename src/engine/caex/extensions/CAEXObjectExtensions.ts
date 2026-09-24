// Port of Aml.Engine.CAEX.Extensions.CAEXObjectExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { ArgumentNullException } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { from, type Enumerable } from '../../../system/linq.js';
import type { XElement } from '../../../xml/index.js';
import { XmlCAEXAttributes } from '../../xmlext/XmlCAEXAttributes.js';
import { SemanticVersion } from '../../resources/files/SemanticVersion.js';
import type { CAEXBasicObject } from '../CAEXBasicObject.js';
import type { CAEXObject } from '../CAEXObject.js';
import type { CAEXSequence } from '../CAEXSequence.js';
import type { ICAEXBasicObject } from '../ICAEXBasicObject.js';
import type { ICAEXObject } from '../ICAEXObject.js';
import type { RevisionType } from '../RevisionType.js';

/** Extension methods for CAEX objects. */
export class CAEXObjectExtensions {
  private constructor() {}

  /** Creates a copy of the CAEX object with the provided name. */
  static copy(caexObject: CAEXObject, name: string | null): CAEXObject | null {
    const copied = caexObject.copy();
    const cAEXObject = copied instanceof T.CAEXObject ? copied : null;
    if (cAEXObject == null) {
      return null;
    }
    cAEXObject.name = name;
    return cAEXObject;
  }

  /** Gets the full node path (names of all ancestors) of the CAEX object. */
  static getFullNodePath(caexObject: ICAEXObject): string {
    return XmlCAEXAttributes.getFullNodePath(caexObject.node);
  }

  /** Sets the description (obsolete: set the Description property). */
  static setDescription(caexObject: ICAEXObject, description: string | null): void {
    caexObject.description = description;
  }

  /** Creates a new AdditionalInformation element. Internal in C#. */
  static new_AdditionalInformation(caexObject: ICAEXBasicObject, asFirst = true): XElement {
    if (!asFirst) {
      return caexObject.additionalInformation.append(null);
    }
    return caexObject.additionalInformation.prepend(null);
  }

  /** Creates a new named element in the sequence. Internal in C#. */
  static newElement<R extends CAEXObject>(sequence: CAEXSequence<R>, name: string | null, asFirst = true): R {
    const obj = asFirst ? sequence.prepend() : sequence.append();
    obj.name = name;
    return obj;
  }

  /** Determines whether testVersion is a new version of the CAEX object (by the revisions of both). */
  static isNewVersion(caexObject: CAEXObject, testVersion: CAEXObject): boolean {
    const newVersionPath = testVersion.caexPath();
    const list = from<RevisionType>(caexObject.revision)
      .where((r) => !r.isExtension && !isNullOrEmpty(r.newVersion) && cultureEndsWith(r.newVersion, newVersionPath))
      .toList();
    if (list.length > 0) {
      for (const item of list) {
        const newVersionObject = item.newVersionObject;
        if (!(newVersionObject == null) && newVersionObject.version === testVersion.version && newVersionObject.name === testVersion.name) {
          return true;
        }
      }
    }
    const oldVersionPath = caexObject.caexPath();
    const list2 = from<RevisionType>(testVersion.revision)
      .where((r) => !r.isExtension && !isNullOrEmpty(r.oldVersion) && cultureEndsWith(r.oldVersion, oldVersionPath))
      .toList();
    if (list2.length === 0) {
      return false;
    }
    for (const item2 of list2) {
      const oldVersionObject = item2.oldVersionObject;
      if (!(oldVersionObject == null) && oldVersionObject.version === caexObject.version && oldVersionObject.name === caexObject.name) {
        return true;
      }
    }
    return false;
  }

  /** Gets the old versions of the CAEX object (lazy, like the C# iterator). */
  static oldVersions(caexObject: CAEXBasicObject): Iterable<CAEXBasicObject | null> {
    return {
      *[Symbol.iterator]() {
        const list = from<RevisionType>(caexObject.revision)
          .where((r) => !r.isExtension && !isNullOrEmpty(r.oldVersion))
          .toList();
        if (list.length <= 0) {
          return;
        }
        for (const item of list) {
          yield item.oldVersionObject;
        }
      },
    };
  }

  /** Gets the new versions of the CAEX object (lazy, like the C# iterator). */
  static newVersions(caexObject: CAEXBasicObject): Iterable<CAEXObject | null> {
    return {
      *[Symbol.iterator]() {
        const list = from<RevisionType>(caexObject.revision)
          .where((r) => !r.isExtension && !isNullOrEmpty(r.newVersion))
          .toList();
        if (list.length <= 0) {
          return;
        }
        for (const item of list) {
          yield item.newVersionObject;
        }
      },
    };
  }

  /** Gets the revisions describing old versions. */
  static oldRevisions(caexObject: CAEXBasicObject): Enumerable<RevisionType> {
    return from<RevisionType>(caexObject.revision).where((r) => !r.isExtension && !isNullOrEmpty(r.oldVersion));
  }

  /** Gets the revisions describing extended versions. */
  static extensions(caexObject: CAEXBasicObject): Enumerable<RevisionType> {
    return from<RevisionType>(caexObject.revision).where((r) => r.isExtension && !isNullOrEmpty(r.oldVersion));
  }

  /** Gets the version string as SemanticVersion object (missing components are completed). */
  static semanticVersion(caexObject: ICAEXBasicObject, defaultVersion: string | null = null): SemanticVersion | null {
    const text = caexObject.version ?? defaultVersion;
    if (isNullOrEmpty(text)) {
      return null;
    }
    const parsed = SemanticVersion.tryParse(text);
    const val = parsed.value;
    if (!parsed.result || val == null) {
      return null;
    }
    let num = val.version.major;
    let num2 = val.version.minor;
    let num3 = val.version.build;
    let flag = false;
    if (num < 0) {
      num = 1;
      flag = true;
    }
    if (num2 < 0) {
      num2 = 0;
      flag = true;
    }
    if (num3 < 0) {
      num3 = 0;
      flag = true;
    }
    if (flag || !SemanticVersion.tryParseStrict(text).result) {
      return new SemanticVersion(num, num2, num3);
    }
    return val;
  }

  /** Determines whether a revision describes a new version whose path ends with the provided name. */
  static hasNewVersion(caexObject: CAEXBasicObject, name: string | null): boolean {
    return from<RevisionType>(caexObject.revision).any(
      (r) => !r.isExtension && !isNullOrEmpty(r.newVersion) && cultureEndsWith(r.newVersion, name),
    );
  }

  /** Determines whether testVersion is an extended version of the CAEX object. */
  static isExtendedVersion(caexObject: CAEXObject, testVersion: CAEXObject): boolean {
    const oldVersionPath = caexObject.caexPath();
    const list = from<RevisionType>(testVersion.revision)
      .where((r) => r.isExtension && !isNullOrEmpty(r.oldVersion) && cultureEndsWith(r.oldVersion, oldVersionPath))
      .toList();
    if (list.length === 0) {
      return false;
    }
    for (const item of list) {
      const oldVersionObject = item.oldVersionObject;
      if (!(oldVersionObject == null) && oldVersionObject.version === caexObject.version && oldVersionObject.name === caexObject.name) {
        return true;
      }
    }
    return false;
  }
}

/**
 * string.EndsWith(string) is culture sensitive in .NET; the port compares ordinally (identical
 * except for ignorable code points and canonically equivalent sequences).
 */
function cultureEndsWith(s: string, value: string | null): boolean {
  if (value === null || value === undefined) throw new ArgumentNullException('value');
  return s.endsWith(value);
}
