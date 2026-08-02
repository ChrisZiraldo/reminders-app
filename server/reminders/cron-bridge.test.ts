import { describe, expect, it, vi } from "vitest";
import { HermesCronBridge } from "./cron-bridge.js";

describe("HermesCronBridge", () => {
  it("lists enabled and paused jobs from Hermes cron without using a shell", async () => {
    const execute = vi.fn().mockResolvedValue({
      stdout: [
        "  job-morning [active]",
        "    Name:      Morning brief",
        "    Schedule:  0 8 * * *",
        "    Deliver:   discord:123",
        "  job-plants [paused]",
        "    Name:      Water plants",
        "    Schedule:  every 2w",
        "    Deliver:   telegram:456",
      ].join("\n"),
    });
    const bridge = new HermesCronBridge({ execute });

    await expect(bridge.list()).resolves.toEqual([
      {
        id: "job-morning",
        name: "Morning brief",
        schedule: "0 8 * * *",
        enabled: true,
        deliver: "discord:123",
      },
      {
        id: "job-plants",
        name: "Water plants",
        schedule: "every 2w",
        enabled: false,
        deliver: "telegram:456",
      },
    ]);
    expect(execute).toHaveBeenCalledWith("hermes", ["cron", "list", "--all"]);
  });

  it("hydrates a legacy Discord cron origin while preserving sidecar precedence", async () => {
    const execute = vi.fn().mockResolvedValue({
      stdout: [
        "  legacy-job [active]",
        "    Name:      Legacy reminder",
        "    Schedule:  0 8 * * *",
        "    Deliver:   origin",
        "  sidecar-job [paused]",
        "    Name:      Sidecar reminder",
        "    Schedule:  every 2w",
        "    Deliver:   discord:sidecar-channel",
      ].join("\n"),
    });
    const bridge = new HermesCronBridge({
      execute,
      originStore: {
        load: vi.fn().mockResolvedValue({
          "sidecar-job": {
            platform: "discord",
            requester: { id: "sidecar-user" },
            conversation: { id: "sidecar-channel", name: "sidecar" },
          },
        }),
        save: vi.fn(),
      },
      cronStore: {
        load: vi.fn().mockResolvedValue({
          jobs: [
            {
              id: "legacy-job",
              origin: {
                platform: "discord",
                chat_id: "channel-42",
                chat_name: "reminders",
                thread_id: "thread-3",
                user_id: "user-7",
              },
            },
            {
              id: "sidecar-job",
              origin: {
                platform: "discord",
                chat_id: "ignored-channel",
                chat_name: "ignored",
                user_id: "ignored-user",
              },
            },
          ],
        }),
      },
    });

    await expect(bridge.list()).resolves.toEqual([
      {
        id: "legacy-job",
        name: "Legacy reminder",
        schedule: "0 8 * * *",
        enabled: true,
        deliver: "origin",
        origin: {
          platform: "discord",
          requester: { id: "user-7" },
          conversation: { id: "channel-42", name: "reminders" },
          thread: { id: "thread-3" },
        },
      },
      {
        id: "sidecar-job",
        name: "Sidecar reminder",
        schedule: "every 2w",
        enabled: false,
        deliver: "discord:sidecar-channel",
        origin: {
          platform: "discord",
          requester: { id: "sidecar-user" },
          conversation: { id: "sidecar-channel", name: "sidecar" },
        },
      },
    ]);
  });

  it("creates and controls a job using argument arrays", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ stdout: "Created job reminder-1" });
    const bridge = new HermesCronBridge({ execute });

    await bridge.create({
      name: "Take bins out",
      schedule: "2026-08-01T09:00:00",
      prompt: "Take bins out",
      deliver: "discord:123",
    });
    await bridge.pause("reminder-1");
    await bridge.resume("reminder-1");
    await bridge.update("reminder-1", {
      schedule: "0 9 * * 6",
      deliver: "discord:123",
    });
    await bridge.remove("reminder-1");

    expect(execute.mock.calls).toEqual([
      [
        "hermes",
        [
          "cron",
          "create",
          "2026-08-01T09:00:00",
          "Take bins out",
          "--name",
          "Take bins out",
          "--deliver",
          "discord:123",
        ],
      ],
      ["hermes", ["cron", "pause", "reminder-1"]],
      ["hermes", ["cron", "resume", "reminder-1"]],
      [
        "hermes",
        [
          "cron",
          "edit",
          "reminder-1",
          "--schedule",
          "0 9 * * 6",
          "--deliver",
          "discord:123",
        ],
      ],
      ["hermes", ["cron", "remove", "reminder-1"]],
    ]);
  });

  it("persists Discord origin context and defaults delivery to its conversation", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ stdout: "Created job: reminder-1" });
    const origins = {};
    const bridge = new HermesCronBridge({
      execute,
      originStore: {
        load: vi.fn().mockResolvedValue(origins),
        save: vi
          .fn()
          .mockImplementation(async (next) => Object.assign(origins, next)),
      },
    });
    const origin = {
      platform: "discord",
      requester: { id: "user-7", name: "Chris" },
      conversation: { id: "channel-42", name: "reminders" },
      message: { id: "message-9" },
      thread: { id: "thread-3", name: "Weekend chores" },
    };

    await bridge.create({
      name: "Take bins out",
      schedule: "2026-08-01T09:00:00",
      prompt: "Take bins out",
      origin,
    });

    expect(execute).toHaveBeenCalledWith("hermes", [
      "cron",
      "create",
      "2026-08-01T09:00:00",
      "Take bins out",
      "--name",
      "Take bins out",
      "--deliver",
      "discord:channel-42",
    ]);
    expect(origins).toEqual({ "reminder-1": origin });
  });
});
