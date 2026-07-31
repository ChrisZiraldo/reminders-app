# Reminders App

A private, Tailnet-hosted dashboard for Hermes cron reminders. It uses the same TypeScript, React, Vite, and Fastify approach as Lists, but is an independent app and service.

## Features

- View active, paused, and completed one-time cron reminders.
- Create, edit, pause, resume, run, and delete reminders.
- See schedules and delivery destinations.
- Manage reminders through a dedicated stdio MCP server.

## Commands

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run start` — runs the loopback-only web service (port `3458` by default; set `REMINDERS_PORT` to override).
- `npm run mcp` — runs the MCP server over stdio after build.

## Deployment

Run as a dedicated `reminders-app.service`, bound to `127.0.0.1:3458`. Configure Tailscale Serve to route `/reminders` to that port and add an MCP entry pointing to `dist/server/reminders/mcp-main.js`. Do not expose it publicly.
