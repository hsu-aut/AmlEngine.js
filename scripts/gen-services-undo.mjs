// Generates the undo/redo scripts (seeded) for oracle/ServicesUndoOracle.cs and
// test/services/undo.oracle.test.ts: engine operations (the operations of the engine ops test,
// test/engine/ops-apply.ts, plus a few that reach the remaining command types) mixed with calls of
// the UndoRedoService, on one document and an optional related document.
//   node scripts/gen-services-undo.mjs <out.json> [randomScripts] [opsPerScript] [seed]
// The first scripts are fixed scenarios (edge cases of the service, every command type); the rest
// are random.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [out = 'test/services/undo/scripts.json', nScripts = '260', nOps = '28', seedArg = '3682'] = process.argv.slice(2);
let seed = Number(seedArg);
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = () => Math.floor(rnd() * 1000);
const chance = (p) => rnd() < p;

// Small documents keep the per-step serialization cheap; new documents of both versions.
const STARTS = ['new30', 'new30', 'new30', 'new215', 'new215', '12_MirrorObject.aml', '5_SUC.aml', '6_RCL.aml', '7_ICL.aml', '9_ExtInt_IntLink.aml', '13_Facet.aml', 'plant.aml', 'legacy-caex215.aml', '11_Constraints.aml', '3_IE_Attribute.aml', '8_AMLAttributeLibrary.aml', '10_RefSemantic.aml', 'Topology.aml', 'DemoLib.aml', '1_AMLBaseLibraries.aml'];
const RELATED = ['new30', 'new215', '2_IE.aml', '4_IH.aml', '3_IE_Attribute.aml', '5_SUC.aml', '7_ICL.aml', 'legacy-caex215.aml'];
const NAMES = ['A', 'B', 'Pump', 'Tank', 'Motor', 'x', 'Name with space', 'a/b', 'Ä', '[x]', 'dup', 'dup'];
const DATA_TYPES = [null, 'xs:string', 'xs:double', 'xs:int', 'xs:boolean', 'xs:dateTime', 'xs:decimal'];
const VALUES = [null, '', '1', '1.5', 'true', 'abc', '2021-03-14T12:00:00', ' 7 '];
const TX_NAMES = ['', 'T', 'Outer', 'Inner', 'Batch', null];

