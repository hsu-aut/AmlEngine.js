#!/usr/bin/env bash
# Regenerates the reference outputs of the original Aml.Engine / System.Xml.Linq (needs the .NET 8 SDK).
set -euo pipefail
cd "$(dirname "$0")/.."
dotnet build oracle -c Release -nologo -v q >/dev/null
ORACLE="dotnet oracle/bin/Release/net8.0/Oracle.dll"
rm -rf test/oracle-out
node scripts/gen-xml-fuzz.mjs test/xml-fuzz 400 >/dev/null
$ORACLE xml test/oracle-out/xml test/xml-corpus/* test/xml-fuzz/* test/corpus/*.aml
$ORACLE dump test/oracle-out/dump test/corpus/*.aml >/dev/null
