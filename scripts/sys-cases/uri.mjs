// System.Uri cases (src/system/Uri.ts): TryCreate for every UriKind, the constructor, the
// component getters, Equals, EscapeDataString / UnescapeDataString.
//   uri.create [s, kind]  -> TryCreate + ToString/OriginalString/Scheme/LocalPath/Fragment/AbsoluteUri
//   uri.new    [s, kind]  -> constructor (exceptions)
//   uri.parts  [s, kind]  -> AbsolutePath/Query/Host/Port/IsUnc/IsFile/IsDefaultPort/UserInfo/Authority/PathAndQuery
//   uri.equals [a, b]     -> Equals of two RelativeOrAbsolute URIs

const realistic = [
  // http(s)
  'http://example.com',
  'http://example.com/',
  'https://example.com/path/to/file.aml',
  'http://example.com:80/x',
  'https://example.com:443/x',
  'http://example.com:8080/x',
  'https://example.com:80/x',
  'http://example.com:0/x',
  'http://example.com:00080/x',
  'http://example.com:65535/',
  'http://example.com:65536/',
  'http://example.com:/x',
  'http://example.com:8a/x',
  'HTTP://EXAMPLE.COM/Path',
  'HtTpS://Example.Com:443/A/b?Q=1#F',
  'http://example.com/a?b=c&d=e',
  'http://example.com/a?b=c#frag',
  'http://example.com/a#frag?x',
  'http://example.com/a#frag#frag2',
  'http://example.com/?',
  'http://example.com/#',
  'http://example.com?q',
  'http://example.com#f',
  'http://example.com/a%20b',
  'http://example.com/a b',
  'http://example.com/a%2Fb',
  'http://example.com/a%2fb/../c',
  'http://example.com/%41%42%43',
  'http://example.com/%7e%7E',
  'http://example.com/a%zzb',
  'http://example.com/a%',
  'http://example.com/a%4',
  'http://example.com/%25',
  'http://example.com/%2525',
  'http://example.com/%C3%A4',
  'http://example.com/%c3%a4?%C3%A4#%C3%A4',
  'http://example.com/%E4%B8%AD',
  'http://example.com/%F0%9F%98%80',
  'http://example.com/%C3%28',
  'http://example.com/%FF',
  'http://example.com/%80%80',
  'http://example.com/%E2%82',
  'http://example.com/%ED%A0%80',
  'http://example.com/%00',
  'http://example.com/%0A',
  'http://example.com/%7F',
  'http://example.com/ä',
  'http://example.com/中文',
  'http://example.com/😀',
  'http://example.com/ä?ä#ä',
  'http://example.com/a?ä=ö',
  'http://example.com/#ä',
  'http://bücher.de/',
  'http://BÜCHER.de/x',
  'http://Ü.de/',
  'http://xn--bcher-kva.de/',
  'http://中文.cn/路径',
  'http://example.com./x',
  'http://ex_ample.com/',
  'http://-example.com/',
  'http://exa mple.com',
  'http://',
  'http:/',
  'http:',
  'http:x',
  'http:/x',
  'http:\\\\example.com\\a\\b',
  'http://example.com\\a\\b',
  'http://example.com/a\\b',
  'http://example.com/a/./b/../c',
  'http://example.com/a/b/../../../c',
  'http://example.com/./a',
  'http://example.com/a/..',
  'http://example.com/a/.',
  'http://example.com/a/...',
  'http://example.com/a.../b',
  'http://example.com/a//b',
  'http://example.com//a',
  'http://example.com/a/%2E%2E/b',
  'http://example.com/a/%2e/b',
  'http://[::1]',
  'http://[::1]/',
  'http://[::1]:8080/x',
  'http://[2001:db8::1]/',
  'http://[2001:DB8:0:0:0:0:0:1]/',
  'http://[::ffff:127.0.0.1]/',
  'http://[::127.0.0.1]/',
  'http://[fe80::1%25eth0]/',
  'http://[fe80::1%eth0]/',
  'http://[::1/64]/',
  'http://[1:2:3:4:5:6:7:8]/',
  'http://[1:2:3:4:5:6:7:8:9]/',
  'http://[::]/',
  'http://[1::]/',
  'http://[:1]/',
  'http://[',
  'http://[]/',
  'http://[::1',
  'http://127.0.0.1/',
  'http://127.1/',
  'http://0x7f.1/',
  'http://0177.0.0.1/',
  'http://2130706433/',
  'http://192.168.1.256/',
  'http://1.2.3.4.5/',
  'http://1.2.3/',
  'http://999999999999/',
  'http://localhost/',
  'http://LOCALHOST:80/',
  'http://loopback/',
  'http://user@example.com/',
  'http://user:pass@example.com:8080/p?q#f',
  'http://us er@example.com/',
  'http://user%40x@example.com/',
  'http://ü@example.com/',
  'http://@example.com/',
  'http://user@/',
  'http://a@b@c/',
  'https://www.automationml.org/Standard/AutomationML.xsd',
  'https://www.automationml.org/Standard/AutomationML%20Base.xsd',
  '  http://example.com/  ',
  '\thttp://example.com/\n',
  'http://example.com/ \t',
  // file
  'file:///C:/x/y.aml',
  'file:///C:/x/y.aml#frag',
  'file:///C:/x#/ID',
  'file:///c:/Program%20Files/a.aml',
  'file:///C:/x y/ä.aml',
  'file:///C:/x%20y/%C3%A4.aml',
  'file:///C:/x/../y/./z.aml',
  'file:///C:/x/%2E%2E/y',
  'file:///C:\\x\\y.aml',
  'file:///C|/x/y.aml',
  'file://C:/x/y.aml',
  'file:/C:/x/y.aml',
  'file:C:/x/y.aml',
  'file:C:x',
  'file:///C:',
  'file://///server/share/x',
  'file://server/share/f.aml',
  'file://server/share/a b.aml',
  'file://server/share/%C3%A4.aml',
  'file://server/',
  'file://server',
  'file:////server/share',
  'file:///home/user/x.aml',
  'file:///',
  'file://',
  'file:',
  'file:/x',
  'file://localhost/C:/x',
  'file://127.0.0.1/share/x',
  'file:///C:/x?q=1',
  'file:///C:/x#a#b',
  'FILE:///C:/X',
  // implicit Windows paths
  'C:\\x\\y.aml',
  'C:/x/y.aml',
  'c:\\',
  'c:/',
  'C:',
  'C:x',
  'C:\\x y\\ä.aml',
  'C:/x y/ä.aml',
  'C:\\x\\..\\y\\.\\z.aml',
  'C:\\x%20y\\a.aml',
  'C:\\x\\y.aml#frag',
  'C:\\x\\y.aml?q',
  'C:\\x\\a#b%c.aml',
  'C|\\x\\y',
  'C:\\Program Files\\AutomationML\\lib.aml',
  'D:\\Daten\\Projekt [1]\\a{b}.aml',
  'C:\\a\\😀.aml',
  'C:\\a\\中.aml',
  '  C:\\x\\y.aml',
  'C:\\x\\y.aml  ',
  'C:\\x\\\\y',
  '\\\\server\\share\\a b.aml',
  '\\\\server\\share\\f.aml',
  '\\\\server\\share',
  '\\\\server',
  '\\\\',
  '\\\\\\server\\share',
  '\\\\server\\share\\ä.aml',
  '\\\\sérver\\share\\x',
  '\\\\192.168.1.1\\share\\x',
  '\\\\server.domain.com\\share\\x',
  '\\\\server\\share\\x#y',
  '//server/share/x.aml',
  '\\x\\y',
  '/abs/path',
  '/abs/path/x.aml#frag',
  // relative
  'lib/x.aml',
  './x.aml',
  '../x',
  '../../lib/Library.aml',
  '#frag',
  '?q',
  'x.aml#/ID',
  'x.aml#/12345678-1234-1234-1234-123456789abc',
  'Lib.aml#InstanceHierarchy/IE1',
  '',
  ' ',
  '  ',
  'a',
  'ab',
  'abc',
  'a b',
  'a%20b',
  'a%zz',
  'ä',
  'äb/c',
  'x/ä.aml',
  'x/%C3%A4.aml',
  '中文/a',
  '😀',
  ':',
  '::',
  'a:',
  'a:b',
  '1a:b',
  'ab:c',
  'a-b+c.d:x',
  '_x:y',
  'a_b:c',
  'a b:c',
  'ä:x',
  '%41:b',
  'a|b',
  '1:2',
  'C:',
  'c|',
  'c|x',
  // urn, mailto, others
  'urn:uuid:6e8bc430-9c3a-11d9-9669-0800200c9a66',
  'urn:isbn:0451450523',
  'URN:ietf:rfc:2648',
  'urn:x:a%20b',
  'urn:x:ä',
  'urn:x:a b',
  'urn:x:a\\b',
  'urn:x:a/../b',
  'urn:x:a#b?c',
  'mailto:a@b',
  'mailto:a@b.com',
  'mailto:A@B.COM?subject=hi',
  'mailto:a@b.com#frag',
  'mailto:',
  'mailto:a',
  'mailto:@b',
  'mailto:a@',
  'mailto:ä@b.de',
  'mailto:a@bücher.de',
  'mailto:a@[::1]',
  'mailto:a@127.0.0.1',
  'mailto://a@b',
  'news:comp.lang',
  'news:a b',
  'uuid:6e8bc430-9c3a-11d9',
  'aml:x',
  'aml:/x/y',
  'aml://host/x',
  'aml:x#frag',
  'opc.tcp://host:4840/path',
  'opc.tcp://host:4840',
  'opc.tcp://host:99999/x',
  'opc.tcp://host:48a0/x',
  'opc.tcp://[::1]:4840/',
  'opc.tcp://ÿ.de:4840/',
  'x-y://a/b',
  'scheme://',
  'scheme:///',
  'scheme:////x',
  'scheme://./x',
  'scheme://../x',
  'scheme://.../x',
  'scheme://host\\x',
  'scheme://C:\\x',
  'scheme:C:\\x',
  'scheme://host/a\\b',
  'scheme:a\\b',
  'scheme:a/./b/../c',
  'scheme:/a/./b/../c',
  'scheme://h/a/./b/../c',
  'scheme://user@host:12/x',
  'scheme://ho st/x',
  'scheme://ä/x',
  'vsmacros://c:\\path\\file',
  'vsmacros://host/x',
  'ftp://ftp.example.com/pub/file.txt',
  'ftp://user:pw@ftp.example.com:21/a?b#c',
  'ftp://ftp.example.com/a?b',
  'gopher://host/x',
  'ldap://host/x?y',
  'ldap:///o=x',
  'net.tcp://host:808/svc',
  'net.pipe://host/svc',
  'telnet://host:23/',
  'nntp://host/x',
  'ws://host/x',
  'wss://host:443/x',
  'data:text/plain;base64,SGVsbG8=',
  'javascript:alert(1)',
  'tel:+1-816-555-1212',
  'jar:file:/x.jar!/a',
  'httpſ://x',
  'HTTPſ://x',
  'fıle:///C:/x',
  'http://Aİ.de/',
  'http://A\u212A.de/',
  'http://A\u0131.de/',
  'http://AΣ.de/',
  'http://A\ud801\udc00.de/',
  'http://Aǅ.de/',
  'http://A\u2126.de/',
  'http://Aß.de/',
  'http://Aﬀ.de/',
  'httpſ:x',
  'ſcheme:x',
  'a'.repeat(1024) + ':x',
  'a'.repeat(1025) + ':x',
  // control characters and odd characters
  'http://example.com/a\u0001b',
  'http://example.com/a\u007fb',
  'http://example.com/a\u0085b',
  'http://example.com/a\u00a0b',
  'http://example.com/a\u200eb',
  'http://ex\u200eample.com/',
  'http://example.com/\ue000?\ue000#\ue000',
  'http://example.com/\ufdd0',
  'http://example.com/\ufffd',
  'http://example.com/a"b<c>d`e{f}g|h^i',
  'http://example.com/a[b]c',
  'http://example.com/a\'b(c)d*e!',
  'a\u0001b',
  'C:\\a\u0001b',
  'http://example.com/%1',
  'http://example.com/%%41',
  'http://example.com/a%2',
  'http://example.com/%E4%B8',
  'http://example.com/%E4%B8%41',
  'http://example.com/%F0%9F%98',
  'http://example.com/%F0%9F%98%80%F0',
  'http://example.com/%EF%BF%BE',
  'http://example.com/%F3%A0%80%80',
  'http://example.com/%F4%8F%BF%BF',
  'http://example.com/%F4%90%80%80',
  'http://example.com/%C0%80',
  'http://example.com/%E0%80%80',
  'http://example.com/%C2%A0',
  'http://example.com/%C2%85',
  'http://example.com/?%E2%80%8E',
  'http://example.com/%3F%23',
  'http://example.com/%5C',
  'http://example.com/a%5C..%5Cb',
  'http://example.com/%2e%2e/x',
  'http://example.com/?%20#%20',
  'http://example.com/?a b#c d',
  'http://example.com/?\\#\\',
  'http://example.com/?a%zz#b%zz',
];

