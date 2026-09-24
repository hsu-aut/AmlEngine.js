// The part of System.IO.Compression.ZipArchive that System.IO.Packaging.ZipPackage uses, on an
// in-memory archive (helper for AutomationMLContainer, no C# counterpart in Aml.Engine). The
// entry order, the header fields and the rules for rewriting follow .NET 8 on Windows as observed
// on archives written by Aml.Engine 4.5.2 (see docs/port-notes/7-amlobjects.md):
// - entries keep their order; a deleted entry is removed, a new one is appended;
// - local and central headers: version 20 (made by 0x0014, FAT), no data descriptor, no extra
//   fields, flag 0x0800 only for non-ASCII names, DOS time of the entry's LastWriteTime;
// - CompressionLevel.NoCompression and empty entries are stored, all others deflated;
// - an entry read from the archive and rewritten keeps its compression method and time stamp,
//   an unchanged entry keeps its compressed bytes.
// The deflate streams are produced by fflate and are not byte-identical with the zlib that .NET
// uses; they decompress to the same bytes.

import { deflateSync, inflateSync } from 'fflate';
import { NotSupportedException, SystemException } from '../../../system/exceptions.js';

/** System.IO.InvalidDataException. */
export class InvalidDataException extends SystemException {
  override name = 'InvalidDataException';
}

/** System.IO.Compression.CompressionLevel. */
export enum CompressionLevel {
  Optimal = 0,
  Fastest = 1,
  NoCompression = 2,
  SmallestSize = 3,
}

/** System.IO.Compression.ZipArchiveMode. */
export enum ZipArchiveMode {
  Read = 0,
  Create = 1,
  Update = 2,
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (ISO 3309) of the bytes. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The fields of an entry read from an archive. */
interface OriginalEntry {
  versionMadeBy: number;
  versionNeeded: number;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  externalAttributes: number;
  compressed: Uint8Array;
}

/** The growable content of an entry, shared by the streams opened on it. */
export class EntryBuffer {
  bytes: Uint8Array;
  length: number;
  private readonly _onChange: () => void;

  constructor(initial: Uint8Array, onChange: () => void) {
    this.bytes = initial;
    this.length = initial.length;
    this._onChange = onChange;
  }

  /** Marks the content as changed. */
  changed(): void {
    this._onChange();
  }

  /** Makes room for `capacity` bytes. */
  ensureCapacity(capacity: number): void {
    if (capacity <= this.bytes.length) return;
    const n = new Uint8Array(Math.max(capacity, this.bytes.length * 2, 256));
    n.set(this.bytes.subarray(0, this.length));
    this.bytes = n;
  }

