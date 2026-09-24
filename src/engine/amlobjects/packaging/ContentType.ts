// Port of System.IO.Packaging.ContentType (System.IO.Packaging 10.0.3, internal): parsing,
// validation (RFC 2616 tokens) and the canonical string form of a MIME content type.

import { ArgumentException, ArgumentNullException } from '../../../system/exceptions.js';

const ALLOWED = "!#$%&'*+-.^_`|~";
const LWS = [' ', '\n', '\r', '\t'];

function isLinearWhiteSpaceChar(ch: string): boolean {
  return ch <= ' ' && LWS.includes(ch);
}

function isAsciiLetterOrDigit(ch: string): boolean {
  return /^[A-Za-z0-9]$/.test(ch);
}

function trimEndLws(s: string): string {
  let e = s.length;
  while (e > 0 && LWS.includes(s[e - 1]!)) e--;
  return s.substring(0, e);
}

function trimStartLws(s: string): string {
  let b = 0;
  while (b < s.length && LWS.includes(s[b]!)) b++;
  return s.substring(b);
}

/** A MIME content type (type/subtype; parameter=value ...). */
export class ContentType {
  private _contentType: string | null = null;
  private _type = '';
  private _subType = '';
  private _parameterDictionary: Map<string, string> | null = null;

  /** The type component. */
  get typeComponent(): string {
    return this._type;
  }

  /** The subtype component. */
  get subTypeComponent(): string {
    return this._subType;
  }

  /** The parameter/value pairs in the order of the string. */
  get parameterValuePairs(): ReadonlyMap<string, string> {
    return (this._parameterDictionary ??= new Map());
  }

  /**
   * Parses and validates the content type.
   * @throws ArgumentNullException contentType is null.
   * @throws ArgumentException the content type is not valid.
   */
  constructor(contentType: string | null) {
    if (contentType == null) throw new ArgumentNullException('contentType');
    if (contentType.length === 0) {
      this._contentType = '';
      return;
    }
    if (isLinearWhiteSpaceChar(contentType[0]!) || isLinearWhiteSpaceChar(contentType[contentType.length - 1]!)) {
      throw new ArgumentException('ContentType string cannot have leading/trailing Linear White Spaces [LWS - RFC 2616].');
    }
    ContentType.validateCarriageReturns(contentType);
    const num = contentType.indexOf(';');
    if (num === -1) {
      this.parseTypeAndSubType(contentType);
      return;
    }
    this.parseTypeAndSubType(contentType.substring(0, num));
    this.parseParameterAndValue(contentType.substring(num));
  }

  /**
   * Compares type and subtype (ASCII case-insensitive). Without `allowParameterValuePairs`, a
   * content type with parameters is never equal.
   */
  areTypeAndSubTypeEqual(contentType: ContentType | null, allowParameterValuePairs = false): boolean {
    let result = false;
    if (contentType != null) {
      if (!allowParameterValuePairs) {
        if (this._parameterDictionary != null && this._parameterDictionary.size > 0) {
          return false;
        }
        if (contentType.parameterValuePairs.size > 0) {
          return false;
        }
      }
      result =
        this._type.toUpperCase() === contentType.typeComponent.toUpperCase() &&
        this._subType.toUpperCase() === contentType.subTypeComponent.toUpperCase();
    }
    return result;
  }

  /** "type/subtype ; parameter=value ..." (the original string when it was empty). */
  toString(): string {
    if (this._contentType == null) {
      let s = this._type + '/' + this._subType;
      if (this._parameterDictionary != null && this._parameterDictionary.size > 0) {
        for (const [key, value] of this._parameterDictionary) {
          s += ' ; ' + key + '=' + value;
        }
      }
      this._contentType = s;
    }
    return this._contentType;
  }

  private static validateCarriageReturns(contentType: string): void {
    let num = contentType.indexOf('\r');
    while (num !== -1) {
      if (contentType[num - 1] === '\n' || contentType[num + 1] === '\n') {
        num = contentType.indexOf('\r', ++num);
        continue;
      }
      throw new ArgumentException('A Linear White Space character is not valid.');
    }
  }

