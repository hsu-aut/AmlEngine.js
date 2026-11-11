# Following a new Aml.Engine release

AmlEngine.js reproduces one version each of Aml.Engine, Aml.Engine.Services and
Aml.Engine.Resources, the ones in `oracle/Oracle.csproj` (now 4.5.2, 4.3.1 and 4.2.1). The same
procedure applies to each of them. A new release may change behaviour, including fixes of errors the port reproduces
(`docs/port-notes/*.md`, section "Errors of the original, ported unchanged") or corrects
optionally (`docs/fixes.md`). The oracle makes every such change visible; this is the procedure.

## Noticing a release

- `npm run check-upstream` compares the oracle's versions with NuGet and exits with 1 if a newer
  release of one of the three packages exists.
- Every `npm test` does the same check in its setup and prints a warning (without failing, and
  silently when NuGet cannot be reached).

## Updating

1. **Oracle.** Set the new version in `oracle/Oracle.csproj` and build (`dotnet build oracle -c Release`).
   A new Aml.Engine may depend on a new Aml.Engine.Resources (see its nuspec): pin that one too.
2. **Decompile** the new DLL for reading the changes (it is not kept in the repository):
   `ilspycmd -p -o <dir> ~/.nuget/packages/aml.engine/<version>/lib/net8.0/Aml.Engine.dll`
   (`aml.engine.services/<version>/.../Aml.Engine.Services.dll`,
   `aml.engine.resources/<version>/.../Aml.Engine.Resources.dll`). A diff against the decompiled
   previous version shows which types and members changed; `python scripts/gen-registry.py
   <aml-engine-dir> --resources <dir> --services <dir>` updates the type map.
3. **Reference outputs.** `npm run oracle` regenerates all oracle outputs (about 2 hours; the
   `cyclic-*` documents of the read package take the longest). Also regenerate the schema tables
   if the XSDs changed (`oracle schema`, see `src/engine/schema/data`).
4. **Compare.** `npm test`. Every difference is a change of the original. For each:
   - it matches a change in the decompiled code: port it (following `docs/PORTING.md`);
   - it fixes an error listed in `docs/port-notes/*.md` ("Errors of the original, ported
     unchanged"): port the fix and remove the entry;
   - it fixes one of the errors in `docs/fixes.md`: the new behaviour becomes the port's
     default. If the original fixed it the same way, the correction of that name stays as a
     no-op; otherwise adapt the correction or remove it. Update `docs/fixes.md` and
     `test/engine/fixes*.test.ts`;
   - it touches a guard of `src/engine/cycles.ts` (a call that did not return now returns, or
     the other way round): adapt the guard; the read package (`cyclic-*`) and
     `test/engine/noreturn.oracle.test.ts` show both directions.
5. **Documentation.** Update the version in `README.md`, `docs/deviations.md`, the port notes and
   the comments `(Aml.Engine 4.5.2)`, `(Aml.Engine.Services 4.3.1)` or
   `(Aml.Engine.Resources 4.2.1)` at the top of the changed files, and the oracle outputs'
   reference in `docs/coverage.md` if the coverage run is repeated.
6. **Browser.** `npm run test:browser`.

