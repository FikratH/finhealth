import { describe, expect, it } from "vitest";
import { errorHintKey, isTranslationKey, normalizeErrorKey, toAnalyzeError } from "@/lib/analyze-errors";
import { ApiError } from "@/lib/api";

describe("errorHintKey", () => {
  it("keys 413/415/422 by status alone", () => {
    expect(errorHintKey({ status: 413 })).toBe("payloadTooLarge");
    expect(errorHintKey({ status: 415 })).toBe("unsupportedType");
    expect(errorHintKey({ status: 422 })).toBe("unprocessable");
  });

  it("returns null for a status with no hint", () => {
    expect(errorHintKey({ status: 400 })).toBeNull();
    expect(errorHintKey({ status: 0 })).toBeNull();
  });

  // P5 close wave F3: 503 must NOT be a blanket status→hint mapping — only
  // the vault's own code earns the "uncheck the box" advice.
  it("503 with code 'vault_unavailable' returns the vault hint", () => {
    expect(errorHintKey({ status: 503, code: "vault_unavailable" })).toBe("vaultUnavailable");
  });

  it("503 with a DIFFERENT code (e.g. narrative_unavailable) returns null, not the vault hint", () => {
    expect(errorHintKey({ status: 503, code: "narrative_unavailable" })).toBeNull();
  });

  it("503 with no code at all (e.g. an infra/proxy 503) returns null, not the vault hint", () => {
    expect(errorHintKey({ status: 503 })).toBeNull();
  });
});

describe("toAnalyzeError", () => {
  it("carries ApiError.code through onto AnalyzeError.code", () => {
    const err = new ApiError(503, "Хранилище документов недоступно.", "vault_unavailable");
    const result = toAnalyzeError(err, "errors.network");
    expect(result).toEqual({
      message: "Хранилище документов недоступно.",
      status: 503,
      code: "vault_unavailable",
    });
  });

  it("leaves code undefined for an ApiError with no code", () => {
    const err = new ApiError(404, "Анализ не найден.");
    const result = toAnalyzeError(err, "errors.network");
    expect(result.code).toBeUndefined();
  });

  it("a non-ApiError (network failure) falls back to the network key, status 0, no code", () => {
    const result = toAnalyzeError(new TypeError("fetch failed"), "errors.network");
    expect(result).toEqual({ message: "errors.network", status: 0 });
  });

  it("normalizes the bare 'timeout' literal to 'errors.timeout'", () => {
    const err = new ApiError(0, "timeout");
    const result = toAnalyzeError(err, "errors.network");
    expect(result.message).toBe("errors.timeout");
  });
});

describe("isTranslationKey / normalizeErrorKey", () => {
  it("an errors.* key is a translation key; a backend RU string is not", () => {
    expect(isTranslationKey("errors.network")).toBe(true);
    expect(isTranslationKey("Хранилище документов недоступно.")).toBe(false);
  });

  it("normalizeErrorKey maps the bare 'timeout' literal, passes everything else through", () => {
    expect(normalizeErrorKey("timeout")).toBe("errors.timeout");
    expect(normalizeErrorKey("errors.network")).toBe("errors.network");
    expect(normalizeErrorKey("Хранилище документов недоступно.")).toBe("Хранилище документов недоступно.");
  });
});
