import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { createRemindersMcpServer } from "./mcp.js";

describe("Reminders MCP server", () => {
  it("exposes tools to inspect and manage Hermes cron reminders", async () => {
    const bridge = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const server = createRemindersMcpServer({ bridge });
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    expect(
      (await client.listTools()).tools.map((tool) => tool.name).sort(),
    ).toEqual([
      "create_reminder",
      "delete_reminder",
      "edit_reminder",
      "list_reminders",
      "pause_reminder",
      "resume_reminder",
    ]);
    await client.callTool({
      name: "pause_reminder",
      arguments: { jobId: "job-1" },
    });
    expect(bridge.pause).toHaveBeenCalledWith("job-1");
    await Promise.all([client.close(), server.close()]);
  });

  it("creates a reminder from Discord origin context without an explicit delivery target", async () => {
    const bridge = {
      list: vi.fn(),
      create: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const server = createRemindersMcpServer({ bridge });
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const origin = {
      platform: "discord",
      requester: { id: "user-7", name: "Chris" },
      conversation: { id: "channel-42", name: "reminders" },
      message: { id: "message-9" },
      thread: { id: "thread-3", name: "Weekend chores" },
    };

    await client.callTool({
      name: "create_reminder",
      arguments: {
        name: "Take bins out",
        schedule: "2026-08-01T09:00:00",
        prompt: "Take bins out",
        origin,
      },
    });

    expect(bridge.create).toHaveBeenCalledWith({
      name: "Take bins out",
      schedule: "2026-08-01T09:00:00",
      prompt: "Take bins out",
      origin,
    });
    await Promise.all([client.close(), server.close()]);
  });

  it("rejects origin provenance when editing a reminder", async () => {
    const bridge = {
      list: vi.fn(),
      create: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const server = createRemindersMcpServer({ bridge });
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const response = await client.callTool({
      name: "edit_reminder",
      arguments: {
        jobId: "job-1",
        schedule: "0 9 * * 6",
        deliver: "discord:123",
        origin: {
          platform: "discord",
          requester: { id: "user-7" },
          conversation: { id: "channel-42" },
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(bridge.update).not.toHaveBeenCalled();
    await Promise.all([client.close(), server.close()]);
  });
});
