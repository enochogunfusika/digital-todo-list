// Tests for the browser-storage backend (static/local-api.js). Run: node --test tests/local-api.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createLocalApi } = require("../static/local-api.js");

function memoryStorage() {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } };
}

function setup() {
  const api = createLocalApi(memoryStorage());
  const add = (fields) => api("/api/todos", { method: "POST", body: JSON.stringify({ title: "Task", ...fields }) });
  return { api, add };
}

test("creates a todo with notes and defaults", async () => {
  const { add } = setup();
  const t = await add({ title: "  Buy milk ", description: "2 litres", priority: "urgent" });
  assert.equal(t.title, "Buy milk");
  assert.equal(t.description, "2 litres");
  assert.equal(t.priority, "medium");
  assert.equal(t.category, "General");
  assert.equal(t.completed, false);
});

test("rejects a missing title with 400", async () => {
  const { api } = setup();
  await assert.rejects(api("/api/todos", { method: "POST", body: "{}" }), { status: 400, message: "Title is required" });
});

test("lists, filters, searches and sorts", async () => {
  const { api, add } = setup();
  await add({ title: "Report", description: "quarterly", category: "Work", priority: "high", due_date: "2030-05-01" });
  const g = await add({ title: "Groceries", category: "Shopping", priority: "low", due_date: "2030-01-01" });
  await api(`/api/todos/${g.id}/toggle`, { method: "PATCH" });
  const titles = async (q) => (await api("/api/todos?" + q)).map((t) => t.title);
  assert.deepEqual(await titles("status=active"), ["Report"]);
  assert.deepEqual(await titles("status=completed"), ["Groceries"]);
  assert.deepEqual(await titles("category=Shopping"), ["Groceries"]);
  assert.deepEqual(await titles("search=QUARTER"), ["Report"]);
  assert.deepEqual(await titles("sort=due"), ["Groceries", "Report"]);
  assert.deepEqual(await titles("sort=priority"), ["Report", "Groceries"]);
});

test("updates, toggles and deletes; unknown ids are 404", async () => {
  const { api, add } = setup();
  const t = await add({});
  const u = await api(`/api/todos/${t.id}`, { method: "PUT", body: JSON.stringify({ title: "New", description: "n" }) });
  assert.equal(u.title, "New");
  assert.equal(u.description, "n");
  await assert.rejects(api(`/api/todos/${t.id}`, { method: "PUT", body: JSON.stringify({ title: " " }) }), { status: 400 });
  assert.equal((await api(`/api/todos/${t.id}/toggle`, { method: "PATCH" })).completed, true);
  assert.deepEqual(await api(`/api/todos/${t.id}`, { method: "DELETE" }), { ok: true });
  await assert.rejects(api(`/api/todos/${t.id}`, { method: "DELETE" }), { status: 404 });
  await assert.rejects(api("/api/todos/nope/toggle", { method: "PATCH" }), { status: 404 });
});

test("reorders and clears completed", async () => {
  const { api, add } = setup();
  const a = await add({ title: "A" });
  const b = await add({ title: "B" });
  await api("/api/todos/reorder", { method: "POST", body: JSON.stringify({ ids: [b.id, a.id] }) });
  assert.deepEqual((await api("/api/todos")).map((t) => t.title), ["B", "A"]);
  await api(`/api/todos/${a.id}/toggle`, { method: "PATCH" });
  assert.equal((await api("/api/todos/completed", { method: "DELETE" })).removed, 1);
  assert.deepEqual((await api("/api/todos")).map((t) => t.title), ["B"]);
});

test("stats", async () => {
  const { api, add } = setup();
  await add({ title: "late", due_date: "2000-01-01", category: "Work" });
  const d = await add({ title: "done", category: "Home" });
  await api(`/api/todos/${d.id}/toggle`, { method: "PATCH" });
  assert.deepEqual(await api("/api/stats"), {
    total: 2, completed: 1, active: 1, overdue: 1, percent: 50, categories: ["Home", "Work"],
  });
});
