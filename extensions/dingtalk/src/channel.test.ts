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
  appKey: "test-app-key",
  appSecret: "test-app-secret",
  robotCode: "test-robot",
};

function mockTokenResponse(token = "mock-access-token") {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ accessToken: token, expireIn: 7200 }), { status: 200 }),
  );
}

function mockSendSuccess() {
  mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
}

async function loadChannel() {
  return await import("./channel.js");
}

describe("DingTalk channel", () => {
  test("exports correct channel id", async () => {
    const { dingtalkChannel } = await loadChannel();
    expect(dingtalkChannel.id).toBe("dingtalk");
    expect(dingtalkChannel.name).toBe("DingTalk (钉钉)");
  });

  test("getAccessToken fetches and caches token", async () => {
    const { dingtalkChannel } = await loadChannel();
    mockTokenResponse();

    const token1 = await dingtalkChannel.getAccessToken(testConfig);
    expect(token1).toBe("mock-access-token");

    // Second call should use cache
    const token2 = await dingtalkChannel.getAccessToken(testConfig);
    expect(token2).toBe("mock-access-token");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("token cache is isolated per appKey", async () => {
    const { dingtalkChannel } = await loadChannel();
    mockTokenResponse("token-a");
    await dingtalkChannel.getAccessToken(testConfig);

    mockTokenResponse("token-b");
    const token2 = await dingtalkChannel.getAccessToken({
      ...testConfig,
      appKey: "other-app-key",
    });
    expect(token2).toBe("token-b");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("getAccessToken throws on error response", async () => {
    const { dingtalkChannel } = await loadChannel();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "error", message: "invalid credentials" }), {
        status: 200,
      }),
    );

    await expect(dingtalkChannel.getAccessToken(testConfig)).rejects.toThrow(
      "DingTalk gettoken failed",
    );
  });

  test("sendTextMessage sends correctly formatted request", async () => {
    const { sendTextMessage } = await loadChannel();
    mockTokenResponse();
    mockSendSuccess();

    await sendTextMessage({
      config: testConfig,
      conversationId: "user-123",
      content: "Hello!",
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const sendCall = mockFetch.mock.calls[1];
    const body = JSON.parse(sendCall[1].body);
    expect(body.robotCode).toBe("test-robot");
    expect(body.userIds).toEqual(["user-123"]);
    expect(body.msgKey).toBe("sampleText");
  });

  test("sendMarkdownMessage includes title and content", async () => {
    const { sendMarkdownMessage } = await loadChannel();
    mockTokenResponse();
    mockSendSuccess();

    await sendMarkdownMessage({
      config: testConfig,
      conversationId: "user-123",
      title: "Test Title",
      content: "# Markdown",
    });

    const sendCall = mockFetch.mock.calls[1];
    const body = JSON.parse(sendCall[1].body);
    expect(body.msgKey).toBe("sampleMarkdown");
    const msgParam = JSON.parse(body.msgParam);
    expect(msgParam.title).toBe("Test Title");
    expect(msgParam.text).toBe("# Markdown");
  });

  test("sendGroupMessage uses openConversationId", async () => {
    const { sendGroupMessage } = await loadChannel();
    mockTokenResponse();
    mockSendSuccess();

    await sendGroupMessage({
      config: testConfig,
      openConversationId: "group-456",
      content: "Group message",
    });

    const sendCall = mockFetch.mock.calls[1];
    const body = JSON.parse(sendCall[1].body);
    expect(body.openConversationId).toBe("group-456");
  });

  test("fetch calls include timeout signal", async () => {
    const { sendTextMessage } = await loadChannel();
    mockTokenResponse();
    mockSendSuccess();

    await sendTextMessage({
      config: testConfig,
      conversationId: "user-123",
      content: "test",
    });

    for (const call of mockFetch.mock.calls) {
      expect(call[1]).toHaveProperty("signal");
    }
  });
});
