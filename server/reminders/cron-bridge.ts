import { execFile as nodeExecFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(nodeExecFile);

export type ReminderOrigin = {
  platform: string;
  requester: { id: string; name?: string };
  conversation: { id: string; name?: string; type?: "channel" | "dm" };
  message?: { id: string };
  thread?: { id: string; name?: string };
};

export type ReminderJob = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  deliver: string;
  origin?: ReminderOrigin;
};

export type ReminderJobInput = {
  name: string;
  schedule: string;
  prompt: string;
  deliver?: string;
  origin?: ReminderOrigin;
};

export type ReminderEditInput = {
  schedule: string;
  deliver: string;
};

type Execute = (
  command: string,
  arguments_: string[],
) => Promise<{ stdout: string }>;

type CronBridgeOptions = {
  execute?: Execute;
  originStore?: ReminderOriginStore;
  cronStore?: CronStore;
};

type ReminderOriginStore = {
  load(): Promise<Record<string, ReminderOrigin>>;
  save(origins: Record<string, ReminderOrigin>): Promise<void>;
};

type CronStore = {
  load(): Promise<unknown>;
};

const originStorePath = join(
  homedir(),
  ".hermes",
  "cron",
  "reminders-app-origins.json",
);
const cronStorePath = join(homedir(), ".hermes", "cron", "jobs.json");

const fileOriginStore: ReminderOriginStore = {
  async load() {
    try {
      return JSON.parse(await readFile(originStorePath, "utf8")) as Record<
        string,
        ReminderOrigin
      >;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  },
  async save(origins) {
    await mkdir(dirname(originStorePath), { recursive: true });
    await writeFile(originStorePath, JSON.stringify(origins, null, 2), {
      mode: 0o600,
    });
  },
};

const fileCronStore: CronStore = {
  async load() {
    try {
      return JSON.parse(await readFile(cronStorePath, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { jobs: [] };
      throw error;
    }
  },
};

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeConversationType(
  value: Record<string, unknown>,
): "channel" | "dm" | undefined {
  const type =
    stringField(value.chat_type) ?? stringField(value.conversation_type);
  return type === "channel" || type === "dm" ? type : undefined;
}

function normalizeCronOrigin(value: unknown): ReminderOrigin | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const raw = value as Record<string, unknown>;
  const platform = stringField(raw.platform);
  const conversationId = stringField(raw.chat_id);
  const requesterId = stringField(raw.user_id);
  if (!platform || !conversationId || !requesterId) return undefined;

  const conversationName = stringField(raw.chat_name);
  const threadId = stringField(raw.thread_id);
  const threadName = stringField(raw.thread_name);
  const conversationType = normalizeConversationType(raw);
  return {
    platform,
    requester: { id: requesterId },
    conversation: {
      id: conversationId,
      ...(conversationName ? { name: conversationName } : {}),
      ...(conversationType ? { type: conversationType } : {}),
    },
    ...(threadId
      ? {
          thread: { id: threadId, ...(threadName ? { name: threadName } : {}) },
        }
      : {}),
  };
}

function cronOrigins(value: unknown): Record<string, ReminderOrigin> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const jobs = (value as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) return {};
  return Object.fromEntries(
    jobs.flatMap((job) => {
      if (!job || typeof job !== "object" || Array.isArray(job)) return [];
      const record = job as Record<string, unknown>;
      const id = stringField(record.id);
      const origin = normalizeCronOrigin(record.origin);
      return id && origin ? [[id, origin]] : [];
    }),
  );
}

function parseJobs(stdout: string): ReminderJob[] {
  const jobs: ReminderJob[] = [];
  let current: Partial<ReminderJob> | undefined;

  for (const line of stdout.split("\n")) {
    const header = line.match(/^\s+([\w-]+) \[(active|paused)\]$/);
    if (header) {
      if (current?.id && current.name && current.schedule && current.deliver)
        jobs.push(current as ReminderJob);
      current = { id: header[1], enabled: header[2] === "active" };
      continue;
    }
    const field = line.match(/^\s+(Name|Schedule|Deliver):\s+(.+)$/);
    if (!field || !current) continue;
    if (field[1] === "Name") current.name = field[2].trim();
    if (field[1] === "Schedule") current.schedule = field[2].trim();
    if (field[1] === "Deliver") current.deliver = field[2].trim();
  }
  if (current?.id && current.name && current.schedule && current.deliver)
    jobs.push(current as ReminderJob);
  return jobs;
}

function deliveryFor(input: ReminderJobInput): string {
  if (input.deliver) return input.deliver;
  if (input.origin)
    return `${input.origin.platform}:${input.origin.conversation.id}`;
  throw new Error("a delivery target or origin conversation is required");
}

function createdJobId(stdout: string): string | undefined {
  return stdout.match(/Created job:\s*([\w-]+)/)?.[1];
}

export class HermesCronBridge {
  private readonly execute: Execute;
  private readonly originStore: ReminderOriginStore;
  private readonly cronStore: CronStore;

  constructor({
    execute = (command, arguments_) => execFile(command, arguments_),
    originStore = fileOriginStore,
    cronStore = fileCronStore,
  }: CronBridgeOptions = {}) {
    this.execute = execute;
    this.originStore = originStore;
    this.cronStore = cronStore;
  }

  async list(): Promise<ReminderJob[]> {
    const [{ stdout }, origins, storedJobs] = await Promise.all([
      this.execute("hermes", ["cron", "list", "--all"]),
      this.originStore.load(),
      this.cronStore.load(),
    ]);
    const hydratedOrigins = cronOrigins(storedJobs);
    return parseJobs(stdout).map((job) => ({
      ...job,
      ...((origins[job.id] ?? hydratedOrigins[job.id])
        ? { origin: origins[job.id] ?? hydratedOrigins[job.id] }
        : {}),
    }));
  }

  async create(input: ReminderJobInput): Promise<void> {
    const { stdout } = await this.execute("hermes", [
      "cron",
      "create",
      input.schedule,
      input.prompt,
      "--name",
      input.name,
      "--deliver",
      deliveryFor(input),
    ]);
    const jobId = createdJobId(stdout);
    if (jobId && input.origin) {
      const origins = await this.originStore.load();
      origins[jobId] = input.origin;
      await this.originStore.save(origins);
    }
  }

  async pause(jobId: string): Promise<void> {
    await this.execute("hermes", ["cron", "pause", jobId]);
  }

  async resume(jobId: string): Promise<void> {
    await this.execute("hermes", ["cron", "resume", jobId]);
  }

  async update(jobId: string, input: ReminderEditInput): Promise<void> {
    await this.execute("hermes", [
      "cron",
      "edit",
      jobId,
      "--schedule",
      input.schedule,
      "--deliver",
      input.deliver,
    ]);
  }

  async remove(jobId: string): Promise<void> {
    await this.execute("hermes", ["cron", "remove", jobId]);
    const origins = await this.originStore.load();
    if (origins[jobId]) {
      delete origins[jobId];
      await this.originStore.save(origins);
    }
  }
}
