// Oracle parity for Aml.Engine.Resources 4.2.1: the library catalog (PublicLibraryCatalog with the
// System.Text.Json emulation), the file models (AMLFileMetaModel, AMLDomainEnumMapping,
// AMLLibraryModel, AMLResourceStream), SignedLibraryVersionExtensions, ClassRepositoryItem, the
// type converters and the embedded catalog resource. The JS counterpart of
// oracle/ServicesResourcesOracle.cs: every section makes the same calls on the cases of
// test/services/resources/cases.json (scripts/gen-services-resources.mjs) and records the same
// lines. Keep both files in sync.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { oracleOut } from '../setup/oracle-out.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { TypeConverter } from '../../src/system/TypeConverter.js';
import { serializeJson } from '../../src/system/Json.js';
import {
  PublicLibraryCatalog,
  PublicLibraryCatalog_Library,
  PublicLibraryCatalog_LibraryRevision,
  PublicLibraryCatalog_LibraryType,
  PublicLibraryCatalog_LibraryVersion,
} from '../../src/engine/resources/catalogue/PublicLibraryCatalog.js';
import { SignedLibraryVersionExtensions as X } from '../../src/engine/resources/catalogue/SignedLibraryVersionExtensions.js';
import type { SignedLibraryVersionLink } from '../../src/engine/resources/catalogue/SignedLibraryVersionExtensions.js';
import type { ISignedLibraryVersion } from '../../src/engine/resources/catalogue/ISignedLibraryVersion.js';
import { ClassRepositoryItem } from '../../src/engine/resources/catalogue/ClassRepositoryItem.js';
import { StringComparisonAlgorithmEnum } from '../../src/engine/resources/catalogue/StringComparisonAlgorithmEnum.js';
import { AMLFileMetaModel } from '../../src/engine/resources/files/AMLFileMetaModel.js';
import { AMLFileContentType } from '../../src/engine/resources/files/AMLFileContentType.js';
import { AMLFileType } from '../../src/engine/resources/files/AMLFileType.js';
import { AMLDomainEnum } from '../../src/engine/resources/files/AMLDomainEnum.js';
import { AMLDomainEnumMapping } from '../../src/engine/resources/files/AMLDomainEnumMapping.js';
import { AMLLibraryModel } from '../../src/engine/resources/files/AMLLibraryModel.js';
import { AMLLibraryTypeEnum } from '../../src/engine/resources/files/AMLLibraryTypeEnum.js';
import { AMLResourceStream } from '../../src/engine/resources/files/AMLResourceStream.js';
import { SemanticVersion } from '../../src/engine/resources/files/SemanticVersion.js';
import { SemanticVersionTypeConverter } from '../../src/engine/resources/files/SemanticVersionTypeConverter.js';
import { EnumDescriptionTypeConverter } from '../../src/engine/resources/EnumDescriptionTypeConverter.js';
import { AMLLibraries } from '../../src/engine/resources/libraries/AMLLibraries.js';
import { EMBEDDED_LIBRARIES } from '../../src/engine/resources/libraries/data/index.js';
import { AccessRightsEnum } from '../../src/engine/services/model/AccessRightsEnum.js';
import { AMLEditionEnum } from '../../src/engine/services/model/AMLEditionEnum.js';
import { CAEXDocument_CAEXSchema } from '../../src/engine/caex/CAEXDocument.js';
import { AMLLibraryServerProfile } from '../../src/engine/services/model/AMLLibraryServerProfile.js';
import { Version } from '../../src/engine/amlobjects/internal/Version.js';

const casesDir = resolve(__dirname, 'resources');
const expectedFile = join(oracleOut, 'services', 'resources.json');
const workDir = join(oracleOut, 'services', 'resources-js-work');

type Section = Record<string, string[]>;
type Cases = {
  catalogs: { name: string; text?: string; bytes?: string; resource?: string; ops: unknown[][] }[];
  fileNames: string[];
  fileGroups: string[][];
  enumStrings: string[];
  semverStrings: string[];
  items: (string | null)[][];
  profiles: string[];
};

// ---------------------------------------------------------------- recording

function replaceAllCi(text: string, find: string, repl: string): string {
  if (!find) return text;
  const lower = text.toLowerCase();
  const f = find.toLowerCase();
  let out = '';
  let i = 0;
  for (;;) {
    const j = lower.indexOf(f, i);
    if (j < 0) break;
    out += text.substring(i, j) + repl;
    i = j + f.length;
  }
  return out + text.substring(i);
}

class Rec {
  readonly lines: string[] = [];
  v(label: string, f: () => unknown): void {
    this.add(label + '=' + Tr(f));
  }
  do(label: string, a: () => unknown): void {
    let s = 'ok';
    try {
      a();
    } catch (e) {
      s = ex(e);
    }
    this.add(label + '=' + s);
  }
  add(line: string): void {
    // The oracle writes its output with System.Text.Json, which replaces lone surrogates.
    line = line.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, String.fromCharCode(0xfffd));
    line = replaceAllCi(line, workDir, '<WORK>');
    line = replaceAllCi(line, workDir.replace(/\\/g, '/'), '<WORK>');
    this.lines.push(line);
  }
}