  private parseTypeAndSubType(typeAndSubType: string): void {
    typeAndSubType = trimEndLws(typeAndSubType);
    const num = typeAndSubType.indexOf('/');
    if (num < 0 || typeAndSubType.substring(num + 1).indexOf('/') >= 0) {
      throw new ArgumentException('ContentType string is not valid. Expected format is type/subtype.');
    }
    this._type = ContentType.validateToken(typeAndSubType.substring(0, num));
    this._subType = ContentType.validateToken(typeAndSubType.substring(num + 1));
  }

  private parseParameterAndValue(parameterAndValue: string): void {
    while (parameterAndValue.length > 0) {
      if (parameterAndValue[0] !== ';') {
        throw new ArgumentException('Semicolon separator is required between two valid parameter=value pairs.');
      }
      if (parameterAndValue.length === 1) {
        throw new ArgumentException("';' must be followed by parameter=value pair.");
      }
      parameterAndValue = trimStartLws(parameterAndValue.substring(1));
      const num = parameterAndValue.indexOf('=');
      if (num <= 0 || num === parameterAndValue.length - 1) {
        throw new ArgumentException('Parameter and value pair is not valid. Expected form is parameter=value.');
      }
      const num2 = num + 1;
      const lengthOfParameterValue = ContentType.getLengthOfParameterValue(parameterAndValue, num2);
      const key = ContentType.validateToken(parameterAndValue.substring(0, num));
      const value = ContentType.validateQuotedStringOrToken(parameterAndValue.substring(num2, num2 + lengthOfParameterValue));
      this._parameterDictionary ??= new Map();
      if (this._parameterDictionary.has(key)) {
        throw new ArgumentException(`An item with the same key has already been added. Key: ${key}`);
      }
      this._parameterDictionary.set(key, value);
      parameterAndValue = trimStartLws(parameterAndValue.substring(num2 + lengthOfParameterValue));
    }
  }

  private static getLengthOfParameterValue(s: string, startIndex: number): number {
    let num3: number;
    if (s[startIndex] !== '"') {
      const num = s.substring(startIndex).indexOf(';');
      if (num !== -1) {
        const rest = s.substring(startIndex);
        let num2 = -1;
        for (let i = 0; i < rest.length; i++) {
          if (LWS.includes(rest[i]!)) {
            num2 = i;
            break;
          }
        }
        num3 = num2 !== -1 && num2 < num ? num2 : num;
        num3 += startIndex;
      } else {
        num3 = s.length;
      }
    } else {
      let flag = false;
      num3 = startIndex;
      while (!flag) {
        const num4 = ++num3;
        num3 = s.substring(num4).indexOf('"');
        if (num3 === -1) {
          throw new ArgumentException('Parameter value must be a valid token or a quoted string as per RFC 2616.');
        }
        num3 += num4;
        if (s[num3 - 1] !== '\\') {
          flag = true;
          num3++;
        }
      }
    }
    return num3 - startIndex;
  }

  private static validateToken(token: string): string {
    if (token.length === 0) {
      throw new ArgumentException('A token is not valid. Refer to RFC 2616 for correct grammar of content types.');
    }
    for (const ch of token) {
      if (!isAsciiLetterOrDigit(ch) && !ALLOWED.includes(ch)) {
        throw new ArgumentException('A token is not valid. Refer to RFC 2616 for correct grammar of content types.');
      }
    }
    return token;
  }

  private static validateQuotedStringOrToken(parameterValue: string): string {
    if (parameterValue.length === 0) {
      throw new ArgumentException('Parameter value must be a valid token or a quoted string as per RFC 2616.');
    }
    if (parameterValue.length >= 2 && parameterValue[0] === '"' && parameterValue[parameterValue.length - 1] === '"') {
      ContentType.validateQuotedText(parameterValue.substring(1, parameterValue.length - 1));
    } else {
      ContentType.validateToken(parameterValue);
    }
    return parameterValue;
  }

  private static validateQuotedText(quotedText: string): void {
    for (let i = 0; i < quotedText.length; i++) {
      const c = quotedText[i]!;
      if (!isLinearWhiteSpaceChar(c)) {
        if (c <= ' ' || c >= 'ÿ') {
          throw new ArgumentException('Parameter value must be a valid token or a quoted string as per RFC 2616.');
        }
        if (c === '"' && (i === 0 || quotedText[i - 1] !== '\\')) {
          throw new ArgumentException('Parameter value must be a valid token or a quoted string as per RFC 2616.');
        }
      }
    }
  }
}
