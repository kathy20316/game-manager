# NYSA Referee Staff

Web app for managing soccer game schedules, referee availability, assignor monitoring, notifications, and CSV availability exports.

## Requirements

- Node.js
- PostgreSQL

## Environment

Create a local `.env` or set these variables in your shell/host:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
AUTH_SECRET=replace-with-a-long-random-secret
DATABASE_SSL=false
```

Use `DATABASE_SSL=false` for local PostgreSQL. On Render, omit `DATABASE_SSL` or leave it unset so SSL is used.

## Local Development

Install dependencies:

```bash
npm install
```

Start the full app:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

The backend automatically creates the PostgreSQL tables on startup. If the database is empty and `data/db.json` exists, it imports that file once as seed data.

## Production

Build and start:

```bash
npm run build
npm start
```

For Render:

```text
Build Command: npm install --include=dev && npm run build
Start Command: npm start
```

Add these environment variables in Render:

```text
DATABASE_URL=<your Render PostgreSQL internal database URL>
AUTH_SECRET=<a long random secret>
NODE_ENV=production
```

The app now uses PostgreSQL for runtime data. `data/db.json` is only a legacy seed/import file, not the live database.

*****************************************************************
App is currently live at https://game-manager-yill.onrender.com/
*****************************************************************
