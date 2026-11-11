// Concurrency of ExternalReferenceResolver (no oracle possible: the C# behaviour depends on thread
// timing). Checks what the C# code guarantees with its SemaphoreSlim(1, 1), here AsyncLock: two
// concurrent asynchronous loads of the same reference load the document once and return the same
// document; RemoveDocument while an asynchronous load holds the lock is deferred until that load
// ends (MakePendingRemove). The web server test/services/extref-server.mjs runs in this process
// (on a port of its own) and counts the requests.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import '../../src/engine/index.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { ServiceLocator } from '../../src/engine/services/ServiceLocator.js';
import { ExternalReferenceResolver } from '../../src/services/ExternalReferenceResolver.js';
import { AsyncLock, SemaphoreFullException } from '../../src/system/AsyncLock.js';
import { from } from '../../src/system/linq.js';
import { EXTREF_PORT, startExtRefServer } from './extref-server.mjs';
import { casesDir } from './extref-run.js';

// A port of its own, so that this file can run in parallel with extref.oracle.test.ts.
const port = EXTREF_PORT + 1;
const EXTREF_BASE = `http://127.0.0.1:${port}`;
let server: Awaited<ReturnType<typeof startExtRefServer>> | null = null;
let resolver: ExternalReferenceResolver;
const loaded: CAEXDocument[] = [];

beforeAll(async () => {
  server = await startExtRefServer(casesDir, port);
});
afterAll(async () => {
  await server?.close();
});
beforeEach(() => {
  resolver = ExternalReferenceResolver.register();
});
afterEach(() => {
  for (const d of loaded.splice(0).reverse()) d.unload();
  ServiceLocator.unRegister(ExternalReferenceResolver as any);
});

function main(): CAEXDocument {
  const d = CAEXDocument.loadFromFile(join(casesDir, 'Main.aml'));
  loaded.push(d);
  return d;
}

function addRef(d: CAEXDocument, alias: string, path: string): any {
  const er = d.caexFile!.externalReference.append() as any;
  er.alias = alias;
  er.path = path;
  return er;
}

const ref = (d: CAEXDocument, alias: string): any => from(d.caexFile!.externalReference as Iterable<any>).first((e: any) => e.alias === alias);

describe('ExternalReferenceResolver: concurrent calls', () => {
  it('two concurrent loads of the same reference load the document once and return the same document', async () => {
    const m = main();
    const path = '/slow/300/files/libs/Lib3.aml';
    server!.counts.delete(path);
    const er = addRef(m, 'H', EXTREF_BASE + path);
    const [a, b] = await Promise.all([resolver.loadOrGetReferencedDocumentAsync(er), resolver.loadOrGetReferencedDocumentAsync(er)]);
    expect(server!.counts.get(path)).toBe(1);
    expect(a.document).not.toBeNull();
    expect(b.document).toBe(a.document);
    expect(a.message).toBeNull();
    expect(b.message).toBeNull();
    expect(a.document!.caexFile!.fileName).toBe('Lib3.aml');
  });

  it('concurrent loads of two references wait for each other (first in, first out)', async () => {
    const m = main();
    const order: string[] = [];
    const slow = addRef(m, 'S', EXTREF_BASE + '/slow/200/files/libs/Lib3.aml');
    const fast = addRef(m, 'F', EXTREF_BASE + '/files/libs/Lib2.aml');
    await Promise.all([
      resolver.loadOrGetReferencedDocumentAsync(slow).then(() => order.push('slow')),
      resolver.loadOrGetReferencedDocumentAsync(fast).then(() => order.push('fast')),
    ]);
    expect(order).toEqual(['slow', 'fast']);
  });

  it('RemoveDocument during a pending asynchronous load is deferred until the load ends', async () => {
    const m = main();
    const l1 = resolver.loadOrGetReferencedDocument(ref(m, 'L1')).document!;
    expect(l1.caexFile!.fileName).toBe('Lib1.aml');
    const pending = resolver.loadOrGetReferencedDocumentAsync(addRef(m, 'H', EXTREF_BASE + '/slow/300/files/libs/Lib3.aml'));
    // The lock is held: the removal of the referencing document waits.
    resolver.removeDocument(m);
    expect(l1.xDocument).not.toBeNull();
    expect([...resolver.resolvedDocuments(m)].map((d) => d.caexFile!.fileName)).toEqual(['Lib1.aml']);
    const r = await pending;
    expect(r.message).toBeNull();
    // MakePendingRemove in the finally block of the load removes Main, and with it every document
    // only Main references: Lib1 and the Lib3 just loaded (returned already unloaded).
    expect(l1.xDocument).toBeNull();
    expect(r.document!.xDocument).toBeNull();
    expect([...resolver.resolvedDocuments(m)]).toEqual([]);
  });

  it('unloading the referencing document during a pending load is deferred as well (the engine calls RemoveDocument)', async () => {
    const m = main();
    const l1 = resolver.loadOrGetReferencedDocument(ref(m, 'L1')).document!;
    const pending = resolver.loadOrGetReferencedDocumentAsync(addRef(m, 'H', EXTREF_BASE + '/slow/200/files/libs/Lib3.aml'));
    loaded.splice(loaded.indexOf(m), 1);
    m.unload();
    expect(l1.xDocument).not.toBeNull();
    expect(resolver.resolveExternalDocument('libs/Lib1.aml').document).toBe(l1);
    await pending;
    expect(l1.xDocument).toBeNull();
    expect(resolver.resolveExternalDocument('libs/Lib1.aml').document).toBeNull();
  });

  it('unloading an external document during a pending load: the deferred removal finds nothing', async () => {
    // As in C#: XDocumentWrapper.Unload passes the XDocument to RemoveDocument and then clears it,
    // so the deferred Unload(XDocumentWrapper) of the registry no longer finds the document.
    const m = main();
    const l1 = resolver.loadOrGetReferencedDocument(ref(m, 'L1')).document!;
    const pending = resolver.loadOrGetReferencedDocumentAsync(addRef(m, 'H', EXTREF_BASE + '/slow/200/files/libs/Lib3.aml'));
    l1.unload();
    await pending;
    expect(resolver.resolveExternalDocument('libs/Lib1.aml').document).toBe(l1);
    expect(l1.xDocument).toBeNull();
  });

  it('without a pending load RemoveDocument acts at once', () => {
    const m = main();
    const l1 = resolver.loadOrGetReferencedDocument(ref(m, 'L1')).document!;
    resolver.removeDocument(m);
    expect(l1.xDocument).toBeNull();
  });

  it('a synchronous call during a pending load runs without the lock and processes the deferred removals (port)', async () => {
    // C# blocks the synchronous call until the asynchronous one releases the lock; a synchronous
    // JavaScript call cannot wait (docs/port-notes/services-extref.md, "The lock").
    const m = main();
    const l1 = resolver.loadOrGetReferencedDocument(ref(m, 'L1')).document!;
    const pending = resolver.loadOrGetReferencedDocumentAsync(addRef(m, 'H', EXTREF_BASE + '/slow/200/files/libs/Lib3.aml'));
    resolver.removeDocument(m);
    expect(l1.xDocument).not.toBeNull();
    const l2 = resolver.loadOrGetReferencedDocument(ref(m, 'L2'));
    // Its MakePendingRemove removes Main and the documents Main references, Lib2 included.
    expect(l2.message).toBeNull();
    expect(l2.document!.xDocument).toBeNull();
    expect(l1.xDocument).toBeNull();
    await pending;
  });

  it('RegisterExternalDocumentAsync holds the lock; its deferred removals wait for the next load', async () => {
    const m = main();
    const l1 = resolver.loadOrGetReferencedDocument(ref(m, 'L1')).document!;
    const lib2 = CAEXDocument.loadFromFile(join(casesDir, 'libs', 'Lib2.aml'));
    const registering = resolver.registerExternalDocumentAsync(ref(m, 'L2'), lib2, 'libs/Lib2.aml');
    resolver.removeDocument(m);
    expect(await registering).toBe(lib2);
    // RegisterExternalDocumentAsync does not call MakePendingRemove (as in C#).
    expect(l1.xDocument).not.toBeNull();
    await resolver.loadOrGetReferencedDocumentAsync(ref(m, 'MISS'));
    expect(l1.xDocument).toBeNull();
  });
});

