// A small web server for the external reference tests (svc-extref oracle and
// test/services/extref*.test.ts). It serves the case files of test/services/extref over http on
// 127.0.0.1 with a fixed port and has routes for the error paths:
//
//   /files/<path>                  the case file (application/xml), 404 if it does not exist
//   /status/<code>/<rest>          answers with the status code; a 2xx code sends libs/Lib3.aml
//   /redirect/<code>/<n>/<rest>    n redirects with the code (Location relative), then /<rest>
//   /slow/<ms>/<rest>              waits, then answers /<rest>
//   /wrong/<rest>                  200 with text that is not XML
//   /auth/<user>/<pass>/<rest>     /<rest> if the request has "Authorization: Basic base64(user:pass)",
//                                  otherwise 401 ("_" stands for an empty user name or password)
//   /echo/<rest>                   200 with an AML document whose FileName shows the request:
//                                  "auth=<Authorization header>;url=<request target>"
//   /__ping                        200 "ok"
//   /__count?path=<request target> the number of requests for the target (since the last reset)
//   /__reset                       resets the counts
//   /__stop                        stops the server (and the process when started from the command line)
//
// Command line: node test/services/extref-server.mjs <casesDir> <port>
// It prints "listening <url>" when ready and stops on SIGINT, SIGTERM or a request of /__stop.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The port the tests and the oracle use. */
export const EXTREF_PORT = 48217;

/** The base URL of the server on EXTREF_PORT. */
export const EXTREF_BASE = `http://127.0.0.1:${EXTREF_PORT}`;

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function echoDocument(text) {
  return `<?xml version="1.0" encoding="utf-8"?>
<CAEXFile FileName="${xmlEscape(text)}" SchemaVersion="3.0" xmlns="http://www.dke.de/CAEX">
  <SourceDocumentInformation OriginName="extref-server" OriginID="echo" OriginVersion="1.0" LastWritingDateTime="2024-01-01T00:00:00" />
</CAEXFile>
`;
}

/**
 * Starts the server. Resolves to { server, counts, close } once it listens; rejects with a clear
 * message if the port is taken.
 */
export function startExtRefServer(casesDir, port = EXTREF_PORT) {
  const root = resolve(casesDir);
  const counts = new Map();

  const handle = (req, res, target) => {
    const [pathPart] = target.split('?');
    const parts = pathPart.split('/').slice(1);
    const head = parts[0];
    const rest = '/' + parts.slice(1).join('/');
    if (head === 'files') {
      let rel;
      try {
        rel = decodeURIComponent(parts.slice(1).join('/'));
      } catch {
        rel = '';
      }
      const file = join(root, rel);
      if (rel === '' || !file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(readFileSync(file));
      return;
    }
    if (head === 'status') {
      const code = Number(parts[1]);
      if (code >= 200 && code < 300 && code !== 204 && code !== 205) {
        res.writeHead(code, { 'content-type': 'application/xml' });
        res.end(readFileSync(join(root, 'libs', 'Lib3.aml')));
        return;
      }
      res.writeHead(code, { 'content-type': 'text/plain' });
      res.end(code === 204 || code === 205 || code === 304 ? undefined : 'status ' + code);
      return;
    }
    if (head === 'redirect') {
      const code = Number(parts[1]);
      const n = Number(parts[2]);
      const tail = '/' + parts.slice(3).join('/');
      const location = n > 0 ? `/redirect/${code}/${n - 1}${tail}` : tail;
      res.writeHead(code, { location });
      res.end();
      return;
    }
    if (head === 'slow') {
      const ms = Number(parts[1]);
      const tail = '/' + parts.slice(2).join('/');
      setTimeout(() => handle(req, res, tail), ms);
      return;
    }
    if (head === 'wrong') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('this is not xml');
      return;
    }
    if (head === 'auth') {
      const user = parts[1] === '_' ? '' : parts[1];
      const pass = parts[2] === '_' ? '' : parts[2];
      const expected = 'Basic ' + Buffer.from(user + ':' + pass, 'latin1').toString('base64');
      if (req.headers.authorization !== expected) {
        res.writeHead(401, { 'content-type': 'text/plain' });
        res.end('unauthorized');
        return;
      }
      handle(req, res, '/' + parts.slice(3).join('/'));
      return;
    }
    if (head === 'echo') {
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(echoDocument(`auth=${req.headers.authorization ?? '(none)'};url=${req.url}`));
      return;
    }
    if (head === '__ping') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('unknown route ' + rest);
  };

  const server = createServer((req, res) => {
    // No keep-alive: a client must not reuse a socket the server closes while the client's
    // process is busy (the tests run long synchronous steps between requests).
    res.setHeader('connection', 'close');
    const url = req.url ?? '/';
    if (url.startsWith('/__count')) {
      const path = new URL(url, 'http://localhost').searchParams.get('path') ?? '';
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(String(counts.get(path) ?? 0));
      return;
    }
    if (url === '/__stop') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('stopping', () => {
        server.closeAllConnections?.();
        server.close(() => server.emit('stopped'));
      });
      return;
    }
    if (url === '/__reset') {
      counts.clear();
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    counts.set(url, (counts.get(url) ?? 0) + 1);
    try {
      handle(req, res, url);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(e));
    }
  });

  return new Promise((resolvePromise, reject) => {
    server.once('error', (e) => {
      reject(
        e && e.code === 'EADDRINUSE'
          ? new Error(`extref-server: port ${port} on 127.0.0.1 is taken; stop the process that uses it (another test run?)`)
          : e,
      );
    });
    server.listen(port, '127.0.0.1', () => {
      resolvePromise({
        server,
        counts,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  const port = process.argv[3] ? Number(process.argv[3]) : EXTREF_PORT;
  if (!dir) {
    console.error('usage: node test/services/extref-server.mjs <casesDir> [port]');
    process.exit(2);
  }
  startExtRefServer(dir, port).then(
    ({ server, close }) => {
      console.log(`listening http://127.0.0.1:${port}`);
      const stop = () => close().then(() => process.exit(0));
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      server.on('stopped', () => process.exit(0));
    },
    (e) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}
