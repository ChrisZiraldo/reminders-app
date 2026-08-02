import { FormEvent, useEffect, useMemo, useState } from "react";
import "./styles.css";

type Reminder = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  deliver: string;
  origin?: {
    platform: string;
    requester: { id: string; name?: string };
    conversation: { id: string; name?: string };
    message?: { id: string };
    thread?: { id: string; name?: string };
  };
};
type Filter = "all" | "active" | "paused";
type ScheduleMode = "once" | "recurring";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
];

function api(path: string) {
  return `${import.meta.env.BASE_URL}api${path}`;
}

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error("Reminder request failed");
  return response.status === 204 ? undefined : response.json();
}

function originLabel(origin: NonNullable<Reminder["origin"]>) {
  return [
    origin.platform.slice(0, 1).toUpperCase() + origin.platform.slice(1),
    origin.requester.name ?? origin.requester.id,
    `#${origin.conversation.name ?? origin.conversation.id}`,
    origin.thread?.name ?? origin.thread?.id,
    origin.message ? `message ${origin.message.id}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function destinationLabel(job: Reminder) {
  if (job.origin)
    return `#${job.origin.conversation.name ?? job.origin.conversation.id}`;
  return job.deliver;
}

function editableDestination(job: Reminder) {
  if (job.origin)
    return `${job.origin.platform}:${job.origin.conversation.id}`;
  return job.deliver;
}

function PlusIcon() {
  return (
    <span className="qa-icon" aria-hidden="true">
      <svg className="qa-icon-glyph" viewBox="0 0 16 16">
        <path
          d="M8 3.5v9M3.5 8h9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M11.3 1.7a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1l-7.8 7.8-3.4.9.9-3.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M5 3v10M11 3v10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ResumeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4.5 2.5v11l9-5.5-9-5.5Z" fill="currentColor" />
    </svg>
  );
}

export function App() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [name, setName] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("once");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleText, setScheduleText] = useState("");
  const [deliver, setDeliver] = useState("origin");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, setPending] = useState<Set<string>>(new Set());

  const reload = () =>
    request(api("/reminders"))
      .then((jobs) => setReminders(jobs as Reminder[]))
      .catch((cause) => setError(String(cause)));
  useEffect(() => {
    void reload();
  }, []);

  const activeCount = reminders.filter((job) => job.enabled).length;
  const pausedCount = reminders.length - activeCount;
  const visibleReminders = useMemo(
    () =>
      reminders.filter(
        (job) =>
          filter === "all" ||
          (filter === "active" ? job.enabled : !job.enabled),
      ),
    [reminders, filter],
  );

  async function withPending(key: string, action: () => Promise<void>) {
    setPending((current) => new Set(current).add(key));
    try {
      await action();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  const schedule =
    scheduleMode === "once"
      ? scheduleDate
        ? `${scheduleDate}:00`
        : ""
      : scheduleText.trim();

  async function createReminder(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !schedule.trim() || !deliver.trim()) return;
    await withPending("create", async () => {
      await request(api("/reminders"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          schedule: schedule.trim(),
          prompt: name.trim(),
          deliver: deliver.trim(),
        }),
      });
      setName("");
      setScheduleDate("");
      setScheduleText("");
      await reload();
    });
  }

  async function control(job: Reminder, action: "pause" | "resume" | "delete") {
    await withPending(`${action}:${job.id}`, async () => {
      await request(
        api(`/reminders/${job.id}${action === "delete" ? "" : `/${action}`}`),
        { method: action === "delete" ? "DELETE" : "POST" },
      );
      await reload();
    });
  }

  async function edit(job: Reminder) {
    const nextSchedule = window.prompt("Schedule", job.schedule);
    if (!nextSchedule?.trim()) return;
    const nextDeliver = window.prompt("Destination", editableDestination(job));
    if (!nextDeliver?.trim()) return;
    await withPending(`edit:${job.id}`, async () => {
      await request(api(`/reminders/${job.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schedule: nextSchedule.trim(),
          deliver: nextDeliver.trim(),
        }),
      });
      await reload();
    });
  }

  return (
    <main className="reminders-shell">
      <header className="app-top">
        <p className="eyebrow">Hermes cron</p>
        <h1>Reminders</h1>
        <p className="subtitle">
          Upcoming and paused deliveries, under your control.
        </p>
      </header>
      {error && (
        <p role="alert" className="error" onClick={() => setError("")}>
          {error}
        </p>
      )}

      <div className="layout">
        <div className="sidebar">
          <form onSubmit={createReminder} className="quickadd">
            <div className="quickadd-row">
              <PlusIcon />
              <label htmlFor="reminder-name" className="sr-only">
                Reminder name
              </label>
              <input
                id="reminder-name"
                aria-label="Reminder name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="New reminder…"
              />
            </div>
            <div className="quickadd-details">
              <div className="schedule-field">
                <span className="field-label">Schedule</span>
                <div
                  className="segmented segmented-mini"
                  role="group"
                  aria-label="Schedule type"
                >
                  <button
                    type="button"
                    className={scheduleMode === "once" ? "active" : ""}
                    onClick={() => setScheduleMode("once")}
                  >
                    One-time
                  </button>
                  <button
                    type="button"
                    className={scheduleMode === "recurring" ? "active" : ""}
                    onClick={() => setScheduleMode("recurring")}
                  >
                    Recurring
                  </button>
                </div>
                {scheduleMode === "once" ? (
                  <input
                    aria-label="Schedule"
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(event) => setScheduleDate(event.target.value)}
                  />
                ) : (
                  <input
                    aria-label="Schedule"
                    placeholder="every monday 9am"
                    value={scheduleText}
                    onChange={(event) => setScheduleText(event.target.value)}
                  />
                )}
              </div>
              <label>
                Delivery target
                <input
                  aria-label="Delivery target"
                  value={deliver}
                  onChange={(event) => setDeliver(event.target.value)}
                />
              </label>
            </div>
            <button type="submit" disabled={pending.has("create")}>
              {pending.has("create") ? "Creating…" : "Create reminder"}
            </button>
          </form>

          <nav aria-label="Filter reminders" className="shelf">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={
                  "tile status-" +
                  option.id +
                  (filter === option.id ? " active" : "")
                }
                onClick={() => setFilter(option.id)}
              >
                <span className="tile-dot" aria-hidden="true" />
                <span className="tile-name">{option.label}</span>
                <span className="tile-foot">
                  {option.id === "all"
                    ? reminders.length
                    : option.id === "active"
                      ? activeCount
                      : pausedCount}
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div className="main">
          <section aria-label="Scheduled reminders" className="sheet">
            {visibleReminders.length === 0 ? (
              <div className="empty-state">
                <p>
                  {reminders.length === 0
                    ? "No reminders yet."
                    : "No reminders match this filter."}
                </p>
              </div>
            ) : (
              <ul className="items">
                {visibleReminders.map((job) => (
                  <li
                    key={job.id}
                    className={"item" + (job.enabled ? "" : " paused")}
                  >
                    <span
                      className={"status-dot" + (job.enabled ? " active" : "")}
                      aria-hidden="true"
                    />
                    <div className="item-body">
                      <div className="item-main">
                        <span className="item-text">{job.name}</span>
                        <span className="status-label">
                          {job.enabled ? "Active" : "Paused"}
                        </span>
                      </div>
                      <div className="meta">
                        <span className="schedule">{job.schedule}</span>
                        <span className="deliver-badge">
                          Destination: {destinationLabel(job)}
                        </span>
                        {job.origin && (
                          <span className="origin-badge">
                            Source: {originLabel(job.origin)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="item-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Edit"
                        onClick={() => void edit(job)}
                        disabled={pending.has(`edit:${job.id}`)}
                      >
                        <EditIcon />
                      </button>
                      {job.enabled ? (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Pause"
                          onClick={() => void control(job, "pause")}
                          disabled={pending.has(`pause:${job.id}`)}
                        >
                          <PauseIcon />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Resume"
                          onClick={() => void control(job, "resume")}
                          disabled={pending.has(`resume:${job.id}`)}
                        >
                          <ResumeIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label="Delete"
                        onClick={() => void control(job, "delete")}
                        disabled={pending.has(`delete:${job.id}`)}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
