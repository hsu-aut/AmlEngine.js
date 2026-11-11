// The step runner of the external reference tests (extref.oracle.test.ts, github.live.test.ts):
// the JS counterpart of oracle/ServicesExtRefOracle.cs. Every step of a case of
// test/services/extref/*.json (scripts/gen-services-extref.mjs) records the same line as the
// oracle. Keep both in sync.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { isAbsolute, resolve, sep } from 'node:path';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { CAEXDocumentExtensions } from '../../src/engine/caex/extensions/CAEXDocumentExtensions.js';
import { ServiceLocator } from '../../src/engine/services/ServiceLocator.js';
import { ExternalReferenceResolver } from '../../src/services/ExternalReferenceResolver.js';
import { GitHubAccessService } from '../../src/services/GitHubAccessService.js';
import { GitHubReferenceResolver } from '../../src/services/GitHubReferenceResolver.js';
import { from } from '../../src/system/linq.js';
import { AggregateException, dotNetExceptionName, InvalidOperationException } from '../../src/system/exceptions.js';
import { Uri, UriKind } from '../../src/system/Uri.js';
import { EXTREF_BASE } from './extref-server.mjs';

export const casesDir = resolve(__dirname, 'extref');
const casesDirU = casesDir.replace(/\\/g, '/');
const corpusDir = resolve(casesDir, '..', '..', 'corpus');
const baseUrl = EXTREF_BASE;

export type Step = (string | null)[] | { s: (string | null)[]; port: string };

// ---------------------------------------------------------------- recording

class Canon {
  private readonly guids = new Map<string, string>();
  apply(text: string): string {
    return text.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, (m) => {
      const k = m.toLowerCase();
      let id = this.guids.get(k);
      if (!id) {
        id = 'G' + (this.guids.size + 1);
        this.guids.set(k, id);
      }
      return id;
    });
  }
}

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

function canonPaths(line: string): string {
  line = replaceAllCi(line, casesDir, '<IN>');
  line = replaceAllCi(line, casesDirU, '<IN>');
  line = replaceAllCi(line, corpusDir, '<CORPUS>');
  line = replaceAllCi(line, corpusDir.replace(/\\/g, '/'), '<CORPUS>');
  return line.split(baseUrl).join('<BASE>');
}

function expand(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const file = casesDirU.startsWith('/') ? 'file://' + casesDirU : 'file:///' + casesDirU;
  return s.split('<IN>').join(casesDir).split('<INU>').join(casesDirU).split('<FILE>').join(file).split('<BASE>').join(baseUrl).split('<CORPUS>').join(corpusDir);
}

export function ex(e: unknown): string {
  // .Result of a synchronous method: the wrapper, whether its message has the .NET format, the inner exception
  if (e instanceof AggregateException && e.innerExceptions.length === 1) {
    const inner = e.innerExceptions[0];
    const innerMessage = inner instanceof Error ? inner.message : String(inner);
    return '!AggregateException[' + (e.message === `One or more errors occurred. (${innerMessage})` ? 'message' : e.message) + ']' + ex(inner);
  }
  const name = dotNetExceptionName(e);
  return name === 'NullReferenceException' ? '!' + name : '!' + name + ': ' + (e as Error).message;
}

const N = (s: string | null | undefined) => s ?? 'null';
const B = (b: boolean) => (b ? 'true' : 'false');

function D(w: any): string {
  if (w === null || w === undefined) return 'null';
  if (w.node == null) return w.constructor.name + '(nonode)';
  let path: string;
  try {
    path = N(w.caexPath());
  } catch (e) {
    path = ex(e);
  }
  if (w instanceof T.CAEXObject) return `${w.constructor.name}:${w.node.name.localName}|${N((w as any).name)}|${N((w as any).id)}|${path}`;
  return `${w.constructor.name}:${w.node.name.localName}`;
}

// ---------------------------------------------------------------- the cases

class Case {
  readonly lines: string[] = [];
  private readonly canon = new Canon();
  private readonly docs = new Map<string, any>();
  private readonly refs = new Map<string, any>();
  private readonly resolvers: ExternalReferenceResolver[] = [];
  private readonly ids = new Map<object, number>();
  private readonly fnLog: (string | null)[] = [];
  private R!: ExternalReferenceResolver;

  async run(steps: Step[]): Promise<string[]> {
    this.R = ExternalReferenceResolver.register();
    this.resolvers.push(this.R);
    try {
      for (const step of steps) {
        const s = Array.isArray(step) ? step : step.s;
        const op = s[0] as string;
        const a = s.slice(1);
        let result: string;
        try {
          result = await this.do(op, a);
        } catch (e) {
          result = ex(e);
        }
        this.lines.push(this.canon.apply(canonPaths(op + '(' + a.map(N).join(',') + ')=' + result)));
      }
    } finally {
      for (const d of [...this.docs.values()].reverse()) {
        try {
          d.unload();
        } catch {
          // as the oracle: cleanup errors are ignored
        }
      }
      ServiceLocator.unRegister(ExternalReferenceResolver as any);
      ServiceLocator.unRegister(GitHubAccessService as any);
    }
    return this.lines;
  }

