#!/usr/bin/env bash
# Regenerates the reference outputs of the original Aml.Engine / System.Xml.Linq (needs the .NET 8 SDK).
set -euo pipefail
cd "$(dirname "$0")/.."
dotnet build oracle -c Release -nologo -v q >/dev/null
ORACLE="dotnet oracle/bin/Release/net8.0/Oracle.dll"
rm -rf test/oracle-out
node scripts/gen-xml-fuzz.mjs test/xml-fuzz 400 >/dev/null
node scripts/gen-xops.mjs test/xml-ops/xops.json 300 40 4242 >/dev/null
$ORACLE xops test/xml-ops/xops.json test/oracle-out/xops.json
$ORACLE schema test/oracle-out/schema
$ORACLE xml test/oracle-out/xml test/xml-corpus/* test/xml-fuzz/* test/corpus/*.aml
node scripts/gen-engine-ops.mjs test/engine-ops/ops.json 150 60 777 >/dev/null
$ORACLE engineops test/engine-ops/ops.json test/corpus test/oracle-out/engineops.json
$ORACLE dump test/oracle-out/dump test/corpus/*.aml >/dev/null
