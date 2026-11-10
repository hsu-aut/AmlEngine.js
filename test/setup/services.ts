// With AMLENGINE_SERVICES set (a comma list of lookup, uniquename, undo, extref), the services of
// the port of Aml.Engine.Services are registered for all tests, as ORACLE_SERVICES does for the
// oracle (oracle/OracleServices.cs). scripts/services-check.mjs runs both with the same list:
//   AMLENGINE_SERVICES=lookup,undo ORACLE_OUT=<dir> npx vitest run
// Without the variable nothing is loaded.

export {};

const names = process.env.AMLENGINE_SERVICES;
if (names) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const services: any = await import('../../src/services/index.js');
  const register: Record<string, () => unknown> = {
    lookup: () => services.LookupService.register(),
    uniquename: () => services.UniqueNameService.register(),
    undo: () => services.UndoRedoService.register(),
    extref: () => services.ExternalReferenceResolver.register(),
  };
  for (const name of names.split(',').map((n) => n.trim()).filter((n) => n !== '')) {
    const r = register[name];
    if (r === undefined) throw new Error('unknown service in AMLENGINE_SERVICES: ' + name);
    r();
  }
}
