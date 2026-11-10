// System.Threading.SemaphoreSlim as Aml.Engine.Services uses it: `new SemaphoreSlim(1, 1)` with
// WaitAsync, Release and CurrentCount (helper, no C# counterpart of its own).
//
// JavaScript runs one piece of code at a time but interleaves asynchronous methods at every
// `await`, so a lock is needed exactly where the C# code has one. waitAsync takes the lock at once
// when it is free (the count drops before the returned promise settles, as SemaphoreSlim does for
// an uncontended WaitAsync); otherwise the caller is queued. Waiters are served first in, first
// out. release hands the lock directly to the first waiter (the count stays 0 until that waiter
// releases it), as SemaphoreSlim.Release does for asynchronous waiters; the waiter continues in a
// later microtask.

import { SystemException } from './exceptions.js';

/** System.Threading.SemaphoreFullException. */
export class SemaphoreFullException extends SystemException {
  override name = 'SemaphoreFullException';

  constructor(message = 'Adding the specified count to the semaphore would cause it to exceed its maximum count.') {
    super(message);
  }
}

/** An asynchronous semaphore with FIFO waiters (SemaphoreSlim). */
export class AsyncLock {
  private _currentCount: number;

  private readonly _maxCount: number;

  private readonly _waiters: (() => void)[] = [];

  /** `new SemaphoreSlim(initialCount, maxCount)`; the default is a lock (1, 1). */
  constructor(initialCount = 1, maxCount = 1) {
    this._currentCount = initialCount;
    this._maxCount = maxCount;
  }

  /** SemaphoreSlim.CurrentCount: the number of callers that can still enter without waiting. */
  get currentCount(): number {
    return this._currentCount;
  }

  /** SemaphoreSlim.WaitAsync(): enters at once when the count is positive, otherwise queues the caller. */
  waitAsync(): Promise<void> {
    if (this._currentCount > 0) {
      this._currentCount--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this._waiters.push(resolve);
    });
  }

  /**
   * SemaphoreSlim.Wait(0): enters when the count is positive and returns true, otherwise returns
   * false without waiting (a synchronous caller cannot wait in JavaScript).
   */
  tryWait(): boolean {
    if (this._currentCount > 0) {
      this._currentCount--;
      return true;
    }
    return false;
  }

  /**
   * SemaphoreSlim.Release(): returns the previous count. With queued waiters the first one enters
   * and the count stays the same; above the maximum count it throws SemaphoreFullException.
   */
  release(): number {
    const previous = this._currentCount;
    if (this._maxCount - previous < 1) {
      throw new SemaphoreFullException();
    }
    const waiter = this._waiters.shift();
    if (waiter !== undefined) {
      waiter();
    } else {
      this._currentCount = previous + 1;
    }
    return previous;
  }
}
