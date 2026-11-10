// Port of Aml.Engine.Services.GitHubReferenceResolver (Aml.Engine.Services 4.3.1).
//
// The C# class uses Octokit. The port sends the REST requests Octokit sends, with fetch:
// GetRawContentByRef(owner, repo, path, ref) is GET
// https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref} with
// `Accept: application/vnd.github.v3.raw` (the bytes of the file), GetAllContentsByRef the same
// request with `Accept: application/vnd.github.v3+json` (a file gives one object, which Octokit
// wraps into a list, a folder an array). Credentials are sent as `Authorization: token <token>`;
// a response that is not successful raises Octokit's ApiException, a 404 its NotFoundException.
// The C# code catches every one of them, so they never leave this module.

import '../engine/index.js';
import { CAEXDocument } from '../engine/caex/CAEXDocument.js';
import { ArgumentException } from '../system/exceptions.js';
import { equalsOrdinalIgnoreCase, isNullOrEmpty, isNullOrWhiteSpace } from '../system/strings.js';
import { Uri, UriKind } from '../system/Uri.js';

/** Octokit.ApiException: the response of an API request was not successful. */
class ApiException extends Error {
  override name = 'ApiException';

  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

/** Octokit.NotFoundException: the API answered 404. */
class NotFoundException extends ApiException {
  override name = 'NotFoundException';
}

/** Octokit.Credentials: anonymous, or an OAuth token (the password of the credentials). */
class Credentials {
  /** Credentials.Anonymous. */
  static readonly anonymous = new Credentials(null);

  constructor(readonly password: string | null) {}
}

/** The part of Octokit.GitHubClient used here (Repository.Content). */
class GitHubClient {
  credentials: Credentials = Credentials.anonymous;

  /** `new GitHubClient(new ProductHeaderValue(productName))`. */
  constructor(private readonly productName: string) {}

  /** Repository.Content.GetRawContentByRef: the bytes of the file. */
  async getRawContentByRef(owner: string, name: string, path: string, reference: string): Promise<Uint8Array> {
    const response = await this.get(owner, name, path, reference, 'application/vnd.github.v3.raw');
    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Repository.Content.GetAllContentsByRef: the entries of a folder, or the file as a list of one
   * entry (only the number of entries is used here); `null` for an empty JSON response.
   */
  async getAllContentsByRef(owner: string, name: string, path: string, reference: string): Promise<unknown[] | null> {
    const response = await this.get(owner, name, path, reference, 'application/vnd.github.v3+json');
    const body = await response.text();
    const mediaType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (mediaType === 'application/json' && !isNullOrEmpty(body) && body !== '{}') {
      // Octokit: "If we're expecting an array, but we get a single object, just wrap it."
      const json = JSON.parse(body.startsWith('{') ? '[' + body + ']' : body) as unknown;
      return Array.isArray(json) ? json : null;
    }
    return null;
  }

  private async get(owner: string, name: string, path: string, reference: string, accept: string): Promise<Response> {
    ensureArgumentNotNullOrEmptyString(owner, 'owner');
    ensureArgumentNotNullOrEmptyString(name, 'name');
    ensureArgumentNotNullOrEmptyString(path, 'path');
    ensureArgumentNotNullOrEmptyString(reference, 'reference');
    const uri = new Uri(`https://api.github.com/repos/${owner}/${name}/contents/${path}?ref=${reference}`, UriKind.Absolute);
    const headers: Record<string, string> = { Accept: accept, 'User-Agent': this.productName };
    if (this.credentials.password !== null) {
      headers['Authorization'] = 'token ' + this.credentials.password;
    }
    const response = await fetch(uri.absoluteUri, { headers });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      const message = response.statusText !== '' ? response.statusText : `HTTP ${response.status}`;
      throw response.status === 404 ? new NotFoundException(message, response.status) : new ApiException(message, response.status);
    }
    return response;
  }
}

/** Octokit's Ensure.ArgumentNotNullOrEmptyString. */
function ensureArgumentNotNullOrEmptyString(value: string | null, name: string): void {
  if (isNullOrWhiteSpace(value)) {
    throw new ArgumentException('String cannot be empty', name);
  }
}

/** string.Trim(char): removes the character from both ends. */
function trimChar(s: string, c: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === c) start++;
  while (end > start && s[end - 1] === c) end--;
  return s.substring(start, end);
}

/** string.EndsWith(value, StringComparison.OrdinalIgnoreCase). */
function endsWithOrdinalIgnoreCase(s: string, value: string): boolean {
  return s.length >= value.length && equalsOrdinalIgnoreCase(s.substring(s.length - value.length), value);
}

/**
 * Provides methods to resolve and load CAEX documents from GitHub repositories using the GitHub
 * REST API.
 */
export class GitHubReferenceResolver {
  private readonly _accessToken: string;

  private _client: GitHubClient;

  /** @internal */
  readonly userName: string;

  /** @internal */
  readonly repositoryName: string;

  /** Gets the access token. */
  get accessToken(): string {
    return this._accessToken;
  }

  /**
   * Resolves and loads CAEX documents from GitHub repositories. Supports checking file existence
   * and downloading files from both raw and blob GitHub URLs.
   */
  constructor(userName: string, repositoryName: string, accessToken: string) {
    this.userName = userName;
    this.repositoryName = repositoryName;
    this._accessToken = accessToken;
    if (!isNullOrWhiteSpace(this._accessToken)) {
      const credentials = new Credentials(this._accessToken);
      this._client = GitHubReferenceResolver.createClient(credentials);
    } else {
      this._client = new GitHubClient('AMLEngine');
    }
  }

