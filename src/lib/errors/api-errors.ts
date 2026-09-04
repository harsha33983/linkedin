/**
 * API Error Classes
 *
 * Typed errors for consistent API error responses.
 */

export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code || "UNKNOWN_ERROR";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Authentication required") {
    super(401, message, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Insufficient permissions") {
    super(403, message, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    super(
      404,
      id ? `${resource} with id ${id} not found` : `${resource} not found`,
      "NOT_FOUND"
    );
    this.name = "NotFoundError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, message, "VALIDATION_ERROR");
    this.name = "ValidationError";
    this.details = details;
  }
  details?: unknown;
}

export class RateLimitError extends ApiError {
  constructor(message = "Rate limit exceeded. Please try again later.") {
    super(429, message, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

export class AiGenerationError extends ApiError {
  constructor(message = "AI generation failed. Please try again.") {
    super(502, message, "AI_GENERATION_FAILED");
    this.name = "AiGenerationError";
  }
}

export class LinkedInApiError extends ApiError {
  constructor(message: string, linkedInError?: string) {
    super(502, message, "LINKEDIN_API_ERROR");
    this.name = "LinkedInApiError";
    this.linkedInError = linkedInError;
  }
  linkedInError?: string;
}

/**
 * Handle an error in an API route and return a consistent JSON response.
 */
export function handleApiError(error: unknown): Response {
  console.error("API Error:", error);

  if (error instanceof ApiError) {
    return Response.json(
      {
        success: false,
        error: error.message,
        code: error.code,
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof Error && error.message === "Unauthorized") {
    return Response.json(
      {
        success: false,
        error: "Authentication required",
        code: "UNAUTHORIZED",
      },
      { status: 401 }
    );
  }

  // Unknown error — don't leak internal details
  return Response.json(
    {
      success: false,
      error: "An unexpected error occurred",
      code: "INTERNAL_ERROR",
    },
    { status: 500 }
  );
}
