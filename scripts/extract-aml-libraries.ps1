# Extracts the embedded AutomationML standard libraries of the NuGet package Aml.Engine.Resources
# byte for byte (Assembly.GetManifestResourceNames / GetManifestResourceStream) into
# scripts/aml-libraries. Afterwards run `node scripts/gen-aml-libraries.mjs` to regenerate the TS
# modules under src/engine/resources/libraries/data.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/extract-aml-libraries.ps1 [path to Aml.Engine.Resources.dll]
# Default: the net481 build of Aml.Engine.Resources 4.2.1 (the version Aml.Engine 4.5.2 references)
# from the local NuGet cache; the embedded resources are identical in all target frameworks.
param(
  [string]$Dll = (Join-Path $env:USERPROFILE '.nuget\packages\aml.engine.resources\4.2.1\lib\net481\Aml.Engine.Resources.dll')
)
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'aml-libraries'
New-Item -ItemType Directory -Force $out | Out-Null
$asm = [System.Reflection.Assembly]::LoadFile((Resolve-Path $Dll).Path)
foreach ($name in $asm.GetManifestResourceNames()) {
  $stream = $asm.GetManifestResourceStream($name)
  $ms = New-Object System.IO.MemoryStream
  $stream.CopyTo($ms)
  $stream.Dispose()
  [System.IO.File]::WriteAllBytes((Join-Path $out $name), $ms.ToArray())
  Write-Output ("{0}  {1} bytes" -f $name, $ms.Length)
}
