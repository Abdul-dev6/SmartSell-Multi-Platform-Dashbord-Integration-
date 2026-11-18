// Errors with a safe HTTP status, code and message for Amazon routes.
export class AmazonServiceError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = "AmazonServiceError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const notFound = (what = "Amazon record") => new AmazonServiceError(404, "not_found", `${what} not found.`);
export const invalid = (message, errors) => new AmazonServiceError(422, "validation", message, errors ? { errors } : {});
