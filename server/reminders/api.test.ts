import { describe, expect, it, vi } from "vitest";
import { buildRemindersApi } from "./api.js";

const job = {
  id: "job-1",
  name: "Take bins out",
  schedule: "2026-08-01T09:00:00",
  enabled: true,
  deliver: "discord:123",
};

describe("Reminders HTTP API", () => {
  it("lists existing Hermes jobs and creates a reminder through the safe bridge", async () => {
    const bridge = {
      list: vi.fn().mockResolvedValue([job]),
      create: vi.fn().mockResolvedValue(undefined),
    };
    const app = buildRemindersApi(bridge);

    expect(
      (await app.inject({ method: "GET", url: "/api/reminders" })).json(),
    ).toEqual([job]);
    const created = await app.inject({
      method: "POST",
      url: "/api/reminders",
      payload: {
        name: "Take bins out",
        schedule: "2026-08-01T09:00:00",
        prompt: "Take bins out",
        deliver: "discord:123",
      },
    });

    expect(created.statusCode).toBe(201);
    expect(bridge.create).toHaveBeenCalledWith({
      name: "Take bins out",
      schedule: "2026-08-01T09:00:00",
      prompt: "Take bins out",
      deliver: "discord:123",
    });
    await app.close();
  });

  it("accepts origin metadata without a delivery target", async () => {
    const bridge = { create: vi.fn().mockResolvedValue(undefined) };
    const app = buildRemindersApi(bridge);
    const origin = {
      platform: "discord",
      requester: { id: "user-7", name: "Chris" },
      conversation: { id: "channel-42", name: "reminders" },
      message: { id: "message-9" },
      thread: { id: "thread-3", name: "Weekend chores" },
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/reminders",
      payload: {
        name: "Take bins out",
        schedule: "2026-08-01T09:00:00",
        prompt: "Take bins out",
        origin,
      },
    });

    expect(created.statusCode).toBe(201);
    expect(bridge.create).toHaveBeenCalledWith({
      name: "Take bins out",
      schedule: "2026-08-01T09:00:00",
      prompt: "Take bins out",
      origin,
    });
    await app.close();
  });

  it("pauses, resumes, edits, and removes the targeted reminder only", async () => {
    const bridge = {
      list: vi.fn(),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const app = buildRemindersApi(bridge);

    expect(
      (await app.inject({ method: "POST", url: "/api/reminders/job-1/pause" }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: "POST", url: "/api/reminders/job-1/resume" }))
        .statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/reminders/job-1",
          payload: {
            schedule: "0 9 * * 6",
            deliver: "discord:123",
          },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: "DELETE", url: "/api/reminders/job-1" }))
        .statusCode,
    ).toBe(204);
    expect(bridge.pause).toHaveBeenCalledWith("job-1");
    expect(bridge.resume).toHaveBeenCalledWith("job-1");
    expect(bridge.update).toHaveBeenCalledWith("job-1", {
      schedule: "0 9 * * 6",
      deliver: "discord:123",
    });
    expect(bridge.remove).toHaveBeenCalledWith("job-1");
    await app.close();
  });

  it("rejects origin provenance on reminder edits", async () => {
    const bridge = { update: vi.fn().mockResolvedValue(undefined) };
    const app = buildRemindersApi(bridge);

    const edited = await app.inject({
      method: "PATCH",
      url: "/api/reminders/job-1",
      payload: {
        schedule: "0 9 * * 6",
        deliver: "discord:123",
        origin: {
          platform: "discord",
          requester: { id: "user-7" },
          conversation: { id: "channel-42" },
        },
      },
    });

    expect(edited.statusCode).toBe(400);
    expect(bridge.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects non-editable name and prompt fields", async () => {
    const bridge = { update: vi.fn().mockResolvedValue(undefined) };
    const app = buildRemindersApi(bridge);

    const edited = await app.inject({
      method: "PATCH",
      url: "/api/reminders/job-1",
      payload: {
        name: "Bins tomorrow",
        schedule: "0 9 * * 6",
        deliver: "discord:123",
      },
    });

    expect(edited.statusCode).toBe(400);
    expect(bridge.update).not.toHaveBeenCalled();
    await app.close();
  });
});
