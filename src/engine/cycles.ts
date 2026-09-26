// Not part of Aml.Engine: guards for the places where the original never returns.
//
// Aml.Engine follows base class and mirror references without checking for cycles. On a document
// with cyclic references some members loop forever and others recurse until the stack overflows,
// which ends a .NET process. The port detects the repetition and throws CyclicReferenceException
// instead (docs/deviations.md, "Cyclic references").
//
// A guard only fires where the original provably does not return: a loop whose complete state
// repeats, or a recursive member that is entered again with the same arguments while the first
// call is still running. Nothing else changes, so every document without such a cycle gives the
// same results as before.

import { InvalidOperationException } from '../system/exceptions.js';
import type { XElement } from '../xml/index.js';

/** Thrown where Aml.Engine would loop forever or overflow the stack on cyclic references. */
export class CyclicReferenceException extends InvalidOperationException {
  override name = 'CyclicReferenceException';

  constructor(
    message: string,
    /** The element at which the cycle was detected (a class, an attribute, ...). */
    readonly element: XElement | null = null,
  ) {
    super(message);
  }
}

function describe(element: XElement | null): string {
  if (element === null) return 'an element without node';
  const name = element.attribute('Name')?.value ?? element.attribute('ID')?.value ?? '';
  return `${element.name.localName} '${name}'`;
}

/**
 * The states a loop has passed. `visit` throws when a state comes up a second time: the loop
 * depends on nothing but that state, so the original would run through the same states forever.
 */
export class LoopGuard {
  private readonly seen = new Set<unknown>();

  /** `what`: the references followed, as the subject of the message ("The base class references"). */
  constructor(private readonly what: string) {}

  visit(state: unknown, element: XElement | null): void {
    if (this.seen.has(state)) {
      throw new CyclicReferenceException(`${this.what} form a cycle at ${describe(element)}; Aml.Engine does not return here.`, element);
    }
    this.seen.add(state);
  }
}

const ids = new WeakMap<object, number>();
let nextId = 0;

function keyPart(x: unknown): string {
  if ((typeof x === 'object' && x !== null) || typeof x === 'function') {
    let id = ids.get(x as object);
    if (id === undefined) {
      id = ++nextId;
      ids.set(x as object, id);
    }
    return '#' + id;
  }
  return typeof x + ':' + String(x);
}

/**
 * The calls in progress of one recursive member. `run` throws when the member is entered again
 * with the same arguments before the first call has returned: the original would recurse until
 * the stack overflows.
 */
export class RecursionGuard {
  private readonly active = new Set<string>();

  /** `what`: the references followed, as the subject of the message ("The base class references"). */
  constructor(private readonly what: string) {}

  /** Runs `f` for the arguments `args` (compared by identity for objects, by value otherwise). */
  run<R>(args: readonly unknown[], element: XElement | null, f: () => R): R {
    const key = args.map(keyPart).join(' ');
    if (this.active.has(key)) {
      throw new CyclicReferenceException(`${this.what} form a cycle at ${describe(element)}; Aml.Engine overflows the stack here.`, element);
    }
    this.active.add(key);
    try {
      return f();
    } finally {
      this.active.delete(key);
    }
  }
}
