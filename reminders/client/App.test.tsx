// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Reminders App", () => {
  it("labels a typed Discord DM without fabricating a channel marker", async () => {
    vi.stubEnv("BASE_URL", "/reminders/");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "job-dm",
              name: "Call Mum",
              schedule: "0 8 * * *",
              enabled: true,
              deliver: "origin",
              origin: {
                platform: "discord",
                requester: { id: "user-7", name: "Chris" },
                conversation: {
                  id: "dm-42",
                  name: "Chris",
                  type: "dm",
                },
              },
            },
          ]),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(<App />);

    expect(await screen.findByText("Call Mum")).not.toBeNull();
    expect(screen.getByText("Destination: DM Chris")).not.toBeNull();
    expect(
      screen.getByText("Source: Discord · Chris · DM Chris"),
    ).not.toBeNull();
  });

  it("labels an explicit Discord destination separately from its source", async () => {
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
              deliver: "discord:destination-dm-42",
              origin: {
                platform: "discord",
                requester: { id: "user-7", name: "Chris" },
                conversation: { id: "source-dm-7", name: "Chris", type: "dm" },
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
    expect(screen.getByText("Destination: discord:destination-dm-42")).not.toBeNull();
    expect(
      screen.getByText(
        "Source: Discord · Chris · DM Chris · Weekend chores · message message-9",
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
    fireEvent.change(screen.getByLabelText("Schedule date"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("Schedule time"), {
      target: { value: "09:00" },
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

  it("edits an origin-backed reminder's schedule and destination from its inline editor", async () => {
    vi.stubEnv("BASE_URL", "/reminders/");
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
    const editor = screen.getByRole("form", { name: "Edit Water plants" });
    const source = within(editor).getByLabelText("Source") as HTMLInputElement;
    expect(source.value).toBe("Discord · Chris · reminders");
    expect(source.disabled).toBe(true);
    fireEvent.change(within(editor).getByLabelText("Schedule"), {
      target: { value: "every saturday 9am" },
    });
    fireEvent.change(within(editor).getByLabelText("Destination"), {
      target: { value: "discord:other-channel" },
    });
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save changes" }),
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
