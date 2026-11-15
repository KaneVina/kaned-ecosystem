/** Errors the API throws on purpose; anything else becomes a 500. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  static badRequest(message: string, fields?: Record<string, string>) {
    return new ApiError(400, 'BAD_REQUEST', message, fields);
  }
  static unauthorized(message = 'You need to sign in to do that.') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have access to that.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'We could not find that.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string, fields?: Record<string, string>) {
    return new ApiError(409, 'CONFLICT', message, fields);
  }
  static tooLarge(message: string) {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', message);
  }
  static internal(message = 'Something went wrong on our side.') {
    return new ApiError(500, 'INTERNAL', message);
  }
}
