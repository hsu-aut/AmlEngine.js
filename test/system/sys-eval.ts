// Evaluation of the System layer cases (test/system/cases.json) by the port, without Node or
// test framework APIs: used by sys.oracle.test.ts (against .NET) and by the browser check
// (test/browser/checks.ts, the same results in every browser as in Node).
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import type { Args } from './repr.js';
import * as datetime from './eval/datetime.js';
import * as dtparse from './eval/dtparse.js';
import * as timespan from './eval/timespan.js';
import * as number from './eval/number.js';
import * as guid from './eval/guid.js';
import * as uri from './eval/uri.js';
import * as xmlconvert from './eval/xmlconvert.js';
import * as convert from './eval/convert.js';

interface EvalModule {
  evaluators: Record<string, (args: Args) => string>;
  /** known deviations from .NET: key `${fn} ${JSON.stringify(args)}` -> reason */
  deviations: Record<string, string>;
  /** known deviations that apply to a whole class of cases (not checked for staleness) */
  deviationRules?: { reason: string; test: (fn: string, args: Args) => boolean }[];
}

const modules: EvalModule[] = [datetime, dtparse, timespan, number, guid, uri, xmlconvert, convert];
export const evaluators: Record<string, (args: Args) => string> = {};
export const deviations: Record<string, string> = {};
export const deviationRules: NonNullable<EvalModule['deviationRules']> = [];
for (const m of modules) {
  deviationRules.push(...(m.deviationRules ?? []));
  for (const [k, v] of Object.entries(m.evaluators)) {
    if (k in evaluators) throw new Error(`duplicate evaluator ${k}`);
    evaluators[k] = v;
  }
  Object.assign(deviations, m.deviations);
}

export interface Case {
  area: string;
  fn: string;
  args: Args;
}
export type Result = { ok: string } | { err: string };

export function run(c: Case): Result {
  const f = evaluators[c.fn];
  if (!f) return { err: `no evaluator for ${c.fn}` };
  try {
    // The oracle's JSON writer replaces lone surrogates by U+FFFD; do the same with our output.
    return { ok: f(c.args).replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '�') };
  } catch (e) {
    return { err: dotNetExceptionName(e) };
  }
}