function kase(o: Section, name: string, action: (r: Rec) => void): void {
  const r = new Rec();
  try {
    action(r);
  } catch (e) {
    r.add('abort:' + ex(e));
  }
  o[name] = r.lines;
}

function ex(e: unknown): string {
  const name = dotNetExceptionName(e);
  return name === 'NullReferenceException' ? '!' + name : '!' + name + ': ' + (e as Error).message;
}

function Tr(f: () => unknown): string {
  try {
    return F(f());
  } catch (e) {
    return ex(e);
  }
}

const B = (b: boolean) => (b ? 'true' : 'false');
const N = (s: string | null | undefined) => s ?? 'null';
const hashBytes = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').toUpperCase().substring(0, 16);
/** C# `enum + "=" + (int)enum`: the member name (or the number) and the number. */
const E = (en: any, v: number) => ((en[v] as string | undefined) ?? String(v)) + '=' + v;

function F(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return B(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof SemanticVersion) return 'SV(' + v.toString() + ')';
  if (v instanceof Version) return 'Version(' + v.toString() + ')';
  if (v instanceof Uint8Array) return 'bytes(' + v.length + ':' + hashBytes(v) + ')';
  if (v instanceof PublicLibraryCatalog_LibraryVersion) return V(v);
  if (v instanceof PublicLibraryCatalog_Library) return L(v);
  if (v instanceof PublicLibraryCatalog_LibraryType) return LT(v);
  if (v instanceof PublicLibraryCatalog_LibraryRevision) return R(v, null);
  if (typeof (v as any)[Symbol.iterator] === 'function') return '[' + [...(v as Iterable<unknown>)].map(F).join(',') + ']';
  return (v as object).constructor.name;
}

/** A string of the cases: null, text, or "@hex:" + UTF-16 code units (texts that are no valid UTF-16). */
function str(s: unknown): string | null {
  if (s === null || s === undefined) return null;
  const t = s as string;
  if (!t.startsWith('@hex:')) return t;
  let r = '';
  for (let i = 5; i < t.length; i += 4) r += String.fromCharCode(parseInt(t.substring(i, i + 4), 16));
  return r;
}

// ---------------------------------------------------------------- catalog descriptions

type LV = PublicLibraryCatalog_LibraryVersion;

const links = (l: (string | null)[] | null) => (l === null ? 'null' : '[' + l.map(N).join(',') + ']');
const LT = (t: PublicLibraryCatalog_LibraryType | null) => (t === null ? 'null' : 'LT(' + N(t.caexType) + '|n=' + (t.libraries === null ? 'null' : t.libraries.length) + ')');
const L = (l: PublicLibraryCatalog_Library | null) => (l === null ? 'null' : 'L(' + N(l.name) + '|n=' + (l.versions === null ? 'null' : l.versions.length) + ')');

function R(r: PublicLibraryCatalog_LibraryRevision, owner: LV | null): string {
  const rel = r.relatedLibraryVersion === null ? 'null' : r.relatedLibraryVersion === owner ? 'self' : 'V:' + N(r.relatedLibraryVersion.version);
  return 'R(' + N(r.downloadLink) + '|' + links(r.downloadLinks) + '|' + N(r.signature) + '|rel=' + rel + ')';
}

function chain(v: LV): string {
  const parts: string[] = [];
  let n = 0;
  for (let r = v.revision; r !== null && n < 100; r = r.revision, n++) parts.push(R(r, v));
  return parts.join('>');
}

function V(v: LV | null): string {
  if (v === null) return 'null';
  return (
    'V(' + N(v.version) + '|' + N(v.caexVersion) + '|' + N(v.amlEdition) + '|' + B(v.isArchived) + '|' + N(v.description) + '|' + N(v.downloadLink) + '|' +
    links(v.downloadLinks) + '|' + N(v.sources) + '|' + N(v.signature) + '|' + N(v.publicKey) + '|lib=' + (v.library === null ? 'null' : N(v.library.name)) + '|rev=' + chain(v) + ')'
  );
}

function dump(c: PublicLibraryCatalog | null): string {
  if (c === null) return 'null';
  let s = 'PublicKey=' + N(c.publicKey);
  if (c.libraryTypes === null) return s + '\ntypes=null';
  c.libraryTypes.forEach((t, i) => {
    s += `\nT${i}=` + LT(t);
    if (t?.libraries == null) return;
    t.libraries.forEach((l, j) => {
      s += `\nT${i}L${j}=` + L(l);
      if (l?.versions == null) return;
      l.versions.forEach((v, k) => {
        s += `\nT${i}L${j}V${k}=` + V(v);
        if (v !== null) s += '|libref=' + (v.library === null ? 'null' : v.library === l ? 'own' : 'other');
      });
    });
  });
  return s;
}