// Engine operations: those of test/engine/ops-apply.ts (same shapes as scripts/gen-engine-ops.mjs)
// and the extra ones of the undo test (seqMove, prependIE, seqRemoveAll, recreate, constraint,
// meta, delMeta, superior).
const ENGINE = [
  [4, () => ({ op: 'newIH', name: pick(NAMES) })],
  [2, () => ({ op: 'newLib', kind: pick(['suc', 'rc', 'ic', 'at']), name: pick(NAMES) })],
  [5, () => ({ op: 'newClass', kind: pick(['suc', 'rc', 'ic', 'at']), a: int(), name: pick(NAMES) })],
  [7, () => ({ op: 'newIE', a: int(), name: pick(NAMES) })],
  [6, () => ({ op: 'newAttr', a: int(), name: pick(NAMES) })],
  [5, () => ({ op: 'setAttr', a: int(), dataType: pick(DATA_TYPES), value: pick(VALUES) })],
  [2, () => {
    const type = pick(['double', 'int', 'bool', 'decimal', 'string']);
    const value = type === 'double' ? pick([0, 1.5, -2.25, 3.14159]) : type === 'int' ? pick([0, 7, -3, 65535]) : type === 'bool' ? chance(0.5) : type === 'decimal' ? pick(['1.50', '-0.1']) : pick(NAMES);
    return { op: 'setAttrTyped', a: int(), type, value };
  }],
  [2, () => ({ op: 'setUnit', a: int(), value: pick([null, 'm', 'kg', '°C']) })],
  [4, () => ({ op: 'newEI', a: int(), b: int(), name: pick(NAMES), withClass: chance(0.7) })],
  [2, () => ({ op: 'setBase', kind: pick(['suc', 'rc', 'ic']), a: int(), b: int() })],
  [3, () => ({ op: 'addRole', a: int(), b: int() })],
  [3, () => ({ op: 'instantiate', a: int(), b: int() })],
  [3, () => ({ op: 'link', a: int(), b: int(), name: pick(NAMES) })],
  [4, () => ({ op: 'remove', a: int(), relations: chance(0.5) })],
  [2, () => ({ op: 'copyIE', a: int(), b: int() })],
  [3, () => ({ op: 'rename', a: int(), name: pick(NAMES) })],
  [2, () => ({ op: 'describe', a: int(), value: pick([null, 'text', '']), version: pick([null, '1.0.0']) })],
  [2, () => ({ op: 'newGuid', a: int(), updateRefs: chance(0.5) })],
  [2, () => ({ op: 'mirror', a: int(), b: int() })],
  [1, () => ({ op: 'setRefBase', a: int(), b: int() })],
  [2, () => ({ op: 'move', a: int(), b: int() })],
  [3, () => ({ op: 'seqMove', kind: pick(['ie', 'attr', 'ei']), a: int(), i: int(), j: int() })],
  [2, () => ({ op: 'prependIE', a: int(), name: pick(NAMES) })],
  [1, () => ({ op: 'seqRemoveAll', kind: pick(['ie', 'attr', 'ei']), a: int() })],
  [2, () => ({ op: 'recreate', a: int(), b: int() })],
  [2, () => ({ op: 'constraint', kind: pick(['nominal', 'ordinal', 'unknown']), a: int(), name: pick(NAMES), value: pick(['1', 'x', '']) })],
  [2, () => ({ op: 'meta', id: pick(['W1', 'W2', '']), name: pick(NAMES), date: pick(['2021-03-14T12:00:00', '2020-01-01T00:00:00Z', '1999-12-31T23:59:59']) })],
  [1, () => ({ op: 'delMeta', id: pick(['W1', 'W2', 'none']) })],
  [1, () => ({ op: 'superior', value: pick(['AutomationML 2.10', 'AutomationML 2.0', 'x']), i: int() })],
];

function weighted(list) {
  const total = list.reduce((s, [w]) => s + w, 0);
  let r = rnd() * total;
  for (const [w, f] of list) {
    if ((r -= w) < 0) return f();
  }
  return list[0][1]();
}

/** One random script; tracks open transactions and pauses to balance most scripts at the end. */
function randomScript() {
  const start = pick(STARTS);
  const related = chance(0.45) ? pick(RELATED) : null;
  const doc = () => (related !== null && chance(0.3) ? 'r' : 'a');
  const open = { a: 0, r: 0 };
  const paused = { a: 0, r: 0, g: 0 };
  const SERVICE = [
    [10, () => ({ op: 'undo', d: doc() })],
    [6, () => ({ op: 'redo', d: doc() })],
    [5, () => {
      const d = doc();
      const rel = related !== null && chance(0.35) ? (d === 'a' ? 'r' : 'a') : chance(0.08) ? d : null;
      open[d]++;
      if (rel !== null && rel !== d) open[rel]++;
      return { op: 'begin', d, name: pick(TX_NAMES), rel };
    }],
    [5, () => {
      const d = doc();
      open[d] = Math.max(0, open[d] - 1);
      return { op: 'end', d };
    }],
    [2, () => {
      if (chance(0.3)) {
        paused.g++;
        return { op: 'pause', d: null };
      }
      const d = doc();
      paused[d]++;
      return { op: 'pause', d };
    }],
    [2, () => {
      if (chance(0.3)) {
        paused.g = 0;
        return { op: 'resume', d: null };
      }
      const d = doc();
      paused[d] = Math.max(0, paused[d] - 1);
      return { op: 'resume', d };
    }],
    [1, () => ({ op: 'clear', d: doc() })],
    [1, () => ({ op: 'removeCommands' })],
    [2, () => ({ op: 'lastMod', d: doc(), undo: chance(0.6) })],
    [1, () => ({ op: 'stamps', d: doc() })],
    [1, () => ({ op: 'actionsLazy', d: doc(), redo: chance(0.4) })],
    [1, () => ({ op: 'actionsModify', d: doc(), redo: chance(0.4) })],
    [2, () => ({ op: 'push', d: doc(), name: pick(['C1', 'C2', null]), fail: pick(['none', 'none', 'none', 'undo', 'redo']) })],
  ];
  const ops = [];
  for (let j = 0; j < Number(nOps); j++) {
    if (chance(0.4)) ops.push(weighted(SERVICE));
    else ops.push({ ...weighted(ENGINE), d: doc() });
  }
  if (chance(0.85)) {
    if (paused.g > 0) ops.push({ op: 'resume', d: null });
    for (const d of ['a', 'r']) {
      for (let k = 0; k < paused[d]; k++) ops.push({ op: 'resume', d });
      for (let k = 0; k < open[d]; k++) ops.push({ op: 'end', d });
    }
  }
  return related === null ? { start, ops } : { start, related, ops };
}

