// Convert.ToBase64String / FromBase64String and Encoding.UTF8.
export default function (rng) {
  const cases = [];
  const add = (fn, ...args) => cases.push({ fn, args });
  const texts = ['', 'a', 'ab', 'abc', 'abcd', 'Hello, World!', 'äöüß', '中文', '😀', 'a\u0000b','﻿bom', '<xml attr="1"/>', 'line1\nline2\r\n'];
  for (const t of texts) {
    add('b64.enc', t);
    add('utf8.enc', t);
  }
  for (const u of ['d800', '0078dc000079', 'dbffdfff', 'dfffdbff', 'd83dde00', 'd83d', 'de00d83d0041']) add('utf8.encU16', u);
  const hexes = ['', '00', 'ff', '0000', 'fffe', 'efbbbf41', 'c3a4', 'c3', 'c328', 'e282', 'e282ac', 'f09f9880', 'f09f98', 'eda080', 'c0af', 'f4908080', '80', 'fe', 'ff41', 'e0808041', 'f0808080'];
  for (const h of hexes) {
    add('b64.encHex', h);
    add('utf8.dec', h);
  }
  const dec = [
    '', ' ', '=', '==', '===', 'A', 'AA', 'AAA', 'AAAA', 'AA==', 'AAA=', 'A===', 'AA=', 'AA=A', 'A=AA', 'QQ==', 'QUI=', 'QUJD', 'QUJDRA==', 'QUJDRA', 'QUJDRA=', 'QUJDRA===',
    ' QUJD ', 'QU JD', 'Q\tU\rJ\nD', 'QUJD\n', '\nQUJD', 'QUJ D RA ==', 'QUJDRA= =', 'QUJDRA = =', 'QUJD\u0000', 'QU\u0001JD', 'QUJD\u000b', 'QUJD ', 'QUJD+/+/', 'QUJD-_-_',
    'QUJD====', 'QUJDRA==QUJD', 'QQ==QQ==', 'Q===', 'QR==', 'QUI+', 'w6Q=', '5Lit5paH', '8J+YgA==', '/w==', '//8=', '////', 'QUJDäQ==', 'QUJDĀ', '====', 'QUJD=', 'QU=D', 'Q UJ DR A= =',
    'SGVsbG8gV29ybGQ=', 'SGVsbG8gV29ybGQ', 'SGVs bG8g V29y bGQ=', 'SGVsbG8gV29ybGQ=\r\n', 'SGVsbG8gV29ybGQ= x', '  ', '\t\t', 'QUJD  RA==  ',
  ];
  for (const s of dec) add('b64.dec', s);
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < 300; i++) {
    const n = rng.range(0, 24);
    let s = '';
    for (let j = 0; j < n; j++) s += rng.next() < 0.9 ? alpha[rng.int(64)] : rng.pick(['=', ' ', '\n', '\t', '-', '\u0001', 'ä']);
    add('b64.dec', s);
  }
  for (let i = 0; i < 200; i++) {
    const n = rng.range(0, 30);
    const h = Array.from({ length: n }, () => rng.int(256).toString(16).padStart(2, '0')).join('');
    add('b64.encHex', h);
    add('utf8.dec', h);
  }
  return cases;
}
