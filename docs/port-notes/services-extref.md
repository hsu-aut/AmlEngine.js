# Port notes: Aml.Engine.Services external references and GitHub access

Files: `src/services/ExternalReferenceResolver.ts` (with the nested static class
NoSynchronizationContextScope and its struct DisposableSynchronizationContext),
`src/services/GitHubAccessService.ts`, `src/services/GitHubReferenceResolver.ts`
(Aml.Engine.Services 4.3.1), and the helper `src/system/AsyncLock.ts` (SemaphoreSlim). The
resolver loads the documents that ExternalReference elements point to (local files, http(s),
GitHub through the GitHub service), keeps them in the registry of `src/services/generique/`, and
applies redirections of reference paths. The GitHub service holds one resolver per registered
repository and loads documents through the GitHub REST API.

## API decisions

- **ExternalReferenceResolver** implements IExternalReferenceResolverAsync,
  IExternalReferenceResolver, IAMLService, IXMLDocumentRegistry and IXMLExternalUnload and registers
  all five. The constructor is private as in C#; `register()` registers the service under the class
  (key "ExternalReferenceResolver", as `Register<ExternalReferenceResolver>`), `unRegister()`
  unloads all documents and calls `ServiceLocator.unRegister('IExternalReferenceResolver')`.
- **Overloads**: `loadOrGetReferencedDocument(Async)(x, path?)` is the (document, path) overload
  when called with two arguments or with a CAEXDocument, the (externalReference) overload
  otherwise. `clearRedirection()` without argument is `ClearRedirection()`, with an argument (also
  null) `ClearRedirection(address)`. `isExternal(document, element)` returns `{ result, alias,
  path }`; tuple results are `{ document, message }`.
- **Internal members** are public and marked `@internal`: `getAddressWithRedirection`,
  `GitHubReferenceResolver.loadOrGetReferencedDocument` (async without the suffix, as in C#),
  `GitHubReferenceResolver.findGitHubParameters` (returns `{ userName, repositoryName, path,
  gitRef }`), `userName` and `repositoryName` (internal readonly fields).
- **NoSynchronizationContextScope** is exported as `ExternalReferenceResolver_NoSynchronizationContextScope`
  and attached as `ExternalReferenceResolver.NoSynchronizationContextScope`; the struct is
  `ExternalReferenceResolver_NoSynchronizationContextScope_DisposableSynchronizationContext` (also
  attached to the scope class). `enter()` returns the disposable; `dispose()` does nothing, since
  JavaScript has no synchronization context. The resolver's own `using (...Enter())` blocks around
  `.Result` are dropped (no effect).
- **Not ported**: the static HttpClient (`_webClient`, internal `WebClient`), the unused
  `_myTaskFactory`, the HttpClient of GitHubAccessService. Each request is one `fetch` with the
  headers the C# code sets on its client right before the request.
- **getResponseFromWebServerAsync(uri: Uri)** is public static and resolves to a `Response` or
  null. `uri.GetComponents(HttpRequestUrl, UriEscaped)` and `GetComponents(UserInfo, UriEscaped)`
  use the new `Uri.getComponents` (engine changes); the Basic header uses Encoding.ASCII
  (characters above U+007F become '?') and `toBase64String`.
- **Status codes** in messages (`{response?.StatusCode}`) are the .NET 8 HttpStatusCode names, from
  a table checked against `((HttpStatusCode)i).ToString()` for 100 to 599 (for shared values .NET
  gives MultipleChoices, MovedPermanently, Found, SeeOther, RedirectKeepVerb, UnprocessableEntity);
  an unnamed code is its number, a null response "".
- **Disposal** of an HttpResponseMessage (`using`) cancels the body of a response that was not read.
- **NameValueCollection** (`_redirections`) is a module-private class: `item` (null for a missing
  key), `setItem` (one value per key), `remove`, `clear`; keys are folded for
  InvariantCultureIgnoreCase like InvariantIgnoreCaseDictionary of the engine (the generique
  registry uses the same folding); a null key is allowed. `HashSet<string>` fields are JS `Set`s
  (ordinal, null allowed; never enumerated in an order that matters). The ConcurrentBag of removed
  documents is an array enumerated from the most recently added document (ConcurrentBag on one
  thread). The ConcurrentDictionary fields of GitHubAccessService are Maps enumerated in insertion
  order; the C# order depends on randomized string hashing and is not specified (it only decides
  which of several cached documents with the same FilePath UnregisterExternalDocument removes).
