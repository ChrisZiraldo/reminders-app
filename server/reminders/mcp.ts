import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RemindersBridge } from "./api.js";

const jobId = z.string().regex(/^[A-Za-z0-9_-]+$/);
const origin = z.object({
  platform: z.literal("discord"),
  requester: z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
  }),
  conversation: z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    type: z.enum(["channel", "dm"]).optional(),
  }),
  message: z.object({ id: z.string().min(1) }).optional(),
  thread: z
    .object({ id: z.string().min(1), name: z.string().min(1).optional() })
    .optional(),
});
const input = {
  name: z.string().min(1),
  schedule: z.string().min(1),
  prompt: z.string().min(1),
  deliver: z.string().min(1).optional(),
  origin,
};
const editInput = z
  .object({
    jobId,
    schedule: z.string().min(1),
    deliver: z.string().min(1),
  })
  .strict();
const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

function concreteDiscordDelivery(callerOrigin: z.infer<typeof origin>): string {
  return `discord:${callerOrigin.conversation.id}`;
}

export function createRemindersMcpServer({
  bridge,
}: {
  bridge: Required<RemindersBridge>;
}) {
  const server = new McpServer({ name: "reminders-app", version: "0.1.0" });
  server.registerTool(
    "list_reminders",
    {
      description:
        "List Hermes cron reminders, including delivery targets and enabled state.",
    },
    async () => json(await bridge.list()),
  );
  server.registerTool(
    "create_reminder",
    {
      description:
        "Create a one-time or recurring Hermes reminder from the invoking Discord caller context. origin is required; pass the real Discord requester, conversation, optional message, and optional thread metadata. If no Discord caller context is available, do not create the reminder.",
      inputSchema: input,
    },
    async (value) => {
      await bridge.create({
        ...value,
        deliver:
          value.deliver && value.deliver !== "origin"
            ? value.deliver
            : concreteDiscordDelivery(value.origin),
      });
      return json({ created: true });
    },
  );
  server.registerTool(
    "pause_reminder",
    { description: "Pause a Hermes reminder.", inputSchema: { jobId } },
    async ({ jobId: id }) => {
      await bridge.pause(id);
      return json({ paused: true, jobId: id });
    },
  );
  server.registerTool(
    "resume_reminder",
    { description: "Resume a Hermes reminder.", inputSchema: { jobId } },
    async ({ jobId: id }) => {
      await bridge.resume(id);
      return json({ resumed: true, jobId: id });
    },
  );
  server.registerTool(
    "edit_reminder",
    {
      description:
        "Edit a Hermes reminder schedule or delivery destination.",
      inputSchema: editInput,
    },
    async ({ jobId: id, ...value }) => {
      await bridge.update(id, value);
      return json({ updated: true, jobId: id });
    },
  );
  server.registerTool(
    "delete_reminder",
    { description: "Delete a Hermes reminder.", inputSchema: { jobId } },
    async ({ jobId: id }) => {
      await bridge.remove(id);
      return json({ deleted: true, jobId: id });
    },
  );
  return server;
}