  private id(o: object): number {
    let id = this.ids.get(o);
    if (id === undefined) this.ids.set(o, (id = this.ids.size + 1));
    return id;
  }

  private dd(d: any): string {
    if (d === null || d === undefined) return 'null';
    if (d.xDocument === null) return `doc(#${this.id(d)}|unloaded)`;
    return `doc(${N(d.caexFile?.fileName)}|${N(d.filePath)}|#${this.id(d)})`;
  }

  private od(o: any): string {
    return o === null || o === undefined ? 'null' : D(o) + '@' + this.dd(o.caexDocument);
  }

  private res(r: { document: any; message: string | null }, bind: string | null | undefined): string {
    if (bind != null && r.document !== null) this.docs.set(bind, r.document);
    return this.dd(r.document) + '|' + N(r.message);
  }

  private doc(name: string | null | undefined): any {
    return name == null ? null : this.docs.get(name);
  }

  private ref(d: string | null | undefined, alias: string | null | undefined): any {
    return d == null ? null : from(this.doc(d).caexFile.externalReference as Iterable<any>).firstOrDefault((e: any) => e.alias === alias);
  }

  private obj(d: string, path: string): any {
    const o = CAEXDocumentExtensions.findByPath(this.doc(d), path);
    if (o === null) throw new InvalidOperationException('no object ' + path);
    return o;
  }

  private static base(o: any): any {
    if (o instanceof T.InternalElementType) return o.systemUnitClass;
    if (o instanceof T.SystemUnitFamilyType) return o.baseClass;
    if (o instanceof T.RoleFamilyType) return o.baseClass;
    if (o instanceof T.InterfaceClassType) return o.baseClass;
    if (o instanceof T.AttributeFamilyType) return o.baseClass;
    return 'nobase';
  }

  private static refAttrs(o: any): string {
    return ['RefBaseClassPath', 'RefBaseSystemUnitPath', 'RefRoleClassPath']
      .map((n) => o.node.attribute(n))
      .filter((x: any) => x !== null)
      .map((x: any) => x.name.localName + '=' + x.value)
      .join('|');
  }

