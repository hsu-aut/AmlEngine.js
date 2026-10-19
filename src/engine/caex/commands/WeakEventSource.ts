// Port of Aml.Engine.CAEX.Commands.WeakEventSource<TEventArgs>.
//
// JavaScript has no weak delegates (a bound handler keeps its target alive, and a WeakRef to a
// closure would let it be collected while still subscribed). Handlers are therefore held
// strongly; a subscribed handler is never dropped automatically. See docs/port-notes/document.md.

import { T } from '../../registry.js';

/** `EventHandler<TEventArgs>`: (sender, e). */
export type EventHandler<TEventArgs> = (sender: unknown, e: TEventArgs) => void;

/** Subscription side of an event (C# `event` add/remove accessors). */
export interface IEvent<TEventArgs> {
  subscribe(handler: EventHandler<TEventArgs>): void;
  unsubscribe(handler: EventHandler<TEventArgs>): void;
}

/** A subscribed handler (private nested class WeakDelegate in C#). */
export class WeakEventSource_WeakDelegate<TEventArgs> {
  /** The handler itself (C# keeps the MethodInfo and a weak reference to the target). */
  private readonly _method: EventHandler<TEventArgs>;

  /** C# `WeakReference` to the target; always null here since the handler is held strongly. */
  private readonly _weakTarget: null = null;

  constructor(handler: EventHandler<TEventArgs>) {
    this._method = handler;
  }

  /** Invokes the handler; returns false, if the target is no longer alive (never, in JS). */
  invoke(sender: unknown, e: TEventArgs): boolean {
    this._method(sender, e);
    return true;
  }

  /** Determines if this delegate wraps the provided handler. */
  isMatch(handler: EventHandler<TEventArgs>): boolean {
    return this._weakTarget === null && handler === this._method;
  }
}

/** Event source whose subscriptions do not keep the subscriber alive (in .NET). */
export class WeakEventSource<TEventArgs> {
  static readonly WeakDelegate = WeakEventSource_WeakDelegate;

  private readonly _handlers: WeakEventSource_WeakDelegate<TEventArgs>[];

  constructor() {
    this._handlers = [];
  }

  /** Raises the event for all live subscribers and drops dead ones. */
  raise(sender: unknown, e: TEventArgs): void {
    for (const h of this._handlers.slice()) {
      if (!h.invoke(sender, e)) {
        const i = this._handlers.indexOf(h);
        if (i >= 0) this._handlers.splice(i, 1);
      }
    }
  }

  /** Subscribes the handler. */
  subscribe(handler: EventHandler<TEventArgs>): void {
    // handler.GetInvocationList(): a JS function is a single delegate.
    const collection = [new T.WeakEventSource_WeakDelegate<TEventArgs>(handler)];
    this._handlers.push(...collection);
  }

  /** Unsubscribes the first subscription of the handler. */
  unsubscribe(handler: EventHandler<TEventArgs>): void {
    const num = this._handlers.findIndex((h) => h.isMatch(handler));
    if (num >= 0) this._handlers.splice(num, 1);
  }
}

T.WeakEventSource = WeakEventSource;
T.WeakEventSource_WeakDelegate = WeakEventSource_WeakDelegate;
