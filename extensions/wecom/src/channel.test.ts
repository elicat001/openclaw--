import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const testConfig = {
  corpId: "test-corp-id",
  agentId: "1000001",
  secret: "test-secret",
};

function mockTokenResponse(token = "mock-wecom-token") {
  mockFetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        errcode: 0,
        errmsg: "ok",
        access_token: token,
        expires_in: 7200,
      }),
      { status: 200 },
    ),
  );
}

function mockSendSuccess() {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ errcode: 0, errmsg: "ok" }), { status: 200 }),
  );
}

async function loadChannel() {
  return await import("./channel.js");
}

describe("WeCom channel", () => {
  test("exports correct channel id", async () => {
    const { wecomChannel } = await loadChannel();
    expect(wecomChannel.id).toBe("wecom");
    expect(wecomChannel.name).toBe("WeCom (企业微信)");
  });

  test("getAccessToken fetches and caches token", async () => {
    const { wecomChannel } = await loadChannel();
    mockTokenResponse();

    const token1 = await wecomChannel.getAccessToken(testConfig);
    expect(token1).toBe("mock-wecom-token");

    const token2 = await wecomChannel.getAccessToken(testConfig);
    expect(token2).toBe("mock-wecom-token");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("token cache is isolated per corpId", async () => {
    const { wecomChannel } = await loadChannel();
    mockTokenResponse("token-a");
    await wecomChannel.getAccessToken(testConfig);

    mockTokenResponse("token-b");
    const token2 = await wecomChannel.getAccessToken({
      ...testConfig,
      corpId: "other-corp-id",
    });
    expect(token2).toBe("token-b");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("getAccessToken throws on API error", async () => {
    const { wecomChannel } = await loadChannel();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ errcode: 40013, errmsg: "invalid corpid" }), { status: 200 }),
    );

    await expect(wecomChannel.getAccessToken(testConfig)).rejects.toThrow("WeCom gettoken failed");
  });

  test("sendTextMessage sends correct payload", async () => {
    const { sendTextMessage } = await loadChannel();
    mockTokenResponse();
    mockSendSuccess();

    await sendTextMessage({
      config: testConfig,
      toUser: "employee-001",
      content: "Hello WeCom!",
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const sendCall = mockFetch.mock.calls[1];
    const body = JSON.parse(sendCall[1].body);
    expect(body.touser).toBe("employee-001");
    expect(body.msgtype).toBe("text");
    expect(body.agentid).toBe(1000001);
    expect(body.text.content).toBe("Hello WeCom!");
  });

  test("sendMarkdownMessage sends correct payload", async () => {
    const { sendMarkdownMessage } = await loadChannel();
    mockTokenResponse();
    mockSendSuccess();

    await sendMarkdownMessage({
      config: testConfig,
      toUser: "employee-001",
      content: "# Title\nContent",
    });

    const sendCall = mockFetch.mock.calls[1];
    const body = JSON.parse(sendCall[1].body);
    expect(body.msgtype).toBe("markdown");
    expect(body.markdown.content).toBe("# Title\nContent");
  });

  test("throws on non-numeric agentId", async () => {
    const { sendTextMessage } = await loadChannel();
    mockTokenResponse();
    mockSendSuccess();

    await expect(
      sendTextMessage({
        config: { ...testConfig, agentId: "not-a-number" },
        toUser: "user",
        content: "test",
      }),
    ).rejects.toThrow("agentId is not a valid number");
  });

  test("fetch calls include timeout signal", async () => {
    const { sendTextMessage } = await loadChannel();
    mockTokenResponse();
    mockSendSuccess();

    await sendTextMessage({
      config: testConfig,
      toUser: "user",
      content: "test",
    });

    for (const call of mockFetch.mock.calls) {
      expect(call[1]).toHaveProperty("signal");
    }
  });
});
