// Generates src/engine/fluent.ts: the public C# extension methods of Aml.Engine become instance
// methods of the engine classes (doc.findByPath(p) instead of CAEXDocumentExtensions.findByPath(doc, p)).
//
// Rules, following C# method resolution:
// - an existing member of a class (own or inherited) is never replaced: in C# an instance member
//   always wins over an extension method;
// - an extension declared for a class is attached to that class; one declared for an interface is
//   attached to the topmost classes implementing it; subclasses inherit;
// - when a class gets two candidates with the same name, the one declared for a class wins over
//   one declared for an interface, a more derived class over a base class; remaining ties are
//   ambiguous (a compile error in C#) and skipped.
//
//   node scripts/gen-fluent.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const typeMap = new Map(
  readFileSync('docs/type-map.tsv', 'utf8').trim().split(/\r?\n/).slice(1).map((l) => {
    const [, , type, kind, module, name] = l.split('\t');
    return [name, { type, kind, module }];
  }),
);
const extensions = readFileSync('docs/extension-methods.tsv', 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => {
    const [method, thisType, , visibility, staticClass] = l.split('\t');
    return { method, thisType: thisType.replace(/<.*$/, ''), visibility, staticClass };
  })
  .filter((e) => e.visibility === 'public');

/** C# member name to the port's name (docs/PORTING.md). */
function camel(name) {
  const m = /^([A-Z]+)(.*)$/.exec(name);
  if (!m) return name;
  let [, caps, rest] = m;
  if (caps.length > 1 && /^[a-z]/.test(rest)) {
    rest = caps.slice(-1) + rest;
    caps = caps.slice(0, -1);
  }
  return caps.toLowerCase() + rest;
}

