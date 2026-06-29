import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "./crypto.server";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("crypto", () => {
  it("round-trips a value", () => {
    const out = encrypt("super-secret-token");
    expect(out).not.toContain("super-secret-token");
    expect(decrypt(out)).toBe("super-secret-token");
  });

  it("produces different ciphertext each call (random IV)", () => {
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });
});
