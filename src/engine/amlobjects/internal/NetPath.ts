// The parts of System.IO.Path, File and Directory that the AmlObjects namespace uses (helper, no C#
// counterpart in Aml.Engine). Path functions follow .NET on the platform the code runs on
// (Windows rules on win32, otherwise Unix rules; in a browser Unix rules). File system access is
// synchronous and uses node:fs through `process.getBuiltinModule` (Node 20.16+); without it the
// file functions throw NotSupportedException.

import { ArgumentException, NotSupportedException } from '../../../system/exceptions.js';

/** The subset of node:fs used here. */
export interface SyncFs {
  existsSync(path: string): boolean;
  statSync(path: string, options?: { throwIfNoEntry?: boolean }): { isFile(): boolean; isDirectory(): boolean } | undefined;
  readFileSync(path: string): Uint8Array;
  writeFileSync(path: string, data: Uint8Array): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): unknown;
}

interface NodePath {
  resolve(...paths: string[]): string;
}

type ProcessLike = { platform?: string; getBuiltinModule?: (id: string) => unknown; cwd?: () => string };

function proc(): ProcessLike | undefined {
  return (globalThis as { process?: ProcessLike }).process;
}

const isWindows = proc()?.platform === 'win32';

/** Path.DirectorySeparatorChar. */
export const directorySeparatorChar = isWindows ? '\\' : '/';

function isSep(c: string): boolean {
  return c === '/' || (isWindows && c === '\\');
}

/** Length of the root of the path ("C:\", "\\server\share\", "/"), 0 if relative. */
function rootLength(path: string): number {
  if (!isWindows) return path.startsWith('/') ? 1 : 0;
  if (path.length >= 2 && isSep(path[0]!) && isSep(path[1]!)) {
    // UNC: \\server\share\
    let i = 2;
    let parts = 0;
    while (i < path.length) {
      if (isSep(path[i]!)) {
        parts++;
        if (parts === 2) return i + 1;
      }
      i++;
    }
    return path.length;
  }
  if (path.length >= 2 && path[1] === ':' && /[A-Za-z]/.test(path[0]!)) {
    return path.length >= 3 && isSep(path[2]!) ? 3 : 2;
  }
  return path.length >= 1 && isSep(path[0]!) ? 1 : 0;
}

function checkInvalid(path: string): void {
  if (path.includes('\0')) throw new ArgumentException('Null character in path.', 'path');
}

/** Path.IsPathRooted. */
export function isPathRooted(path: string | null): boolean {
  if (path == null) return false;
  return rootLength(path) > 0;
}

/** Path.GetExtension: '' when there is none, `null` for `null`. */
export function getExtension(path: string | null): string | null {
  if (path == null) return null;
  const length = path.length;
  for (let i = length - 1; i >= 0; i--) {
    const ch = path[i]!;
    if (ch === '.') {
      if (i !== length - 1) return path.substring(i, length);
      return '';
    }
    if (isSep(ch) || (isWindows && ch === ':')) break;
  }
  return '';
}

/** Path.GetFileName. */
export function getFileName(path: string | null): string | null {
  if (path == null) return null;
  const root = isWindows ? rootLength(path) : 0;
  for (let i = path.length - 1; i >= root; i--) {
    if (isSep(path[i]!) || (isWindows && i < 2 && path[i] === ':')) return path.substring(i + 1);
  }
  return path.substring(root);
}

/** Path.GetFileNameWithoutExtension. */
export function getFileNameWithoutExtension(path: string | null): string | null {
  const fileName = getFileName(path);
  if (fileName == null) return null;
  const i = fileName.lastIndexOf('.');
  return i === -1 ? fileName : fileName.substring(0, i);
}

/**
 * Path.GetDirectoryName (.NET Core): `null` for `null`, empty or root paths; the directory part
 * with normalized separators otherwise.
 */
export function getDirectoryName(path: string | null): string | null {
  if (path == null || path.length === 0) return null;
  checkInvalid(path);
  const root = rootLength(path);
  let end = path.length;
  if (end <= root) return null;
  while (end > root && !isSep(path[end - 1]!)) end--;
  while (end > root && isSep(path[end - 1]!)) end--;
  const dir = path.substring(0, end);
  return isWindows ? normalizeSeparators(dir) : dir;
}

function normalizeSeparators(path: string): string {
  // Keeps a leading "\\" (UNC), collapses other runs of separators to one '\'.
  let result = '';
  for (let i = 0; i < path.length; i++) {
    const c = path[i]!;
    if (isSep(c)) {
      if (i > 0 && isSep(path[i - 1]!) && i !== 1) continue;
      result += '\\';
    } else {
      result += c;
    }
  }
  return result;
}

/** Path.Combine(path1, path2). */
export function combine(path1: string, path2: string): string {
  if (path1 == null) throw new ArgumentException('Value cannot be null.', 'path1');
  if (path2 == null) throw new ArgumentException('Value cannot be null.', 'path2');
  if (path2.length === 0) return path1;
  if (path1.length === 0 || isPathRooted(path2)) return path2;
  return isSep(path1[path1.length - 1]!) ? path1 + path2 : path1 + directorySeparatorChar + path2;
}

/** node:fs, or `null` when not available (browser, old Node). */
export function tryGetFs(): SyncFs | null {
  const fs = proc()?.getBuiltinModule?.('node:fs') as SyncFs | undefined;
  return fs ?? null;
}

/** node:fs, or NotSupportedException. */
export function getFs(): SyncFs {
  const fs = tryGetFs();
  if (fs == null) throw new NotSupportedException('File system access is not available in this environment.');
  return fs;
}

/** Path.GetFullPath. */
export function getFullPath(path: string): string {
  const nodePath = proc()?.getBuiltinModule?.('node:path') as NodePath | undefined;
  if (nodePath == null) throw new NotSupportedException('File system access is not available in this environment.');
  return nodePath.resolve(path);
}

/** File.Exists: `false` for invalid paths or when the path is a directory. */
export function fileExists(path: string | null): boolean {
  if (path == null || path.length === 0) return false;
  const fs = getFs();
  try {
    const st = fs.statSync(path, { throwIfNoEntry: false });
    return st !== undefined && st.isFile();
  } catch {
    return false;
  }
}

/** Directory.Exists. */
export function directoryExists(path: string | null): boolean {
  if (path == null || path.length === 0) return false;
  const fs = getFs();
  try {
    const st = fs.statSync(path, { throwIfNoEntry: false });
    return st !== undefined && st.isDirectory();
  } catch {
    return false;
  }
}