function owner(v: LV, o: ISignedLibraryVersion): string {
  if (o === v) return 'v';
  let k = 1;
  for (let r = v.revision; r !== null && k < 100; r = r.revision, k++) if (r === o) return 'r' + k;
  return '?';
}

const linkList = (l: Iterable<SignedLibraryVersionLink>, v: LV) => '[' + [...l].map((t) => N(t.linkAddress) + '@' + owner(v, t.revision)).join(',') + ']';

// ---------------------------------------------------------------- 1. catalogs

function deser(f: () => PublicLibraryCatalog | null): { text: string; c: PublicLibraryCatalog | null } {
  try {
    const c = f();
    return { text: dump(c), c };
  } catch (e) {
    return { text: ex(e), c: null };
  }
}

const utf8 = (s: string) => new TextEncoder().encode(s);

function catalogsSection(cases: Cases['catalogs']): Section {
  const o: Section = {};
  for (const node of cases) {
    const name = node.name;
    kase(o, name, (r) => {
      let c: PublicLibraryCatalog | null = null;
      let bytes: Uint8Array | null = null;
      if (node.resource !== undefined) {
        bytes = AMLLibraries.getManifestResourceStream(node.resource)!;
      } else if (node.bytes !== undefined) {
        bytes = new Uint8Array(Buffer.from(node.bytes, 'base64'));
      } else if (node.text !== undefined) {
        const text = str(node.text)!;
        const d = deser(() => PublicLibraryCatalog.deserialize(text));
        r.add('str=' + d.text);
        c = d.c;
        bytes = utf8(text);
        const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]);
        r.add('bom=' + deser(() => PublicLibraryCatalog.deserialize(bom)).text);
      } else {
        c = new PublicLibraryCatalog();
      }
      if (bytes !== null) {
        const ds = deser(() => PublicLibraryCatalog.deserialize(bytes));
        r.add('stream=' + ds.text);
        const file = join(workDir, name + '.json');
        writeFileSync(file, bytes);
        r.add('file=' + deser(() => AMLLibraries.readAutomationMLLibraryInformation(file)).text);
        if (c === null && node.text === undefined) c = ds.c;
      }
      if (c === null) {
        r.add('nocatalog');
        return;
      }
      node.ops.forEach((op, i) => r.add(i + ':' + (op[0] as string) + '=' + Tr(() => runOp(c!, op))));
      // The final state with the default options (compact) and indented.
      r.v('compact', () => serializeJson(c!.toJsonObject()));
      r.v('indented', () => serializeJson(c!.toJsonObject(), true));
    });
  }
  kase(o, 'readinfo', (r) => {
    r.v('null', () => dump(AMLLibraries.readAutomationMLLibraryInformation(null)));
    r.v('empty', () => dump(AMLLibraries.readAutomationMLLibraryInformation('')));
    r.v('missing', () => dump(AMLLibraries.readAutomationMLLibraryInformation(join(workDir, 'missing.json'))));
    r.v('missing-dir', () => dump(AMLLibraries.readAutomationMLLibraryInformation(join(workDir, 'no-dir', 'missing.json'))));
    r.v('deserializeNull', () => dump(PublicLibraryCatalog.deserialize(null)));
  });
  return o;
}

const S = (op: unknown[], i: number) => str(op[i]);
const I = (op: unknown[], i: number) => op[i] as number;

function ver(c: PublicLibraryCatalog, op: unknown[]): LV | null {
  const l = c.item(S(op, 1), S(op, 2));
  const idx = I(op, 3);
  return l?.versions != null && idx < l.versions.length ? l.versions[idx] : null;
}

function target(v: LV, depth: number): ISignedLibraryVersion | null {
  let t: ISignedLibraryVersion | null = v;
  for (let i = 0; i < depth && t !== null; i++) t = t.revision;
  return t;
}

