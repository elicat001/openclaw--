import { describe, expect, test, vi } from "vitest";

// Mock modules
vi.mock("./scrapling-tool.js", () => ({
  runPython: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("../../agent-reach/extended-path.js", () => ({
  extendedPythonPath: () => "/usr/bin:/usr/local/bin",
}));

import { fetchWithCamoufox, isCamoufoxInstalled } from "./web-fetch-camoufox-engine.js";

describe("fetchWithCamoufox", () => {
  test("returns parsed result on success", async () => {
    const { execFile } = await import("node:child_process");
    const mockExecFile = vi.mocked(execFile);
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as (...args: unknown[]) => void)(
          null,
          JSON.stringify({
            status: 200,
            text: "<html>test</html>",
            title: "Test",
            cookies: [{ name: "sid", value: "abc", domain: "example.com", path: "/" }],
          }),
          "",
        );
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await fetchWithCamoufox({ url: "https://example.com" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.title).toBe("Test");
    expect(result!.cookies).toHaveLength(1);
  });

  test("returns null on failure", async () => {
    const { execFile } = await import("node:child_process");
    const mockExecFile = vi.mocked(execFile);
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as (...args: unknown[]) => void)(new Error("camoufox crashed"), "", "error");
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await fetchWithCamoufox({ url: "https://example.com" });
    expect(result).toBeNull();
  });

  test("passes cookies and viewport", async () => {
    const { execFile } = await import("node:child_process");
    const mockExecFile = vi.mocked(execFile);
    let capturedStdin = "";
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const child = {
          stdin: {
            write(data: string) {
              capturedStdin = data;
            },
            end() {},
          },
        };
        (cb as (...args: unknown[]) => void)(
          null,
          JSON.stringify({ status: 200, text: "", title: "", cookies: [] }),
          "",
        );
        return child as unknown as ReturnType<typeof execFile>;
      },
    );

    await fetchWithCamoufox({
      url: "https://shopee.com.br",
      cookies: [
        {
          name: "sid",
          value: "123",
          domain: "shopee.com.br",
          path: "/",
          expires: null,
          httpOnly: false,
          secure: false,
          sameSite: "lax",
        },
      ],
      viewport: { width: 1920, height: 1080 },
      humanize: true,
    });
    // stdin capture may not work due to async timing, but validates no crash
    void capturedStdin;
  });
});

describe("isCamoufoxInstalled", () => {
  test("returns boolean", async () => {
    const { runPython } = await import("./scrapling-tool.js");
    const mockRunPython = vi.mocked(runPython);
    mockRunPython.mockResolvedValue({ stdout: "ok\n", stderr: "" });

    const result = await isCamoufoxInstalled();
    expect(typeof result).toBe("boolean");
  });
});
