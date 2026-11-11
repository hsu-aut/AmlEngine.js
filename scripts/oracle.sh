#!/usr/bin/env bash
# Regenerates the reference outputs of the original Aml.Engine / System.Xml.Linq (needs the .NET 8 SDK).
set -euo pipefail
cd "$(dirname "$0")/.."
dotnet build oracle -c Release -nologo -v q >/dev/null
ORACLE="dotnet oracle/bin/Release/net8.0/Oracle.dll"
rm -rf test/oracle-out
# xops, engineops and mutations write into this directory without creating it
mkdir -p test/oracle-out
node scripts/gen-xml-fuzz.mjs test/xml-fuzz 400 >/dev/null
node scripts/gen-xops.mjs test/xml-ops/xops.json 300 40 4242 >/dev/null
$ORACLE xops test/xml-ops/xops.json test/oracle-out/xops.json
$ORACLE schema test/oracle-out/schema
$ORACLE xml test/oracle-out/xml test/xml-corpus/* test/xml-fuzz/* test/corpus/*.aml
node scripts/gen-engine-ops.mjs test/engine-ops/ops.json 150 60 777 >/dev/null
$ORACLE engineops test/engine-ops/ops.json test/corpus test/oracle-out/engineops.json
$ORACLE dump test/oracle-out/dump test/corpus/*.aml >/dev/null
node scripts/gen-sys-cases.mjs test/system/cases.json >/dev/null
$ORACLE sys test/system/cases.json test/oracle-out/sys.json
node scripts/gen-invalid-caex.mjs test/validation/cases 10 3682 >/dev/null
$ORACLE validate test/oracle-out/validate test/corpus/*.aml test/validation/cases
node scripts/gen-values.mjs test/values/cases.json 3682 >/dev/null
$ORACLE values test/values/cases.json test/corpus test/oracle-out/values.json
node scripts/gen-mutations.mjs test/mutations/scripts.json 400 40 3682 >/dev/null
$ORACLE mutations test/mutations/scripts.json test/corpus test/oracle-out/mutations.json
node scripts/gen-amlobjects.mjs test/amlobjects/ops.json >/dev/null
$ORACLE amlobjects test/amlobjects test/corpus test/oracle-out/amlobjects-work test/oracle-out/amlobjects
node scripts/gen-reads.mjs test/reads 6 4711 >/dev/null
$ORACLE reads test/oracle-out/reads test/corpus test/reads
$ORACLE noreturn test/noreturn/cases.json test/oracle-out/noreturn.json
node scripts/gen-fixes.mjs test/fixes >/dev/null
$ORACLE fixes test/fixes test/oracle-out/fixes.json
node scripts/gen-gapsinfra.mjs test/gapsinfra/cases.json 250 3682 >/dev/null
$ORACLE gapsinfra test/gapsinfra/cases.json test/oracle-out/gapsinfra.json
node scripts/gen-gapsservices.mjs test/gapsservices 3682 >/dev/null
$ORACLE gapsservices test/gapsservices test/corpus test/oracle-out/gapsservices
$ORACLE gapscaex test/gapscaex test/oracle-out/gapscaex.json
# Aml.Engine.Services and Aml.Engine.Resources (test/services, docs/coverage-notes/services-*.md).
mkdir -p test/oracle-out/services
node scripts/gen-services-resources.mjs test/services/resources 4210 >/dev/null
$ORACLE resources test/services/resources test/oracle-out/services/resources.json
node scripts/gen-services-undo.mjs test/services/undo/scripts.json 260 28 3682 >/dev/null
$ORACLE svc-undo test/services/undo/scripts.json test/corpus test/oracle-out/services/undo.json
node scripts/gen-services-misc.mjs test/services/misc 3682 >/dev/null
$ORACLE svc-misc test/services/misc test/corpus test/oracle-out/services/misc.json
node scripts/gen-services-transform.mjs test/corpus test/services/transform 3682 >/dev/null
$ORACLE svc-transform test/corpus test/services/transform test/oracle-out/services/transform
node scripts/gen-services-split.mjs test/services/split 3682 >/dev/null
$ORACLE svc-split test/services/split test/oracle-out/services/split-work test/oracle-out/services/split
node scripts/gen-services-validator.mjs test/services/validator 3682 >/dev/null
$ORACLE svc-validator test/services/validator test/oracle-out/services
# The external reference cases load over http from a local server (test/services/extref-server.mjs).
node scripts/gen-services-extref.mjs test/services/extref 3682 >/dev/null
node test/services/extref-server.mjs test/services/extref >/dev/null &
$ORACLE svc-extref test/services/extref test/oracle-out/services http://127.0.0.1:48217
node -e "fetch('http://127.0.0.1:48217/__stop').catch(() => {})"
# Large documents (10 and 50 MB, 10 MB with schema errors). The full read model walk only for
# 10 MB: it grows with the square of the size (FindByID without ID table), 50 MB takes hours.
node scripts/gen-large.mjs test/large 10,50,10i 3682 >/dev/null
$ORACLE save test/oracle-out/large test/large
$ORACLE dump test/oracle-out/large test/large/large-10mb.aml >/dev/null
$ORACLE validate test/oracle-out/large-validate test/large