const escapeCases = [
  '',
  'abc',
  'a b',
  "!*'();:@&=+$,/?#[]",
  '-._~',
  'ä',
  'ÄÖÜß',
  '中文',
  '😀',
  '\ud83d\ude00x',
  '%',
  '%41',
  '%zz',
  '+',
  ' \t\r\n',
  '\u0000\u0001\u007f\u0080\u00ff',
  '\u0100\u07ff\u0800\uffff',
  '<>"{}|\\^`',
  'C:\\Program Files\\x.aml',
  'Lib.aml#InstanceHierarchy/IE 1',
];

const unescapeCases = [
  '',
  'abc',
  '%',
  '%4',
  '%41',
  '%41%42',
  '%4a%4A',
  '%C3%A4',
  '%c3%a4',
  '%C3%28',
  '%FF',
  '%C3',
  '%C3%',
  '%C3%A',
  '%E4%B8%AD',
  '%E4%B8',
  '%E4%B8%41',
  '%F0%9F%98%80',
  '%F0%9F%98',
  '%F0%9F%98%80%F0%9F%98%80',
  '%ED%A0%80',
  '%ED%A0%80%ED%B0%80',
  '%EF%BB%BF',
  '%EF%BF%BF',
  '%F4%90%80%80',
  '%F5%80%80%80',
  '%C0%AF',
  '%E0%80%AF',
  '%80',
  '%80%80%80%80%80',
  '%C3%A4%C3',
  '%C3%C3%A4',
  '%E4%C3%A4',
  '%E2%82%AC%zz',
  '%%',
  '%%%',
  '%%41',
  '%2525',
  '%20+%20',
  '+',
  'a%20b%2Fc%3Fd%23e',
  '%00%01%1F%7F',
  '%zz%41',
  'ä%C3%A4',
  '%E2%80%8E',
  '%EE%80%80',
  '%F3%A0%80%80',
];

