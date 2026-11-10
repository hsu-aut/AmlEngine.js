// Port of Aml.Engine.Services.GitHubAccessService (Aml.Engine.Services 4.3.1).
//
// HttpClient becomes fetch (one request per call with the headers the C# code sets on its client
// before each request); HttpResponseMessage becomes the fetch Response. The ConcurrentDictionary
// fields are Maps (enumerated in insertion order; the order of the C# dictionary is not specified).

import '../engine/index.js';
import { registerInterfaces } from '../engine/interfaces.js';
import { CAEXWrapper } from '../engine/caex/CAEXWrapper.js';
import { ServiceLocator } from '../engine/services/ServiceLocator.js';
import { ArgumentException } from '../system/exceptions.js';
import { from } from '../system/linq.js';
import { equalsOrdinalIgnoreCase, isNullOrEmpty, isNullOrWhiteSpace, toLowerInvariant } from '../system/strings.js';
import { Uri, UriKind } from '../system/Uri.js';
import { GitHubReferenceResolver } from './GitHubReferenceResolver.js';
import type { CAEXDocument } from '../engine/caex/CAEXDocument.js';
import type { ExternalReferenceType } from '../engine/caex/ExternalReferenceType.js';
import type { IGitHubAccessService } from '../engine/services/interfaces/IGitHubAccessService.js';

/** string.StartsWith(value, StringComparison.OrdinalIgnoreCase). */
function startsWithOrdinalIgnoreCase(s: string, value: string): boolean {
  return s.length >= value.length && equalsOrdinalIgnoreCase(s.substring(0, value.length), value);
}

/** string.IndexOf(value, StringComparison.OrdinalIgnoreCase). */
function indexOfOrdinalIgnoreCase(s: string, value: string): number {
  const n = s.length - value.length;
  for (let i = 0; i <= n; i++) {
    if (equalsOrdinalIgnoreCase(s.substring(i, i + value.length), value)) {
      return i;
    }
  }
  return -1;
}

/**
 * Provides a singleton service for accessing GitHub-related functionality. Use
 * {@link GitHubAccessService.instance} to access the shared instance of the service.
 */
export class GitHubAccessService implements IGitHubAccessService {
  /** Lazy<GitHubAccessService> ServiceInstance. */
  private static serviceInstance: GitHubAccessService | null = null;

  private readonly _resolvers = new Map<string, GitHubReferenceResolver>();

  private readonly _externalDocuments = new Map<string, CAEXDocument | null>();

  private readonly _registeredPaths = new Set<string | null>();

  /** Singleton instance of the GitHubAccessService. */
  static get instance(): GitHubAccessService {
    return (GitHubAccessService.serviceInstance ??= new GitHubAccessService());
  }

  private constructor() {}

  /**
   * Registers a new GitHub repository and creates a corresponding resolver.
   * @throws ArgumentException if the user name or the repository name is null or white space.
   */
  register(userName: string, repositoryName: string, accessToken: string): void {
    if (isNullOrWhiteSpace(userName)) {
      throw new ArgumentException('User name required', 'userName');
    }
    if (isNullOrWhiteSpace(repositoryName)) {
      throw new ArgumentException('Repository name required', 'repositoryName');
    }
    const key = GitHubAccessService.makeKey(userName, repositoryName);
    const newResolver = new GitHubReferenceResolver(userName, repositoryName, accessToken);
    // ConcurrentDictionary.AddOrUpdate: an existing resolver with an access token is kept.
    const existing = this._resolvers.get(key);
    this._resolvers.set(key, existing === undefined ? newResolver : !existing.hasAccessToken() ? newResolver : existing);
  }

  /** Unregisters a GitHub repository and removes the corresponding resolver. */
  unregister(userName: string, repositoryName: string): void {
    if (isNullOrWhiteSpace(userName)) {
      throw new ArgumentException('User name required', 'userName');
    }
    if (isNullOrWhiteSpace(repositoryName)) {
      throw new ArgumentException('Repository name required', 'repositoryName');
    }
    const key = GitHubAccessService.makeKey(userName, repositoryName);
    if (!this._resolvers.delete(key)) {
      return;
    }
    const value2 = 'https://raw.githubusercontent.com/' + userName + '/';
    const value3 = 'https://github.com/' + userName + '/';
    const value4 = '/' + repositoryName + '/';
    for (const item of [...this._externalDocuments.keys()]) {
      if (
        (startsWithOrdinalIgnoreCase(item, value2) || startsWithOrdinalIgnoreCase(item, value3)) &&
        indexOfOrdinalIgnoreCase(item, value4) >= 0
      ) {
        this._externalDocuments.delete(item);
      }
    }
    for (const item2 of [...this._registeredPaths]) {
      // A null path (RegisterExternalDocument accepts one) fails here as in C#.
      if (indexOfOrdinalIgnoreCase(item2 as string, repositoryName) >= 0) {
        this._registeredPaths.delete(item2);
      }
    }
  }

  /** Checks if the provided file reference is a valid GitHub path. */
  isGitHubPath(fileRef: string | null): boolean {
    if (fileRef !== null && fileRef !== undefined) {
      if (!startsWithOrdinalIgnoreCase(fileRef, 'https://github.com')) {
        return startsWithOrdinalIgnoreCase(fileRef, 'https://raw.githubusercontent.com');
      }
      return true;
    }
    return false;
  }

