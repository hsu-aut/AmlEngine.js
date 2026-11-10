// Write operation parity: random engine operation scripts (scripts/gen-engine-ops.mjs) run with
// the JS engine, compared step by step with oracle/EngineOpsOracle.cs. Keep both in sync.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { oracleOut } from '../setup/oracle-out.js';
import { apply, Canonicalizer, hash, readAllText, save } from './ops-apply.js';

const root = join(__dirname, '..');
const scriptFile = join(root, 'engine-ops', 'ops.json');
const expectedFile = join(oracleOut, 'engineops.json');

describe.skipIf(!existsSync(expectedFile))('engine operations parity with Aml.Engine', () => {
  const scripts = JSON.parse(readFileSync(scriptFile, 'utf8')) as Array<{ start: string; ops: any[] }>;
  // The suite body runs even when skipped (vitest collects the tests): read only what exists.
  const expected = (existsSync(expectedFile) ? JSON.parse(readFileSync(expectedFile, 'utf8')) : []) as Array<{ steps: Array<[string, string]>; final: string }>;
  scripts.forEach((script, i) => {
    it(`script ${i} (${script.start})`, () => {
      const canon = new Canonicalizer();
      const doc: any =
        script.start === 'new30'
          ? CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0)
          : script.start === 'new215'
            ? CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15)
            : CAEXDocument.loadFromString(readAllText(join(root, 'corpus', script.start)));
      let text = '';
      for (let j = 0; j < script.ops.length; j++) {
        const op = script.ops[j];
        let result: string;
        try {
          result = apply(doc, op);
        } catch (e) {
          result = '!' + dotNetExceptionName(e);
        }
        try {
          text = canon.apply(save(doc));
        } catch (e) {
          text = '!' + dotNetExceptionName(e);
        }
        const [expResult, expHash] = expected[i].steps[j];
        const actual = { step: j, op, result: canon.apply(result), hash: hash(text) };
        if (actual.result !== expResult || actual.hash !== expHash) {
          // Show the document only when the hashes differ at the last step, where the oracle has it.
          expect(actual).toEqual({ step: j, op, result: expResult, hash: expHash });
        }
      }
      expect(text).toBe(expected[i].final);
    });
  });
});