  /** The content. */
  toArray(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

/** A ZipArchiveEntry. */
export class ZipArchiveEntry {
  /** The archive, or `null` when deleted. */
  archive: ZipArchive | null;

  /** The entry name. */
  readonly fullName: string;

  /** The time stamp (local time). */
  lastWriteTime: Date;

  /** The level of a new entry; `null` for an entry read from the archive. */
  readonly compressionLevel: CompressionLevel | null;

  private readonly _original: OriginalEntry | null;
  private _buffer: EntryBuffer | null = null;
  private _modified: boolean;

  /** @internal */
  constructor(archive: ZipArchive, fullName: string, compressionLevel: CompressionLevel | null, original: OriginalEntry | null, lastWriteTime: Date) {
    this.archive = archive;
    this.fullName = fullName;
    this.compressionLevel = compressionLevel;
    this._original = original;
    this.lastWriteTime = lastWriteTime;
    this._modified = original === null;
  }

  /** The uncompressed length. */
  get length(): number {
    if (this._buffer !== null) return this._buffer.length;
    return this._original?.uncompressedSize ?? 0;
  }

  /** ZipArchiveEntry.Delete. */
  delete(): void {
    this.archive?.removeEntry(this);
    this.archive = null;
  }

  /** The content buffer (ZipArchiveEntry.Open in update mode). */
  open(): EntryBuffer {
    if (this._buffer === null) {
      let data: Uint8Array;
      const o = this._original;
      if (o === null) {
        data = new Uint8Array(0);
      } else if (o.method === 0) {
        data = o.compressed.slice();
      } else if (o.method === 8) {
        try {
          data = inflateSync(o.compressed, { out: new Uint8Array(o.uncompressedSize) });
        } catch {
          throw new InvalidDataException('A local file header is corrupt.');
        }
      } else {
        throw new InvalidDataException('The archive entry was compressed using an unsupported compression method.');
      }
      this._buffer = new EntryBuffer(data, () => {
        this._modified = true;
      });
    }
    return this._buffer;
  }

  /** @internal The local file header, data and central directory header for writing. */
  serialize(offset: number): { local: Uint8Array; central: Uint8Array } {
    const nameBytes = new TextEncoder().encode(this.fullName);
    const unicode = /[^\x00-\x7f]/.test(this.fullName);
    let flags: number;
    let method: number;
    let crc: number;
    let compressed: Uint8Array;
    let size: number;
    let dosTime: number;
    let dosDate: number;
    let versionMadeBy = 0x0014;
    let versionNeeded = 20;
    let externalAttributes = 0;
    const o = this._original;
    if (o !== null) {
      versionMadeBy = o.versionMadeBy;
      versionNeeded = o.versionNeeded;
      externalAttributes = o.externalAttributes;
      dosTime = o.dosTime;
      dosDate = o.dosDate;
      flags = o.flags & ~0x0008;
    } else {
      [dosTime, dosDate] = toDosTime(this.lastWriteTime);
      flags = unicode ? 0x0800 : 0;
    }
    if (o !== null && !this._modified) {
      method = o.method;
      crc = o.crc;
      compressed = o.compressed;
      size = o.uncompressedSize;
    } else {
      const data = this._buffer?.toArray() ?? new Uint8Array(0);
      size = data.length;
      crc = crc32(data);
      const store = o !== null ? o.method === 0 : this.compressionLevel === CompressionLevel.NoCompression;
      if (store || data.length === 0) {
        method = 0;
        compressed = data;
      } else {
        method = 8;
        compressed = deflateSync(data, { level: deflateLevel(o !== null ? CompressionLevel.Optimal : (this.compressionLevel ?? CompressionLevel.Optimal)) });
      }
    }
    const local = new Uint8Array(30 + nameBytes.length + compressed.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, versionNeeded, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(compressed, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, versionMadeBy, true);
    cv.setUint16(6, versionNeeded, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, externalAttributes, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    return { local, central };
  }
}

function deflateLevel(level: CompressionLevel): 0 | 1 | 6 | 9 {
  switch (level) {
    case CompressionLevel.Fastest:
      return 1;
    case CompressionLevel.SmallestSize:
      return 9;
    case CompressionLevel.NoCompression:
      return 0;
    default:
      return 6;
  }
}

/** DateTime to MS-DOS time and date (local time, two second resolution). */
function toDosTime(d: Date): [number, number] {
  let year = d.getFullYear();
  if (year < 1980) year = 1980;
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return [time & 0xffff, date & 0xffff];
}

/** A ZIP archive in memory (ZipArchive over a seekable stream). */
export class ZipArchive {
  /** The mode the archive was opened in. */
  readonly mode: ZipArchiveMode;

  private readonly _entries: ZipArchiveEntry[] = [];

  /**
   * Opens the archive in the bytes (Read, Update) or creates a new one (Create, Update on empty
   * bytes).
   * @throws InvalidDataException the bytes are no ZIP archive.
   */
  constructor(bytes: Uint8Array, mode: ZipArchiveMode) {
    this.mode = mode;
    if (mode === ZipArchiveMode.Create || (mode === ZipArchiveMode.Update && bytes.length === 0)) {
      return;
    }
    this.readCentralDirectory(bytes);
  }

  /** The entries in archive order. */
  get entries(): readonly ZipArchiveEntry[] {
    return this._entries;
  }

  /** ZipArchive.CreateEntry(name, level): appends a new entry (time stamp now). */
  createEntry(entryName: string, compressionLevel: CompressionLevel | null = null): ZipArchiveEntry {
    const e = new ZipArchiveEntry(this, entryName, compressionLevel ?? CompressionLevel.Optimal, null, new Date());
    this._entries.push(e);
    return e;
  }

  /** ZipArchive.GetEntry: the first entry with the name (ordinal), or `null`. */
  getEntry(entryName: string): ZipArchiveEntry | null {
    return this._entries.find((e) => e.fullName === entryName) ?? null;
  }

  /** @internal */
  removeEntry(entry: ZipArchiveEntry): void {
    const i = this._entries.indexOf(entry);
    if (i >= 0) this._entries.splice(i, 1);
  }

  /** The archive bytes as ZipArchive.Dispose writes them in Create and Update mode. */
  toBytes(): Uint8Array {
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;
    for (const e of this._entries) {
      const { local, central } = e.serialize(offset);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    }
    const cdOffset = offset;
    const cdSize = centrals.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(cdOffset + cdSize + 22);
    let p = 0;
    for (const l of locals) {
      out.set(l, p);
      p += l.length;
    }
    for (const c of centrals) {
      out.set(c, p);
      p += c.length;
    }
    const v = new DataView(out.buffer);
    v.setUint32(p, 0x06054b50, true);
    v.setUint16(p + 4, 0, true);
    v.setUint16(p + 6, 0, true);
    v.setUint16(p + 8, this._entries.length, true);
    v.setUint16(p + 10, this._entries.length, true);
    v.setUint32(p + 12, cdSize, true);
    v.setUint32(p + 16, cdOffset, true);
    v.setUint16(p + 20, 0, true);
    return out;
  }

  private readCentralDirectory(bytes: Uint8Array): void {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
      if (v.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) {
      throw new InvalidDataException('End of Central Directory record could not be found.');
    }
    const count = v.getUint16(eocd + 10, true);
    const cdOffset = v.getUint32(eocd + 16, true);
    if (count === 0xffff || cdOffset === 0xffffffff) {
      throw new NotSupportedException('ZIP64 archives are not supported.');
    }
    let p = cdOffset;
    const decoder = new TextDecoder('utf-8');
    for (let i = 0; i < count; i++) {
      if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) {
        throw new InvalidDataException('Central Directory corrupt.');
      }
      const versionMadeBy = v.getUint16(p + 4, true);
      const versionNeeded = v.getUint16(p + 6, true);
      const flags = v.getUint16(p + 8, true);
      const method = v.getUint16(p + 10, true);
      const dosTime = v.getUint16(p + 12, true);
      const dosDate = v.getUint16(p + 14, true);
      const crc = v.getUint32(p + 16, true);
      const compressedSize = v.getUint32(p + 20, true);
      const uncompressedSize = v.getUint32(p + 24, true);
      const nameLength = v.getUint16(p + 28, true);
      const extraLength = v.getUint16(p + 30, true);
      const commentLength = v.getUint16(p + 32, true);
      const externalAttributes = v.getUint32(p + 38, true);
      const localOffset = v.getUint32(p + 42, true);
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
        throw new NotSupportedException('ZIP64 archives are not supported.');
      }
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
      p += 46 + nameLength + extraLength + commentLength;
      if (localOffset + 30 > bytes.length || v.getUint32(localOffset, true) !== 0x04034b50) {
        throw new InvalidDataException('A local file header is corrupt.');
      }
      const dataStart = localOffset + 30 + v.getUint16(localOffset + 26, true) + v.getUint16(localOffset + 28, true);
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      const time = fromDosTime(dosTime, dosDate);
      this._entries.push(
        new ZipArchiveEntry(
          this,
          name,
          null,
          { versionMadeBy, versionNeeded, flags, method, dosTime, dosDate, crc, compressedSize, uncompressedSize, externalAttributes, compressed },
          time,
        ),
      );
    }
  }
}

function fromDosTime(time: number, date: number): Date {
  return new Date(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2);
}
