using Aml.Engine.Services;

namespace Oracle;

/// <summary>
/// Registers services of Aml.Engine.Services for the whole oracle run (ORACLE_SERVICES, a comma
/// list of lookup, uniquename, undo, extref), so that every oracle package can be compared with
/// the port running with the same services (scripts/services-check.mjs, test/setup/services.ts).
/// </summary>
public static class OracleServices
{
    public static void ApplyFromEnvironment()
    {
        var names = Environment.GetEnvironmentVariable("ORACLE_SERVICES");
        if (string.IsNullOrWhiteSpace(names)) return;
        foreach (var name in names.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            switch (name)
            {
                case "lookup": LookupService.Register(); break;
                case "uniquename": UniqueNameService.Register(); break;
                case "undo": UndoRedoService.Register(); break;
                case "extref": ExternalReferenceResolver.Register(); break;
                default: throw new ArgumentException("unknown service in ORACLE_SERVICES: " + name);
            }
        }
    }
}