- **GitHubAccessService** is a singleton (`GitHubAccessService.instance`, created on first use like
  the Lazy of C#) with a private constructor; RegisterExternalDocument and
  UnregisterExternalDocument are `@deprecated` (Obsolete). `getResponseFromGitServerAsync` sends
  `User-Agent: AMLEngine/1.0`, `Authorization: Bearer <token>` (if the repository has one) and
  `Accept: application/vnd.github.v3.raw`; the request string is parsed as a System.Uri first, as
  HttpClient.GetAsync(string) does, and its `absoluteUri` is fetched. The catch block writes
  "Request error: " + message with `console.log` (Console.WriteLine).
- **GitHubReferenceResolver** replaces Octokit by module-private classes: `GitHubClient`
  (`getRawContentByRef`, `getAllContentsByRef`, `credentials`), `Credentials` (`anonymous`,
  `password`), `ApiException` and `NotFoundException`. The requests are the ones of
  docs/PORTING.md: `GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref}`
  with `Accept: application/vnd.github.v3.raw` (raw bytes) or `application/vnd.github.v3+json`
  (a single object counts as a list of one, as Octokit wraps it), `Authorization: token <token>`
  for non-anonymous credentials, Octokit's argument checks (`Ensure.ArgumentNotNullOrEmptyString`).
  Every Octokit exception is caught by the C# code, so none of them leaves the module.

## Asynchronous and synchronous methods

The …Async methods are asynchronous and use fetch (and node:fs through the engine for files).
Each synchronous method of the C# class blocks on `XxxAsync(...).Result`; the port runs the same
steps without awaiting. The parts after the http(s) branch of CanAccessAsync and
DocumentFromURLAsync complete synchronously in C# and are shared helpers of both twins
(`canAccessWithoutHttp`, `documentFromURLWithoutHttp`); LoadOrGetReferencedDocumentAsync(reference)
and ResolveExternalDocumentAsync are written twice (async and synchronous), side by side.

Places where a synchronous twin would need the network (for docs/deviations.md):

| Synchronous method | C# awaits | Port |
|---|---|---|
| `canResolve` (CanAccessAsync, http/https) | GetResponseFromWebServerAsync | the catch block around that await: message "Error sending the request for {uri}", false |
| `loadOrGetReferencedDocument` (both overloads; DocumentFromURLAsync, http/https) | GetResponseFromWebServerAsync | the catch block around that await: message "Error sending the request for {uri}\n" + the message of a NotSupportedException ("Synchronous access to '{uri}' needs the network; use the asynchronous methods."), no document; the result is (null, that message); the address is not recorded as unresolved |
| `resolveExternalDocument` (DocumentFromURLAsync, http/https) | the same | the same catch block; the result is (null, "can not find file for {url}"); the URL is not recorded as unresolved |
| all FTP branches, asynchronous ones included (FtpWebRequest RETR) | (blocking request) | FTP is not supported: the catch block of the FTP request, "Error sending the request for {uri}" (false or no document) |

Strictly, GetResponseFromWebServerAsync never throws in C# (its catch block returns null), so a
failing request there gives ": no response for {uri}". The synchronous twins take the catch block
around the await instead, so that the message says why the request did not happen. GitHub
addresses go through GetResponseFromWebServerAsync as well and take the same path.

Such a failure comes from the platform, not from the address, so the synchronous twins of
LoadOrGetReferencedDocument and ResolveExternalDocument do not record the address in
`_unresolvedExternalDocumentByURL` (`_syncNetworkFailure`, port only): a later asynchronous call
for the same address sends the request and loads the document, which later synchronous calls then
get from the registry. A request that fails in an asynchronous call is recorded as in C#.

**The lock.** SemaphoreSlim(1, 1) is an `AsyncLock`. RemoveDocument defers removals while the
lock is held (`currentCount === 0 && !_allowAccess`), and MakePendingRemove processes them in the
finally block of LoadOrGetReferencedDocumentAsync, as in C#. A synchronous twin cannot wait for
the lock: it takes the lock when it is free (`tryWait`, SemaphoreSlim.Wait(0)) and releases it at
the end; while an asynchronous call holds it (suspended at an await), the synchronous call runs at
once without the lock, and its MakePendingRemove also processes the removals the asynchronous call
deferred. C# would block until the lock is released.

**AsyncLock** (`src/system/AsyncLock.ts`): `waitAsync()` enters at once when the count is positive
(the count drops before the promise settles, as SemaphoreSlim does for an uncontended
WaitAsync), otherwise queues the caller; waiters are served first in, first out; `release()` hands
the lock to the first waiter (the count stays 0), returns the previous count and throws
SemaphoreFullException above the maximum; `tryWait()` is Wait(0). Unlike C#, a JS `await` on the
already resolved promise continues in a later microtask, but the lock is already held then.

## Errors of the original kept

Marked `// Aml.Engine:` in the code:

- `ExternalReferenceResolver.UnRegister` removes the key "IExternalReferenceResolver", but
  `Register` stored the service under "ExternalReferenceResolver": the service stays registered
  (with its documents unloaded). MergeService starts and ends the service this way.
- `GetComponents(UserInfo)` is "" (never null) for a URI without user info, so every http(s)
  request sends `Authorization: Basic Og==` (empty user name and password). In a browser this header
  makes every cross-origin request need a CORS preflight; some servers answer 401.
- RedirectionAddress sets `isRedirected = false` when it follows a redirection to an absolute
  address that is not a file and finds no further redirection, so GetAddressWithRedirection returns
  the original address: redirections to http(s) addresses are ignored.
- ResolveExternalDocument(Async) returns a cached document with the `message` field (the message
  of an earlier call of any method, initially "") instead of null.

Kept without a mark (behaviour, not clearly an error): the `message` field is shared by all calls
(LoadOrGetReferencedDocumentAsync returns what DocumentFromURLAsync or a concurrent CanResolveAsync
left in it; in JS concurrent calls interleave at awaits as well); RegisterExternalDocumentAsync
does not call MakePendingRemove, so removals deferred while it holds the lock wait for the next
LoadOrGetReferencedDocumentAsync; user info with more than one ':' gives an empty password;
GitHubAccessService.Register keeps an existing resolver that has a token; Unregister removes every
registered path that contains the repository name anywhere, and fails on a null path registered by
RegisterExternalDocument (NullReferenceException in C#, TypeError here).

## Deviations (for docs/deviations.md)

- The synchronous network places and the lock above.
- FTP is not supported (also in the asynchronous methods).
- A redirection of an absolute (not file) address to itself (`setRedirection(a, a)`) makes
  RedirectionAddress loop forever in C#. The port detects the repeated address and throws
  InvalidOperationException ("The redirection of '{address}' leads back to itself."), following
  "Calls that do not return: the port throws". It is the only cycle SetRedirection allows (it
  refuses a target that is redirected itself). LoadOrGetReferencedDocument(Async) catches it and
  returns its message; ResolveExternalDocument(Async) lets it through.
- fetch instead of HttpClient: no timeout (HttpClient: 100 s), at most 20 redirects (HttpClient:
  50, and no https to http redirect), error messages of failed requests come from the JS runtime
  (they appear in "Error sending the request for {uri}\n…" only when reading the body fails, and in
  the "Request error: …" console output of the GitHub service). fetch parses the escaped URL again
  (WHATWG URL), which escapes a few characters .NET leaves as they are (`'` in the query of
  http(s) URLs). In browsers CORS applies and the User-Agent header may be ignored.
- Octokit sends `User-Agent: AMLEngine (<platform>; <architecture>; <culture>; Octokit <version>)`;
  the port sends `User-Agent: AMLEngine`.

## Engine changes

- `src/system/Uri.ts`: exported enums `UriComponents` and `UriFormat` and
  `Uri.getComponents(components, format)` for absolute URIs (it calls the existing port of
  GetComponentsHelper, as .NET does for the built-in syntaxes, which are the only ones of the port;
  SerializationInfoString is not ported). Header comment updated. Checked by hand against .NET 8 for
  HttpRequestUrl and UserInfo on three URIs (spaces, user info with port 80 and dot segments, user
  without password, fragments).
- New `src/system/AsyncLock.ts` (`AsyncLock`, `SemaphoreFullException`); not exported from
  `src/system/index.ts`.

## Verification against the original

Done (docs/coverage-notes/services-extref.md): scripted cases against the original with files and a
local web server, the synchronous network places, the lock (concurrency test, no oracle), the GitHub
parsing and, live, the GitHub requests; `Uri.getComponents` for 77 URIs. The key folding now
keeps the white space controls (TAB, LF, VT, FF, CR, NEL) and folds the case of full width forms, as
the original does; it stays an approximation of the ICU collation for characters not tested.