  private async do(op: string, a: (string | null)[]): Promise<string> {
    const A = (i: number) => (i < a.length ? expand(a[i]) : null);
    const Raw = (i: number) => (i < a.length ? a[i] : null);
    const Bo = (i: number) => a[i] === 'true';
    const R = this.R as any;
    const gh = GitHubAccessService.instance as any;
    switch (op) {
      // ---- services
      case 'reg':
        this.R = ExternalReferenceResolver.register();
        this.resolvers.push(this.R);
        return 'R' + this.resolvers.length;
      case 'unreg':
        ExternalReferenceResolver.unRegister();
        return 'ok';
      case 'locunreg':
        ServiceLocator.unRegister(ExternalReferenceResolver as any);
        return 'ok';
      case 'svc': {
        const s = ServiceLocator.externalReferenceResolverService;
        if (s === null) return 'null';
        const k = this.resolvers.findIndex((x) => x === s);
        return k >= 0 ? 'R' + (k + 1) : 'other:' + (s as object).constructor.name;
      }

      // ---- documents
      case 'load': {
        const p = A(1)!;
        const d = CAEXDocument.loadFromFile(isAbsolute(p) ? p : casesDir + sep + p);
        this.docs.set(Raw(0)!, d);
        return this.dd(d);
      }
      case 'new': {
        const d = CAEXDocument.new_CAEXDocument();
        d.caexFile!.fileName = A(1);
        this.docs.set(Raw(0)!, d);
        return this.dd(d);
      }
      case 'unload':
        this.doc(Raw(0)).unload();
        return 'ok';
      case 'alive':
        return this.dd(this.doc(Raw(0)));
      case 'addref': {
        const er = this.doc(Raw(0)).caexFile.externalReference.append();
        er.alias = A(1);
        er.path = A(2);
        return 'ok';
      }
      case 'detach': {
        const er = this.ref(Raw(0), Raw(1));
        er.remove();
        this.refs.set(Raw(2)!, er);
        return 'ok';
      }

      // ---- resolver
      case 'lord':
        return this.res(R.loadOrGetReferencedDocument(this.ref(Raw(0), Raw(1))), Raw(2));
      case 'lorda':
        return this.res(await R.loadOrGetReferencedDocumentAsync(this.ref(Raw(0), Raw(1))), Raw(2));
      case 'lordr':
        return this.res(R.loadOrGetReferencedDocument(this.refs.get(Raw(0)!)), null);
      case 'lordra':
        return this.res(await R.loadOrGetReferencedDocumentAsync(this.refs.get(Raw(0)!)), null);
      case 'lordnull':
        return this.res(R.loadOrGetReferencedDocument(null), null);
      case 'lordanull':
        return this.res(await R.loadOrGetReferencedDocumentAsync(null), null);
      case 'lordp':
        return this.res(R.loadOrGetReferencedDocument(this.doc(Raw(0)), A(1)), null);
      case 'lordpa':
        return this.res(await R.loadOrGetReferencedDocumentAsync(this.doc(Raw(0)), A(1)), null);
      case 'resolve':
        return this.res(R.resolveExternalDocument(A(0), Bo(1)), Raw(2));
      case 'resolvea':
        return this.res(await R.resolveExternalDocumentAsync(A(0), Bo(1)), Raw(2));
      case 'can':
        return B(R.canResolve(A(0)));
      case 'cana':
        return B(await R.canResolveAsync(A(0)));
      case 'setredir':
        R.setRedirection(A(0), A(1));
        return 'ok';
      case 'clrredir':
        R.clearRedirection(A(0));
        return 'ok';
      case 'clrall':
        R.clearRedirection();
        return 'ok';
      case 'addr': {
        const file = Raw(1) === null ? null : Raw(1) === 'nofile' ? CAEXDocument.new_CAEXDocument().caexFile : this.doc(Raw(1)).caexFile;
        return N(R.getAddressWithRedirection(A(0), file));
      }
      case 'isext': {
        const element = this.obj(Raw(1)!, A(2)!);
        const r = R.isExternal(this.doc(Raw(0)), element.node);
        return B(r.result) + '|' + N(r.alias) + '|' + N(r.path);
      }
      case 'isreg':
        return B(R.isExternalReferenceRegistered(this.ref(Raw(0), Raw(1)), A(2)));
      case 'regext':
        return this.dd(R.registerExternalDocument(this.ref(Raw(0), Raw(1)), this.doc(Raw(2)), A(3)));
      case 'regexta':
        return this.dd(await R.registerExternalDocumentAsync(this.ref(Raw(0), Raw(1)), this.doc(Raw(2)), A(3)));
      case 'resdocs':
        return '[' + [...R.resolvedDocuments(this.doc(Raw(0)))].map((d: any) => this.dd(d)).join(',') + ']';
      case 'unloadext':
        R.unloadExternalDocument(this.ref(Raw(0), Raw(1)));
        return 'ok';
      case 'unloaddoc':
        R.unloadDocument(A(0));
        return 'ok';
      case 'remove':
        R.removeDocument(this.doc(Raw(0)));
        return 'ok';
      case 'fn': {
        const mode = Raw(0);
        const arg = A(1);
        const fns: Record<string, ((url: string) => any) | null> = {
          null: null,
          log: (url) => {
            this.fnLog.push(url);
            return null;
          },
          load: (url) => {
            this.fnLog.push(url);
            return CAEXDocument.loadFromFile(arg!);
          },
          throw: (url) => {
            this.fnLog.push(url);
            throw new InvalidOperationException('resolver function failed');
          },
        };
        R.registerResolverFunction(fns[mode!]);
        return 'ok';
      }
      case 'fnlog': {
        const s = this.fnLog.map(N).join(';');
        this.fnLog.length = 0;
        return s;
      }
      case 'nosync': {
        ExternalReferenceResolver.NoSynchronizationContextScope.enter().dispose();
        new ExternalReferenceResolver.NoSynchronizationContextScope.DisposableSynchronizationContext(null).dispose();
        return 'ok';
      }
      case 'getresp': {
        const resp: Response | null = await ExternalReferenceResolver.getResponseFromWebServerAsync(new Uri(A(0), UriKind.RelativeOrAbsolute));
        if (resp === null) return 'null';
        void resp.body?.cancel().catch(() => undefined);
        return resp.status + '|' + B(resp.ok);
      }

      // ---- engine paths that use the resolver
      case 'extdoc': {
        const d = this.ref(Raw(0), Raw(1)).externalDocument;
        if (Raw(2) !== null && d !== null) this.docs.set(Raw(2)!, d);
        return this.dd(d);
      }
      case 'find': {
        const o: any = CAEXDocumentExtensions.findByPath(this.doc(Raw(0)), A(1));
        if (Raw(2) !== null && o !== null) this.docs.set(Raw(2)!, o.caexDocument);
        return this.od(o);
      }
      case 'findid':
        return this.od(CAEXDocumentExtensions.findByID(this.doc(Raw(0)), A(1)));
      case 'base': {
        const b = Case.base(this.obj(Raw(0)!, A(1)!));
        return typeof b === 'string' ? b : this.od(b);
      }
      case 'chain': {
        const parts: string[] = [];
        let o: any = this.obj(Raw(0)!, A(1)!);
        for (let i = 0; i < 8 && o instanceof T.CAEXObject; i++) {
          o = Case.base(o);
          parts.push(typeof o === 'string' ? o : this.od(o));
        }
        return parts.join(' > ');
      }
      case 'srcrole':
        return this.od(from(this.obj(Raw(0)!, A(1)!).supportedRoleClass as Iterable<any>).first().roleClass);
      case 'setbase': {
        const o = this.obj(Raw(0)!, A(1)!);
        const t = this.obj(Raw(2)!, A(3)!);
        if (o instanceof T.InternalElementType) (o as any).systemUnitClass = t;
        else if (o instanceof T.SystemUnitFamilyType || o instanceof T.RoleFamilyType || o instanceof T.InterfaceClassType) (o as any).baseClass = t;
        return Case.refAttrs(o);
      }
      case 'insert': {
        const d = this.doc(Raw(0));
        const lib = from(d.caexFile.systemUnitClassLib as Iterable<any>).first((l: any) => l.name === A(1));
        const src = this.obj(Raw(2)!, A(3)!);
        const ins = lib.systemUnitClass.insert(src);
        const refs = from(d.caexFile.externalReference as Iterable<any>)
          .select((e: any) => e.alias + '=' + e.path)
          .toList()
          .join(';');
        return (ins === null ? 'null' : ins.node.toString()) + ' refs=' + refs;
      }

      // ---- GitHub
      case 'ghis':
        return B(gh.isGitHubPath(A(0)));
      case 'ghparams': {
        const t = GitHubReferenceResolver.findGitHubParameters(A(0));
        return [t.userName, t.repositoryName, t.path, t.gitRef].map(N).join('|');
      }
      case 'ghraw':
      case 'ghblob': {
        const uri = Uri.tryCreate(A(0), UriKind.Absolute);
        if (uri === null) return 'nouri';
        const r = (GitHubReferenceResolver as any)[op === 'ghraw' ? 'tryParseRawGitHub' : 'tryParseBlobGitHub'](uri);
        return B(r.result) + '|' + [r.owner, r.repo, r.gitRef, r.path].map(N).join('|');
      }
      case 'ghreg':
        gh.register(A(0), A(1), A(2));
        return 'ok';
      case 'ghunreg':
        gh.unregister(A(0), A(1));
        return 'ok';
      case 'ghtoken': {
        const key = (A(0) ?? '').toLowerCase() + '/' + (A(1) ?? '').toLowerCase();
        const r = gh._resolvers.get(key);
        return r === undefined ? 'none' : N(r.accessToken);
      }
      case 'ghload':
        return this.res(await gh.loadOrGetReferencedDocumentAsync(A(0), Bo(1)), null);
      case 'ghresp': {
        const resp: Response | null = await gh.getResponseFromGitServerAsync(A(0));
        if (resp === null) return 'null';
        void resp.body?.cancel().catch(() => undefined);
        return resp.status + '|' + B(resp.ok);
      }
      case 'ghres': {
        const r = new GitHubReferenceResolver(A(0)!, A(1)!, A(2)!);
        return N(r.userName) + '|' + N(r.repositoryName) + '|' + B(r.hasAccessToken()) + '|' + N(r.accessToken);
      }
      case 'ghexists':
        return B(await new GitHubReferenceResolver(A(0)!, A(1)!, A(2)!).gitHubFileExists(A(3)!));
      case 'ghregext':
        gh.registerExternalDocument(this.ref(Raw(0), Raw(1)), this.doc(Raw(2)), A(3));
        return 'ok';
      case 'ghunregext':
        gh.unregisterExternalDocument(this.doc(Raw(0)), A(1));
        return 'ok';
      case 'ghloc':
        if (Raw(0) === 'on') ServiceLocator.register(GitHubAccessService.instance as any);
        else ServiceLocator.unRegister(GitHubAccessService as any);
        return 'ok';
    }
    throw new Error('unknown op ' + op);
  }
}

/** Runs the steps of one case with the port and returns the recorded lines. */
export function runCase(steps: Step[]): Promise<string[]> {
  return new Case().run(steps);
}

/**
 * The expected lines (the oracle's, or the documented line of the port for a deviation step) and
 * the deviation steps whose mark is stale (the original gives the port's line).
 */
export function expectedLines(steps: Step[], oracle: string[]): { lines: string[]; stale: string[] } {
  const stale: string[] = [];
  const lines = steps.map((step, i) => {
    if (Array.isArray(step)) return oracle[i]!;
    if (oracle[i] === step.port) stale.push(step.port);
    return step.port;
  });
  return { lines, stale };
}

