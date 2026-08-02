// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Reminders App", () => {
  it("labels an origin-backed reminder's Discord destination separately from its source", async () => {
    vi.stubEnv("BASE_URL", "/reminders/");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "job-1",
              name: "Take bins out",
              schedule: "once at 2026-08-01 09:00",
              enabled: true,
              deliver: "discord:123",
              origin: {
                platform: "discord",
                requester: { id: "user-7", name: "Chris" },
                conversation: { id: "channel-42", name: "reminders" },
                message: { id: "message-9" },
                thread: { id: "thread-3", name: "Weekend chores" },
              },
            },
          ]),
          {
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created: true }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetch);

    render(<App />);
    expect(await screen.findByText("Take bins out")).not.toBeNull();
    expect(screen.getByText("Destination: #reminders")).not.toBeNull();
    expect(
      screen.getByText(
        "Source: Discord · Chris · #reminders · Weekend chores · message message-9",
      ),
    ).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Reminder name"), {
      target: { value: "Water plants" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Recurring" }));
    fireEvent.change(screen.getByLabelText("Schedule"), {
      target: { value: "every saturday 9am" },
    });
    fireEvent.change(screen.getByLabelText("Delivery target"), {
      target: { value: "discord:123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create reminder" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/reminders/api/reminders",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Water plants",
            schedule: "every saturday 9am",
            prompt: "Water plants",
            deliver: "discord:123",
          }),
        }),
      ),
    );
  });

  it("creates a one-time reminder from the date/time picker by default", async () => {
    vi.stubEnv("BASE_URL", "/reminders/");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created: true }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetch);

    render(<App />);
    await screen.findByText("No reminders yet.");
    fireEvent.change(screen.getByLabelText("Reminder name"), {
      target: { value: "Take bins out" },
    });
    fireEvent.change(screen.getByLabelText("Schedule"), {
      target: { value: "2026-08-01T09:00" },
    });
    fireEvent.change(screen.getByLabelText("Delivery target"), {
      target: { value: "discord:123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create reminder" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/reminders/api/reminders",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Take bins out",
            schedule: "2026-08-01T09:00:00",
            prompt: "Take bins out",
            deliver: "discord:123",
          }),
        }),
      ),
    );
  });

  it("edits an origin-backed reminder's schedule and concrete Discord destination", async () => {
    vi.stubEnv("BASE_URL", "/reminders/");
    vi.spyOn(window, "prompt")
      .mockReturnValueOnce("every saturday 9am")
      .mockReturnValueOnce("discord:other-channel");
    const job = {
      id: "job-1",
      name: "Water plants",
      schedule: "every sunday 9am",
      enabled: true,
      deliver: "discord:123",
      origin: {
        platform: "discord",
        requester: { id: "user-7", name: "Chris" },
        conversation: { id: "channel-42", name: "reminders" },
      },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([job]), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([job]), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetch);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(window.prompt).toHaveBeenNthCalledWith(
      2,
      "Destination",
      "discord:channel-42",
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/reminders/api/reminders/job-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            schedule: "every saturday 9am",
            deliver: "discord:other-channel",
          }),
        }),
      ),
    );
  });
});
