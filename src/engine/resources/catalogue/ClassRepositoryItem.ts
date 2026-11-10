// Port of Aml.Engine.Resources.Catalogue.ClassRepositoryItem (Aml.Engine.Resources 4.2.1).
// A C# record: positional properties (init-only in C#, not enforced here), value equality over all
// properties and the exact type (EqualityContract), the record ToString and Deconstruct.

import { T } from '../../registry.js';

/** Item of a ClassRepository. */
export class ClassRepositoryItem {
  /** Name of the class. */
  className: string | null;

  /** CAEX Path to the class. */
  caexPath: string | null;

  /** Base Path to the class. */
  basePath: string | null;

  /** Name of the containing library. */
  libraryName: string | null;

  /** Version of the containing library. */
  libraryVersion: string | null;

  /** AML Edition of the containing document. */
  amlEdition: string | null;

  /** ID of the class. */
  id: string | null;

  /**
   * Item of a ClassRepository.
   * @param className Name of the class.
   * @param caexPath CAEX Path to the class.
   * @param basePath Base Path to the class.
   * @param libraryName Name of the containing library.
   * @param libraryVersion Version of the containing library.
   * @param amlEdition AML Edition of the containing document.
   * @param id ID of the class.
   */
  constructor(
    className: string | null,
    caexPath: string | null,
    basePath: string | null,
    libraryName: string | null,
    libraryVersion: string | null,
    amlEdition: string | null,
    id: string | null = null,
  ) {
    this.className = className;
    this.caexPath = caexPath;
    this.basePath = basePath;
    this.libraryName = libraryName;
    this.libraryVersion = libraryVersion;
    this.amlEdition = amlEdition;
    this.id = id;
  }

  /** The record ToString: `ClassRepositoryItem { ClassName = ..., ..., ID = ... }` (null as empty text). */
  toString(): string {
    let builder = 'ClassRepositoryItem';
    builder += ' { ';
    if (this.printMembers((s) => (builder += s))) {
      builder += ' ';
    }
    builder += '}';
    return builder;
  }

  /** The record PrintMembers: appends the properties (StringBuilder.Append(object) appends nothing for null). */
  protected printMembers(append: (s: string) => void): boolean {
    append('ClassName = ');
    append(this.className ?? '');
    append(', CaexPath = ');
    append(this.caexPath ?? '');
    append(', BasePath = ');
    append(this.basePath ?? '');
    append(', LibraryName = ');
    append(this.libraryName ?? '');
    append(', LibraryVersion = ');
    append(this.libraryVersion ?? '');
    append(', AMLEdition = ');
    append(this.amlEdition ?? '');
    append(', ID = ');
    append(this.id ?? '');
    return true;
  }

  /** The record Equals: same type (EqualityContract) and equal property values (ordinal strings). */
  equals(other: unknown): boolean {
    if (this === other) return true;
    return (
      other instanceof ClassRepositoryItem &&
      this.constructor === other.constructor &&
      this.className === other.className &&
      this.caexPath === other.caexPath &&
      this.basePath === other.basePath &&
      this.libraryName === other.libraryName &&
      this.libraryVersion === other.libraryVersion &&
      this.amlEdition === other.amlEdition &&
      this.id === other.id
    );
  }

  /** operator == of the record: reference equality or Equals, null only equal to null. */
  static equals(left: ClassRepositoryItem | null, right: ClassRepositoryItem | null): boolean {
    return left === right || (left?.equals(right) ?? false);
  }

  /** operator != of the record. */
  static notEquals(left: ClassRepositoryItem | null, right: ClassRepositoryItem | null): boolean {
    return !ClassRepositoryItem.equals(left, right);
  }

  /** Hash key of the record GetHashCode (the type and all property values). */
  equalityKey(): string {
    return JSON.stringify([
      this.constructor.name,
      this.className,
      this.caexPath,
      this.basePath,
      this.libraryName,
      this.libraryVersion,
      this.amlEdition,
      this.id,
    ]);
  }

  /** The record Deconstruct: the positional properties as out parameters. */
  deconstruct(): {
    className: string | null;
    caexPath: string | null;
    basePath: string | null;
    libraryName: string | null;
    libraryVersion: string | null;
    amlEdition: string | null;
    id: string | null;
  } {
    return {
      className: this.className,
      caexPath: this.caexPath,
      basePath: this.basePath,
      libraryName: this.libraryName,
      libraryVersion: this.libraryVersion,
      amlEdition: this.amlEdition,
      id: this.id,
    };
  }
}

T.ClassRepositoryItem = ClassRepositoryItem;
