# Runs with other seeds

The committed test inputs come from seeded generators (`scripts/gen-*.mjs`, seeds in
`scripts/oracle.sh`). To check that the port does not only match the original on these inputs,
the generators are run from time to time with other seeds and larger sizes. The run happens in a
separate git worktree, so the committed inputs stay as they are: generate, run the oracle modes,
run the corresponding tests.

## 2026-09-26 (version 0.1.0)

All comparisons identical to Aml.Engine 4.5.2 (8,465 tests, none failed).

| Generator | Arguments (size, seed) | Test | Result |
|---|---|---|---|
| `gen-xml-fuzz.mjs` | 800 documents, seed 20260926 | `test/xml/xlinq.oracle.test.ts` | 4,805 passed |
| `gen-xops.mjs` | 400 scripts x 50 steps, seed 9090 | `test/xml/xops.oracle.test.ts` | 400 passed |
| `gen-engine-ops.mjs` | 300 scripts x 80 operations, seed 20260926 | `test/engine/ops.oracle.test.ts` | 300 passed |
| `gen-invalid-caex.mjs` | 20 variants, seed 9191 | `test/validation/validation.oracle.test.ts` | 1,323 passed |
| `gen-values.mjs` | seed 9292 (17,841 cases) | `test/engine/values.oracle.test.ts` | 13 passed (all cases) |
| `gen-mutations.mjs` | 800 scripts x 50 operations, seed 9393 | `test/engine/mutations.oracle.test.ts` | 1,216 passed |
| `gen-amlobjects.mjs` | 240 scripts x 50 operations, seed 9494 | `test/engine/amlobjects.oracle.test.ts` | 381 passed |
| `gen-reads.mjs` | 12 random documents, seed 9595 | `test/engine/reads.oracle.test.ts` | 12 passed |
| `gen-gapsinfra.mjs` | 500 random scripts, seed 9696 (6,276 cases) | `test/engine/gapsinfra.oracle.test.ts` | 5 passed (all cases) |
| `gen-gapsservices.mjs` | seed 9797 | `test/engine/gapsservices.oracle.test.ts` | 10 passed |

The committed inputs are about half this size (see `scripts/oracle.sh`).
