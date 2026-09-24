// .NET exception types used by Aml.Engine, so callers can tell failures apart as in C#.
// `name` carries the .NET type name. NullReferenceException is never thrown on purpose: where
// C# code dereferences null, the JS port fails with a TypeError at the same place.

export class SystemException extends Error {
  override name = 'SystemException';
}

export class ArgumentException extends SystemException {
  override name = 'ArgumentException';

  constructor(
    message = 'Value does not fall within the expected range.',
    readonly paramName: string | null = null,
  ) {
    super(paramName ? `${message} (Parameter '${paramName}')` : message);
  }
}

export class ArgumentNullException extends ArgumentException {
  override name = 'ArgumentNullException';

  constructor(paramName: string | null = null, message = 'Value cannot be null.') {
    super(message, paramName);
  }
}

export class ArgumentOutOfRangeException extends ArgumentException {
  override name = 'ArgumentOutOfRangeException';

  constructor(paramName: string | null = null, message = 'Specified argument was out of the range of valid values.') {
    super(message, paramName);
  }
}

export class InvalidOperationException extends SystemException {
  override name = 'InvalidOperationException';

  constructor(message = 'Operation is not valid due to the current state of the object.') {
    super(message);
  }
}

export class NotSupportedException extends SystemException {
  override name = 'NotSupportedException';

  constructor(message = 'Specified method is not supported.') {
    super(message);
  }
}

export class NotImplementedException extends SystemException {
  override name = 'NotImplementedException';

  constructor(message = 'The method or operation is not implemented.') {
    super(message);
  }
}

export class FormatException extends SystemException {
  override name = 'FormatException';

  constructor(message = 'One of the identified items was in an invalid format.') {
    super(message);
  }
}

export class ArithmeticException extends SystemException {
  override name = 'ArithmeticException';

  constructor(message = 'Overflow or underflow in the arithmetic operation.') {
    super(message);
  }
}

export class OverflowException extends ArithmeticException {
  override name = 'OverflowException';

  constructor(message = 'Arithmetic operation resulted in an overflow.') {
    super(message);
  }
}

export class InvalidCastException extends SystemException {
  override name = 'InvalidCastException';

  constructor(message = 'Specified cast is not valid.') {
    super(message);
  }
}

export class IndexOutOfRangeException extends SystemException {
  override name = 'IndexOutOfRangeException';

  constructor(message = 'Index was outside the bounds of the array.') {
    super(message);
  }
}

export class KeyNotFoundException extends SystemException {
  override name = 'KeyNotFoundException';
}

export class FileNotFoundException extends SystemException {
  override name = 'FileNotFoundException';
}

export class UnauthorizedAccessException extends SystemException {
  override name = 'UnauthorizedAccessException';
}

export class ObjectDisposedException extends InvalidOperationException {
  override name = 'ObjectDisposedException';
}

/** The .NET exception type name for an error thrown by the port (TypeError: a null dereference). */
export function dotNetExceptionName(err: unknown): string {
  if (err instanceof TypeError) return 'NullReferenceException';
  if (err instanceof RangeError) return 'StackOverflowException';
  if (err instanceof Error) return err.name;
  return 'Exception';
}

export class UriFormatException extends FormatException {
  override name = 'UriFormatException';

  constructor(message = 'Invalid URI: The format of the URI could not be determined.') {
    super(message);
  }
}

export class DivideByZeroException extends ArithmeticException {
  override name = 'DivideByZeroException';

  constructor(message = 'Attempted to divide by zero.') {
    super(message);
  }
}
