"""Generates src/engine/registry.ts and docs/type-map.tsv from the decompiled Aml.Engine source.

Every C# type gets a fixed TS module path and export name, so ported files can reference each
other before all of them exist. Classes are reachable at run time through the registry `T`
(see docs/PORTING.md, "Module cycles"). The decompiled sources of Aml.Engine.Resources and
Aml.Engine.Services add their types; the Resources classes join the registry, the Services
classes do not (they live in src/services and import each other directly).

    python scripts/gen-registry.py <aml-engine-dir> [--resources <dir>] [--services <dir>]
"""
import os
import re
import sys

args = sys.argv[1:]
SOURCES = [('Aml.Engine', args[0])]
for flag, assembly in (('--resources', 'Aml.Engine.Resources'), ('--services', 'Aml.Engine.Services')):
    if flag in args:
        SOURCES.append((assembly, args[args.index(flag) + 1]))
ROOT = os.path.join(os.path.dirname(__file__), '..')

NS_DIRS = {}
NS_DIRS['Aml.Engine'] = {
    'Aml.Engine.XML': 'engine/xml',
    'Aml.Engine.Xml.Extensions': 'engine/xmlext',
    'Aml.Engine.Schema': 'engine/schema',
    'Aml.Engine.CAEX': 'engine/caex',
    'Aml.Engine.CAEX.Extensions': 'engine/caex/extensions',
    'Aml.Engine.CAEX.Commands': 'engine/caex/commands',
    'Aml.Engine.CAEX.Linq': 'engine/caex/linq',
    'Aml.Engine.AmlObjects': 'engine/amlobjects',
    'Aml.Engine.AmlObjects.Extensions': 'engine/amlobjects/extensions',
    'Aml.Engine.AmlObjects.MimeType': 'engine/amlobjects/mimetype',
    'Aml.Engine.Services': 'engine/services',
    'Aml.Engine.Services.Interfaces': 'engine/services/interfaces',
    'Aml.Engine.Services.Model': 'engine/services/model',
    'Aml.Engine.Services.Utilities': 'engine/services/utilities',
    'Aml.Engine.Adapter': 'engine/adapter',
    'Aml.Engine.Streaming': 'engine/streaming',
    'Aml.Engine.Resources': 'engine/resources',
    'Aml.Engine.Resources.Catalogue': 'engine/resources/catalogue',
}
NS_DIRS['Aml.Engine.Resources'] = {
    'Aml.Engine.Resources': 'engine/resources',
    'Aml.Engine.Resources.AMLStandard': 'engine/resources/libraries',
    'Aml.Engine.Resources.Catalogue': 'engine/resources/catalogue',
    'Aml.Engine.Resources.Files': 'engine/resources/files',
}
NS_DIRS['Aml.Engine.Services'] = {
    'Aml.Engine.Services': 'services',
    'Aml.Engine.Services.AMLTransformer': 'services/amltransformer',
    'Aml.Engine.Services.Generique': 'services/generique',
    'Aml.Engine.Services.Lookup': 'services/lookup',
    'Aml.Engine.Services.TransformatorService': 'services/transformator',
    'Aml.Engine.Services.UndoRedo': 'services/undoredo',
}

DECL = re.compile(r'^(\t*)(?:\[[^\]]*\]\s*)*((?:public|internal|private|protected|sealed|abstract|static|partial|readonly|ref|new|unsafe|file)\s+)*(class|struct|enum|interface|record(?:\s+(?:struct|class))?)\s+([A-Za-z_][A-Za-z0-9_]*)(<)?')

rows = []
for ASSEMBLY, SRC in SOURCES:
  NS_DIR = NS_DIRS[ASSEMBLY]
  for d in sorted(os.listdir(SRC)):
    full = os.path.join(SRC, d)
    if not os.path.isdir(full) or d not in NS_DIR:
        continue
    for f in sorted(os.listdir(full)):
        if not f.endswith('.cs') or f == 'NamespaceDoc.cs':
            continue
        text = open(os.path.join(full, f), encoding='utf-8-sig').read()
        module = f"src/{NS_DIR[d]}/{f[:-3]}.ts"
        stack = []  # (indent, name)
        for line in text.splitlines():
            m = DECL.match(line)
            if not m:
                continue
            indent = len(m.group(1))
            mods = (m.group(0))
            kind = m.group(3).split()[0]
            name = m.group(4)
            generic = m.group(5) is not None
            while stack and stack[-1][0] >= indent:
                stack.pop()
            outer = [n for _, n in stack]
            export = '_'.join(outer + [name])
            if generic:
                export += '<'  # resolved below: suffix _1 only where a non-generic twin exists
            is_static = ' static ' in f' {mods} '
            rows.append((d, f, '.'.join(outer + [name]), kind + (' static' if is_static else ''), module, export, ASSEMBLY))
            stack.append((indent, name))

plain = {r[5] for r in rows if not r[5].endswith('<')}
rows = [r[:5] + ((r[5][:-1] + '_1') if r[5].endswith('<') and r[5][:-1] in plain else r[5].rstrip('<'),) + r[6:] for r in rows]

# Export names are unique over all assemblies (tests look types up by export name).
names = {}
for r in rows:
    if r[5] in names and names[r[5]] != r[4]:
        raise SystemExit(f'export {r[5]} in {names[r[5]]} and {r[4]}')
    names[r[5]] = r[4]

with open(os.path.join(ROOT, 'docs', 'type-map.tsv'), 'w', encoding='utf-8', newline='\n') as out:
    out.write('namespace\tfile\ttype\tkind\tmodule\texport\tassembly\n')
    for r in rows:
        out.write('\t'.join(r) + '\n')

# Registry: instantiable classes and structs (not static classes, interfaces or enums) of
# Aml.Engine and Aml.Engine.Resources.
classes = [r for r in rows if r[3] in ('class', 'struct', 'record') and r[6] != 'Aml.Engine.Services']
seen = set()
lines = [
    '// Generated by scripts/gen-registry.py. Do not edit.',
    '// Run time access to engine classes without import cycles: see docs/PORTING.md, "Module cycles".',
    '/* eslint-disable @typescript-eslint/no-explicit-any */',
    '',
]
imports = []
fields = []
for ns, f, typ, kind, module, export, assembly in classes:
    if export in seen:
        raise SystemExit(f'duplicate export {export}')
    seen.add(export)
    rel = './' + os.path.relpath(os.path.join(ROOT, module), os.path.join(ROOT, 'src', 'engine')).replace('\\', '/')
    rel = rel[:-3] + '.js'
    alias = f'{export}_'
    imports.append(f"import type {{ {export} as {alias} }} from '{rel}';")
    fields.append(f'  {export}: typeof {alias};')
lines += imports
lines += ['', '/** All engine classes by export name. Filled by each module at load time. */', 'export interface Registry {']
lines += fields
lines += ['}', '', 'export const T = {} as Registry;', '']
with open(os.path.join(ROOT, 'src', 'engine', 'registry.ts'), 'w', encoding='utf-8', newline='\n') as out:
    out.write('\n'.join(lines))

print(f'{len(rows)} types, {len(classes)} registry classes')