// ---- fixed scenarios -------------------------------------------------------------------------

const ie = (d = 'a', name = 'X') => ({ op: 'newIE', a: 0, name, d });
const ih = (d = 'a', name = 'H') => ({ op: 'newIH', name, d });
const S = (op, extra = {}) => ({ op, ...extra });

const FIXED = [
  {
    name: 'empty stacks',
    start: 'new30',
    ops: [
      S('undo', { d: 'a' }), S('redo', { d: 'a' }), S('lastMod', { d: 'a', undo: true }), S('lastMod', { d: 'a', undo: false }),
      S('stamps', { d: 'a' }), S('end', { d: 'a' }), S('clear', { d: 'a' }), S('removeCommands'), S('actionsLazy', { d: 'a', redo: false }),
      S('actionsModify', { d: 'a', redo: true }), S('undo', { d: 'a' }), S('redo', { d: 'a' }),
    ],
  },
  {
    name: 'nested transactions',
    start: 'new30',
    ops: [
      ih(), S('begin', { d: 'a', name: 'Outer' }), ie('a', 'P'), S('begin', { d: 'a', name: 'Inner' }), ie('a', 'Q'), S('newAttr', { a: 1, name: 'At' }),
      S('end', { d: 'a' }), S('rename', { a: 1, name: 'R' }), S('end', { d: 'a' }), S('end', { d: 'a' }), S('undo', { d: 'a' }), S('redo', { d: 'a' }),
      S('undo', { d: 'a' }), S('undo', { d: 'a' }), S('redo', { d: 'a' }), S('stamps', { d: 'a' }),
    ],
  },
  {
    name: 'empty transactions',
    start: 'new30',
    ops: [
      S('begin', { d: 'a', name: 'E' }), S('end', { d: 'a' }), S('begin', { d: 'a', name: 'O' }), S('begin', { d: 'a', name: 'I' }), ih(),
      S('end', { d: 'a' }), S('end', { d: 'a' }), S('begin', { d: 'a', name: 'O2' }), S('begin', { d: 'a', name: 'I2' }), S('end', { d: 'a' }),
      ih('a', 'H2'), S('end', { d: 'a' }), S('stamps', { d: 'a' }),
    ],
  },
  {
    name: 'transaction without name',
    start: 'new215',
    ops: [
      S('begin', { d: 'a', name: null }), ih(), ie(), S('end', { d: 'a' }), S('push', { d: 'a', name: null, fail: 'none' }), ih('a', 'H3'),
      S('undo', { d: 'a' }), S('undo', { d: 'a' }), S('push', { d: 'a', name: 'Named', fail: 'none' }),
    ],
  },
  {
    name: 'multi document transaction, two documents',
    start: 'new30',
    related: 'new30',
    ops: [
      S('begin', { d: 'a', name: 'Multi', rel: 'r' }), ih('a'), ih('r', 'RH'), S('end', { d: 'a' }), S('end', { d: 'r' }), S('end', { d: 'r' }),
      S('undo', { d: 'a' }), S('undo', { d: 'r' }), S('redo', { d: 'r' }), S('stamps', { d: 'a' }), S('stamps', { d: 'r' }),
    ],
  },
  {
    name: 'multi document transaction inside an outer transaction',
    start: 'new30',
    related: '2_IE.aml',
    ops: [
      S('begin', { d: 'a', name: 'Outer' }), ih('a', 'O'), S('begin', { d: 'a', name: 'Multi', rel: 'r' }), ie('a', 'M'), S('rename', { a: 1, name: 'RR', d: 'r' }),
      S('end', { d: 'a' }), S('end', { d: 'a' }), S('end', { d: 'r' }), S('undo', { d: 'a' }), S('redo', { d: 'a' }), S('undo', { d: 'r' }), S('redo', { d: 'r' }),
    ],
  },
  {
    name: 'multi document transaction, nested transaction inside',
    start: 'new30',
    related: 'new215',
    ops: [
      S('begin', { d: 'a', name: 'Multi', rel: 'r' }), S('begin', { d: 'a', name: 'In' }), ih('a', 'I'), S('end', { d: 'a' }), ih('r', 'J'), S('end', { d: 'a' }),
      S('end', { d: 'r' }), S('undo', { d: 'r' }),
    ],
  },
  {
    name: 'multi document transaction, same document',
    start: 'new30',
    ops: [
      S('begin', { d: 'a', name: 'Same', rel: 'a' }), ih('a'), ie('a', 'S'), S('end', { d: 'a' }), S('stamps', { d: 'a' }), S('undo', { d: 'a' }), S('redo', { d: 'a' }),
      S('undo', { d: 'a' }), ih('a', 'After'), S('undo', { d: 'a' }),
    ],
  },
  {
    name: 'multi document transaction without commands',
    start: 'new30',
    related: 'new30',
    ops: [
      S('begin', { d: 'a', name: 'Empty', rel: 'r' }), S('end', { d: 'a' }), ih('r', 'Open'), S('end', { d: 'r' }), S('undo', { d: 'r' }), S('end', { d: 'r' }),
    ],
  },
  {
    name: 'multi document transaction, related paused',
    start: 'new30',
    related: 'new30',
    ops: [
      S('pause', { d: 'r' }), S('begin', { d: 'a', name: 'M', rel: 'r' }), ih('a'), ih('r'), S('end', { d: 'a' }), S('resume', { d: 'r' }), S('end', { d: 'r' }),
    ],
  },
  {
    // EndTransaction pops the inner multi document transaction and puts the outer one on the undo
    // stack: the only way a MultiDocumentTransaction is undone and redone (with its related one).
    name: 'two multi document transactions',
    start: 'new30',
    related: '3_IE_Attribute.aml',
    ops: [
      S('begin', { d: 'a', name: 'M1', rel: 'r' }), S('rename', { a: 1, name: 'R1', d: 'r' }), S('push', { d: 'r', name: 'RC', fail: 'none' }),
      S('begin', { d: 'a', name: 'M2', rel: 'r' }), ih('a', 'In2'), S('push', { d: 'a', name: 'AC', fail: 'none' }), ih('r', 'R2'), S('end', { d: 'a' }),
      S('undo', { d: 'a' }), S('redo', { d: 'a' }), S('undo', { d: 'a' }), S('end', { d: 'r' }), S('end', { d: 'r' }), S('redo', { d: 'a' }),
    ],
  },
  {
    name: 'two multi document transactions, related paused',
    start: 'new30',
    related: 'new30',
    ops: [
      S('pause', { d: 'r' }), S('begin', { d: 'a', name: 'M1', rel: 'r' }), S('begin', { d: 'a', name: 'M2', rel: 'r' }), S('resume', { d: 'r' }), ih('a', 'X'),
      S('end', { d: 'a' }), S('push', { d: 'a', name: 'AC', fail: 'none' }), S('undo', { d: 'a' }), S('undo', { d: 'a' }), S('redo', { d: 'a' }),
    ],
  },
  {
    name: 'two multi document transactions, the outer with commands',
    start: 'new30',
    related: 'new215',
    ops: [
      S('begin', { d: 'a', name: 'M1', rel: 'r' }), ih('a', 'Out'), S('begin', { d: 'a', name: 'M2', rel: 'r' }), ih('a', 'In'), ih('r', 'RIn'),
      S('end', { d: 'a' }), S('end', { d: 'r' }), S('end', { d: 'r' }), S('undo', { d: 'a' }), S('redo', { d: 'a' }), S('undo', { d: 'r' }), S('undo', { d: 'a' }),
    ],
  },
  {
    name: 'pause per document, nested',
    start: '5_SUC.aml',
    related: 'new30',
    ops: [
      ih(), S('pause', { d: 'a' }), S('pause', { d: 'a' }), ie('a', 'P1'), ih('r', 'R1'), S('begin', { d: 'a', name: 'B' }), S('end', { d: 'a' }),
      S('resume', { d: 'a' }), ie('a', 'P2'), S('lastMod', { d: 'a', undo: true }), S('resume', { d: 'a' }), ie('a', 'P3'), S('resume', { d: 'a' }),
      S('undo', { d: 'a' }), S('undo', { d: 'a' }), S('undo', { d: 'r' }),
    ],
  },
  {
    name: 'pause global',
    start: 'new215',
    ops: [
      ih(), S('pause', { d: null }), ih('a', 'G'), S('begin', { d: 'a', name: 'B' }), S('end', { d: 'a' }), S('push', { d: 'a', name: 'C', fail: 'none' }),
      S('undo', { d: 'a' }), S('pause', { d: null }), S('resume', { d: null }), ih('a', 'G2'), S('undo', { d: 'a' }), S('redo', { d: 'a' }),
    ],
  },
  {
    name: 'resume without pause',
    start: 'new30',
    ops: [S('resume', { d: 'a' }), S('resume', { d: null }), ih(), S('resume', { d: 'a' }), S('undo', { d: 'a' })],
  },
  {
    name: 'clear while paused',
    start: 'new30',
    ops: [ih(), S('pause', { d: 'a' }), S('clear', { d: 'a' }), S('resume', { d: 'a' }), S('undo', { d: 'a' }), S('clear', { d: 'a' }), S('redo', { d: 'a' })],
  },
  {
    name: 'clear and remove commands',
    start: 'new30',
    related: 'new215',
    ops: [
      ih(), ih('r'), ie('a'), S('undo', { d: 'a' }), S('clear', { d: 'a' }), ih('a', 'H4'), S('pause', { d: 'r' }), S('removeCommands'), S('resume', { d: 'r' }),
      S('undo', { d: 'r' }), ih('r', 'R2'), S('removeCommands'), S('undo', { d: 'r' }),
    ],
  },
  {
    name: 'last modification date',
    start: 'new30',
    ops: [
      ih(), S('lastMod', { d: 'a', undo: true }), S('lastMod', { d: 'a', undo: false }), S('undo', { d: 'a' }), S('lastMod', { d: 'a', undo: false }),
      S('lastMod', { d: 'a', undo: true }), S('stamps', { d: 'a' }), S('pause', { d: 'a' }), S('lastMod', { d: 'a', undo: true }), S('resume', { d: 'a' }),
    ],
  },
  {
    name: 'lazy actions and changes during enumeration',
    start: 'new30',
    ops: [
      ih(), ie(), S('actionsLazy', { d: 'a', redo: false }), S('undo', { d: 'a' }), S('actionsLazy', { d: 'a', redo: true }), S('actionsModify', { d: 'a', redo: false }),
      S('undo', { d: 'a' }), S('actionsModify', { d: 'a', redo: true }), S('begin', { d: 'a', name: 'T' }), S('actionsModify', { d: 'a', redo: false }), S('end', { d: 'a' }),
    ],
  },
  {
    name: 'undo throws',
    start: 'new30',
    ops: [
      ih(), S('push', { d: 'a', name: 'Bad', fail: 'undo' }), S('undo', { d: 'a' }), ih('a', 'NotRecorded'), S('begin', { d: 'a', name: 'B' }), S('end', { d: 'a' }),
      S('undo', { d: 'a' }), S('redo', { d: 'a' }),
    ],
  },
  {
    name: 'redo throws',
    start: 'new30',
    ops: [ih(), S('push', { d: 'a', name: 'Bad', fail: 'redo' }), S('undo', { d: 'a' }), S('redo', { d: 'a' }), S('redo', { d: 'a' }), ih('a', 'Later')],
  },
  {
    name: 'command order in transactions',
    start: 'new30',
    ops: [
      S('begin', { d: 'a', name: 'Order' }), S('push', { d: 'a', name: 'C1', fail: 'none' }), S('push', { d: 'a', name: 'C2', fail: 'none' }),
      S('begin', { d: 'a', name: 'Sub' }), S('push', { d: 'a', name: 'C3', fail: 'none' }), S('end', { d: 'a' }), S('push', { d: 'a', name: 'C4', fail: 'none' }),
      S('end', { d: 'a' }), S('undo', { d: 'a' }), S('redo', { d: 'a' }), S('pushNull'),
    ],
  },
  {
    name: 'undo inside an open transaction',
    start: 'new30',
    ops: [ih(), ih('a', 'H2'), S('begin', { d: 'a', name: 'T' }), ie(), S('undo', { d: 'a' }), ie('a', 'Y'), S('end', { d: 'a' }), S('undo', { d: 'a' }), S('undo', { d: 'a' })],
  },
  {
    // MoveCmd.UnExecute without a previous sibling (the moved element was the first child).
    name: 'move the first element',
    start: 'new30',
    ops: [
      ih(), ie('a', 'E1'), S('newAttr', { a: 0, name: 'A1' }), S('newAttr', { a: 0, name: 'A2' }), S('newIE', { a: 1, name: 'C1' }), S('newIE', { a: 1, name: 'C2' }),
      S('seqMove', { kind: 'attr', a: 0, i: 0, j: 1 }), S('seqMove', { kind: 'ie', a: 1, i: 0, j: 1 }), S('seqMove', { kind: 'ie', a: 1, i: 1, j: 0 }),
      S('undo', { d: 'a' }), S('undo', { d: 'a' }), S('undo', { d: 'a' }), S('redo', { d: 'a' }), S('redo', { d: 'a' }), S('redo', { d: 'a' }),
    ],
  },
  {
    name: 'push clears redo',
    start: '3_IE_Attribute.aml',
    ops: [S('rename', { a: 1, name: 'N1' }), S('rename', { a: 1, name: 'N2' }), S('undo', { d: 'a' }), S('undo', { d: 'a' }), S('setAttr', { a: 0, dataType: 'xs:int', value: '5' }), S('redo', { d: 'a' })],
  },
  {
    name: 'end and begin while the document is paused',
    start: 'new30',
    ops: [
      S('begin', { d: 'a', name: 'T' }), ih(), S('pause', { d: 'a' }), S('end', { d: 'a' }), S('begin', { d: 'a', name: 'U' }), S('resume', { d: 'a' }), S('end', { d: 'a' }),
      S('end', { d: 'a' }),
    ],
  },
  {
    name: 'null document arguments',
    start: 'new30',
    ops: ['canUndo', 'canRedo', 'undo', 'redo', 'begin', 'beginRel', 'end', 'clear', 'lastMod', 'undoActions', 'redoActions', 'pause', 'resume', 'push'].map((m) => S('nullDoc', { m })),
  },
  {
    name: 'unload related document',
    start: 'new30',
    related: 'new30',
    ops: [
      ih('r'), S('begin', { d: 'a', name: 'M', rel: 'r' }), ih('a'), ih('r', 'R2'), S('unload', { d: 'r' }), S('end', { d: 'r' }), S('pause', { d: 'r' }),
      S('resume', { d: 'r' }), S('undo', { d: 'r' }), S('clear', { d: 'r' }), S('lastMod', { d: 'r', undo: true }),
    ],
  },
  {
    name: 'unload paused document',
    start: 'new30',
    related: 'new215',
    ops: [ih('r'), S('pause', { d: 'r' }), S('unload', { d: 'r' }), ih('a'), S('removeCommands')],
  },
];

