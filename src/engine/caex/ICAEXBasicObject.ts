// Port of Aml.Engine.CAEX.ICAEXBasicObject (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { DateTime } from '../../system/index.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { ValueSequence } from './ValueSequence.js';
import type { ChangeMode } from './ChangeMode.js';
import type { CopyrightType } from './CopyrightType.js';
import type { DescriptionType } from './DescriptionType.js';
import type { RevisionType } from './RevisionType.js';
import type { SourceObjectInformationType } from './SourceObjectInformationType.js';
import type { VersionType } from './VersionType.js';

type Ctor<C> = abstract new (...args: never[]) => C;

/** Interface for the CAEXBasicObject: header information which exists for all CAEX elements. */
export interface ICAEXBasicObject extends ICAEXWrapper {
  /** Gets the collection of AdditionalInformation values contained in this instance. */
  readonly additionalInformation: ValueSequence<unknown>;
  /** Gets and sets the change mode (optional in CAEX). */
  changeMode: ChangeMode;
  /** Gets and sets the Copyright. */
  copyright: string | null;
  /** Gets the wrapper for the Copyright element. */
  readonly copyrightElement: CopyrightType;
  /** Gets and sets the Description. */
  description: string | null;
  /** Gets the wrapper for the Description element. */
  readonly descriptionElement: DescriptionType;
  /** Gets the collection of Revision objects. */
  readonly revision: CAEXSequence<RevisionType>;
  /** Gets the collection of SourceObjectInformation objects. */
  readonly sourceObjectInformation: CAEXSequence<SourceObjectInformationType>;
  /** Gets and sets the Version. */
  version: string | null;
  /** Gets the wrapper for the Version element. */
  readonly versionElement: VersionType;

  /** Gets the CAEXSequence owned by this instance, which contains the specified CAEX object. */
  caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null;

  /** C# Container<T>(): the sequence for elements of the given type (class constructor). */
  container<TW extends CAEXWrapper>(type: Ctor<TW>): CAEXSequence<TW> | null;

  /** Inserts the CAEX object in its sequence, Insert(obj, asFirst, asIs), or at a position, Insert(pos, obj). */
  insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  insert(pos: number, caexObject: CAEXWrapper | null): boolean;

  /** Imports (copies) the CAEX object into its associated sequence. */
  import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses?: boolean): CAEXWrapper | null;

  /** Creates a new Revision object. */
  new_Revision(date: DateTime, author: string | null, asFirst?: boolean): RevisionType | null;
}

registerInterfaceBases('ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
