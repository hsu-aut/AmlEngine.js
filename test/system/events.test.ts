// EventSource: .NET multicast delegate semantics (no oracle needed: the rules are those of
// Delegate.Combine / Delegate.Remove and are listed in src/system/events.ts).
import { describe, expect, it } from 'vitest';
import { EventSource } from '../../src/system/events.js';

describe('EventSource', () => {
  it('raises synchronously in subscription order with sender and args', () => {
    const e = new EventSource<number>();
    const log: string[] = [];
    e.subscribe((s, a) => log.push(`a:${String(s)}:${a}`));
    e.subscribe((s, a) => log.push(`b:${String(s)}:${a}`));
    e.raise('src', 1);
    expect(log).toEqual(['a:src:1', 'b:src:1']);
  });

  it('calls a handler subscribed twice twice; unsubscribe removes the last registration', () => {
    const e = new EventSource<void>();
    const log: string[] = [];
    const h = () => log.push('h');
    const g = () => log.push('g');
    e.subscribe(h);
    e.subscribe(g);
    e.subscribe(h);
    e.raise(null, undefined);
    expect(log.join('')).toBe('hgh');
    log.length = 0;
    e.unsubscribe(h);
    e.raise(null, undefined);
    expect(log.join('')).toBe('hg');
    e.unsubscribe(h);
    e.unsubscribe(h);
    log.length = 0;
    e.raise(null, undefined);
    expect(log.join('')).toBe('g');
    expect(e.count).toBe(1);
  });

  it('works on a snapshot while raising', () => {
    const e = new EventSource<void>();
    const log: string[] = [];
    const late = () => log.push('late');
    const first = () => {
      log.push('first');
      e.subscribe(late);
      e.unsubscribe(second);
    };
    const second = () => log.push('second');
    e.subscribe(first);
    e.subscribe(second);
    e.raise(null, undefined);
    expect(log).toEqual(['first', 'second']);
    log.length = 0;
    e.raise(null, undefined);
    expect(log).toEqual(['first', 'late']);
  });

  it('stops at an exception', () => {
    const e = new EventSource<void>();
    const log: string[] = [];
    e.subscribe(() => {
      throw new Error('x');
    });
    e.subscribe(() => log.push('never'));
    expect(() => e.raise(null, undefined)).toThrow('x');
    expect(log).toEqual([]);
  });

  it('ignores null handlers and unknown handlers', () => {
    const e = new EventSource<void>();
    e.subscribe(null);
    e.unsubscribe(() => {});
    expect(e.isEmpty).toBe(true);
  });
});
