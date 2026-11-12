# Coverage notes: services-extref

Area: `ExternalReferenceResolver`, `GitHubAccessService` and `GitHubReferenceResolver` of
Aml.Engine.Services 4.3.1 (`src/services/ExternalReferenceResolver.ts`, `GitHubAccessService.ts`,
`GitHubReferenceResolver.ts`), the registries of `src/services/generique/` as far as the resolver
uses them, `src/system/AsyncLock.ts`, `Uri.getComponents` (`src/system/Uri.ts`) and the engine
paths that call the resolver (alias paths in FindByPath and FindByID, `ExternalReference.ExternalDocument`,
base classes from external libraries, IsExternal when references are set or classes inserted).

Files: `oracle/ServicesExtRefOracle.cs` (`svc-extref <casesDir> <outDir> <baseUrl>`, outputs
`test/oracle-out/services/extref.json`, `extref-uri.json`; with `ORACLE_LIVE=1` `extref-live.json`),
`scripts/gen-services-extref.mjs` (seed 3682) writing `test/services/extref/` (the AML files of the
cases, `cases.json`, `live.json`, `uris.json`), the web server `test/services/extref-server.mjs`
(fixed port 48217 on 127.0.0.1; routes for files, status codes, redirects, slow answers, wrong
content, basic authentication and an echo of the request), the step runner
`test/services/extref-run.ts` and the tests `test/services/extref.oracle.test.ts`,
`test/services/extref-concurrency.test.ts` and `test/services/github.live.test.ts`.

## What is compared

75 scripted cases with 1,788 steps. The oracle and the port run the same steps and record one line
per step: the result (documents as file name, file path and an identity number per case, so that
"the same document" is compared; tuples with the message; exceptions as `!Name: message`, an
AggregateException from a synchronous method as `!AggregateException[message]` (its message has the
.NET format) followed by its inner exception), with the case folder, the corpus folder and the base
URL of the server replaced and GUIDs canonicalized.

- Every public member of the resolver, synchronous and asynchronous: LoadOrGetReferencedDocument
  (both overloads; relative, absolute, file URI, http(s), ftp, mailto and urn addresses, missing
  files, files that are not XML, empty files, documents without FileName, a second document with
  the FileName of a loaded one, references without path or outside a document, null),
  ResolveExternalDocument with and without cache, CanResolve, Set/ClearRedirection (relative,
  absolute, file URI and http targets, chains, null and empty keys and values, the
  `_AMLExternalLibraries` doubling, the case-insensitive keys), the internal
  GetAddressWithRedirection (reflection), RegisterResolverFunction (logging, loading, throwing,
  null), IsExternal, IsExternalReferenceRegistered, RegisterExternalDocument(+Async),
  ResolvedDocuments, UnloadExternalDocument, UnloadDocument, RemoveDocument (directly and through
  unloading documents, with shared and nested external documents), GetResponseFromWebServerAsync,
  Register/UnRegister (the original keeps the service registered: UnRegister removes the wrong key)
  and NoSynchronizationContextScope.
- http: success, 404, 500, 63 status codes (the HttpStatusCode names in the messages), redirects
  (301, 302, 303, 307, 308, chains of 2, 19 and 25), slow answers, content that is not XML, a
  refused connection (IPv4 and IPv6), an unknown host, TLS against a plain http server, query and
  fragment, user info (the Authorization header the server receives, also the `Basic Og==` the
  original sends without user info) and the request target the server receives (escaping).
- Engine paths: FindByPath and FindByID with aliases (found, missing, unknown alias, alias of a
  missing file), ExternalReference.ExternalDocument, BaseClass, SystemUnitClass and RoleClass of
  classes, instances, interfaces and supported role classes derived from external classes,
  chains across documents, setting base classes to external classes (IsExternal gives the alias),
  inserting a class of an external document (references rewritten, ExternalReference added), the
  same without a registered resolver.
- The corpus: 34 documents with external references; every file reference is resolved (the
  http(s) ones are skipped, they need the internet) and up to 20 alias paths of the document are
  queried with FindByPath.
- GitHub without network: IsGitHubPath, FindGitHubParameters, TryParseRawGitHub and
  TryParseBlobGitHub (reflection) for 94 URLs (54 written, 40 generated), Register and Unregister
  (argument checks, the kept resolver with a token, the registered paths), LoadOrGetReferencedDocumentAsync
  and GetResponseFromGitServerAsync where they make no request, GitHubReferenceResolver (token,
  GitHubFileExists without request), RegisterExternalDocument and UnregisterExternalDocument
  (obsolete), the service in the ServiceLocator.
- `Uri.getComponents`: 77 URIs (47 written, 30 generated) x 45 component masks (every component,
  the named combinations, KeepDelimiter, random combinations) x 5 formats (the three valid ones,
  0 and 4); 14,027 lines (relative URIs and constructor failures have only the constructor line).

Live (`AMLENGINE_LIVE=1`, oracle with `ORACLE_LIVE=1`; run once, unauthenticated): raw and blob URLs
of github.com/AutomationML/AML-UA-XSLT, a missing file, a repository that is not registered,
GitHubFileExists, LoadOrGetReferencedDocumentAsync of the service (cached, connect) and of the
resolver with the GitHub service registered, GetResponseFromGitServerAsync (200 and 404), the cache
of the service on unregistering. 22 steps, about ten API requests per run.

