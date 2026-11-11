// ValidatorService parity: the cases of scripts/gen-services-validator.mjs run with the port and
// compared with oracle/ServicesValidatorOracle.cs (the JS twin of every step there; keep in sync).
// The coverage notes are in docs/coverage-notes/services-validator.md.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { implementsInterface } from '../../src/engine/interfaces.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { CAEXObject } from '../../src/engine/caex/CAEXObject.js';
import { InternalElementType } from '../../src/engine/caex/InternalElementType.js';
import { AutomationMLContainer } from '../../src/engine/amlobjects/AutomationMLContainer.js';
import { FileMode } from '../../src/engine/amlobjects/packaging/Package.js';
import { MemoryStream } from '../../src/engine/amlobjects/packaging/MemoryStream.js';
import { ServiceLocator } from '../../src/engine/services/ServiceLocator.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { Uri, UriKind, XmlConvert } from '../../src/system/index.js';
import { XmlException } from '../../src/xml/index.js';
import { LookupService } from '../../src/services/LookupService.js';
import { RepairTypeEnum } from '../../src/services/RepairTypeEnum.js';
import { RepairTypeEnumConverter } from '../../src/services/RepairTypeEnumConverter.js';
import { UniqueNameService } from '../../src/services/UniqueNameService.js';
import { ValidationElement } from '../../src/services/ValidationElement.js';
import { ValidationKey } from '../../src/services/ValidationKey.js';
import { ValidationResults as VR } from '../../src/services/ValidationResults.js';
import { ValidationTypeEnum } from '../../src/services/ValidationTypeEnum.js';
import { ValidatorService } from '../../src/services/ValidatorService.js';
import { Canonicalizer, hash, objects, save as saveDoc } from '../engine/ops-apply.js';
import { oracleOut } from '../setup/oracle-out.js';

const casesDir = resolve(__dirname, 'validator');
const expectedFile = join(oracleOut, 'services', 'validator.json');
const expectedDocs = join(oracleOut, 'services', 'validator-docs');
const rootDir = process.cwd().replace(/[\\/]+$/, '');
const rootRegex = new RegExp(
  [...new Set([rootDir, rootDir.replace(/\\/g, '/')])].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi',
);

/** Surrogates as \uXXXX, absolute paths of the working directory as <root>. */
function esc(s: string): string {
  s = s.replace(rootRegex, '<root>');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 0xd800 && c <= 0xdfff ? '\\u' + c.toString(16).toUpperCase().padStart(4, '0') : s[i];
  }
  return out;
}
const J = (s: string | null | undefined): string | null => (s === null || s === undefined ? null : esc(s));
const ex = (e: unknown) => '!' + dotNetExceptionName(e);
function tryStr(f: () => unknown): string {
  try {
    const v = f();
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    return esc(String(v));
  } catch (e) {
    return ex(e);
  }
}
function hashOk(x: ValidationElement): string {
  try {
    x.equalityKey();
    return 'ok';
  } catch (e) {
    return ex(e);
  }
}
function save(doc: any): string {
  try {
    return saveDoc(doc);
  } catch (e) {
    return ex(e);
  }
}

