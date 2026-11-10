// Port of Aml.Engine.Resources.Files.AMLResourceStream (Aml.Engine.Resources 4.2.1).
// The Stream is represented by its bytes, as in AMLLibraries.

import { T } from '../../registry.js';
import type { AMLFileType } from './AMLFileType.js';

/** Provides an AMLFile as a stream. The filename and the AutomationML File type is defined. */
export class AMLResourceStream {
  private readonly _amlFileStream: Uint8Array | null;

  private readonly _amlFileType: AMLFileType;

  private readonly _amlFileName: string | null;

  /**
   * @param amlFileStream The byte stream.
   * @param amlFileType The AutomationML file type.
   * @param amlFileName The name of the original file.
   */
  constructor(amlFileStream: Uint8Array | null, amlFileType: AMLFileType, amlFileName: string | null) {
    this._amlFileStream = amlFileStream;
    this._amlFileType = amlFileType;
    this._amlFileName = amlFileName;
  }

  /** The AutomationML file stream. */
  get amlFileStream(): Uint8Array | null {
    return this._amlFileStream;
  }

  /** The AutomationML file type. */
  get amlFileType(): AMLFileType {
    return this._amlFileType;
  }

  /** The AutomationML filename of the original file. */
  get amlFileName(): string | null {
    return this._amlFileName;
  }
}

T.AMLResourceStream = AMLResourceStream;