function runOp(c: PublicLibraryCatalog, op: unknown[]): unknown {
  const name = op[0] as string;
  switch (name) {
    case 'item':
      return LT(c.item(S(op, 1)));
    case 'item2':
      return L(c.item(S(op, 1), S(op, 2)));
    case 'getPub':
      return V(c.getPublishedLibraryVersion(S(op, 1), S(op, 2), S(op, 3), S(op, 4)));
    case 'isArchived':
      return c.isArchived(S(op, 1), S(op, 2), S(op, 3));
    case 'listed':
      return c.libraryVersionIsListed(S(op, 1), S(op, 2), S(op, 3), S(op, 4));
    case 'libVersion':
      return V(c.libVersion(S(op, 1), S(op, 2), S(op, 3), S(op, 4)));
    case 'libVersions':
      return c.libVersions(S(op, 1), S(op, 2), S(op, 3));
    case 'libraries':
      return c.libraries(S(op, 1));
    case 'getOrCreate': {
      const t = c.getOrCreate(S(op, 1));
      return LT(t) + '|count=' + c.libraryTypes!.length;
    }
    case 'getOrCreateLib': {
      const t = c.getOrCreate(S(op, 1));
      const l = t.getOrCreate(S(op, 2));
      return L(l) + '|count=' + t.libraries!.length;
    }
    case 'highest': {
      const l = c.item(S(op, 1), S(op, 2));
      return l === null ? 'nolib' : V(l.highestVersion(S(op, 3)));
    }
    case 'format':
      return PublicLibraryCatalog_Library.formatCAEXVersionString(S(op, 1));
    case 'addVersion': {
      const l = c.getOrCreate(S(op, 1)).getOrCreate(S(op, 2));
      const v = new PublicLibraryCatalog_LibraryVersion();
      v.version = S(op, 3);
      v.caexVersion = S(op, 4);
      v.amlEdition = S(op, 5);
      l.versions!.push(v);
      return L(l);
    }
    case 'dump':
      return dump(c);
    case 'serialize': {
      const bytes = c.serializeToStream();
      return F(bytes) + '|' + new TextDecoder().decode(bytes);
    }
    case 'save': {
      const p = S(op, 1);
      const path = p === null ? null : p.length === 0 ? '' : join(workDir, p);
      c.save(path);
      const bytes = new Uint8Array(readFileSync(path!));
      return F(bytes) + '|' + new TextDecoder().decode(bytes);
    }
    case 'onDeserialized':
      c.onDeserialized();
      return dump(c);
    case 'custom':
      return custom();
  }
  const v = ver(c, op);
  if (v === null) return 'nover';
  switch (name) {
    case 'isCaex':
      return v.isCaexVersion(S(op, 4));
    case 'semver': {
      const sv = v.semanticVersion;
      return F(sv) + '|' + N(v.version) + '|' + Tr(() => v.netVersion);
    }
    case 'addSource':
      v.addSource(S(op, 4));
      return N(v.sources);
    case 'links':
      return linkList(v.allDownloadLinks, v);
    case 'set': {
      const value = S(op, 5);
      switch (S(op, 4)) {
        case 'Version':
          v.version = value;
          break;
        case 'CAEXVersion':
          v.caexVersion = value;
          break;
        case 'AMLEdition':
          v.amlEdition = value;
          break;
        case 'Description':
          v.description = value;
          break;
        case 'Sources':
          v.sources = value;
          break;
        case 'PublicKey':
          v.publicKey = value;
          break;
        case 'IsArchived':
          v.isArchived = value === 'true';
          break;
        case 'DownloadLinks':
          v.downloadLinks = value === null ? null : value.split('|');
          break;
      }
      return V(v);
    }
  }
  const t = target(v, I(op, 4));
  if (t === null) return 'norev';
  switch (name) {
    case 'addLink':
      X.addDownloadLink(t, S(op, 5));
      return links(t.downloadLinks);
    case 'addRev': {
      const rev = X.addRevision(t, S(op, 5));
      return R(rev as PublicLibraryCatalog_LibraryRevision, v) + '|chain=' + chain(v);
    }
    case 'addRevObj': {
      const nested = S(op, 6);
      const obj = new PublicLibraryCatalog_LibraryRevision();
      obj.signature = S(op, 5);
      obj.downloadLink = 'dl';
      if (nested !== null) {
        obj.revision = new PublicLibraryCatalog_LibraryRevision();
        obj.revision.signature = nested;
      }
      const rev = X.addRevision(t, obj);
      return B(rev === obj) + '|' + R(rev as PublicLibraryCatalog_LibraryRevision, v) + '|chain=' + chain(v);
    }
    case 'ext':
      return Tr(() => X.description(t)) + '|' + Tr(() => X.libraryName(t)) + '|' + Tr(() => X.version(t));
    case 'setDesc':
      X.setDescription(t, S(op, 5));
      return N(v.description);
    case 'getLinks':
      return linkList(X.getLinks(t), v);
    case 'transform':
      t.downloadLink = S(op, 5);
      X.transformLink(t);
      return N(t.downloadLink) + '|' + links(t.downloadLinks);
  }
  throw new Error('unknown op ' + name);
}

/** An ISignedLibraryVersion that is neither a LibraryVersion nor a LibraryRevision. */
class CustomSigned implements ISignedLibraryVersion {
  downloadLink: string | null = null;
  downloadLinks: string[] | null = null;
  revision: PublicLibraryCatalog_LibraryRevision | null = null;
  signature: string | null = null;
}

