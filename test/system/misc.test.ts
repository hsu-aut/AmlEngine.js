// System layer pieces that the oracle cannot check directly (random values, the duck-typed hook
// used by src/xml). Their building blocks are oracle-verified in sys.oracle.test.ts.
import { describe, expect, it } from 'vitest';
import { DateTime, DateTimeKind, Decimal, Guid, TimeSpan, Uri, UriKind, XmlConvert, XmlDateTimeSerializationMode } from '../../src/system/index.js';
import { getStringValue } from '../../src/xml/XNode.js';

describe('Guid.newGuid', () => {
  it('produces distinct version 4 GUIDs in "D" form', () => {
    const a = Guid.newGuid().toString('D');
    const b = Guid.newGuid().toString();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
    expect(Guid.parse(a).toString()).toBe(a);
  });
});

describe('toXmlString (XContainer.GetStringValue of System values)', () => {
  it('DateTime: XmlConvert.ToString(value, RoundtripKind)', () => {
    for (const kind of [DateTimeKind.Unspecified, DateTimeKind.Utc, DateTimeKind.Local]) {
      const d = new DateTime(2026, 9, 25, 12, 30, 5, 250, kind);
      expect(getStringValue(d)).toBe(XmlConvert.toString(d, XmlDateTimeSerializationMode.RoundtripKind));
    }
    expect(getStringValue(new DateTime(2026, 1, 2, 3, 4, 5, 0, DateTimeKind.Utc))).toBe('2026-01-02T03:04:05Z');
  });

  it('TimeSpan, Decimal, Guid, Uri', () => {
    expect(getStringValue(new TimeSpan(1, 30, 0))).toBe('PT1H30M');
    expect(getStringValue(TimeSpan.fromDays(-1.5))).toBe('-P1DT12H');
    expect(getStringValue(Decimal.parse('1.50'))).toBe('1.50');
    const g = Guid.parse('CA761232-ED42-11CE-BACD-00AA0057B223');
    expect(getStringValue(g)).toBe('ca761232-ed42-11ce-bacd-00aa0057b223');
    expect(getStringValue(Uri.tryCreate('HTTP://Example.com/a%20b', UriKind.RelativeOrAbsolute)!)).toBe(
      Uri.tryCreate('HTTP://Example.com/a%20b', UriKind.RelativeOrAbsolute)!.toString(),
    );
  });
});

describe('DateTime.now', () => {
  it('is local, close to utcNow', () => {
    const now = DateTime.now;
    const utc = DateTime.utcNow;
    expect(now.kind).toBe(DateTimeKind.Local);
    expect(utc.kind).toBe(DateTimeKind.Utc);
    const diff = now.toUniversalTime().ticks - utc.ticks;
    expect(diff < 0n ? -diff : diff).toBeLessThan(10_000_000n);
    expect(DateTime.today.equals(now.date)).toBe(true);
  });
});
