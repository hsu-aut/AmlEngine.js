// Generates large, plant-like CAEX documents for the size and performance checks (test/large,
// not in the repository): class libraries with inheritance, attribute types with constraints, and
// an instance hierarchy (plant, areas, cells, devices, components) with typed attribute values,
// interfaces, role requirements, internal links and mirrors. Deterministic for a given seed.
// A size with the suffix "i" (e.g. 10i) writes large-10mb-invalid.aml: the same kind of document
// with schema errors scattered in (undeclared attributes and elements, a missing Name, a wrong
// ChangeMode value), for the validation messages at scale.
//   node scripts/gen-large.mjs [outDir=test/large] [sizesInMB=10,50,10i] [seed=3682]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'test/large';
const sizes = (process.argv[3] ?? '10,50,10i').split(',');
const seedArg = Number(process.argv[4] ?? 3682);

function generator(seed) {
  let s = seed | 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(rnd() * n);
  const pick = (a) => a[int(a.length)];
  let ids = 0;
  const id = () => {
    const h = (ids++).toString(16).padStart(12, '0');
    return `${(seed >>> 0).toString(16).padStart(8, '0')}-0000-4000-a000-${h}`;
  };
  return { rnd, int, pick, id };
}

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function document(targetBytes, seed, fileName, invalid) {
  const g = generator(seed);
  // Errors come from a generator of their own, so that the valid parts stay the same.
  const errors = generator(seed + 7);
  const bad = (p) => invalid && errors.rnd() < p;
  const out = [];
  let size = 0;
  const w = (s) => {
    out.push(s);
    size += s.length;
  };
  const ind = (n) => '\r\n' + '  '.repeat(n);

  // class libraries
  const ic = ['Port', 'SignalInterface', 'EnergyInterface', 'MaterialPort', 'Connector'];
  const rc = ['Resource', 'Product', 'Process', 'Machine', 'Robot', 'Conveyor', 'Sensor', 'Actuator', 'Controller', 'Drive'];
  const suc = ['Pump', 'Valve', 'Motor', 'Tank', 'Mixer', 'Robot', 'Conveyor', 'Sensor', 'Heater', 'Controller'];
  const at = ['Length', 'Mass', 'Temperature', 'Pressure', 'Speed', 'Voltage', 'Current', 'Power'];
  const units = { Length: 'm', Mass: 'kg', Temperature: '°C', Pressure: 'bar', Speed: '1/min', Voltage: 'V', Current: 'A', Power: 'kW' };
  const types = [
    ['xs:double', () => (g.rnd() * 1000).toFixed(g.int(4))],
    ['xs:int', () => String(g.int(100000) - 50000)],
    ['xs:string', () => `value ${g.int(1e6)} äöü`],
    ['xs:boolean', () => g.pick(['true', 'false'])],
    ['xs:dateTime', () => `20${10 + g.int(15)}-0${1 + g.int(9)}-1${g.int(9)}T0${g.int(9)}:1${g.int(9)}:00`],
    ['xs:decimal', () => `${g.int(1e6)}.${g.int(100)}`],
  ];

  w(`<?xml version="1.0" encoding="utf-8"?>\r\n<CAEXFile SchemaVersion="3.0" FileName="${fileName}" xmlns="http://www.dke.de/CAEX" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`);
  w(`${ind(1)}<SuperiorStandardVersion>AutomationML 2.10</SuperiorStandardVersion>`);
  w(`${ind(1)}<SourceDocumentInformation OriginName="gen-large" OriginID="gen-large" OriginVersion="1.0.0" LastWritingDateTime="2024-05-06T07:08:09" />`);

  // instance hierarchy: written until the target size is reached
  const ieIds = [];
  const eiIds = [];
  const attribute = (level, name) => {
    const [type, value] = g.pick(types);
    const a = at[g.int(at.length)];
    const ref = g.rnd() < 0.3 ? ` RefAttributeType="ATL/${a}"` : '';
    const unit = type === 'xs:double' && g.rnd() < 0.5 ? ` Unit="${esc(units[a])}"` : '';
    let s = `${ind(level)}<Attribute${bad(0.005) ? '' : ` Name="${name}"`} AttributeDataType="${type}"${unit}${ref}>`;
    if (g.rnd() < 0.2) s += `${ind(level + 1)}<Description>${esc(`Description of ${name}`)}</Description>`;
    if (bad(0.005)) s += `${ind(level + 1)}<Comment>not in the schema</Comment>`;
    s += `${ind(level + 1)}<Value>${esc(value())}</Value>`;
    if (g.rnd() < 0.1) {
      s += `${ind(level + 1)}<Attribute Name="Min" AttributeDataType="xs:double">${ind(level + 2)}<Value>0</Value>${ind(level + 1)}</Attribute>`;
      s += `${ind(level + 1)}<Attribute Name="Max" AttributeDataType="xs:double">${ind(level + 2)}<Value>100</Value>${ind(level + 1)}</Attribute>`;
    }
    return s + `${ind(level)}</Attribute>`;
  };
  const element = (level, name, depthLeft) => {
    const own = g.id();
    ieIds.push(own);
    const cls = g.pick(suc);
    // a few mirrors of earlier elements
    if (ieIds.length > 10 && g.rnd() < 0.02) {
      w(`${ind(level)}<InternalElement Name="${name}" ID="${own}" RefBaseSystemUnitPath="${g.pick(ieIds.slice(0, -1))}" />`);
      return;
    }
    const extra = (bad(0.01) ? ' Foo="1"' : '') + (bad(0.01) ? ' ChangeMode="bogus"' : '');
    w(`${ind(level)}<InternalElement Name="${name}" ID="${own}" RefBaseSystemUnitPath="SUCL/${cls}"${extra}>`);
    const nAttr = 3 + g.int(8);
    for (let i = 0; i < nAttr; i++) w(attribute(level + 1, `${g.pick(at)}${i}`));
    const myEis = [];
    const nEi = 1 + g.int(3);
    for (let i = 0; i < nEi; i++) {
      const eid = g.id();
      myEis.push(eid);
      eiIds.push(eid);
      w(`${ind(level + 1)}<ExternalInterface Name="${g.pick(ic)}${i}" ID="${eid}" RefBaseClassPath="ICL/${g.pick(ic)}" />`);
    }
    const children = [];
    if (depthLeft > 0) {
      const n = depthLeft > 3 ? 2 + g.int(4) : 1 + g.int(6);
      for (let i = 0; i < n && size < targetBytes; i++) {
        const before = eiIds.length;
        element(level + 1, `${cls}_${i}`, depthLeft - 1);
        children.push(eiIds.slice(before, before + 1)[0]);
      }
    }
    // links between the first interfaces of neighbouring children
    for (let i = 1; i < children.length; i++) {
      if (children[i - 1] && children[i]) w(`${ind(level + 1)}<InternalLink Name="L${i}" RefPartnerSideA="${children[i - 1]}" RefPartnerSideB="${children[i]}" />`);
    }
    w(`${ind(level + 1)}<RoleRequirements RefBaseRoleClassPath="RCL/${g.pick(rc)}" />`);
    w(`${ind(level)}</InternalElement>`);
  };
  let plant = 0;
  while (size < targetBytes) {
    w(`${ind(1)}<InstanceHierarchy Name="Plant${plant}">`);
    for (let area = 0; area < 4 && size < targetBytes; area++) element(2, `Area${area}`, 7);
    w(`${ind(1)}</InstanceHierarchy>`);
    plant++;
  }

  // libraries
  w(`${ind(1)}<InterfaceClassLib Name="ICL">${ind(2)}<Version>1.0.0</Version>`);
  ic.forEach((n, i) => w(`${ind(2)}<InterfaceClass Name="${n}"${i > 0 ? ` RefBaseClassPath="ICL/${ic[0]}"` : ''}>${ind(3)}<Attribute Name="Direction" AttributeDataType="xs:string">${ind(4)}<Value>InOut</Value>${ind(3)}</Attribute>${ind(2)}</InterfaceClass>`));
  w(`${ind(1)}</InterfaceClassLib>`);
  w(`${ind(1)}<RoleClassLib Name="RCL">${ind(2)}<Version>1.0.0</Version>`);
  rc.forEach((n, i) => w(`${ind(2)}<RoleClass Name="${n}"${i > 0 ? ` RefBaseClassPath="RCL/${rc[0]}"` : ''}>${ind(3)}<Attribute Name="Nominal" AttributeDataType="xs:double" />${ind(2)}</RoleClass>`));
  w(`${ind(1)}</RoleClassLib>`);
  w(`${ind(1)}<SystemUnitClassLib Name="SUCL">${ind(2)}<Version>1.0.0</Version>`);
  suc.forEach((n) => {
    w(`${ind(2)}<SystemUnitClass Name="${n}">`);
    w(attribute(3, 'Nominal'));
    w(`${ind(3)}<ExternalInterface Name="Port" ID="${g.id()}" RefBaseClassPath="ICL/Port" />`);
    w(`${ind(3)}<SupportedRoleClass RefRoleClassPath="RCL/${g.pick(rc)}" />`);
    w(`${ind(2)}</SystemUnitClass>`);
  });
  w(`${ind(1)}</SystemUnitClassLib>`);
  w(`${ind(1)}<AttributeTypeLib Name="ATL">${ind(2)}<Version>1.0.0</Version>`);
  at.forEach((n) => w(`${ind(2)}<AttributeType Name="${n}" AttributeDataType="xs:double" Unit="${esc(units[n])}">${ind(3)}<Constraint Name="Range">${ind(4)}<OrdinalScaledType>${ind(5)}<RequiredMaxValue>1000</RequiredMaxValue>${ind(5)}<RequiredMinValue>0</RequiredMinValue>${ind(4)}</OrdinalScaledType>${ind(3)}</Constraint>${ind(2)}</AttributeType>`));
  w(`${ind(1)}</AttributeTypeLib>`);
  w('\r\n</CAEXFile>\r\n');
  return { text: out.join(''), elements: ieIds.length, interfaces: eiIds.length };
}

mkdirSync(outDir, { recursive: true });
for (const size of sizes) {
  const invalid = size.endsWith('i');
  const mb = Number(invalid ? size.slice(0, -1) : size);
  const name = `large-${mb}mb${invalid ? '-invalid' : ''}.aml`;
  const d = document(mb * 1024 * 1024, seedArg + mb, name, invalid);
  writeFileSync(join(outDir, name), '﻿' + d.text);
  console.log(`${name}: ${(d.text.length / 1048576).toFixed(1)} MB, ${d.elements} internal elements, ${d.interfaces} interfaces`);
}
