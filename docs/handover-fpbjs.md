# Übergabe an FPB.js: FpbMapper auf AmlEngine.js portieren

Ziel: FPB.js wandelt FPB-JSON und AML selbst um, im Browser, ohne das Azure-Backend. Heute ruft
FPB.js dafür `/api/to-aml` (FPB-JSON nach AML) und `/api/to-json` (AML nach FPB-JSON) auf. Dahinter
steht der C#-FpbMapper (`AML/fpb-aml-mapper/dotnet/FpbMapper.Conversion`, gut 4.500 Zeilen) mit
Aml.Engine. Der Mapper wird nach TypeScript portiert und nutzt statt Aml.Engine die JS-Engine
AmlEngine.js (`AML/AmlEngine.js`).

## Was AmlEngine.js ist

- Ein TypeScript-Port von Aml.Engine 4.5.2 mit demselben Verhalten, geprüft durch differenzielle
  Tests gegen das Original: gut 5.300 Tests und rund 6 Millionen aufgezeichnete Leseaufrufe.
  In Edge, Chromium, Firefox und WebKit liefert die Engine dieselben Ergebnisse wie in Node.
  Stand: Version 0.2.0, Tag `v0.2.0` (Änderungen seit 0.1.0 in `CHANGELOG.md`).
- Der Mapper nutzt nur einen kleinen, gut abgedeckten Teil der Engine:
  - Dokument anlegen und Bibliotheken anhängen;
  - Klassen, InternalElements, Attribute, IDs;
  - Referenzen als Text, SupportedRoleClass;
  - InternalLinks und ExternalReferences;
  - `CreateClassInstance`, `Remove`;
  - Speichern und Laden.
- Doku im Repository: `README.md` (Einstieg und Beispiel), `docs/PORTING.md` (Namensregeln),
  `docs/fluent-api.md` (Erweiterungsmethoden als Instanzmethoden), `docs/deviations.md`
  (bekannte Abweichungen), `docs/fixes.md` (optionale Korrekturen), `CHANGELOG.md`.

## Einbinden ohne npm-Veröffentlichung

1. Tarball: `AML/AmlEngine.js/amlengine-js-0.2.0.tgz` (nicht im Git). Neu erzeugen im Ordner
   `AML/AmlEngine.js` mit `npm run build && npm pack`.
2. In FPB.js nach `vendor/amlengine-js-0.2.0.tgz` kopieren und als devDependency eintragen:
   `"amlengine-js": "file:vendor/amlengine-js-0.2.0.tgz"`. So funktioniert es lokal und in der
   GitHub-CI gleich; ein Pfad auf `../AML/AmlEngine.js` würde in der CI scheitern.
3. FPB.js bündelt alles außer React in `dist/` (siehe `externals` in `webpack.lib.config.js`).
   Die Engine landet also im fpbjs-Paket; wer fpbjs installiert, braucht `amlengine-js` nicht.
4. Nachladen: `const { CAEXDocument } = await import('amlengine-js')` erst beim Export oder
   Import. Geprüft mit dem webpack aus FPB.js: Die Engine wird ein eigener Chunk (rund 960 KB
   minifiziert, rund 216 KB mit gzip), das Hauptbundle bleibt klein. Achtung: Ein Library-Build
   von FPB.js begrenzt die Chunks auf einen (`LimitChunkCountPlugin`, `maxChunks: 1`). Dort wird
   die Engine trotz `import()` mit eingebaut.
5. Lizenzen: Die MIT-Hinweise für Aml.Engine (AutomationML e.V.) und fflate stehen in `NOTICE`
   des Tarballs und müssen mit ins fpbjs-Paket.
6. Engine-Update: neuen Tarball erzeugen, in `vendor/` ersetzen, `CHANGELOG.md` der Engine lesen.

## Vom C#-Code zur Engine-API

Die Namen folgen C# in camelCase (`docs/PORTING.md`):

| C# (Mapper) | AmlEngine.js |
|---|---|
| `CAEXDocument.New_CAEXDocument()` | `CAEXDocument.new_CAEXDocument()` |
| `CAEXDocument.LoadFromString(aml)` | `CAEXDocument.loadFromString(aml)` (liefert `null`, wenn der Text kein XML ist) |
| `doc.CAEXFile.SystemUnitClassLib.Append("X")` | `doc.caexFile.systemUnitClassLib.append('X')` |
| `ie.Attribute["x"]` (Indexer) | `ie.attribute.item('x')` |
| `ie.ID`, `.RefBaseSystemUnitPath`, `.RefBaseClassPath` | `ie.id`, `.refBaseSystemUnitPath`, `.refBaseClassPath` |
| `suc.CreateClassInstance()` | `suc.createClassInstance()` |
| Erweiterungsmethode `doc.FindByPath(p)` | `doc.findByPath(p)` oder `CAEXDocumentExtensions.findByPath(doc, p)` |
| `out`-Parameter | Rückgabe als Objekt `{ result, <name> }` |
| `a.AttributeValue = 1.5` | Zahlen ohne Nachkommastellen gelten als `int`, sonst `double`; andere Typen explizit: `ClrValue.double(1500)` |
| `doc.SaveToFile(path, true)` (Azure) | im Browser `doc.saveToStream(true)` (liefert `Uint8Array` mit BOM; `new TextDecoder().decode(bytes)` entfernt den BOM) |