function custom(): string {
  const x = new CustomSigned();
  const parts = [
    Tr(() => X.description(x)),
    Tr(() => X.libraryName(x)),
    Tr(() => X.version(x)),
    Tr(() => {
      X.setDescription(x, 'd');
      return 'set';
    }),
    Tr(() => {
      X.addDownloadLink(x, 'a');
      X.addDownloadLink(x, 'a');
      X.addDownloadLink(x, '');
      X.addDownloadLink(x, null);
      return links(x.downloadLinks);
    }),
    Tr(() => [...X.getLinks(x)].map((t) => t.linkAddress + '@' + (t.revision === x ? 'x' : '?')).join(',')),
    Tr(() => X.addRevision(x, 's')),
    Tr(() => x.revision),
    Tr(() => X.addRevision(x, new PublicLibraryCatalog_LibraryRevision())),
    Tr(() => (x.revision === null ? 'null' : R(x.revision, null))),
  ];
  const orphan = new PublicLibraryCatalog_LibraryRevision();
  parts.push(Tr(() => X.description(orphan)) + '/' + Tr(() => X.libraryName(orphan)) + '/' + Tr(() => X.version(orphan)));
  parts.push(
    Tr(() => {
      X.setDescription(orphan, 'x');
      return 'set';
    }),
  );
  parts.push(Tr(() => X.addRevision(orphan, 'o')));
  parts.push(Tr(() => R(orphan.revision!, null)));
  const empty = new CustomSigned();
  empty.downloadLinks = [];
  parts.push(Tr(() => X.getLinks(empty).count()));
  empty.downloadLink = 'moved';
  X.transformLink(empty);
  parts.push(N(empty.downloadLink) + links(empty.downloadLinks));
  const none = new CustomSigned();
  X.transformLink(none);
  parts.push(N(none.downloadLink) + links(none.downloadLinks));
  const lazy = new CustomSigned();
  lazy.downloadLinks = ['1'];
  const seq = X.getLinks(lazy);
  lazy.downloadLinks.push('2');
  lazy.downloadLinks = ['other'];
  parts.push([...seq].map((t) => t.linkAddress).join(','));
  const lazyEmpty = new CustomSigned();
  lazyEmpty.downloadLinks = [];
  const seq2 = X.getLinks(lazyEmpty);
  lazyEmpty.downloadLinks.push('late');
  parts.push('[' + [...seq2].map((t) => t.linkAddress).join(',') + ']');
  const lv = new PublicLibraryCatalog_LibraryVersion();
  lv.version = '1';
  const all = lv.allDownloadLinks;
  X.addDownloadLink(lv, 'a1');
  X.addDownloadLink(X.addRevision(lv, 's')!, 'r1');
  parts.push(
    '[' + [...all].map((t) => t.linkAddress + '@' + owner(lv, t.revision)).join(',') + ']|[' + [...lv.allDownloadLinks].map((t) => t.linkAddress + '@' + owner(lv, t.revision)).join(',') + ']',
  );
  return parts.join(' ; ');
}

// ---------------------------------------------------------------- 2. file models

const Editions = ['2.0', '2.1', '2.10', '3.0', '', null];

function props(m: AMLFileMetaModel): string {
  return [
    Tr(() => E(AMLFileContentType, m.contentType)),
    Tr(() => m.filePath),
    Tr(() => m.url),
    Tr(() => m.fileName),
    Tr(() => E(AMLFileType, m.fileType)),
    Tr(() => m.producer),
    Tr(() => m.domain),
    Tr(() => m.subDomain),
    Tr(() => m.mainDomain),
    Tr(() => m.libType),
    Tr(() => m.extension),
    Tr(() => m.edition),
    Tr(() => m.version),
    Tr(() => m.semanticVersion),
    Tr(() => m.aliasNameFromParts),
    Tr(() => m.identifyingName),
    Tr(() => m.fileNameFromParts),
    Tr(() => m.isConsistent),
    Tr(() => m.isExtension),
    Tr(() => m.alias),
    Editions.map((e) => (m.isDocumentEdition(e) ? '1' : '0')).join(''),
    Tr(() => m.isNewVersion(null)),
    Tr(() => m.isNewVersion(m)),
  ].join('|');
}