  /** Loads or gets a referenced CAEX document from GitHub. */
  async loadOrGetReferencedDocumentAsync(fileRef: string, connect = false): Promise<{ document: CAEXDocument | null; message: string | null }> {
    if (!this.isGitHubPath(fileRef)) {
      return { document: null, message: 'The provided path is not a valid GitHub path.' };
    }
    if (!connect) {
      const value = this._externalDocuments.get(fileRef);
      if (value !== undefined && !CAEXWrapper.equals(value !== null ? value.caexFile : null, null)) {
        return { document: value, message: '' };
      }
    }
    const gitHubReferenceResolver = this.findCorrespondingResolver(fileRef);
    if (gitHubReferenceResolver === null) {
      return { document: null, message: 'No corresponding GitHub profile found for the provided file reference.' };
    }
    const tuple = await gitHubReferenceResolver.loadOrGetReferencedDocument(fileRef);
    if (tuple.document !== null) {
      if (!connect) {
        this._externalDocuments.set(fileRef, tuple.document);
      }
      return { document: tuple.document, message: tuple.message };
    }
    if (!connect) {
      this._externalDocuments.set(fileRef, null);
    }
    return { document: null, message: 'No corresponding GitHub profile found or file does not exist.' };
  }

  /** @deprecated ExternalDocuments are cached in the ExternalReferenceResolver. */
  registerExternalDocument(externalReference: ExternalReferenceType, document: CAEXDocument, path: string): void {
    if (!this._registeredPaths.has(path)) {
      this._registeredPaths.add(path);
      const externalReferenceResolverService = ServiceLocator.externalReferenceResolverService;
      if (externalReferenceResolverService !== null && !externalReferenceResolverService.isExternalReferenceRegistered(externalReference, path)) {
        externalReferenceResolverService.registerExternalDocument(externalReference, document, path);
      }
    }
  }

  /** @deprecated ExternalDocuments are cached in the ExternalReferenceResolver and unloaded with UnloadExternalDocument method. */
  unregisterExternalDocument(document: CAEXDocument, path: string): void {
    if (isNullOrEmpty(path)) {
      return;
    }
    this._registeredPaths.delete(path);
    if (this._externalDocuments.delete(path)) {
      return;
    }
    let text = '';
    const first = from(this._externalDocuments).firstOrDefault(([, value2]) => (value2 !== null ? value2.filePath : null) === document.filePath);
    if (first !== null) {
      text = first[0];
    }
    if (!isNullOrEmpty(text)) {
      this._externalDocuments.delete(text);
    }
  }

  /** Gets the http response from the GitHub server for the provided git content URL. */
  async getResponseFromGitServerAsync(url: string): Promise<Response | null> {
    try {
      if (isNullOrEmpty(url)) {
        return null;
      }
      const { owner: value, repo: value2, filePath: value3, gitRef: value4, token: text } = this.getAccessParameters(url);
      if (isNullOrEmpty(value)) {
        return null;
      }
      const requestUri = !isNullOrEmpty(value4)
        ? `https://api.github.com/repos/${value}/${value2}/contents/${value3}?ref=${value4}`
        : `https://api.github.com/repos/${value}/${value2}/contents/${value3}`;
      const headers: Record<string, string> = { 'User-Agent': 'AMLEngine/1.0' };
      if (!isNullOrEmpty(text)) {
        headers['Authorization'] = 'Bearer ' + text;
      }
      headers['Accept'] = 'application/vnd.github.v3.raw';
      // HttpClient.GetAsync(string) parses the string as a System.Uri (always absolute here).
      return await fetch(new Uri(requestUri, UriKind.RelativeOrAbsolute).absoluteUri, { headers });
    } catch (ex) {
      console.log('Request error: ' + (ex instanceof Error ? ex.message : String(ex)));
      return null;
    }
  }

  /** Gets the access parameters for the Git URL allowing to create an http request to get the content. */
  private getAccessParameters(fileRef: string | null): {
    owner: string | null;
    repo: string | null;
    filePath: string | null;
    gitRef: string | null;
    token: string | null;
  } {
    if (isNullOrEmpty(fileRef)) {
      return { owner: null, repo: null, filePath: null, gitRef: null, token: null };
    }
    const { userName: text, repositoryName: text2, path: item, gitRef: item2 } = GitHubReferenceResolver.findGitHubParameters(fileRef);
    if (isNullOrEmpty(text) || isNullOrEmpty(text2)) {
      return { owner: null, repo: null, filePath: null, gitRef: null, token: null };
    }
    const key = GitHubAccessService.makeKey(text, text2);
    const value = this._resolvers.get(key) ?? null;
    const item3 = value?.accessToken ?? null;
    return { owner: text, repo: text2, filePath: item, gitRef: item2, token: item3 };
  }

  private findCorrespondingResolver(fileRef: string): GitHubReferenceResolver | null {
    const { userName: text, repositoryName: text2 } = GitHubReferenceResolver.findGitHubParameters(fileRef);
    if (isNullOrEmpty(text) || isNullOrEmpty(text2)) {
      return null;
    }
    const key = GitHubAccessService.makeKey(text, text2);
    const value = this._resolvers.get(key);
    if (value === undefined) {
      return null;
    }
    return value;
  }

  private static makeKey(user: string | null, repo: string | null): string {
    return toLowerInvariant(user ?? '') + '/' + toLowerInvariant(repo ?? '');
  }
}

registerInterfaces(GitHubAccessService as unknown as abstract new () => unknown, 'IGitHubAccessService', 'IAMLService');