Concurrency (no oracle possible, `extref-concurrency.test.ts`, its own port 48218): two concurrent
asynchronous loads of the same reference make one request and return the same document; queued
loads keep their order; RemoveDocument and unloading during a pending load are deferred until the
load ends (and a deferred removal of an external document unloaded meanwhile finds nothing, as the
C# code does); RegisterExternalDocumentAsync holds the lock without processing the deferred
removals; the documented port behaviour of a synchronous call during a pending load; AsyncLock; the
redirection of an absolute address to itself (port only, see below).

## Results

All lines equal, except the documented deviations below, which the test expects exactly (15 steps
marked in `cases.json`; a mark whose line the original gives as well fails the test). Test
duration: about 35 s for the oracle test and the concurrency test together (25 s of it loading the
modules), the live test about 20 s. Oracle run: about 40 s (one lookup of an unknown host name).

## Deviations

- Synchronous calls that need the network (LoadOrGetReferencedDocument, ResolveExternalDocument,
  CanResolve, ExternalReference.ExternalDocument and the engine queries on http(s) or GitHub
  addresses): the original sends the request, the port sends none. CanResolve gives false and
  leaves the message unchanged, as the original does for a failed request (null response);
  LoadOrGetReferencedDocument and ResolveExternalDocument give no document with the message "Error
  sending the request for {uri}" and the NotSupportedException text (the original reports a failed
  request with "{status}: no response for {uri}"). The port does not record such an address as
  unresolved, so a later asynchronous call loads it (decision of this
  verification; the original records every failed address). Marked steps: the synchronous call
  itself, and where the original's unresolved record or cache shows afterwards (a later asynchronous
  call sends the request, ResolveExternalDocumentAsync loads instead of returning the cached document
  with the message field).
- A 407 answer: fetch turns it into a network error (Fetch standard), HttpClient returns it: the
  message has no status name.
- More than 20 redirects: fetch fails, HttpClient follows up to 50.
- `'` in the query of an http(s) URL: fetch escapes it (WHATWG URL), HttpClient sends it as is.
- `Uri.getComponents` with `NormalizedHost` (IdnMapping) is not ported: the port throws
  NotSupportedException for every mask with that bit and a valid format (1 to 3); an invalid format
  gives the ArgumentOutOfRangeException of .NET. SerializationInfoString throws
  NotSupportedException as well (not in the cases).
- A redirection of an absolute address to itself makes the original loop forever; the port throws
  InvalidOperationException, wrapped in an AggregateException by the synchronous
  ResolveExternalDocument (checked in the concurrency test file, not in the oracle).

The text for users is in docs/deviations.md ("Synchronous calls that need the network", and
`GetComponents` under "Not ported").

## Port errors fixed

- `src/system/Uri.ts`: GetComponents with an invalid UriFormat threw ArgumentException instead of
  ArgumentOutOfRangeException ("uriFormat").
- `src/xml/XmlParser.ts`: "Root element is missing." had line information; .NET throws it without
  (an empty file loaded through the resolver).
- `src/services/ExternalReferenceResolver.ts`, `src/services/generique/ExternalDocumentRegistry.ts`:
  the case-insensitive keys of the redirections and URLs ignored the white space controls (TAB, LF,
  VT, FF, CR, NEL) and compared the case of full width letters.
- `src/services/ExternalReferenceResolver.ts`: a synchronous call that fails only because it would
  need the network no longer records the address as unresolved (the change above); the flag is a
  return value of the synchronous documentFromURL, so a re-entrant resolver function cannot change it.
- `src/services/ExternalReferenceResolver.ts`: the synchronous twins threw the exception of the
  asynchronous method itself; C# blocks on `.Result` and wraps it in an AggregateException
  (ResolveExternalDocument of a file that is not XML or has no FileName, a throwing resolver
  function). AggregateException moved from UniqueNameService to `src/system/exceptions.ts`. The
  oracle no longer unwraps it.
- `src/services/ExternalReferenceResolver.ts`: the synchronous CanResolve on an http(s) address
  set the message of the catch block; C# reaches the null response path, which leaves it unchanged.
- `src/system/Uri.ts`: with NormalizedHost and format 0, GetComponents threw NotSupportedException
  before the format check; .NET throws ArgumentOutOfRangeException ("uriFormat").

## Not covered, and why

- `ExternalReferenceResolver.ts` (98.4 % of the statements with the live test): the `catch` of
  cancelling an unread body, `load` returning the registered document (RegisterExternalDocument looks
  the name up before), `IsExternalReferenceRegistered` with a null value in the reference dictionary
  (CreateNew never gives null), the repeated cache check of the synchronous ResolveExternalDocument,
  the `catch` of CanAccessAsync (GetResponseFromWebServerAsync never throws, as in C#), the private
  constructor of the static class NoSynchronizationContextScope. The GitHub branch of
  GetResponseFromWebServerAsync is covered by the live test only.
- `GitHubAccessService.ts` (94.4 % with the live test): the Bearer header (needs a token), the
  `catch` of a failing request to api.github.com, the search of a cached document by file path when
  one matches, the empty branch of GetAccessParameters (its caller checks first).
- `GitHubReferenceResolver.ts` (86.4 % with the live test): the token client and its header (needs a
  token), the replacement of the client in GetClient (the token never changes), Octokit's argument
  check and error mapping for failing API answers other than 404, an empty or non-JSON answer of
  GetAllContentsByRef, URLs that are neither raw nor blob URLs of a registered repository
  (FindCorrespondingResolver rejects them before).
- `generique/` (registry 94.7 %, ExternalDocument 100 %): `ExternalDocumentRegistry.Unload(string)`
  is never called (C# internal, unused); `DocumentReference` is not used by any service (0 %);
  `DocumentReferenceDictionary.IsLoaded`, `removeDisposed`/`ClearDisposed`, the null and
  "already registered" branches of GetOrLoadValue are not reached from the resolver (it looks up
  before and always sets CreateNew).
- `AsyncLock.ts`: 100 %.