const casePath = (relative: string) => resolve(casesDir, relative);
function decode(value: string): string {
  value = value.replaceAll('%CASESURL%', pathToFileURL(casesDir).href).replaceAll('%CASES%', casesDir);
  return value.replace(/%%([0-9A-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function subst(doc: any): void {
  for (const e of [...doc.xDocument.descendants()]) {
    for (const a of [...e.attributes()]) if (a.value.includes('%')) a.value = decode(a.value);
  }
  for (const e of [...doc.xDocument.descendants()].filter((e: any) => !e.hasElements)) {
    if (e.value.includes('%')) e.value = decode(e.value);
  }
}
type Case = { file: string; subst: boolean; corpus?: boolean; parts?: Array<[string, string, string]> };
function load(c: Case, fromString = false): any {
  const path = casePath(c.file);
  const doc: any = fromString ? CAEXDocument.loadFromString(readFileSync(path, 'utf8').replace(/^﻿/, '')) : CAEXDocument.loadFromFile(path);
  if (c.subst) subst(doc);
  return doc;
}
function buildContainer(c: Case, added: string[] | null = null): any {
  const path = casePath(c.file);
  const container: any = new AutomationMLContainer(new MemoryStream(), FileMode.Create);
  const root = container.addRoot(new MemoryStream(new Uint8Array(readFileSync(path))), new Uri('/' + basename(path), UriKind.Relative));
  for (const [kind, uriText, source] of c.parts ?? []) {
    const uri = new Uri(uriText, UriKind.Relative);
    const stream = new MemoryStream(new Uint8Array(readFileSync(join(dirname(path), source))));
    try {
      if (kind === 'library') container.addLibrary(root, stream, uri);
      else container.addAnyContent(root, stream, uri, 'application/octet-stream');
      added?.push('ok');
    } catch (e) {
      added?.push(ex(e));
    }
  }
  return container;
}

/** One validation result: element, key, type, options, texts (Line in the oracle). */
function line(v: ValidationElement, canon: (s: string) => string = (s) => s): unknown[] {
  const C = (s: string | null | undefined) => (s === null || s === undefined ? null : canon(s));
  const e = v.element;
  const w: any = v.caexElement;
  const key = (v as any)._validationKey as ValidationKey;
  const name = C(e.attribute('Name')?.value ?? null);
  const id = C(e.attribute('ID')?.value ?? null);
  const path = w instanceof CAEXObject ? C(tryStr(() => (w as any).caexPath())) : '-';
  const k = C(key.key);
  const info = C(v.validationInformation);
  const long = C(v.longDescription);
  const repair = C(v.repairResult);
  return [
    J(e.name.localName),
    J(name),
    J(id),
    J(path),
    J(w === null ? 'null' : w.constructor.name),
    J(k),
    J(ValidationTypeEnum[v.validationType]),
    v.availableRepairOptions,
    J(v.validatedAttribute),
    J(info),
    J(long),
    J(repair),
    J(RepairTypeEnumConverter.repairTypeDescription(v.availableRepairOptions)),
  ];
}

function tables(doc: any): string {
  const q: any = ServiceLocator.queryService;
  return implementsInterface(q, 'ILookUpTable') ? `${q.idTableIsLoaded(doc) ? 'T' : 'F'}${q.pathTableIsLoaded(doc) ? 'T' : 'F'}` : '-';
}

const FILTERS: Array<[string, (r: Iterable<ValidationElement>) => Iterable<ValidationElement>]> = [
  ['AliasReferenceValidationResults', VR.aliasReferenceValidationResults],
  ['AliasValidationResults', VR.aliasValidationResults],
  ['ExternalReferenceValidationResults', VR.externalReferenceValidationResults],
  ['ClassPathValidationResults', VR.classPathValidationResults],
  ['IDReferenceValidationResults', VR.idReferenceValidationResults],
  ['CardinalityValidationResults', VR.cardinalityValidationResults],
  ['DirectionValidationResults', VR.directionValidationResults],
  ['CategoryValidationResults', VR.categoryValidationResults],
  ['PathReferenceValidationResults', VR.pathReferenceValidationResults],
  ['NameReferenceValidationResults', VR.nameReferenceValidationResults],
  ['NameValidationResults', VR.nameValidationResults],
  ['IDValidationResults', VR.idValidationResults],
  ['MetaDataValidationResults', VR.metaDataValidationResults],
  ['InvalidAutomationMLVersion', VR.invalidAutomationMLVersion],
  ['InvalidSchemaVersion', VR.invalidSchemaVersion],
  ['MissingDocumentSourceInformation', VR.missingDocumentSourceInformation],
  ['InvalidIDs', VR.invalidIDs],
  ['NotUniquePath', VR.notUniquePath],
  ['Repairable', VR.repairable],
  ['NotRepairable', VR.notRepairable],
  ['UnresolvedIDRefs', VR.unresolvedIDRefs],
  ['UnresolvedPathRefs', VR.unresolvedPathRefs],
  ['EmptyPathRefs', VR.emptyPathRefs],
  ['EmptyIDRefs', VR.emptyIDRefs],
  ['MissingIDs', VR.missingIDs],
  ['NotUniqueIDs', VR.notUniqueIDs],
  ['UnidentifiedAlias', VR.unidentifiedAlias],
  ['UselessAlias', VR.uselessAlias],
];

// ------------------------------------------------------------------ documents

const CORPUS_RUNS_NONE = ['all', 'allL', 'allC', 'noSC', 'aliasL'];
const CORPUS_RUNS_LOOKUP = ['allL', 'allC'];

function runDoc(v: ValidatorService, c: Case): any {
  const rec: any = {};
  const corpus = c.corpus === true;
  let container: any;
  try {
    const added: string[] = [];
    container = buildContainer(c, added);
    rec.added = added.join(',');
    rec.parts = [...container.getParts()].map((p: any) => J(p.uri.toString())).sort((a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0));
  } catch (e) {
    rec.parts = ex(e);
    return rec;
  }
  const runs: Array<[string, (d: any) => Iterable<ValidationElement>, boolean]> = [
    ['all', (d) => v.validateAll(d), false],
    ['allL', (d) => v.validateAll(d, true), false],
    ['allN', (d) => v.validateAll(d, null, false), false],
    ['allC', (d) => v.validateAll(d, container, true), false],
    ['noS', (d) => v.validateAllWithoutStrictID(d), false],
    ['noSC', (d) => v.validateAllWithoutStrictID(d, container, true), false],
    ['alias', (d) => v.validateAliasReferences(d), false],
    ['aliasL', (d) => v.validateAliasReferences(d, true), false],
  ];
  if (!corpus) runs.push(['str', (d) => v.validateAll(d, true), true]);

  for (const svc of ['none', 'lookup']) {
    if (svc === 'lookup') LookupService.register();
    const runRec: any = {};
    const seen = new Map<string, string>();
    let allL: ValidationElement[] | null = null;
    for (const [name, call, fromString] of runs) {
      // Corpus documents: a subset of the calls (the generated documents take every call).
      if (corpus && !(svc === 'none' ? CORPUS_RUNS_NONE : CORPUS_RUNS_LOOKUP).includes(name)) continue;
      const r: any = {};
      let doc: any;
      try {
        doc = load(c, fromString);
      } catch (e) {
        r.load = ex(e);
        runRec[name] = r;
        continue;
      }
      const before = save(doc);
      r.tables0 = tables(doc);
      let list: ValidationElement[] | null = null;
      let e1: Iterable<ValidationElement> | null = null;
      try {
        e1 = call(doc);
        r.tablesCall = tables(doc);
        list = [...e1];
      } catch (e) {
        r.error = ex(e);
      }
      r.tables = tables(doc);
      if (list !== null) {
        const lines = list.map((x) => line(x));
        const text = JSON.stringify(lines);
        r.n = list.length;
        const same = seen.get(text);
        if (same !== undefined) r.same = same;
        else {
          r.lines = lines;
          seen.set(text, name);
        }
        if (!corpus || name === 'allL') try {
          const again = [...e1!];
          r.again = JSON.stringify(again.map((x) => line(x))) === text ? 'same' : 'differs:' + again.length;
          r.againEquals = list
            .slice(0, Math.min(60, again.length))
            .map((x, i) => (x.equals(again[i]) ? 'T' : 'F'))
            .join('');
        } catch (e) {
          r.again = ex(e);
        }
      }
      const after = save(doc);
      r.doc = after === before ? 'unchanged' : hash(esc(after));
      if (after !== before && !corpus) r.docText = J(after);
      runRec[name] = r;
      if (name === 'allL' && list !== null) allL = list;
    }

    if (!corpus || svc === 'none') try {
      const doc = load(c);
      const states = [tables(doc)];
      const e = v.validateAll(doc);
      states.push(tables(doc));
      const en = e[Symbol.iterator]();
      en.next();
      en.return?.();
      states.push(tables(doc));
      const n = v.validateAll(doc).count();
      states.push(tables(doc));
      const n2 = v.validateAliasReferences(doc).count();
      states.push(tables(doc));
      runRec.partial = states.join(',') + `|${n}|${n2}`;
    } catch (e) {
      runRec.partial = ex(e);
    }

    if (allL !== null) {
      const list = allL;
      const filters: any = {};
      for (const [fname, f] of FILTERS) filters[fname] = [...f(list)].map((x) => list.findIndex((y) => y.equals(x))).join(',');
      runRec.filters = filters;
      runRec.revalidate = list
        .map((x) => {
          const s = tryStr(() => x.reValidate());
          return s === 'True' ? 'T' : s === 'False' ? 'F' : '(' + s + ')';
        })
        .join('');
      const eq: string[] = [];
      const head = list.slice(0, 60);
      for (let i = 0; i < head.length; i++) for (let j = i + 1; j < head.length; j++) if (head[i].equals(head[j])) eq.push(`${i}=${j}`);
      runRec.equals = eq.join(',');
      runRec.hash = head.map((x) => (hashOk(x) === 'ok' ? 'o' : 'x')).join('');
      if (head.length > 0) runRec.equalsOther = `${head[0].equals(null) ? 'True' : 'False'}|${head[0].equals('x') ? 'True' : 'False'}|${head[0].equals(head[0]) ? 'True' : 'False'}`;
    }
    runRec.names = nameSweep(v, c);
    rec[svc] = runRec;
    if (svc === 'lookup') LookupService.unRegister();
  }

  const repairs: any = {};
  for (const mode of corpus ? ['plain', 'unique'] : ['plain', 'unique', 'lookup']) {
    if (mode !== 'plain') UniqueNameService.register();
    if (mode === 'lookup') LookupService.register();
    repairs[mode] = repairDoc(v, c);
    if (mode === 'lookup') LookupService.unRegister();
    if (mode !== 'plain') UniqueNameService.unRegister();
  }
  rec.repair = repairs;
  rec.xmlName = xmlNameRepair(v, c);
  return rec;
}

/** The final canonical texts of the repairs, by case and mode (compared on a hash mismatch). */
const repairTexts = new Map<string, string>();

function repairDoc(v: ValidatorService, c: Case): any {
  const r: any = {};
  const canon = new Canonicalizer();
  let doc: any;
  try {
    doc = load(c);
  } catch (e) {
    r.load = ex(e);
    return r;
  }
  let list: ValidationElement[];
  try {
    list = [...v.validateAll(doc, true)];
  } catch (e) {
    r.error = ex(e);
    return r;
  }
  const steps: unknown[] = [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    if (x.availableRepairOptions === RepairTypeEnum.None) continue;
    const ret = tryStr(() => v.repair(x));
    const rv = tryStr(() => x.reValidate());
    steps.push([i, J(ret), J(canon.apply(esc(x.repairResult ?? 'null'))), J(rv)]);
  }
  r.steps = steps;
  const text = canon.apply(esc(save(doc)));
  r.final = hash(text);
  repairTexts.set(r.final, text);
  try {
    const after = [...v.validateAll(doc)];
    r.after = after.map((x) => line(x, (s) => canon.apply(esc(s))));
  } catch (e) {
    r.after = ex(e);
  }
  return r;
}

function xmlNameRepair(v: ValidatorService, c: Case): unknown {
  try {
    const doc = load(c);
    const list = [...v.validateAll(doc)].filter((x) => x.validationType === ValidationTypeEnum.NameValidation);
    return list.map((x) => {
      const ret = tryStr(() => x.renameElement(RepairTypeEnum.GenerateXmlName));
      return [J(ret), J(x.repairResult)];
    });
  } catch (e) {
    return ex(e);
  }
}

function nameSweep(v: ValidatorService, c: Case): unknown {
  try {
    const doc = load(c);
    const all = objects(doc);
    const n = all.length;
    const step = Math.max(1, Math.floor(n / 60));
    const lines: unknown[] = [];
    const R = (t: { isValid: boolean; message: string | null }) => (t.isValid ? 'T:' : 'F:') + (t.message ?? 'null');
    for (let i = 0; i < n; i += step) {
      const o = all[i];
      const other = all[(i * 7 + 3) % n];
      const sib = [...o.node.elementsAfterSelf(), ...o.node.elementsBeforeSelf()].find((e: any) => e.attribute('Name') !== null);
      const sibling = sib === undefined ? null : sib.attribute('Name').value;
      lines.push([
        J(tryStr(() => R(v.idValidation(o, null)))),
        J(tryStr(() => R(v.idValidation(o, '')))),
        J(tryStr(() => R(v.idValidation(o, o.id)))),
        J(tryStr(() => R(v.idValidation(o, other.id)))),
        J(tryStr(() => R(v.idValidation(o, 'no-such-id')))),
        J(tryStr(() => R(v.nameValidation(o, o.name)))),
        J(tryStr(() => R(v.nameValidation(o, null)))),
        J(tryStr(() => R(v.nameValidation(o, '')))),
        J(tryStr(() => R(v.nameValidation(o, other.name)))),
        J(tryStr(() => R(v.nameValidation(o, 'Fresh')))),
        J(tryStr(() => R(v.nameValidation(o, sibling)))),
      ]);
    }
    const first = all.find((o: any) => o instanceof InternalElementType);
    if (first !== undefined) {
      first.remove();
      const B = (t: { isValid: boolean; message: string | null }) => `${t.isValid ? 'True' : 'False'}:${t.message ?? ''}`;
      lines.push([J(tryStr(() => B(v.idValidation(first, 'x')))), J(tryStr(() => B(v.nameValidation(first, 'x'))))]);
    }
    return lines;
  } catch (e) {
    return ex(e);
  }
}

// ------------------------------------------------------------------ sweeps

function locate(container: any, file: any, fileRef: string | null): string {
  try {
    const r = ValidatorService.canLocateFile(container, file, fileRef, 'init');
    return (r.result ? 'T|' : 'F|') + esc(r.message);
  } catch (e) {
    return ex(e);
  }
}

function fileRefSweep(cases: any): any {
  const ext = cases.docs.find((d: Case) => d.file === 'v-extrefs30.aml');
  const data = cases.docs.find((d: Case) => d.file === 'v-extdata30.aml');
  const fromFile = load(ext).caexFile;
  const fromString = load(ext, true).caexFile;
  const fresh = CAEXDocument.new_CAEXDocument().caexFile;
  // Documents named by a root path: Path.GetDirectoryName gives null (NullReferenceException "rootPath").
  const rootC: any = CAEXDocument.new_CAEXDocument().caexFile;
  rootC.fileName = 'C:\\';
  const rootSlash: any = CAEXDocument.new_CAEXDocument().caexFile;
  rootSlash.fileName = '/';
  const container = buildContainer({ file: ext.file, subst: true, parts: [...ext.parts, ...data.parts] });
  const fpv = (ValidatorService as any).filePathFromValue as (p: string | null, d: string) => string;
  const lines: unknown[] = [];
  for (const raw of cases.fileRefs as Array<string | null>) {
    const fileRef = raw === null ? null : decode(raw);
    lines.push([
      J(locate(null, fromFile, fileRef)),
      J(locate(null, fromString, fileRef)),
      J(locate(null, fresh, fileRef)),
      J(locate(container, fromFile, fileRef)),
      J(tryStr(() => ValidatorService.normalizeFilePath(fileRef, fromFile))),
      J(tryStr(() => ValidatorService.normalizeFilePath(fileRef, fromString))),
      J(tryStr(() => ValidatorService.normalizeFilePath(fileRef, fresh))),
      J(tryStr(() => fpv.call(ValidatorService, fileRef, casesDir))),
      J(tryStr(() => fpv.call(ValidatorService, fileRef, ''))),
      J(tryStr(() => fpv.call(ValidatorService, fileRef, 'sub'))),
      J(locate(null, rootC, fileRef)),
      J(tryStr(() => ValidatorService.normalizeFilePath(fileRef, rootC))),
      J(tryStr(() => ValidatorService.normalizeFilePath(fileRef, rootSlash))),
    ]);
  }
  return {
    lines,
    nullFile: tryStr(() => ValidatorService.normalizeFilePath('x.aml', null)),
    ftp: locate(null, fromFile, 'ftp://127.0.0.1:9/lib.aml'),
    ftpContainer: locate(container, fromFile, 'ftp://127.0.0.1:9/lib.aml'),
  };
}

function xmlCharsSweep(cases: any): unknown[] {
  const lines: unknown[] = [];
  for (const u of cases.xmlChars as number[][]) {
    const s = String.fromCharCode(...u);
    try {
      lines.push(J('=' + XmlConvert.verifyXmlChars(s)));
    } catch (e) {
      if (e instanceof XmlException) lines.push(J(`!XmlException|${e.message}|${e.lineNumber}|${e.linePosition}`));
      else lines.push(J(ex(e)));
    }
  }
  lines.push(J(tryStr(() => XmlConvert.verifyXmlChars(null))));
  return lines;
}

function keySweep(): unknown[] {
  const lines: unknown[] = [];
  const b = (x: boolean) => (x ? 'True' : 'False');
  for (const key of ['a', '', null, 'x|y', '#CAEXNoName#']) {
    const types = key === 'a' ? Array.from({ length: 20 }, (_, i) => i) : [0, 18, 19];
    for (const t of types) {
      const k = new ValidationKey(key, t);
      lines.push([
        J(k.key),
        k.validationType,
        J(k.toString()),
        J(k.item1),
        k.item2,
        b(k.equals(new ValidationKey(key, t))),
        b(k.equals(new ValidationKey((key ?? '') + 'x', t))),
        b(k.equals(new ValidationKey(key, t + 1))),
        b(k.equals(null)),
        b(k.equals('x')),
        b(k.equals(k)),
        // Hash codes differ between the platforms: only whether two keys have the same one.
        b(k.equalityKey() === new ValidationKey(key, t).equalityKey()),
        b(k.equalityKey() === new ValidationKey((key ?? '') + 'x', t).equalityKey()),
        b(k.equalityKey() === new ValidationKey(key, t + 1).equalityKey()),
      ]);
    }
  }
  return lines;
}

const find = (doc: any, local: string, name: string | null): any =>
  [...doc.xDocument.root.descendantsAndSelf()].find((e: any) => e.name.localName === local && (name === null || (e.attribute('Name')?.value ?? null) === name));

const R = RepairTypeEnum;
const REPAIR_FLAGS = [
  R.None, R.GenerateUniqueIDWhenEmpty, R.GenerateUniqueIDForDoubles, R.GenerateNameWhenEmpty, R.RemoveEmptyReference, R.RemoveUnresolvedIDReference,
  R.RemoveUnresolvedPathReference, R.RenameClassPathForDoubles, R.CreateWriterHeader, R.CreateAutomationMLVersion, R.GenerateUniqueName, R.SetSchemaVersion,
  R.GenerateXmlName, R.GenerateValidGUID, R.RemoveAlias, R.CheckAliasInExternalReference, R.CreateSourceDocumentInformation, R.RemoveElement,
  R.RemoveElementNotInScope, R.ChangeFileURL, R.RemoveUnresolvedNameReference, R.NameDefinitionOption, R.IDDefinitionOption, R.GenerateXmlName | R.GenerateUniqueName,
];
const TARGETS: Array<[string, string, string | null, string | null]> = [
  ['v-aliases30.aml', 'InternalElement', 'Useless', 'RefBaseSystemUnitPath'],
  ['v-aliases30.aml', 'InternalElement', 'Twice', 'RefBaseSystemUnitPath'],
  ['v-aliases30.aml', 'InternalElement', 'Known', 'Name'],
  ['v-aliases30.aml', 'InternalElement', 'Known', null],
  ['v-aliases30.aml', 'InternalElement', 'Known', 'NoSuchAttribute'],
  ['v-aliases30.aml', 'ExternalReference', null, 'Alias'],
  ['v-aliases30.aml', 'CAEXFile', null, 'SchemaVersion'],
  ['v-aliases30.aml', 'Attribute', 'a', 'RefAttributeType'],
  ['v-aliases30.aml', 'RoleRequirements', null, 'RefBaseRoleClassPath'],
  ['v-aliases30.aml', 'SuperiorStandardVersion', null, 'x'],
  ['v-aliases30.aml', 'SystemUnitClass', 'Derived', 'RefBaseClassPath'],
  ['v-extdata30.aml', 'Attribute', 'refURI', 'Value'],
  ['v-names30.aml', 'InternalElement', 'Same', 'Name'],
  ['v-names30.aml', 'InternalElement', 'Ctrl%%0001x', 'Name'],
  ['v-meta-none215.aml', 'CAEXFile', null, 'SchemaVersion'],
  ['v-meta-wrong215.aml', 'CAEXFile', null, 'SchemaVersion'],
  ['v-meta-none30.aml', 'CAEXFile', null, 'SchemaVersion'],
  ['v-ids215.aml', 'InternalElement', 'Bad', 'ID'],
  ['v-meta-none215.aml', 'InstanceHierarchy', null, 'Name'],
  ['v-idrefs30.aml', 'InternalLink', 'L_unres', 'RefPartnerSideA'],
  ['v-idrefs30.aml', 'InterfaceIDMapping', null, 'RoleInterfaceID'],
];

function elementSweep(v: ValidatorService, cases: any): any {
  const caseOf = (f: string): Case => cases.docs.find((d: Case) => d.file === f);
  const lines: unknown[] = [];
  for (const unique of [false, true]) {
    if (unique) UniqueNameService.register();
    for (const [docFile, local, name, attribute] of TARGETS) {
      for (const flag of REPAIR_FLAGS) {
        const canon = new Canonicalizer();
        let doc: any;
        try {
          doc = load(caseOf(docFile));
        } catch (e) {
          lines.push(J('load' + ex(e)));
          continue;
        }
        const target = find(doc, local, name === null ? null : decode(name));
        const x = new ValidationElement(target, new ValidationKey('k', ValidationTypeEnum.IDValidation));
        x.validatedAttribute = attribute;
        x.availableRepairOptions = flag;
        const ret = tryStr(() => v.repair(x));
        const rv = tryStr(() => x.reValidate());
        const text = canon.apply(esc(save(doc)));
        lines.push([J(ret), J(canon.apply(esc(x.repairResult ?? 'null'))), J(rv), J(hash(text))]);
      }
    }
    if (unique) UniqueNameService.unRegister();
  }

  const d0 = load(caseOf('v-ids30.aml'));
  const ieNode = find(d0, 'InternalElement', null);
  const descr = find(d0, 'SuperiorStandardVersion', null);
  const k = new ValidationKey('k', ValidationTypeEnum.NameValidation);
  const a = new ValidationElement(ieNode, k);
  const b = new ValidationElement(ieNode, new ValidationKey('other', ValidationTypeEnum.IDValidation));
  const B = (x: boolean) => (x ? 'True' : 'False');
  const api: unknown[] = [
    J(ValidationElement.NOT_REPAIRED),
    a.availableRepairOptions,
    J(a.repairResult),
    J(a.validationInformation),
    J(a.longDescription),
    J(a.validatedAttribute),
    J(ValidationTypeEnum[a.validationType]),
    J(a.caexElement?.constructor.name ?? 'null'),
    J(a.element.name.localName),
    J(hashOk(a)),
    J(B(a.equals(b))),
    J(tryStr(() => a.reValidate())),
  ];
  a.validatedAttribute = 'ID';
  b.validatedAttribute = 'ID';
  api.push(J(hashOk(a)));
  api.push(J(B(a.equals(b))));
  b.validatedAttribute = 'Name';
  api.push(J(B(a.equals(b))));
  const n1 = new ValidationElement(descr, k);
  n1.validatedAttribute = 'x';
  const n2 = new ValidationElement(descr, k);
  n2.validatedAttribute = 'x';
  api.push(J(n1.caexElement?.constructor.name ?? 'null'));
  api.push(J(hashOk(n1)));
  api.push(J(B(n1.equals(n2))));
  api.push(J(B(n1.equals(a))));
  const rootEl = new ValidationElement(d0.xDocument.root, k);
  api.push(J(rootEl.caexElement?.constructor.name ?? 'null'));
  return { repairs: lines, api };
}

function misc(v: ValidatorService): unknown[] {
  return [
    J(tryStr(() => v.idValidation(null as any, 'x'))),
    J(tryStr(() => v.nameValidation(null as any, 'x'))),
    J(tryStr(() => v.validateAll(null as any).count())),
    J(tryStr(() => v.validateAliasReferences(null as any).count())),
    J(tryStr(() => v.repair(null as any))),
    J(tryStr(() => ValidatorService.register() === ServiceLocator.getService('IValidator'))),
  ];
}

// ------------------------------------------------------------------ deviations

/**
 * Documented deviations (docs/deviations.md, "ValidatorService: references over the network"): for
 * an ftp URL the original sends an FtpWebRequest without a catch block and fails with a
 * WebException out of the enumeration; the port throws NotSupportedException there.
 */
function ftpDeviation<T>(expected: T): T {
  return JSON.parse(JSON.stringify(expected).replaceAll('"!WebException"', '"!NotSupportedException"'));
}

// ------------------------------------------------------------------ tests

describe.skipIf(!existsSync(expectedFile) || !!process.env.AMLENGINE_SERVICES)('ValidatorService parity with Aml.Engine.Services', () => {
  const cases = JSON.parse(readFileSync(join(casesDir, 'cases.json'), 'utf8'));
  // The suite body runs even when skipped (vitest collects the tests): read only what exists.
  const expected = existsSync(expectedFile) ? JSON.parse(readFileSync(expectedFile, 'utf8')) : { docs: {} };
  const v = ValidatorService.register();

  for (const c of cases.docs as Case[]) {
    it(`document ${c.file}`, () => {
      const actual = runDoc(v, c);
      let exp = expected.docs[c.file];
      if (c.file === 'v-extrefs-ftp.aml') exp = ftpDeviation(exp);
      for (const svc of ['none', 'lookup']) {
        if (actual[svc] === undefined || exp[svc] === undefined) continue;
        for (const name of Object.keys(exp[svc])) expect({ svc, name, value: actual[svc][name] }).toEqual({ svc, name, value: exp[svc][name] });
      }
      for (const mode of Object.keys(exp.repair ?? {})) {
        const a = actual.repair[mode];
        const e = exp.repair[mode];
        if (a.final !== e.final && existsSync(join(expectedDocs, basename(c.file, '.aml') + '.' + mode + '.aml'))) {
          const expectedText = readFileSync(join(expectedDocs, basename(c.file, '.aml') + '.' + mode + '.aml'), 'utf8');
          expect({ mode, text: repairTexts.get(a.final) }).toEqual({ mode, text: expectedText });
        }
        expect({ mode, repair: a }).toEqual({ mode, repair: e });
      }
      expect(actual).toEqual(exp);
    }, 600_000);
  }

  it('file references (CanLocateFile, NormalizeFilePath, FilePathFromValue)', () => {
    const actual = fileRefSweep(cases);
    const exp = expected.fileRefs;
    actual.lines.forEach((l: unknown, i: number) => expect({ ref: cases.fileRefs[i], l }).toEqual({ ref: cases.fileRefs[i], l: exp.lines[i] }));
    // Documented deviation: ftp without a container (see ftpDeviation).
    expect(exp.ftp).toBe('!WebException');
    expect(actual).toEqual({ ...exp, ftp: '!NotSupportedException' });
  });

  it('XmlConvert.VerifyXmlChars', () => {
    const actual = xmlCharsSweep(cases);
    actual.forEach((l, i) => expect({ s: cases.xmlChars[i], l }).toEqual({ s: cases.xmlChars[i], l: expected.xmlChars[i] }));
    expect(actual).toEqual(expected.xmlChars);
  });

  it('RepairTypeDescription', () => {
    expect((cases.repairValues as number[]).map((x) => J(RepairTypeEnumConverter.repairTypeDescription(x)))).toEqual(expected.repairValues);
  });

  it('ValidationKey', () => {
    expect(keySweep()).toEqual(expected.keys);
  });

  it('ValidationElement and the repair methods', () => {
    const actual = elementSweep(v, cases);
    expect(actual.api).toEqual(expected.elements.api);
    actual.repairs.forEach((l: unknown, i: number) => {
      const unique = i >= TARGETS.length * REPAIR_FLAGS.length;
      const j = i % (TARGETS.length * REPAIR_FLAGS.length);
      const target = TARGETS[Math.floor(j / REPAIR_FLAGS.length)];
      const flag = REPAIR_FLAGS[j % REPAIR_FLAGS.length];
      expect({ unique, target, flag, l }).toEqual({ unique, target, flag, l: expected.elements.repairs[i] });
    });
    expect(actual.repairs.length).toBe(expected.elements.repairs.length);
  });

  it('null arguments, registration', () => {
    expect(misc(v)).toEqual(expected.misc);
    ValidatorService.unRegister();
    expect(ServiceLocator.getService('IValidator') === null).toBe(expected.unregistered);
  });
});
