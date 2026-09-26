using System.Reflection;

namespace Oracle;

/// <summary>
/// ORACLE_TZ (an IANA or Windows zone ID): makes that zone the local time zone of this process, so
/// the oracle can run in another time zone without changing the one of the machine
/// (scripts/tz-check.mjs). Replaces TimeZoneInfo.Local and the one-year cache that DateTime.Now uses
/// on Windows (it reads the zone of the OS otherwise). Relies on private fields of .NET 8.
/// </summary>
public static class LocalTimeZone
{
    public static void ApplyFromEnvironment()
    {
        var id = Environment.GetEnvironmentVariable("ORACLE_TZ");
        if (string.IsNullOrEmpty(id)) return;
        var found = TimeZoneInfo.FindSystemTimeZoneById(id);
        // A zone object of its own, as on a machine set to this zone: FindSystemTimeZoneById("UTC")
        // returns the TimeZoneInfo.Utc instance itself, and .NET treats Local == Utc specially
        // (ToUniversalTime of a local time would keep DateTimeKind.Local).
        var zone = TimeZoneInfo.CreateCustomTimeZone(found.Id, found.BaseUtcOffset, found.DisplayName, found.StandardName, found.DaylightName,
            found.GetAdjustmentRules(), !found.SupportsDaylightSavingTime);
        const BindingFlags Private = BindingFlags.NonPublic | BindingFlags.Instance;
        var cachedData = typeof(TimeZoneInfo).GetField("s_cachedData", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)!;
        cachedData.GetType().GetField("_localTimeZone", Private)!.SetValue(cachedData, zone);

        int year = DateTime.UtcNow.Year;
        var rule = zone.GetAdjustmentRules().FirstOrDefault(r => r.DateStart.Year <= year && r.DateEnd.Year >= year);
        var offsetAndRule = typeof(TimeZoneInfo).GetNestedType("OffsetAndRule", BindingFlags.NonPublic)!;
        var value = Activator.CreateInstance(offsetAndRule, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance, null,
            new object?[] { year, zone.BaseUtcOffset, rule }, null);
        cachedData.GetType().GetField("_oneYearLocalFromUtc", Private)!.SetValue(cachedData, value);

        if (TimeZoneInfo.Local != zone) throw new InvalidOperationException("ORACLE_TZ was not applied");
        var probe = new DateTime(year, 7, 1, 12, 0, 0, DateTimeKind.Utc);
        if (probe.ToLocalTime() != TimeZoneInfo.ConvertTimeFromUtc(probe, zone)) throw new InvalidOperationException("ORACLE_TZ: ToLocalTime differs");
        var now = DateTime.UtcNow;
        var local = DateTime.Now;
        var expected = TimeZoneInfo.ConvertTimeFromUtc(now, zone);
        if (Math.Abs((local - expected).TotalSeconds) > 5) throw new InvalidOperationException("ORACLE_TZ: DateTime.Now differs");
    }
}
