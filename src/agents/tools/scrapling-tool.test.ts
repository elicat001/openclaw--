import { execFile } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createScraplingTool } from "./scrapling-tool.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function stubPythonSuccess(output: Record<string, unknown>) {
  mockExecFile.mockImplementation(((
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    const child = {
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      },
    };
    // Call callback on next tick to simulate async
    setTimeout(() => cb(null, JSON.stringify(output), ""), 0);
    return child;
  }) as typeof execFile);
}

function stubPythonError(errorMessage: string) {
  mockExecFile.mockImplementation(((
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    const child = {
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      },
    };
    setTimeout(() => cb(new Error("exit 1"), "", errorMessage), 0);
    return child;
  }) as typeof execFile);
}

describe("createScraplingTool", () => {
  test("creates a tool with correct name and description", () => {
    const tool = createScraplingTool();
    expect(tool).not.toBeNull();
    expect(tool!.name).toBe("scrapling");
    expect(tool!.label).toBe("Scrapling");
    expect(tool!.description).toContain("anti-bot bypass");
  });

  test("throws ToolInputError when url is missing", async () => {
    const tool = createScraplingTool()!;
    await expect(tool.execute("test-call", {})).rejects.toThrow("url required");
  });

  test("passes parameters as JSON via stdin (no code injection)", async () => {
    const mockOutput = { status: 200, length: 100, text: "Hello" };
    stubPythonSuccess(mockOutput);

    const tool = createScraplingTool()!;
    await tool.execute("test-call", {
      url: "https://example.com",
      mode: "fast",
    });

    // Verify execFile was called with python3 -c and a static script
    expect(mockExecFile).toHaveBeenCalledWith(
      "python3",
      ["-c", expect.any(String)],
      expect.any(Object),
      expect.any(Function),
    );

    // The script should NOT contain the URL directly (it's passed via stdin)
    const script = (mockExecFile.mock.calls[0] as unknown[])[1] as string[];
    expect(script[1]).not.toContain("https://example.com");
    expect(script[1]).toContain("json.loads(sys.stdin.read())");
  });

  test("handles scrapling not installed error", async () => {
    stubPythonError("No module named 'scrapling'");

    const tool = createScraplingTool()!;
    const result = await tool.execute("test-call", { url: "https://example.com" });

    expect(result).toEqual(
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining("scrapling not installed"),
          }),
        ]),
      }),
    );
  });

  test("handles browser not installed error", async () => {
    stubPythonError("Executable doesn't exist at /path/to/browser");

    const tool = createScraplingTool()!;
    const result = await tool.execute("test-call", { url: "https://example.com", mode: "stealth" });

    expect(result).toEqual(
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining("scrapling browser not installed"),
          }),
        ]),
      }),
    );
  });

  test("injection payload is treated as data, not code", async () => {
    const mockOutput = { status: 200, text: "safe" };
    stubPythonSuccess(mockOutput);

    const tool = createScraplingTool()!;
    await tool.execute("test-call", {
      url: "x' + __import__('os').system('rm -rf /') + '",
      mode: "fast",
    });

    // The malicious URL should be in stdin data, not in the script
    const stdinWrite = mockExecFile.mock.results[0];
    expect(stdinWrite).toBeDefined();

    // Script itself is static and safe
    const script = (mockExecFile.mock.calls[0] as unknown[])[1] as string[];
    expect(script[1]).not.toContain("__import__");
    expect(script[1]).not.toContain("os.system");
  });
});
