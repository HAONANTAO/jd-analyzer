import { describe, it, expect } from "vitest";
import {
  AppError, ErrorType,
  fromHttpError, fromException, serializeError
} from "../lib/errors.js";

describe("fromHttpError", () => {
  it("classifies 401 as AUTH", () => {
    const err = fromHttpError(401, "invalid x-api-key");
    expect(err.type).toBe(ErrorType.AUTH);
    expect(err.retryable).toBe(false);
  });

  it("classifies 403 as AUTH", () => {
    expect(fromHttpError(403, "").type).toBe(ErrorType.AUTH);
  });

  it("classifies 429 with 'credit' as QUOTA", () => {
    const err = fromHttpError(429, "Your credit balance is too low");
    expect(err.type).toBe(ErrorType.QUOTA);
    expect(err.retryable).toBe(false);
  });

  it("classifies 429 with 'billing' as QUOTA", () => {
    expect(fromHttpError(429, "billing issue").type).toBe(ErrorType.QUOTA);
  });

  it("classifies 429 without credit/quota as RATE_LIMIT", () => {
    const err = fromHttpError(429, "rate exceeded");
    expect(err.type).toBe(ErrorType.RATE_LIMIT);
    expect(err.retryable).toBe(true);
  });

  it("classifies 413 as CONTENT_TOO_LONG", () => {
    expect(fromHttpError(413, "").type).toBe(ErrorType.CONTENT_TOO_LONG);
  });

  it("classifies 'context' body as CONTENT_TOO_LONG", () => {
    expect(fromHttpError(400, "context length exceeded").type).toBe(ErrorType.CONTENT_TOO_LONG);
  });

  it("classifies 5xx as SERVER", () => {
    const err = fromHttpError(503, "");
    expect(err.type).toBe(ErrorType.SERVER);
    expect(err.retryable).toBe(true);
  });

  it("falls back to UNKNOWN for unrecognized status", () => {
    expect(fromHttpError(418, "").type).toBe(ErrorType.UNKNOWN);
  });
});

describe("fromException", () => {
  it("classifies AbortError as TIMEOUT", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(fromException(e).type).toBe(ErrorType.TIMEOUT);
  });

  it("classifies 'failed to fetch' as NETWORK", () => {
    expect(fromException(new Error("Failed to fetch")).type).toBe(ErrorType.NETWORK);
  });

  it("classifies invalid JSON as INVALID_RESPONSE", () => {
    expect(fromException(new Error("Invalid JSON: unexpected token")).type).toBe(ErrorType.INVALID_RESPONSE);
  });

  it("passes AppError through unchanged", () => {
    const original = new AppError(ErrorType.QUOTA, "out");
    expect(fromException(original)).toBe(original);
  });

  it("falls back to UNKNOWN", () => {
    expect(fromException(new Error("weird")).type).toBe(ErrorType.UNKNOWN);
  });
});

describe("serializeError", () => {
  it("serializes AppError with all fields", () => {
    const err = new AppError(ErrorType.AUTH, "bad key", { hint: "fix it", retryable: false });
    const s = serializeError(err);
    expect(s).toEqual({
      __isAppError: true,
      type: ErrorType.AUTH,
      message: "bad key",
      hint: "fix it",
      retryable: false
    });
  });

  it("serializes plain Error as UNKNOWN", () => {
    const s = serializeError(new Error("oops"));
    expect(s.__isAppError).toBe(false);
    expect(s.type).toBe(ErrorType.UNKNOWN);
    expect(s.message).toBe("oops");
  });
});