Methoden mit Dateisystem gibt es nur in Node; im Browser werfen sie `NotSupportedException`.
`Guid` und weitere .NET-Typen der System-Schicht sind exportiert (`import { Guid } from
'amlengine-js'`, alles weitere unter `system`).

## Stolperstellen beim Nachbau

- **Deterministische IDs** (`DeriveSubProcessId`, `DeriveBoundaryStateId`): SHA-1 über UTF-8,
  die ersten 16 Bytes, Versions- und Variantenbits gesetzt, dann `new Guid(bytes).ToString("B")`.
  Zwei Fallen:
  - **Byte-Reihenfolge:** `new Guid(byte[])` liest die ersten drei Felder als Little Endian. Die
    fünf Gruppen des Textes entstehen also aus den Bytes 3 2 1 0, dann 5 4, dann 7 6, dann 8 9,
    dann 10 bis 15 (jeweils in Hex), nicht aus der Reihenfolge der Bytes. Die Engine hat dafür
    keinen fertigen Helfer; ein kleiner eigener reicht, geprüft gegen die C#-Ausgabe.
  - **SHA-1 im Browser:** `crypto.subtle` gibt es nur asynchron. Also entweder den Mapper
    asynchron machen oder eine kleine synchrone SHA-1-Implementierung verwenden.
- **Zufällige IDs**: `Guid.NewGuid().ToString("B")` entspricht `'{' + crypto.randomUUID() + '}'`
  (oder `Guid.newGuid().toString('B')` aus der Engine).
- **Azure-Eigenheit beim Dateinamen**: `/api/to-aml` speichert über `SaveToFile` in eine
  Temp-Datei. Das schreibt deren Namen in das Attribut `FileName`, die heutigen Azure-Dateien
  haben also etwas wie `tmp1A2B.tmp` im Kopf. Beim Nachbau festlegen, was dort stehen soll (etwa
  der Download-Name), und beim Vergleich mit Azure ausnehmen.
- **Zeitstempel**: `SourceDocumentInformation LastWritingDateTime` ist „jetzt“; in JS nur auf
  Millisekunden genau (`docs/deviations.md`). Beim Vergleich maskieren.
- **JSON (`/api/to-json`)**: Der C#-Mapper serialisiert mit `System.Text.Json` (eingerückt,
  camelCase). Das maskiert Nicht-ASCII- und einige HTML-Zeichen als `\uXXXX`, `JSON.stringify`
  nicht. Den Inhalt vergleichen (geparst), nicht die Bytes.
- **Versionsstand**: Der C#-Mapper bindet `Aml.Engine 4.*` (gleitend), die JS-Engine bildet 4.5.2
  nach. Solange NuGet keine neuere Version hat (`npm run check-upstream` in AmlEngine.js), ist
  das derselbe Stand.
- **Zyklische Dokumente**: Wo Aml.Engine nie zurückkehrt, wirft die Engine
  `CyclicReferenceException`. Beim Import fremder AML abfangen und melden.
- **Korrekturen**: Die optionalen Korrekturen von Datenfehlern des Originals (`docs/fixes.md`)
  sind aus. Für den Vergleich mit dem C#-Mapper aus lassen; ob FPB.js sie danach einschaltet,
  ist eine eigene Entscheidung.

## Nachweis für den Mapper-Port

Dasselbe Prinzip wie bei der Engine: Das Original ist das Orakel.

1. Eingaben sammeln:
   - die Testdaten des C#-Mappers (`FpbMapper.Tests/TestData`, `Showcases`, Golden-Tests);
   - `fpb-aml-mapper/examples`;
   - die Beispielmodelle von FPB.js.
2. Eine kleine C#-Konsole (oder die vorhandenen Tests) lässt den C#-Mapper über alle Eingaben
   laufen und schreibt die Ergebnisse: AML aus `FpbJsonToCaex.Convert`, JSON aus
   `CaexToFpbJson.Convert`, dazu die Warnungen.
3. Ein Vitest in FPB.js lässt den TypeScript-Mapper über dieselben Eingaben laufen und vergleicht:
   - **AML:** byteweise nach dem Speichern, mit maskierten Zufalls-IDs (in Reihenfolge des
     Auftretens nummeriert), Zeitstempeln und `FileName`;
   - **JSON:** inhaltlich, geparst.
4. Erst bei vollständiger Gleichheit auf den lokalen Weg umstellen; bis dahin kann ein Schalter
   zwischen lokal und Azure wählen.
