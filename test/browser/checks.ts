// The case based checks of the System layer (test/system/cases.json) and of the XML and System
// substitutes (test/gapsinfra/cases.json), bundled for the browser check: every browser must give
// the same result for every case as Node, whose results are compared with .NET by the oracle
// tests. These are the parts that rely on the JavaScript environment (Intl.Collator for culture
// sensitive comparison, Unicode normalization, Date for local time, TextDecoder, number formatting).
import { deviationRules, deviations, run as runSys, type Case as SysCase } from '../system/sys-eval.js';
import { run as runGaps, type Case as GapsCase } from '../engine/gapsinfra-eval.js';

export function runChecks(sys: SysCase[], gaps: GapsCase[]): { sys: string[]; gaps: string[] } {
  return {
    sys: sys.map((c) => JSON.stringify(runSys(c))),
    gaps: gaps.map((c) => JSON.stringify(runGaps(c))),
  };
}

/**
 * Why a browser result may differ from the Node result, or null if it must not:
 * - the sign of NaN: .NET's NaN has the sign bit set (bits fff8000000000000, float ffc00000); V8
 *   keeps the bits of a NaN, SpiderMonkey and JavaScriptCore replace every NaN by the positive one
 *   (7ff8000000000000). Only the bit dumps of the test cases show it, never the engine API.
 * - a System case that is a documented deviation from .NET (docs/deviations.md), e.g. local time
 *   before 1996, where the result comes from the time zone data of the JavaScript engine.
 */
export function explainDifference(c: SysCase | GapsCase, part: 'sys' | 'gaps', node: string, browser: string): string | null {
  const nan = (s: string): string => s.replace(/\bfff8000000000000\b/g, '7ff8000000000000').replace(/\bffc00000\b/g, '7fc00000');
  if (nan(node) === nan(browser)) return 'sign of NaN';
  if (part === 'sys') {
    const key = `${c.fn} ${JSON.stringify(c.args)}`;
    if (key in deviations) return deviations[key];
    const rule = deviationRules.find((r) => r.test(c.fn, (c as SysCase).args));
    if (rule) return rule.reason;
  }
  return null;
}