  /** Determines whether the file of a GitHub blob URL exists. */
  async gitHubFileExists(blobUrl: string): Promise<boolean> {
    const parsed = GitHubReferenceResolver.tryParseBlobGitHub(new Uri(blobUrl));
    if (!parsed.result) {
      return false;
    }
    const client = this.getClient();
    try {
      const readOnlyList = await client.getAllContentsByRef(parsed.owner, parsed.repo, parsed.path, parsed.gitRef);
      return readOnlyList !== null && readOnlyList.length > 0;
    } catch (e) {
      if (e instanceof NotFoundException) {
        return false;
      }
      return false;
    }
  }

  /** @internal Loads the CAEX document of a GitHub URL. */
  async loadOrGetReferencedDocument(fileRef: string): Promise<{ document: CAEXDocument | null; message: string }> {
    try {
      const resultStream = await this.resourceStreamFromUrlAsync(fileRef);
      const val = await CAEXDocument.loadFromStreamAsync(resultStream, null, false);
      if (val !== null) {
        return { document: val, message: '' };
      }
      return { document: null, message: 'No corresponding GitHub profile found.' };
    } catch (ex) {
      return { document: null, message: ex instanceof Error ? ex.message : String(ex) };
    }
  }

  private async resourceStreamFromUrlAsync(url: string): Promise<Uint8Array | null> {
    const result = Uri.tryCreate(url, UriKind.Absolute);
    if (result === null) {
      return null;
    }
    if (equalsOrdinalIgnoreCase(result.host, 'raw.githubusercontent.com')) {
      const raw = GitHubReferenceResolver.tryParseRawGitHub(result);
      if (!raw.result) {
        return null;
      }
      return await this.downloadWithOctokit(raw.owner, raw.repo, raw.path, raw.gitRef);
    }
    if (endsWithOrdinalIgnoreCase(result.host, 'github.com')) {
      const blob = GitHubReferenceResolver.tryParseBlobGitHub(result);
      if (!blob.result) {
        return null;
      }
      return await this.downloadWithOctokit(blob.owner, blob.repo, blob.path, blob.gitRef);
    }
    return null;
  }

  /** @internal The owner, repository, path and reference of a raw or blob GitHub URL ("" each if none). */
  static findGitHubParameters(fileRef: string | null): { userName: string; repositoryName: string; path: string; gitRef: string } {
    const result = Uri.tryCreate(fileRef, UriKind.Absolute);
    if (result === null) {
      return { userName: '', repositoryName: '', path: '', gitRef: '' };
    }
    if (equalsOrdinalIgnoreCase(result.host, 'raw.githubusercontent.com')) {
      const raw = GitHubReferenceResolver.tryParseRawGitHub(result);
      if (raw.result) {
        return { userName: raw.owner, repositoryName: raw.repo, path: raw.path, gitRef: raw.gitRef };
      }
    }
    if (endsWithOrdinalIgnoreCase(result.host, 'github.com')) {
      const blob = GitHubReferenceResolver.tryParseBlobGitHub(result);
      if (blob.result) {
        return { userName: blob.owner, repositoryName: blob.repo, path: blob.path, gitRef: blob.gitRef };
      }
    }
    return { userName: '', repositoryName: '', path: '', gitRef: '' };
  }

  private static tryParseRawGitHub(uri: Uri): { result: boolean; owner: string; repo: string; gitRef: string; path: string } {
    const array = trimChar(uri.absolutePath, '/').split('/');
    if (array.length < 4) {
      return { result: false, owner: '', repo: '', gitRef: '', path: '' };
    }
    return { result: true, owner: array[0]!, repo: array[1]!, gitRef: array[2]!, path: array.slice(3).join('/') };
  }

  private async downloadWithOctokit(owner: string, repo: string, path: string, gitRef: string): Promise<Uint8Array | null> {
    try {
      return await this.getClient().getRawContentByRef(owner, repo, path, gitRef);
    } catch {
      return null;
    }
  }

  private static tryParseBlobGitHub(uri: Uri): { result: boolean; owner: string; repo: string; gitRef: string; path: string } {
    const array = trimChar(uri.absolutePath, '/').split('/');
    const num = array.indexOf('blob');
    if (num <= 1 || num + 2 >= array.length) {
      return { result: false, owner: '', repo: '', gitRef: '', path: '' };
    }
    return { result: true, owner: array[0]!, repo: array[1]!, gitRef: array[num + 1]!, path: array.slice(num + 2).join('/') };
  }

  private getClient(): GitHubClient {
    if (isNullOrWhiteSpace(this._accessToken)) {
      if (this._client.credentials === Credentials.anonymous) {
        return this._client;
      }
      this._client = new GitHubClient('AMLEngine');
    } else {
      const val = new Credentials(this._accessToken);
      if (this._client.credentials.password === val.password) {
        return this._client;
      }
      this._client = GitHubReferenceResolver.createClient(val);
    }
    return this._client;
  }

  private static createClient(credentials: Credentials): GitHubClient {
    const client = new GitHubClient('AMLEngine');
    client.credentials = credentials;
    return client;
  }

  /** Checks if the resolver has an access token. */
  hasAccessToken(): boolean {
    return !isNullOrWhiteSpace(this._accessToken);
  }
}