// Every command type: engine operations on documents of both versions, then undo and redo all.
for (const start of ['new30', 'new215', '11_Constraints.aml', '12_MirrorObject.aml']) {
  FIXED.push({
    name: 'every command type ' + start,
    start,
    ops: [
      ih('a', 'H'), S('newLib', { kind: 'suc', name: 'L' }), S('newClass', { kind: 'suc', a: 0, name: 'C' }), S('newLib', { kind: 'at', name: 'AL' }),
      S('newClass', { kind: 'at', a: 0, name: 'AT' }), S('newLib', { kind: 'ic', name: 'IL' }), S('newClass', { kind: 'ic', a: 0, name: 'IC' }),
      ie('a', 'E1'), ie('a', 'E2'), S('prependIE', { a: 0, name: 'E0' }), S('newAttr', { a: 3, name: 'A1' }), S('newAttr', { a: 3, name: 'A2' }),
      S('setAttr', { a: 0, dataType: 'xs:double', value: '1.5' }), S('setUnit', { a: 0, value: 'm' }), S('describe', { a: 2, value: 'text', version: '1.0.0' }),
      S('seqMove', { kind: 'ie', a: 0, i: 0, j: 2 }), S('seqMove', { kind: 'attr', a: 0, i: 1, j: 0 }), S('recreate', { a: 0, b: 0 }), S('recreate', { a: 1, b: 1 }),
      S('constraint', { kind: 'nominal', a: 0, name: 'N', value: 'v' }), S('constraint', { kind: 'ordinal', a: 1, name: 'O', value: '3' }),
      S('constraint', { kind: 'unknown', a: 0, name: 'U', value: '' }), S('meta', { id: 'W1', name: 'Writer', date: '2021-03-14T12:00:00' }),
      S('meta', { id: 'W1', name: 'Writer2', date: '2020-01-01T00:00:00Z' }), S('delMeta', { id: 'W1' }), S('superior', { value: 'AutomationML 2.10', i: 0 }),
      S('superior', { value: 'AutomationML 2.0', i: 1 }), S('newEI', { a: 2, b: 0, name: 'I1', withClass: true }), S('newEI', { a: 3, b: 0, name: 'I2', withClass: false }),
      S('link', { a: 0, b: 1, name: 'L1' }), S('instantiate', { a: 0, b: 1 }), S('addRole', { a: 1, b: 0 }), S('newGuid', { a: 4, updateRefs: true }),
      S('copyIE', { a: 0, b: 0 }), S('mirror', { a: 1, b: 0 }), S('move', { a: 2, b: 1 }), S('seqRemoveAll', { kind: 'attr', a: 3 }), S('remove', { a: 5, relations: true }),
      S('remove', { a: 7, relations: false }), S('rename', { a: 3, name: 'Renamed' }), S('setRefBase', { a: 0, b: 0 }),
    ].map((op) => (op.d === undefined && !['undo', 'redo'].includes(op.op) ? { ...op, d: 'a' } : op)),
  });
}

const scripts = [...FIXED];
for (let i = 0; i < Number(nScripts); i++) scripts.push(randomScript());
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(scripts));
console.log(`${scripts.length} scripts (${FIXED.length} fixed) -> ${out}`);