// Probe the loaded engine: members, class hierarchy and interfaces of every class.
const probeFile = join(tmpdir(), `amlengine-fluent-probe-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `
      import * as api from './src/engine/api.ts';
      import { T } from './src/engine/registry.ts';
      import { implementsInterface } from './src/engine/interfaces.ts';
      export { api, T, implementsInterface };`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: probeFile,
  logLevel: 'error',
  keepNames: true,
});
const { api, T, implementsInterface } = await import(pathToFileURL(probeFile).href);
rmSync(probeFile);

const classes = Object.entries(T).filter(([, c]) => typeof c === 'function');
const memberNames = (cls) => {
  const names = new Set();
  for (let p = cls.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const n of Object.getOwnPropertyNames(p)) names.add(n);
  }
  return names;
};
/** Members defined by classes derived from cls (TypeScript requires them to fit a base member). */
const descendantMembers = (cls) => {
  const names = new Map();
  for (const [name, c] of classes) {
    if (c === cls || !(c.prototype instanceof cls)) continue;
    for (let p = c.prototype; p && p !== cls.prototype; p = Object.getPrototypeOf(p)) {
      for (const n of Object.getOwnPropertyNames(p)) if (!names.has(n)) names.set(n, name);
    }
  }
  return names;
};
const depth = (cls) => {
  let d = 0;
  for (let p = cls; p && p !== Function.prototype; p = Object.getPrototypeOf(p)) d++;
  return d;
};

// candidate attachments: target class name -> method name -> list of candidates
const plan = new Map();
const skipped = [];
for (const e of extensions) {
  const holder = api[e.staticClass];
  if (!holder) {
    skipped.push(`${e.staticClass}.${e.method}: static class not exported`);
    continue;
  }
  const tsName = [camel(e.method), camel(e.method) + '_', e.method].find((n) => typeof holder[n] === 'function');
  if (!tsName) {
    skipped.push(`${e.staticClass}.${e.method}: no static method in the port`);
    continue;
  }
  const fluentName = tsName.endsWith('_') ? tsName.slice(0, -1) : tsName;
  const info = typeMap.get(e.thisType);
  let targets = [];
  let specificity;
  if (info && info.kind === 'class' && typeof T[e.thisType] === 'function') {
    targets = [e.thisType];
    specificity = 1000 + depth(T[e.thisType]);
  } else if (info && info.kind === 'interface') {
    // topmost implementers
    for (const [name, cls] of classes) {
      if (!implementsInterface(cls.prototype, e.thisType)) continue;
      const base = Object.getPrototypeOf(cls);
      if (typeof base === 'function' && base.prototype && implementsInterface(base.prototype, e.thisType)) continue;
      targets.push(name);
    }
    specificity = 1;
  } else {
    continue; // string, XElement, enums, ILookup: no engine class to attach to
  }
  for (const t of targets) {
    if (!plan.has(t)) plan.set(t, new Map());
    const byName = plan.get(t);
    if (!byName.has(fluentName)) byName.set(fluentName, []);
    byName.get(fluentName).push({ ...e, tsName, specificity });
  }
}

const attach = [];
const conflicts = [];
for (const [target, byName] of [...plan].sort((a, b) => a[0].localeCompare(b[0]))) {
  const existing = memberNames(T[target]);
  const derived = descendantMembers(T[target]);
  for (const [name, cands] of [...byName].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (existing.has(name)) {
      conflicts.push(`${target}.${name}: member exists`);
      continue;
    }
    if (derived.has(name)) {
      conflicts.push(`${target}.${name}: derived class ${derived.get(name)} has a member of that name`);
      continue;
    }
    // distinct static implementations only (the same method listed for several overloads)
    const unique = [...new Map(cands.map((c) => [`${c.staticClass}.${c.tsName}`, c])).values()];
    unique.sort((a, b) => b.specificity - a.specificity);
    if (unique.length > 1 && unique[0].specificity === unique[1].specificity) {
      conflicts.push(`${target}.${name}: ambiguous (${unique.map((c) => c.staticClass).join(', ')})`);
      continue;
    }
    attach.push({ target, name, ...unique[0] });
  }
}

// The same name attached with different implementations to a class and one of its ancestors:
// C# tells them apart by the argument types, TypeScript (and JS inheritance) cannot. Skip both.
const clash = new Set();
// Generic classes: an augmentation would have to repeat their type parameters with constraints.
for (const a of attach) {
  const src = readFileSync(typeMap.get(a.target).module, 'utf8');
  if (new RegExp(`class\\s+${a.target}\\s*<`).test(src)) {
    clash.add(a);
    skipped.push(`${a.target}.${a.name}: generic class`);
  }
}
for (const a of attach) {
  for (const b of attach) {
    if (a === b || a.name !== b.name) continue;
    if (`${a.staticClass}.${a.tsName}` === `${b.staticClass}.${b.tsName}`) continue;
    if (T[a.target].prototype instanceof T[b.target]) {
      clash.add(a);
      clash.add(b);
    }
  }
}
for (const c of clash) if (!skipped.some((x) => x.startsWith(`${c.target}.${c.name}: generic`))) conflicts.push(`${c.target}.${c.name}: differs from the method of that name attached to a base or derived class (${c.staticClass})`);
attach.splice(0, attach.length, ...attach.filter((a) => !clash.has(a)));

const rel = (module) => './' + module.replace(/^src\/engine\//, '').replace(/\.ts$/, '.js');
const holders = [...new Set(attach.map((a) => a.staticClass))].sort();
const targets = [...new Set(attach.map((a) => a.target))].sort();
const lines = [
  '// Generated by scripts/gen-fluent.mjs. Do not edit.',
  '// The public C# extension methods of Aml.Engine as instance methods of the engine classes.',
  '/* eslint-disable @typescript-eslint/no-explicit-any */',
  '',
  ...holders.map((h) => `import { ${h} } from '${rel(typeMap.get(h).module)}';`),
  ...targets.map((t) => `import { ${t} } from '${rel(typeMap.get(t).module)}';`),
  '',
  '/** An extension method as instance method: the first parameter becomes `this`. */',
  'type Fluent<F> = F extends (self: any, ...args: infer A) => infer R ? (...args: A) => R : never;',
  '',
  'function attach(cls: { prototype: object }, name: string, fn: (self: any, ...args: any[]) => unknown): void {',
  '  Object.defineProperty(cls.prototype, name, {',
  '    value: function (this: unknown, ...args: unknown[]) {',
  '      return fn(this, ...args);',
  '    },',
  '    writable: true,',
  '    configurable: true,',
  '    enumerable: false,',
  '  });',
  '}',
  '',
  ...attach.map((a) => `attach(${a.target}, '${a.name}', ${a.staticClass}.${a.tsName});`),
  '',
];
for (const t of targets) {
  lines.push(`declare module '${rel(typeMap.get(t).module)}' {`);
  lines.push(`  interface ${t} {`);
  for (const a of attach.filter((x) => x.target === t)) lines.push(`    ${a.name}: Fluent<typeof ${a.staticClass}.${a.tsName}>;`);
  lines.push('  }', '}', '');
}
writeFileSync('src/engine/fluent.ts', lines.join('\n'));
writeFileSync(
  'docs/fluent-api.md',
  [
    '# Extension methods as instance methods',
    '',
    'Generated by `scripts/gen-fluent.mjs`. The C# extension methods of Aml.Engine are available as',
    'instance methods (`doc.findByPath(path)`) in addition to the static form',
    '(`CAEXDocumentExtensions.findByPath(doc, path)`). Both call the same code.',
    '',
    `Attached: ${attach.length}. Not attached: ${conflicts.length + skipped.length} (listed below).`,
    '',
    '## Not attached because a member of that name exists (also in a derived class) or the choice is ambiguous',
    '',
    ...conflicts.map((c) => `- ${c}`),
    '',
    '## Not attached for other reasons',
    '',
    ...skipped.map((s) => `- ${s}`),
    '',
  ].join('\n'),
);
console.log(`attached ${attach.length} methods to ${targets.length} classes; ${conflicts.length} conflicts, ${skipped.length} skipped`);
