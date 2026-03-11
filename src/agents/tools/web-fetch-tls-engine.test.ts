import { beforeEach, describe, expect, test, vi } from "vitest";

const { mockRunPython } = vi.hoisted(() => ({
  mockRunPython: vi.fn(),
}));
vi.mock("./scrapling-tool.js", () => ({
  runPython: mockRunPython,
}));

import { fetchWithTlsImpersonation, pickImpersonateProfile } from "./web-fetch-tls-engine.js";

describe("fetchWithTlsImpersonation", () => {
  beforeEach(() => {
    mockRunPython.mockReset();
  });

  test("returns parsed result on success", async () => {
    mockRunPython.mockResolvedValueOnce({
      stdout: JSON.stringify({
        status: 200,
        headers: { "content-type": "text/html" },
        body: "<html>test</html>",
        cookies: [{ name: "sid", value: "abc", domain: "example.com", path: "/" }],
      }),
      stderr: "",
    });

    const result = await fetchWithTlsImpersonation({
      url: "https://example.com",
    });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.cookies).toHaveLength(1);
  });

  test("returns null on failure", async () => {
    mockRunPython.mockRejectedValueOnce(new Error("python error"));
    const result = await fetchWithTlsImpersonation({
      url: "https://example.com",
    });
    expect(result).toBeNull();
  });

  test("passes proxy parameter", async () => {
    mockRunPython.mockResolvedValueOnce({
      stdout: JSON.stringify({
        status: 200,
        headers: {},
        body: "",
        cookies: [],
      }),
      stderr: "",
    });

    await fetchWithTlsImpersonation({
      url: "https://example.com",
      proxy: "http://user:pass@proxy:8080",
      impersonate: "chrome131",
    });

    expect(mockRunPython).toHaveBeenCalledOnce();
    const stdinData = JSON.parse(mockRunPython.mock.calls[0][1]);
    expect(stdinData.proxy).toBe("http://user:pass@proxy:8080");
    expect(stdinData.impersonate).toBe("chrome131");
  });
});

describe("pickImpersonateProfile", () => {
  test("returns string from pool", () => {
    const profile = pickImpersonateProfile();
    expect(typeof profile).toBe("string");
    expect(profile).toMatch(/^(chrome|firefox|safari|edge)\d/);
  });
});