function filesSection(names: string[]): Section {
  const o: Section = {};
  const models: AMLFileMetaModel[] = [];
  names.forEach((name, i) => {
    kase(o, i + ':' + name, (r) => {
      const cts = [0, 1, 2, 3 + (i % 5), ...(i % 7 === 0 ? [99] : [])];
      for (const ct of cts) {
        let m: AMLFileMetaModel;
        try {
          m = new AMLFileMetaModel(name, ct);
        } catch (e) {
          r.add(ct + ':new=' + ex(e));
          continue;
        }
        r.add(ct + '=' + props(m));
        if (ct === 0 && i % 3 === 0) models.push(m);
        if (i % 5 === 0) {
          const other = names[(i * 7 + 3) % names.length];
          r.do(ct + ':setFileName', () => m.setFileName(other));
          r.add(ct + ':after=' + props(m));
        }
        if (i % 5 === 1) {
          const other = names[(i * 11 + 5) % names.length];
          r.do(ct + ':url', () => (m.url = other));
          r.v(ct + ':fileType', () => E(AMLFileType, m.fileType));
          r.do(ct + ':urlNull', () => (m.url = null));
          r.v(ct + ':fileTypeNull', () => E(AMLFileType, m.fileType));
        }
        if (i % 50 === 2) {
          r.do(ct + ':setFileNameNull', () => m.setFileName(null));
          r.add(ct + ':afterNull=' + props(m));
          m.producer = 'P';
          m.domain = ' ';
          m.libType = '\t';
          m.edition = 'E';
          m.version = '1.0.0';
          m.extension = '';
          m.alias = 'alias';
          r.add(ct + ':edited=' + props(m));
          m.filePath = null;
          m.producer = null;
          m.domain = null;
          m.libType = null;
          m.edition = null;
          m.version = null;
          r.add(ct + ':cleared=' + props(m));
          m.extension = 'X';
          r.add(ct + ':extensionOnly=' + props(m));
        }
      }
    });
  });
  kase(o, 'null-path', (r) => {
    for (const ct of [0, 1, 2, 3, 7]) r.v(ct + ':new', () => props(new AMLFileMetaModel(null, ct)));
  });
  kase(o, 'constants', (r) => {
    r.add(
      [
        AMLFileMetaModel.SubNameChar,
        AMLFileMetaModel.AML_PRODUCER,
        AMLFileMetaModel.AMLEdition1,
        AMLFileMetaModel.AMLEdition2,
        AMLFileMetaModel.BASE_DOMAIN,
        AMLFileMetaModel.AUTOMATIONCOMPONENT_DOMAIN,
        AMLFileMetaModel.LOGIC_DOMAIN,
        PublicLibraryCatalog.fileName,
      ].join('|'),
    );
  });
  kase(o, 'latest-all', (r) => {
    r.add([...AMLFileMetaModel.getLatestVersions(models)].map((m) => models.indexOf(m)).join(','));
  });
  return o;
}

function groupsSection(groups: string[][]): Section {
  const o: Section = {};
  groups.forEach((names, g) => {
    kase(o, 'group' + g, (r) => {
      const ct = g % 4 === 3 ? AMLFileContentType.ExampleFile : AMLFileContentType.LibraryFile;
      const models = names.map((n) => new AMLFileMetaModel(n, ct));
      models.forEach((a, k) => r.add(k + '=' + models.map((b) => (Tr(() => a.isNewVersion(b)) === 'true' ? '1' : '0')).join('')));
      r.v('latest', () => [...AMLFileMetaModel.getLatestVersions(models)].map((m) => models.indexOf(m)).join(','));
      r.v('latestEmpty', () => [...AMLFileMetaModel.getLatestVersions([])].length);
      const mixed = [...models, new AMLFileMetaModel(names[0], AMLFileContentType.LibraryCollectionFile)];
      r.v('latestMixed', () => [...AMLFileMetaModel.getLatestVersions(mixed)].map((m) => mixed.indexOf(m)).join(','));
    });
  });
  return o;
}

// ---------------------------------------------------------------- 3. misc

