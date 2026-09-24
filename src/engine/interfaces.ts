// Run time support for C# interface checks (`x is IObjectWithAttributes`), which TypeScript
// interfaces cannot provide. Each class registers the interfaces it implements in C#; the
// registration is inherited along the prototype chain, like interface implementation in C#.
// Interface inheritance (`interface ICAEXObject : ICAEXBasicObject`) is registered by the
// interface modules and resolved when checking, so module load order does not matter.
// Generic interfaces use their export name from docs/type-map.tsv (`IMirror_1` for IMirror<T>).

const INTERFACES = Symbol('csInterfaces');

type Ctor = abstract new (...args: never[]) => unknown;

interface WithInterfaces {
  [INTERFACES]?: Set<string>;
}

/** Declares that instances of `cls` implement the named C# interfaces. */
export function registerInterfaces(cls: Ctor, ...names: string[]): void {
  const proto = cls.prototype as WithInterfaces;
  const own = Object.prototype.hasOwnProperty.call(proto, INTERFACES) ? proto[INTERFACES]! : new Set(proto[INTERFACES] ?? []);
  for (const n of names) own.add(n);
  Object.defineProperty(proto, INTERFACES, { value: own, enumerable: false, configurable: true, writable: true });
}

const bases = new Map<string, string[]>();

/** Declares the base interfaces of an interface. */
export function registerInterfaceBases(name: string, ...baseNames: string[]): void {
  bases.set(name, baseNames);
}

/** `x is IName` in C#. */
export function implementsInterface(x: unknown, name: string): boolean {
  if (x === null || x === undefined || typeof x !== 'object') return false;
  const set = (x as WithInterfaces)[INTERFACES];
  if (set === undefined) return false;
  if (set.has(name)) return true;
  for (const n of set) if (derives(n, name, new Set())) return true;
  return false;
}

function derives(from: string, target: string, seen: Set<string>): boolean {
  if (seen.has(from)) return false;
  seen.add(from);
  for (const b of bases.get(from) ?? []) if (b === target || derives(b, target, seen)) return true;
  return false;
}