describe('AsyncLock (SemaphoreSlim(1, 1))', () => {
  it('enters at once when free, queues waiters first in, first out and hands the lock over', async () => {
    const lock = new AsyncLock();
    expect(lock.currentCount).toBe(1);
    await lock.waitAsync();
    expect(lock.currentCount).toBe(0);
    expect(lock.tryWait()).toBe(false);
    const order: number[] = [];
    const w1 = lock.waitAsync().then(() => order.push(1));
    const w2 = lock.waitAsync().then(() => order.push(2));
    expect(lock.release()).toBe(0);
    expect(lock.currentCount).toBe(0);
    await w1;
    expect(lock.release()).toBe(0);
    await w2;
    expect(order).toEqual([1, 2]);
    expect(lock.release()).toBe(0);
    expect(lock.currentCount).toBe(1);
    expect(() => lock.release()).toThrow(SemaphoreFullException);
    expect(lock.tryWait()).toBe(true);
    expect(lock.currentCount).toBe(0);
  });

  it('honours the initial and the maximum count', () => {
    const lock = new AsyncLock(0, 2);
    expect(lock.tryWait()).toBe(false);
    expect(lock.release()).toBe(0);
    expect(lock.release()).toBe(1);
    expect(() => lock.release()).toThrow(
      'Adding the specified count to the semaphore would cause it to exceed its maximum count.',
    );
  });
});

describe('ExternalReferenceResolver: calls that do not return in C# (port only)', () => {
  it('a redirection of an absolute address to itself throws instead of looping', async () => {
    // RedirectionAddress of the original loops forever (docs/deviations.md, calls that do not return).
    const m = main();
    const self = EXTREF_BASE + '/files/libs/Self.aml';
    resolver.setRedirection(self, self);
    const message = `The redirection of '${self}' leads back to itself.`;
    expect(() => resolver.getAddressWithRedirection(self, m.caexFile)).toThrow(message);
    const er = addRef(m, 'S', self);
    expect(resolver.loadOrGetReferencedDocument(er)).toEqual({ document: null, message });
    expect(await resolver.loadOrGetReferencedDocumentAsync(er)).toEqual({ document: null, message });
    expect(() => resolver.resolveExternalDocument(self, false)).toThrow(message);
    await expect(resolver.resolveExternalDocumentAsync(self, false)).rejects.toThrow(message);
    // a relative address redirected to itself is no cycle: the redirection is a file path
    resolver.setRedirection('self.aml', 'self.aml');
    expect(resolver.getAddressWithRedirection('self.aml', m.caexFile)).toBe('self.aml');
  });
});