function miscSection(itemArgs: (string | null)[][]): Section {
  const o: Section = {};
  const editions = ['AMLEd1', 'AMLEd2', null, '', 'amled1', 'AMLEd3'];
  kase(o, 'domainString', (r) => {
    for (let d = -1; d <= 16; d++) for (const e of editions) r.v(d + ':' + N(e), () => AMLDomainEnumMapping.domainString(d, e));
  });
  kase(o, 'libraryName', (r) => {
    const combos: (string | null)[][] = [
      ['AutomationML', 'Base', null],
      ['AutomationML', 'Base', ''],
      ['AutomationML', 'Base', 'Ext'],
      [null, null, null],
      ['', '', ''],
      ['P_x', 'D.y', 'E'],
      [null, 'D', 'E'],
    ];
    for (let t = -1; t <= 5; t++) for (const [p, d, x] of combos) r.v(t + ':' + N(p) + ':' + N(d) + ':' + N(x), () => AMLLibraryModel.libraryName(p, d, t, x));
    r.v('default', () => AMLLibraryModel.libraryName('A', 'B', AMLLibraryTypeEnum.RoleClass));
  });
  kase(o, 'resourceStream', (r) => {
    const inputs: [Uint8Array | null, number, string | null][] = [
      [new Uint8Array([1, 2, 3]), 0, 'a.aml'],
      [null, 4, null],
      [new Uint8Array(0), 99, ''],
      [utf8('<CAEXFile/>'), 1, 'x.amlx'],
    ];
    for (const [b, t, n] of inputs) {
      const s = new AMLResourceStream(b, t, n);
      r.add(E(AMLFileType, s.amlFileType) + '|' + N(s.amlFileName) + '|' + (s.amlFileStream === null ? 'null' : F(s.amlFileStream)));
    }
  });
  kase(o, 'enums', (r) => {
    for (const [name, en] of [
      ['AMLFileContentType', AMLFileContentType],
      ['AMLFileType', AMLFileType],
      ['AMLDomainEnum', AMLDomainEnum],
      ['AMLLibraryTypeEnum', AMLLibraryTypeEnum],
      ['StringComparisonAlgorithmEnum', StringComparisonAlgorithmEnum],
    ] as [string, any][]) {
      const members = Object.keys(en)
        .filter((k) => typeof en[k] === 'number')
        .map((k) => k + ':' + en[k]);
      r.add(name + '=' + members.join(','));
    }
  });
  kase(o, 'items', (r) => {
    const items = itemArgs.map((a) => new ClassRepositoryItem(str(a[0]), str(a[1]), str(a[2]), str(a[3]), str(a[4]), str(a[5]), str(a[6])));
    /** The record copy of C# (`with`): the positional properties through the constructor. */
    const withProps = (a: ClassRepositoryItem, p: Partial<ReturnType<ClassRepositoryItem['deconstruct']>>) => {
      const d = { ...a.deconstruct(), ...p };
      return new ClassRepositoryItem(d.className, d.caexPath, d.basePath, d.libraryName, d.libraryVersion, d.amlEdition, d.id);
    };
    class DerivedItem extends ClassRepositoryItem {}
    items.forEach((a, i) => {
      r.v(i + ':toString', () => a.toString());
      r.v(i + ':props', () => [a.className, a.caexPath, a.basePath, a.libraryName, a.libraryVersion, a.amlEdition, a.id].map(N).join('|'));
      const d = a.deconstruct();
      r.v(i + ':deconstruct', () => [d.className, d.caexPath, d.basePath, d.libraryName, d.libraryVersion, d.amlEdition, d.id].map(N).join('|'));
      r.v(i + ':equalsNull', () => [a.equals(null), ClassRepositoryItem.equals(a, null), ClassRepositoryItem.notEquals(a, null), ClassRepositoryItem.equals(null, a)].map(B).join('|'));
      r.v(i + ':equalsOther', () => [a.equals('x'), a.equals(a), a.equals(new DerivedItem(a.className, '', '', '', '', ''))].map(B).join('|'));
      const w = withProps(a, { className: 'W' });
      r.v(i + ':with', () => w.toString() + '|' + [w.equals(a), withProps(w, { className: a.className }).equals(a), withProps(a, {}) === a, withProps(a, {}).equals(a)].map(B).join('|'));
      items.forEach((b, j) => {
        r.add(i + ',' + j + '=' + B(a.equals(b)) + B(a.equals(b)) + B(ClassRepositoryItem.equals(a, b)) + B(ClassRepositoryItem.notEquals(a, b)) + B(a.equalityKey() === b.equalityKey()));
      });
    });
    r.add('nulls=' + B(ClassRepositoryItem.equals(null, null)) + B(ClassRepositoryItem.notEquals(null, null)) + B(ClassRepositoryItem.equals(null, items[0])) + B(ClassRepositoryItem.notEquals(items[0], null)));
  });
  return o;
}

// ---------------------------------------------------------------- 4. converters

const TypeArgs: [string, unknown][] = [
  ['string', String],
  ['double', Number],
  ['bool', Boolean],
  ['object', Object],
  ['null', null],
];

function convertersSection(enumStrings: string[], semverStrings: string[]): Section {
  const o: Section = {};
  const enums: [string, any][] = [
    ['AMLFileContentType', AMLFileContentType],
    ['AccessRightsEnum', AccessRightsEnum],
    ['AMLEditionEnum', AMLEditionEnum],
    ['CAEXSchema', CAEXDocument_CAEXSchema],
    ['AMLFileType', AMLFileType],
    ['StringComparisonAlgorithmEnum', StringComparisonAlgorithmEnum],
  ];
  for (const [name, et] of enums) {
    kase(o, 'enum:' + name, (r) => {
      const conv = new EnumDescriptionTypeConverter(et);
      const values = Object.values(et).filter((x): x is number => typeof x === 'number');
      const max = Math.max(...values);
      const asEnum = (x: unknown) => (typeof x === 'number' ? E(et, x) : F(x));
      for (let v = -1; v <= max + 1; v++) {
        r.v('to:' + v, () => conv.convertTo(null, null, v, String));
        r.v('toCulture:' + v, () => conv.convertTo(null, 'de-DE', v, String));
        for (const [tn, t] of TypeArgs.slice(1)) r.v('to:' + v + ':' + tn, () => conv.convertTo(null, null, v, t));
      }
      r.v('to:99', () => conv.convertTo(null, null, 99, String));
      for (const x of [null, 'Empty', 'LibraryFile', '', true]) r.v('toValue:' + F(x), () => conv.convertTo(null, null, x, String));
      r.v('toNullDouble', () => conv.convertTo(null, null, null, Number));
      r.v('toStringDouble', () => conv.convertTo(null, null, 'x', Number));
      for (const s of enumStrings) r.v('from:' + F(s), () => asEnum(conv.convertFrom(null, null, s)));
      for (const x of [null, 5, true, 1.5]) r.v('fromValue:' + F(x), () => asEnum(conv.convertFrom(null, null, x)));
      for (const [tn, t] of TypeArgs) {
        r.v('canFrom:' + tn, () => conv.canConvertFrom(null, t));
        r.v('canTo:' + tn, () => conv.canConvertTo(null, t));
      }
    });
  }
  kase(o, 'semver', (r) => {
    const conv = new SemanticVersionTypeConverter();
    for (const [tn, t] of TypeArgs) {
      r.v('canFrom:' + tn, () => conv.canConvertFrom(null, t));
      r.v('canTo:' + tn, () => conv.canConvertTo(null, t));
    }
    for (const s of semverStrings) r.v('from:' + F(s), () => conv.convertFrom(null, null, s));
    for (const x of [null, 5, true]) r.v('fromValue:' + F(x), () => conv.convertFrom(null, null, x));
    const sv = new SemanticVersion('1.0.0-beta');
    for (const x of [sv, null, 'abc', 5]) for (const [tn, t] of TypeArgs) r.v('to:' + F(x) + ':' + tn, () => conv.convertTo(null, null, x, t));
  });
  kase(o, 'typeconverter', (r) => {
    const conv = new TypeConverter();
    for (const [tn, t] of TypeArgs) {
      r.v('canFrom:' + tn, () => conv.canConvertFrom(null, t));
      r.v('canTo:' + tn, () => conv.canConvertTo(null, t));
    }
    for (const x of ['x', null, 5, true, 2.5, 5n, {}]) {
      r.v('from:' + F(x), () => conv.convertFrom(null, null, x));
      for (const [tn, t] of TypeArgs) r.v('to:' + F(x) + ':' + tn, () => conv.convertTo(null, null, x, t));
    }
  });
  return o;
}

