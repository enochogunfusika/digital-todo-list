# ✅ Digital To Do List

Full-featured web to-do app — Flask backend + vanilla JS frontend.
Built entirely with an AI coding agent (Claude Code) for HNG Internship Stage 1.

**Live app:** _coming soon_

## Features
- Add / edit / complete / delete tasks
- Categories, priorities (low/medium/high), due dates, notes
- Search, filter by status / category / priority, sort (manual / due / priority / newest)
- Drag-and-drop manual reorder
- Stats dashboard: total, active, done, overdue + progress bar
- Dark mode (persisted in localStorage)
- Two storage modes: `todos.json` via Flask when run locally; the browser's localStorage on the live (static) site
- REST API + responsive UI

## Quick start

```bash
cd "/Users/mac/Dev/Digital To do list"
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/python app.py
```

Open http://127.0.0.1:5050 (not port 5000 — on macOS that port belongs to AirPlay Receiver).

## Tests

```bash
.venv/bin/python -m pytest -q            # Flask API endpoints
node --test tests/local-api.test.js      # browser-storage backend
```

## Deploy (Vercel)

Import the GitHub repo in Vercel — `vercel.json` builds a static site (`sh build.sh` → `dist/`).
The live site stores each visitor's tasks in their own browser.

See [AGENTS.md](AGENTS.md) for the rules AI coding agents follow in this repo.

## API
- `GET /api/todos?search=&status=all|active|completed&category=&priority=&sort=order|due|priority|created`
- `POST /api/todos` `{title, description, priority, category, due_date}`
- `PUT /api/todos/<id>` — update fields
- `PATCH /api/todos/<id>/toggle` — toggle complete
- `DELETE /api/todos/<id>`
- `POST /api/todos/reorder` `{ids: [...]}`
- `DELETE /api/todos/completed` — clear done
- `GET /api/stats`

Task shape: `{id, title, description, completed, priority, category, due_date, created_at, updated_at, order}`
