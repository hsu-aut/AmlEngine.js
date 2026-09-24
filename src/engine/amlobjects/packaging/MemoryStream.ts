// A System.IO.Stream on bytes in memory (helper for AutomationMLContainer, no C# counterpart in
// Aml.Engine): System.IO.MemoryStream for streams a caller passes to or gets from the container,
// and the stream on the content of a package part (ZipArchiveEntry stream wrapped by
// ZipWrappingStream, with the read/write permissions of System.IO.Packaging).

import { ArgumentException, ArgumentOutOfRangeException, NotSupportedException, ObjectDisposedException } from '../../../system/exceptions.js';
import { EntryBuffer } from './ZipArchive.js';

/** System.IO.SeekOrigin. */
export enum SeekOrigin {
  Begin = 0,
  Current = 1,
  End = 2,
}

/** A seekable stream on bytes in memory. */
export class MemoryStream {
  private readonly _buffer: EntryBuffer;
  private _position = 0;
  private _disposed = false;
  private readonly _canRead: boolean;
  private readonly _canWrite: boolean;

  /**
   * `new MemoryStream()` (empty, writable) or `new MemoryStream(bytes)` (a copy of the bytes,
   * writable). The internal form (buffer, canRead, canWrite) is the stream on a package part.
   */
  constructor(data?: Uint8Array | EntryBuffer | null, canRead = true, canWrite = true) {
    if (data instanceof EntryBuffer) {
      this._buffer = data;
    } else {
      this._buffer = new EntryBuffer((data ?? new Uint8Array(0)).slice(), () => {});
    }
    this._canRead = canRead;
    this._canWrite = canWrite;
  }

  /** Stream.CanRead. */
  get canRead(): boolean {
    return !this._disposed && this._canRead;
  }

  /** Stream.CanWrite. */
  get canWrite(): boolean {
    return !this._disposed && this._canWrite;
  }

  /** Stream.CanSeek. */
  get canSeek(): boolean {
    return !this._disposed;
  }

  /** Stream.Length. */
  get length(): number {
    this.throwIfDisposed();
    return this._buffer.length;
  }

  /** Stream.Position. */
  get position(): number {
    this.throwIfDisposed();
    return this._position;
  }

  set position(value: number) {
    this.throwIfDisposed();
    if (value < 0) throw new ArgumentOutOfRangeException('value', 'Non-negative number required.');
    this._position = value;
  }

  /** Stream.Seek. */
  seek(offset: number, origin: SeekOrigin): number {
    this.throwIfDisposed();
    const base = origin === SeekOrigin.Begin ? 0 : origin === SeekOrigin.Current ? this._position : this._buffer.length;
    const p = base + offset;
    if (p < 0) throw new ArgumentException('An attempt was made to move the position before the beginning of the stream.');
    this._position = p;
    return p;
  }

  /** Stream.SetLength. */
  setLength(value: number): void {
    this.throwIfDisposed();
    if (!this._canWrite) throw new NotSupportedException('Stream does not support writing.');
    if (value < this._buffer.length) {
      this._buffer.length = value;
    } else {
      this._buffer.ensureCapacity(value);
      this._buffer.bytes.fill(0, this._buffer.length, value);
      this._buffer.length = value;
    }
    if (this._position > value) this._position = value;
    this._buffer.changed();
  }

  /** Stream.Read(buffer, offset, count): the number of bytes read. */
  read(buffer: Uint8Array, offset = 0, count: number = buffer.length - offset): number {
    this.throwIfDisposed();
    if (!this._canRead) throw new NotSupportedException('Stream does not support reading.');
    const n = Math.max(0, Math.min(count, this._buffer.length - this._position));
    buffer.set(this._buffer.bytes.subarray(this._position, this._position + n), offset);
    this._position += n;
    return n;
  }

  /** Stream.ReadByte: the byte, or -1 at the end. */
  readByte(): number {
    const b = new Uint8Array(1);
    return this.read(b, 0, 1) === 1 ? b[0]! : -1;
  }

  /** Stream.Write(buffer, offset, count). */
  write(buffer: Uint8Array, offset = 0, count: number = buffer.length - offset): void {
    this.throwIfDisposed();
    if (!this._canWrite) throw new NotSupportedException('Stream does not support writing.');
    const end = this._position + count;
    this._buffer.ensureCapacity(end);
    if (this._position > this._buffer.length) this._buffer.bytes.fill(0, this._buffer.length, this._position);
    this._buffer.bytes.set(buffer.subarray(offset, offset + count), this._position);
    this._position = end;
    if (end > this._buffer.length) this._buffer.length = end;
    this._buffer.changed();
  }

  /** Stream.CopyTo: copies from the current position to the end into the destination. */
  copyTo(destination: MemoryStream): void {
    const rest = new Uint8Array(Math.max(0, this.length - this.position));
    const n = this.read(rest, 0, rest.length);
    destination.write(rest, 0, n);
  }

  /** Stream.Flush (no operation). */
  flush(): void {
    this.throwIfDisposed();
  }

  /** MemoryStream.ToArray: a copy of the whole content (also after closing). */
  toArray(): Uint8Array {
    return this._buffer.toArray();
  }

  /** Stream.Close. */
  close(): void {
    this.dispose();
  }

  /** Stream.Dispose. */
  dispose(): void {
    this._disposed = true;
  }

  private throwIfDisposed(): void {
    if (this._disposed) throw new ObjectDisposedException('Cannot access a closed Stream.');
  }
}
