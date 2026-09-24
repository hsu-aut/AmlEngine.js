// .NET events (event EventHandler<T>): a multicast delegate with += / -= semantics.
//  - handlers run synchronously in subscription order;
//  - a handler subscribed twice runs twice;
//  - unsubscribe removes the LAST registration of that handler (Delegate.Remove), and nothing if
//    it is not subscribed;
//  - raise works on a snapshot of the invocation list (delegates are immutable in .NET), so
//    subscribing or unsubscribing inside a handler affects the next raise only;
//  - an exception thrown by a handler propagates and the remaining handlers do not run.

export type EventHandler<T> = (sender: unknown, args: T) => void;

export class EventSource<T> {
  private _handlers: readonly EventHandler<T>[] = [];

  /** event += handler */
  subscribe(handler: EventHandler<T> | null | undefined): void {
    if (!handler) return;
    this._handlers = [...this._handlers, handler];
  }

  /** event -= handler */
  unsubscribe(handler: EventHandler<T> | null | undefined): void {
    if (!handler) return;
    const i = this._handlers.lastIndexOf(handler);
    if (i < 0) return;
    this._handlers = [...this._handlers.slice(0, i), ...this._handlers.slice(i + 1)];
  }

  /** event?.Invoke(sender, args) */
  raise(sender: unknown, args: T): void {
    const list = this._handlers;
    for (const h of list) h(sender, args);
  }

  /** true when no handler is subscribed (event == null) */
  get isEmpty(): boolean {
    return this._handlers.length === 0;
  }

  /** number of registrations (GetInvocationList().Length) */
  get count(): number {
    return this._handlers.length;
  }

  /** removes every handler (event = null) */
  clear(): void {
    this._handlers = [];
  }
}

/** System.EventArgs */
export class EventArgs {
  static readonly empty = new EventArgs();
}

/** System.ComponentModel.PropertyChangedEventArgs */
export class PropertyChangedEventArgs extends EventArgs {
  constructor(readonly propertyName: string | null) {
    super();
  }
}
