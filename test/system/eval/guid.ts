// Evaluators for the "guid" cases (scripts/sys-cases/guid.mjs); see test/system/sys.oracle.test.ts.
import { Guid } from '../../../src/system/Guid.js';
import { type Args, FAIL } from '../repr.js';

export const evaluators: Record<string, (args: Args) => string> = {
  'guid.parse': (a) => Guid.tryParse(a[0] as string)?.toString('D') ?? FAIL,
  'guid.Parse': (a) => Guid.parse(a[0] as string).toString('D'),
  'guid.fmt': (a) => Guid.parse(a[0] as string).toString(a[1] as string | null),
};

export const deviations: Record<string, string> = {};
