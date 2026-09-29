# AGENTS.md

Rules for AI coding agents (Claude Code, Codex, Gemini, etc.) working on this repo.
Read this file before making any change.

## Project overview

Digital To Do List — a to-do app with notes, categories, priorities, due dates,
search/filter/sort, drag-and-drop ordering, stats and dark mode.

It runs in two modes with **the same frontend**:

| Mode | Where | Storage | Backend code |
|---|---|---|---|
| Server | `python3 app.py` → http://127.0.0.1:5050 | `todos.json` on disk | `app.py` (Flask REST API) |
| Static | Vercel (live site) | the visitor's `localStorage` | `static/local-api.js` |

`static/app.js` probes `GET /api/stats` on load: JSON response → server mode,
anything else → static mode using `createLocalApi(localStorage)`.

## Layout

```
app.py                  Flask app + REST API
templates/index.html    The single page (plain HTML, no Jinja logic — it is copied as-is for Vercel)
static/app.js           UI logic; calls api(path, opts)
static/local-api.js     Browser-storage implementation of the same API
static/style.css        Styles (light + dark via [data-theme])
tests/test_api.py       pytest tests for every Flask endpoint
tests/local-api.test.js node:test tests for local-api.js
build.sh / vercel.json  Static build for Vercel (output: dist/)
```

## Golden rules

1. **The API has two implementations. Keep them in sync.** Any change to an
   endpoint, field, validation rule or default in `app.py` must be mirrored in
   `static/local-api.js` (and vice versa), with tests on both sides.
2. **Write tests for every endpoint you create or change, and always run them
   to validate the endpoint works before saying you are done.** Never delete or
   weaken an existing test to make it pass — fix the code instead.
3. Keep `templates/index.html` free of Jinja syntax so the static build works.
4. No new dependencies or build tools (npm, bundlers, frameworks) unless the
   user asks. Vanilla JS, plain CSS, Flask only.
5. Keep changes small and focused; one feature or fix at a time.

## Testing & validation (required before finishing any task)

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt   # once
.venv/bin/python -m pytest -q                 # Flask endpoint tests
node --test tests/local-api.test.js           # browser-storage backend tests
sh build.sh                                   # static build must succeed
```

For each endpoint, tests must cover: the success case (status code + response
body), validation errors (400), unknown ids (404) where applicable, and that the
change is actually persisted (read it back with a follow-up request).

For UI changes, also run the app (`python3 app.py`) and check the feature in a
browser, in both server mode and static mode (`cd dist && python3 -m http.server 5051`).

## API contract

| Method | Path | Notes |
|---|---|---|
| GET | `/api/todos` | query: `search`, `status`=all\|active\|completed, `category`, `priority`, `sort`=order\|due\|priority\|created |
| POST | `/api/todos` | `{title*, description, priority, category, due_date}` → 201; empty title → 400 |
| PUT | `/api/todos/<id>` | partial update; empty title → 400; unknown id → 404 |
| PATCH | `/api/todos/<id>/toggle` | flips `completed`; unknown id → 404 |
| DELETE | `/api/todos/<id>` | unknown id → 404 |
| POST | `/api/todos/reorder` | `{ids: [...]}` sets manual order |
| DELETE | `/api/todos/completed` | removes completed tasks, returns `{removed}` |
| GET | `/api/stats` | `{total, active, completed, overdue, percent, categories}` |

Task shape: `{id, title, description, completed, priority, category, due_date, created_at, updated_at, order}`.
`description` is the task's **notes** field in the UI. `priority` ∈ low|medium|high (default medium);
`category` defaults to "General"; `due_date` is `YYYY-MM-DD` or null.

## Code conventions

- Python: PEP 8, 4-space indent, snake_case, errors returned as `{"error": "..."}` with a proper status code.
- JS: 2-space indent, camelCase, `const`/`let` (no `var`), async/await, no globals except
  `createLocalApi`. Always pass user text through `escapeHtml()` before inserting into HTML.
- Keep the UI usable at phone width and in both light and dark themes.

## Security & data

- Never commit `todos.json`, `.venv/`, secrets or API keys (see `.gitignore`).
- Never trust client input: trim strings, validate enums, enforce the title requirement server-side.

## Deployment

- GitHub → Vercel. Vercel runs `sh build.sh` and serves `dist/` (see `vercel.json`).
- After deploying, open the live URL and test add / edit (incl. notes) / complete /
  delete / search — a successful build does not prove the app works.