// ---------------------------------------------------------------- 5. embedded resources

function resourcesSection(names: string[]): Section {
  const o: Section = {};
  kase(o, 'names', (r) => [...EMBEDDED_LIBRARIES.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).forEach((n) => r.add(n)));
  kase(o, 'streams', (r) => {
    for (const n of [...names, names[0].toLowerCase(), names[0] + ' ', '', 'Aml.Engine.Resources.Resources.AutomationMLLibs', 'AutomationMLLibs.json']) {
      r.v(n, () => AMLLibraries.getManifestResourceStream(n));
    }
    r.v('null', () => AMLLibraries.getManifestResourceStream(null as unknown as string));
  });
  return o;
}

// ---------------------------------------------------------------- 6. profiles

/** AMLLibraryServerProfile.loadFromString: regression cases for the shared System.Text.Json emulation. */
function profilesSection(texts: string[]): Section {
  const o: Section = {};
  kase(o, 'load', (r) => {
    texts.forEach((t, i) => {
      const text = str(t)!;
      r.v(String(i), () => {
        const p = AMLLibraryServerProfile.loadFromString(text);
        return N(p.userName) + '|' + p.portNumber + '|' + (p.libraryData === null ? 'null' : p.libraryData.length);
      });
    });
  });
  return o;
}

// ---------------------------------------------------------------- the test

const has = existsSync(expectedFile);

describe.skipIf(!has)('Aml.Engine.Resources against the original (oracle resources)', () => {
  const cases = JSON.parse(readFileSync(join(casesDir, 'cases.json'), 'utf8')) as Cases;
  const expected = has ? (JSON.parse(readFileSync(expectedFile, 'utf8')) as Record<string, Section>) : {};
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  const compare = (section: string, actual: Section) => {
    // The port's lines, for diffs against the oracle output.
    writeFileSync(join(oracleOut, 'services', `resources-js-${section}.json`), JSON.stringify(actual, null, 1));
    const exp = expected[section];
    expect(Object.keys(actual)).toEqual(Object.keys(exp));
    const failures: string[] = [];
    for (const [name, lines] of Object.entries(exp)) {
      const got = actual[name];
      for (let i = 0; i < Math.max(lines.length, got.length); i++) {
        if (lines[i] !== got[i]) {
          failures.push(`${name} #${i}\n  expected: ${JSON.stringify(lines[i])}\n  actual:   ${JSON.stringify(got[i])}`);
          break;
        }
      }
    }
    expect(failures.slice(0, 20).join('\n')).toBe('');
  };

  it('catalogs: deserialization (string, stream, BOM, file), queries, edits, serialization', () => {
    compare('catalogs', catalogsSection(cases.catalogs));
  });

  it('file models: AMLFileMetaModel for real and generated names', () => {
    compare('files', filesSection(cases.fileNames));
  });

  it('file models: IsNewVersion and GetLatestVersions', () => {
    compare('groups', groupsSection(cases.fileGroups));
  });

  it('misc: AMLDomainEnumMapping, AMLLibraryModel, AMLResourceStream, enums, ClassRepositoryItem', () => {
    compare('misc', miscSection(cases.items));
  });

  it('converters: EnumDescriptionTypeConverter, SemanticVersionTypeConverter, TypeConverter', () => {
    compare('converters', convertersSection(cases.enumStrings, cases.semverStrings));
  });

  it('profiles: the System.Text.Json emulation of AMLLibraryServerProfile', () => {
    compare('profiles', profilesSection(cases.profiles));
  });

  it('embedded resources: names and bytes', () => {
    const names = expected.resources.names;
    compare('resources', resourcesSection(names));
  });
});