const kinds = [0, 1, 2];

// Alphabets for random strings
const urlChars = [
  ...'abcxyzABZ019',
  ...'-._~',
  ...":/?#[]@!$&'()*+,;=",
  ...'%%%%%',
  ...'  \\|{}^`"<>',
  'ä',
  'é',
  '中',
  '😀',
  '\u00a0',
  '\u200e',
  '\t',
  '\u0001',
];
const hex = [...'0123456789ABCDEFabcfz'];
const prefixes = [
  '',
  '',
  'http://',
  'https://',
  'http://h',
  'http://host:81',
  'file:///C:/',
  'file://srv/sh/',
  'C:\\',
  'C:/',
  '\\\\srv\\sh\\',
  '//',
  'urn:x:',
  'mailto:',
  'aml:',
  'opc.tcp://h:4840/',
  'x:',
  'a/',
  '../',
  '#',
  '?',
];

function randomString(rng, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const c = rng.pick(urlChars);
    if (c === '%' && rng.next() < 0.7) s += '%' + rng.pick(hex) + rng.pick(hex);
    else s += c;
  }
  return s;
}

function randomEscapes(rng) {
  const bytes = ['C3', 'A4', '80', 'BF', 'E4', 'B8', 'AD', 'F0', '9F', '98', 'ED', 'A0', 'FF', 'C0', '41', '2F', '2E', '25', 'zz', '7', 'e2', '82', 'ac'];
  let s = '';
  const n = rng.range(1, 8);
  for (let i = 0; i < n; i++) {
    const r = rng.next();
    if (r < 0.75) s += '%' + rng.pick(bytes);
    else if (r < 0.85) s += '%';
    else s += rng.pick(['a', 'ä', ' ', '/', '😀']);
  }
  return s;
}

