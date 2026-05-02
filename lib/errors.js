// lib/errors.js
// Centralized error classification and user-friendly messages.

export const ErrorType = {
  AUTH: "auth",                  // 401, invalid api key
  RATE_LIMIT: "rate_limit",      // 429
  QUOTA: "quota",                // out of credits / billing
  NETWORK: "network",            // network failure
  TIMEOUT: "timeout",
  INVALID_RESPONSE: "invalid",   // AI returned malformed JSON
  CONTENT_TOO_LONG: "too_long",  // 413 / context overflow
  SERVER: "server",              // 5xx
  UNKNOWN: "unknown"
};

/**
 * Classify a raw error into a structured AppError.
 * Accepts either an Error object or a fetch Response.
 */
export class AppError extends Error {
  constructor(type, message, { hint, retryable, original } = {}) {
    super(message);
    this.type = type;
    this.hint = hint;
    this.retryable = retryable;
    this.original = original;
  }
}

/**
 * Build an AppError from an HTTP error response (provider call failed).
 */
export function fromHttpError(status, body, providerName = "AI") {
  const bodyLower = (body || "").toLowerCase();

  if (status === 401 || status === 403) {
    return new AppError(
      ErrorType.AUTH,
      `${providerName} rejected your API key.`,
      {
        hint: "Open Settings ⚙️ and double-check your API key. Make sure there are no extra spaces and that the key is still active in your account dashboard.",
        retryable: false
      }
    );
  }

  if (status === 429) {
    // Distinguish rate-limit from out-of-credits
    if (bodyLower.includes("credit") || bodyLower.includes("quota") || bodyLower.includes("billing")) {
      return new AppError(
        ErrorType.QUOTA,
        `Your ${providerName} account is out of credits.`,
        {
          hint: "Top up your account balance in the provider dashboard, or switch to a cheaper model in Settings.",
          retryable: false
        }
      );
    }
    return new AppError(
      ErrorType.RATE_LIMIT,
      `${providerName} is rate-limiting your requests.`,
      {
        hint: "Wait 30 seconds and try again. If this happens often, switch to a faster/cheaper model.",
        retryable: true
      }
    );
  }

  if (status === 413 || bodyLower.includes("context") || bodyLower.includes("token")) {
    return new AppError(
      ErrorType.CONTENT_TOO_LONG,
      "JD or resume is too long for the model's context window.",
      {
        hint: "Try shortening your resume in Settings, or paste only the most relevant part of the JD.",
        retryable: false
      }
    );
  }

  if (status >= 500) {
    return new AppError(
      ErrorType.SERVER,
      `${providerName} server error (${status}).`,
      {
        hint: "The provider is having issues. Wait a moment and try again — usually resolves within minutes.",
        retryable: true
      }
    );
  }

  return new AppError(
    ErrorType.UNKNOWN,
    `${providerName} error (${status})`,
    {
      hint: body ? body.slice(0, 200) : "Unknown error from the provider.",
      retryable: true
    }
  );
}

/**
 * Build an AppError from a non-HTTP exception (network, timeout, etc.)
 */
export function fromException(err, providerName = "AI") {
  const msg = (err?.message || "").toLowerCase();

  if (err.name === "AbortError" || msg.includes("timeout") || msg.includes("timed out")) {
    return new AppError(
      ErrorType.TIMEOUT,
      "Request timed out.",
      {
        hint: "The AI is taking too long to respond. Check your internet connection or try a faster model.",
        retryable: true,
        original: err
      }
    );
  }

  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("connection")) {
    return new AppError(
      ErrorType.NETWORK,
      "Cannot reach the AI provider.",
      {
        hint: "Check your internet connection. If you're behind a corporate firewall or VPN, it may be blocking api.anthropic.com or api.openai.com.",
        retryable: true,
        original: err
      }
    );
  }

  if (msg.includes("invalid json") || msg.includes("not valid json") || msg.includes("unexpected")) {
    return new AppError(
      ErrorType.INVALID_RESPONSE,
      "AI returned an unexpected response.",
      {
        hint: "This sometimes happens. Click Retry — usually works on the second try. If it keeps failing, try a different model.",
        retryable: true,
        original: err
      }
    );
  }

  // Already an AppError? pass through
  if (err instanceof AppError) return err;

  return new AppError(
    ErrorType.UNKNOWN,
    err?.message || "Unknown error",
    { hint: "Please try again. If this keeps happening, check the browser console for details.", retryable: true, original: err }
  );
}

/**
 * Serialize an AppError for sending across runtime.sendMessage
 * (Error objects don't survive structured cloning well)
 */
export function serializeError(err) {
  if (err instanceof AppError) {
    return {
      __isAppError: true,
      type: err.type,
      message: err.message,
      hint: err.hint,
      retryable: err.retryable
    };
  }
  return {
    __isAppError: false,
    type: ErrorType.UNKNOWN,
    message: err?.message || String(err),
    hint: null,
    retryable: true
  };
}
