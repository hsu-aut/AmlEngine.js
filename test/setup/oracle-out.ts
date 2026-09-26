// The directory of the oracle outputs: test/oracle-out, or $ORACLE_OUT, e.g. the outputs of .NET on
// Linux in another time zone (scripts/tz-check.mjs).
import { join, resolve } from 'node:path';

export const oracleOut = process.env.ORACLE_OUT ? resolve(process.env.ORACLE_OUT) : join(__dirname, '..', 'oracle-out');
