// Browser-storage backend: mirrors the Flask API in app.py so the app works
// as a static site (e.g. on Vercel) with tasks saved in localStorage.
// Keep the rules here in sync with app.py.
(function (root) {
  const PRIORITIES = ["low", "medium", "high"];
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

  function createLocalApi(storage, key = "todo-items") {
    function load() {
      try {
        const data = JSON.parse(storage.getItem(key) || "[]");
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }
    function save(todos) {
      storage.setItem(key, JSON.stringify(todos));
    }
    function nowIso() {
      return new Date().toISOString();
    }
    function newId() {
      return Math.random().toString(16).slice(2, 8) + Date.now().toString(16).slice(-6);
    }
    function fail(status, error) {
      const err = new Error(error);
      err.status = status;
      throw err;
    }

    function listTodos(params) {
      const search = (params.get("search") || "").trim().toLowerCase();
      const status = params.get("status") || "all";
      const category = params.get("category") || "all";
      const priority = params.get("priority") || "all";
      const sort = params.get("sort") || "order";

      let todos = load();
      if (status === "active") todos = todos.filter((t) => !t.completed);
      else if (status === "completed") todos = todos.filter((t) => t.completed);
      if (category !== "all") todos = todos.filter((t) => (t.category || "") === category);
      if (priority !== "all") todos = todos.filter((t) => (t.priority || "") === priority);
      if (search) {
        todos = todos.filter((t) =>
          (t.title || "").toLowerCase().includes(search) ||
          (t.description || "").toLowerCase().includes(search));
      }

      const by = (f) => (a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0);
      if (sort === "due") todos.sort(by((t) => t.due_date || "9999-12-31"));
      else if (sort === "priority") todos.sort(by((t) => PRIORITY_RANK[t.priority] ?? 1));
      else if (sort === "created") todos.sort(by((t) => t.created_at || "")).reverse();
      else todos.sort(by((t) => t.order || 0));
      return todos;
    }

    function createTodo(data) {
      const title = String(data.title || "").trim();
      if (!title) fail(400, "Title is required");
      const todos = load();
      const maxOrder = todos.reduce((m, t) => Math.max(m, t.order ?? 0), -1);
      const todo = {
        id: newId(),
        title,
        description: String(data.description || "").trim(),
        completed: false,
        priority: PRIORITIES.includes(data.priority) ? data.priority : "medium",
        category: String(data.category || "General").trim() || "General",
        due_date: data.due_date || null,
        created_at: nowIso(),
        updated_at: nowIso(),
        order: maxOrder + 1,
      };
      todos.push(todo);
      save(todos);
      return todo;
    }

    function findOr404(todos, id) {
      const t = todos.find((x) => x.id === id);
      if (!t) fail(404, "Not found");
      return t;
    }

    function updateTodo(id, data) {
      const todos = load();
      const t = findOr404(todos, id);
      for (const field of ["title", "description", "priority", "category", "due_date", "completed"]) {
        if (field in data) {
          if (field === "title" && !String(data.title).trim()) fail(400, "Title cannot be empty");
          t[field] = data[field];
        }
      }
      t.updated_at = nowIso();
      save(todos);
      return t;
    }

    function toggleTodo(id) {
      const todos = load();
      const t = findOr404(todos, id);
      t.completed = !t.completed;
      t.updated_at = nowIso();
      save(todos);
      return t;
    }

    function deleteTodo(id) {
      const todos = load();
      const remaining = todos.filter((t) => t.id !== id);
      if (remaining.length === todos.length) fail(404, "Not found");
      save(remaining);
      return { ok: true };
    }

    function reorder(data) {
      const todos = load();
      const byId = new Map(todos.map((t) => [t.id, t]));
      (data.ids || []).forEach((id, i) => {
        if (byId.has(id)) byId.get(id).order = i;
      });
      save(todos);
      return { ok: true };
    }

    function clearCompleted() {
      const todos = load();
      const remaining = todos.filter((t) => !t.completed);
      save(remaining);
      return { ok: true, removed: todos.length - remaining.length };
    }

    function stats() {
      const todos = load();
      const total = todos.length;
      const completed = todos.filter((t) => t.completed).length;
      const today = new Date().toISOString().slice(0, 10);
      const overdue = todos.filter((t) => !t.completed && t.due_date && t.due_date < today).length;
      const categories = [...new Set(todos.map((t) => t.category || "General"))].sort();
      return {
        total,
        completed,
        active: total - completed,
        overdue,
        percent: total ? Math.round((completed / total) * 100) : 0,
        categories,
      };
    }

    // Same signature as the fetch-based api() helper in app.js.
    return async function localApi(path, opts = {}) {
      const method = (opts.method || "GET").toUpperCase();
      const body = opts.body ? JSON.parse(opts.body) : {};
      const url = new URL(path, "http://local");
      const p = url.pathname;
      let m;

      if (p === "/api/todos" && method === "GET") return listTodos(url.searchParams);
      if (p === "/api/todos" && method === "POST") return createTodo(body);
      if (p === "/api/todos/reorder" && method === "POST") return reorder(body);
      if (p === "/api/todos/completed" && method === "DELETE") return clearCompleted();
      if (p === "/api/stats" && method === "GET") return stats();
      if ((m = p.match(/^\/api\/todos\/([^/]+)\/toggle$/)) && method === "PATCH") return toggleTodo(m[1]);
      if ((m = p.match(/^\/api\/todos\/([^/]+)$/))) {
        if (method === "PUT") return updateTodo(m[1], body);
        if (method === "DELETE") return deleteTodo(m[1]);
      }
      fail(404, "Not found");
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { createLocalApi };
  else root.createLocalApi = createLocalApi;
})(typeof window !== "undefined" ? window : globalThis);