export default function (rng) {
  const cases = [];
  for (const s of realistic) for (const k of kinds) cases.push({ fn: 'uri.create', args: [s, k] });
  for (const s of realistic) cases.push({ fn: 'uri.parts', args: [s, 0] });
  for (const s of realistic) cases.push({ fn: 'uri.new', args: [s, 1] });
  for (const s of realistic) cases.push({ fn: 'uri.new', args: [s, 0] });
  cases.push({ fn: 'uri.new', args: [null, 0] });
  cases.push({ fn: 'uri.new', args: ['http://x/', 3] });
  cases.push({ fn: 'uri.new', args: ['x', -1] });
  cases.push({ fn: 'uri.create', args: ['x', 3] });

  // very long strings (size limit is 0xFFF0 for the input, 0xFFFF after IRI expansion)
  for (const n of [65000, 65518, 65519, 65520, 70000]) {
    cases.push({ fn: 'uri.create', args: ['http://h/' + 'a'.repeat(n - 9), 0] });
    cases.push({ fn: 'uri.create', args: ['a'.repeat(n), 0] });
  }
  cases.push({ fn: 'uri.create', args: ['http://h/' + 'ä'.repeat(30000), 1] });
  cases.push({ fn: 'uri.create', args: ['http://h/' + 'ä'.repeat(10000), 1] });
  cases.push({ fn: 'uri.create', args: ['http://h/' + '%C3%A4'.repeat(10000), 1] });
  cases.push({ fn: 'uri.create', args: ['http://' + 'a'.repeat(300) + '/', 1] });
  cases.push({ fn: 'uri.create', args: ['http://' + 'a'.repeat(63) + '.b/', 1] });
  cases.push({ fn: 'uri.create', args: ['http://' + 'a'.repeat(64) + '.b/', 1] });
  cases.push({ fn: 'uri.create', args: ['\\\\' + 'a'.repeat(256) + '\\x', 1] });
  cases.push({ fn: 'uri.create', args: ['\\\\' + 'a'.repeat(257) + '\\x', 1] });

  // equality
  const eqPairs = [
    ['http://example.com/a', 'http://EXAMPLE.com/a'],
    ['http://example.com/a', 'HTTP://example.com:80/a'],
    ['http://example.com/a', 'http://example.com/A'],
    ['http://example.com/a#x', 'http://example.com/a#y'],
    ['http://u@example.com/a', 'http://example.com/a'],
    ['http://example.com/a%20b', 'http://example.com/a b'],
    ['http://example.com/%41', 'http://example.com/A'],
    ['http://example.com/a/../b', 'http://example.com/b'],
    ['http://example.com:8080/', 'http://example.com:8081/'],
    ['file:///C:/x/y.aml', 'C:\\x\\y.aml'],
    ['file:///C:/X/Y.aml', 'c:\\x\\y.AML'],
    ['C:\\x\\y.aml', 'C:\\x\\y.aml#f'],
    ['\\\\server\\share\\x', 'file://SERVER/share/X'],
    ['mailto:a@b', 'mailto:A@b'],
    ['mailto:a@b', 'mailto:c@b'],
    ['lib/x.aml', 'lib/x.aml'],
    ['lib/x.aml', 'lib/X.aml'],
    ['lib/x.aml', 'http://h/lib/x.aml'],
    ['urn:a:b', 'URN:a:b'],
    ['urn:a:b', 'urn:A:b'],
    ['http://[::1]/', 'http://[0:0::1]/'],
    ['http://127.0.0.1/', 'http://127.1/'],
    ['http://bücher.de/', 'http://xn--bcher-kva.de/'],
    ['http://example.com/ä', 'http://example.com/%C3%A4'],
    ['aml:x#a', 'aml:x#b'],
  ];
  for (const [a, b] of eqPairs) {
    cases.push({ fn: 'uri.equals', args: [a, b] });
    cases.push({ fn: 'uri.equals', args: [b, a] });
  }

  for (const s of escapeCases) cases.push({ fn: 'uri.escape', args: [s] });
  for (const s of unescapeCases) cases.push({ fn: 'uri.unescape', args: [s] });
  for (const s of realistic) {
    cases.push({ fn: 'uri.escape', args: [s] });
    cases.push({ fn: 'uri.unescape', args: [s] });
  }

  // random URIs
  for (let i = 0; i < 2500; i++) {
    const s = rng.pick(prefixes) + randomString(rng, rng.range(0, 14));
    cases.push({ fn: 'uri.create', args: [s, rng.pick(kinds)] });
  }
  for (let i = 0; i < 300; i++) {
    const s = rng.pick(prefixes) + randomString(rng, rng.range(0, 14));
    cases.push({ fn: 'uri.parts', args: [s, 0] });
  }
  for (let i = 0; i < 300; i++) {
    const s = rng.pick(['http://h/', 'file:///C:/', 'C:\\', 'aml:', '', 'x/']) + randomEscapes(rng);
    cases.push({ fn: 'uri.create', args: [s, 0] });
  }
  // structured random URIs: scheme + authority + path + query + fragment
  const schemes = ['http://', 'HTTPS://', 'file://', 'file:///', 'file:', 'ftp://', 'mailto:', 'urn:', 'news:', 'ldap://', 'net.tcp://', 'x:', 'x://', 'opc.tcp://', 'ws:\\\\', 'http:\\\\', ''];
  const users = ['', '', '', 'u@', 'u:p@', 'ü@', 'a%40b@', 'a b@'];
  const hosts = ['h', 'Host.COM', 'bücher.de', 'BÜCHER.de', '127.0.0.1', '0x7f.1', '[::1]', '[FE80::1%25x]', '[::ffff:1.2.3.4]', 'localhost', 'a_b', 'a-', '-a', '', '.', '..', 'C:', 'c|', 'x y', 'ä', '1.2.3.4.5', '中.cn', 'h\\x'];
  const ports = ['', '', '', ':80', ':443', ':21', ':8080', ':0', ':00', ':', ':65535', ':65536', ':1a'];
  const segs = ['a', 'B', '.', '..', '...', '%2E', '%2e%2E', '%2F', '%5C', 'ä', '%C3%A4', 'a b', '%20', '%zz', '%', '😀', '中', '[x]', '{x}', '|', '^', '`', '"', '<', '\\', 'C:', 'c|', ';p=1', '~', "'", '%41', '%7F', '%E2%80%8E', '\u200e'];
  const qs = ['', '', '?', '?a=b', '?ä', '?%C3%A4', '?a b', '?a#b', '?%zz', '?\\', '?\ue000', '?%EE%80%80', '??'];
  const fs_ = ['', '', '#', '#f', '#ä', '#%C3%A4', '#a b', '#a#b', '#%zz', '#\\', '#/ID', '#?x'];
  for (let i = 0; i < 1500; i++) {
    let path = '';
    const n = rng.range(0, 5);
    for (let k = 0; k < n; k++) path += rng.pick(['/', '/', '/', '\\', '//']) + rng.pick(segs);
    if (rng.next() < 0.2) path += '/';
    const s = rng.pick(schemes) + rng.pick(users) + rng.pick(hosts) + rng.pick(ports) + path + rng.pick(qs) + rng.pick(fs_);
    cases.push({ fn: rng.next() < 0.8 ? 'uri.create' : 'uri.parts', args: [s, rng.pick(kinds)] });
  }
  // structured random Windows paths
  for (let i = 0; i < 400; i++) {
    let path = rng.pick(['C:', 'c:', 'Z|', '\\\\srv', '\\\\srv.dom', '\\\\ä', '\\\\127.0.0.1', '//srv', 'file:///C:', 'file://srv', '  C:']);
    const n = rng.range(0, 5);
    for (let k = 0; k < n; k++) path += rng.pick(['/', '\\', '\\', '//', '\\\\']) + rng.pick(segs);
    if (rng.next() < 0.3) path += rng.pick(['#f', '?q', '#', ' ', '\\']);
    cases.push({ fn: rng.next() < 0.8 ? 'uri.create' : 'uri.parts', args: [path, rng.pick(kinds)] });
  }
  for (let i = 0; i < 400; i++) cases.push({ fn: 'uri.unescape', args: [randomEscapes(rng)] });
  for (let i = 0; i < 300; i++) cases.push({ fn: 'uri.escape', args: [randomString(rng, rng.range(0, 12))] });
  for (let i = 0; i < 200; i++) {
    const a = rng.pick(prefixes) + randomString(rng, rng.range(0, 6));
    const b = rng.next() < 0.5 ? a.toUpperCase() : a.replace(/a/g, '%61');
    cases.push({ fn: 'uri.equals', args: [a, b] });
  }
  return cases;
}
