// Evaluators for the "uri" cases (scripts/sys-cases/uri.mjs); see test/system/sys.oracle.test.ts.
import { Uri, UriKind } from '../../../src/system/Uri.js';
import { FAIL, type Args } from '../repr.js';

/** The oracle's JSON writer turns lone surrogates into U+FFFD; do the same with our output. */
function wellFormed(s: string): string {
  return s.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '�');
}

/** Same representation as SysOracle.Uri(u). */
function repr(u: Uri): string {
  let s = `${u.isAbsoluteUri ? 'abs' : 'rel'}|${u.toString()}|${u.originalString}`;
  if (u.isAbsoluteUri) s += `|${u.scheme}|${u.localPath}|${u.fragment}|${u.absoluteUri}`;
  return wellFormed(s);
}

const cap = (b: boolean): string => (b ? 'True' : 'False');

export const evaluators: Record<string, (args: Args) => string> = {
  'uri.create': (a) => {
    const u = Uri.tryCreate(a[0] as string, a[1] as UriKind);
    return u === null ? FAIL : repr(u);
  },
  'uri.new': (a) => repr(new Uri(a[0] as string | null, a[1] as UriKind)),
  'uri.parts': (a) => {
    const u = Uri.tryCreate(a[0] as string, a[1] as UriKind);
    if (u === null) return FAIL;
    if (!u.isAbsoluteUri) return 'rel';
    return wellFormed(
      [u.absolutePath, u.query, u.host, String(u.port), cap(u.isUnc), cap(u.isFile), cap(u.isDefaultPort), u.userInfo, u.authority, u.pathAndQuery].join('|'),
    );
  },
  'uri.equals': (a) => {
    const x = Uri.tryCreate(a[0] as string, UriKind.RelativeOrAbsolute);
    if (x === null) return FAIL;
    const y = Uri.tryCreate(a[1] as string, UriKind.RelativeOrAbsolute);
    if (y === null) return FAIL;
    return cap(x.equals(y));
  },
  'uri.escape': (a) => wellFormed(Uri.escapeDataString(a[0] as string)),
  'uri.unescape': (a) => wellFormed(Uri.unescapeDataString(a[0] as string)),
};

export const deviations: Record<string, string> = {};
