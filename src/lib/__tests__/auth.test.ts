// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { jwtVerify } from "jose";

vi.mock("server-only", () => ({}));

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDelete = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      set: mockSet,
      get: mockGet,
      delete: mockDelete,
    })
  ),
}));

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

describe("createSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sets an httpOnly auth-token cookie", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-123", "test@example.com");

    expect(mockSet).toHaveBeenCalledOnce();
    const [name, _token, options] = mockSet.mock.calls[0];
    expect(name).toBe("auth-token");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  test("cookie expires approximately 7 days from now", async () => {
    const { createSession } = await import("@/lib/auth");
    const before = Date.now();
    await createSession("user-123", "test@example.com");
    const after = Date.now();

    const [, , options] = mockSet.mock.calls[0];
    const expiresMs = options.expires.getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDays - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + sevenDays + 1000);
  });

  test("token JWT contains userId and email", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-123", "test@example.com");

    const [, token] = mockSet.mock.calls[0];
    const { payload } = await jwtVerify(token, JWT_SECRET);

    expect(payload.userId).toBe("user-123");
    expect(payload.email).toBe("test@example.com");
  });

  test("token is signed with HS256", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-123", "test@example.com");

    const [, token] = mockSet.mock.calls[0];
    const header = JSON.parse(atob(token.split(".")[0]));
    expect(header.alg).toBe("HS256");
  });

  test("secure flag matches NODE_ENV", async () => {
    const { createSession } = await import("@/lib/auth");

    vi.stubEnv("NODE_ENV", "production");
    await createSession("user-123", "test@example.com");
    expect(mockSet.mock.calls[0][2].secure).toBe(true);

    vi.unstubAllEnvs();
    vi.clearAllMocks();

    await createSession("user-123", "test@example.com");
    expect(mockSet.mock.calls[0][2].secure).toBe(false);
  });
});
