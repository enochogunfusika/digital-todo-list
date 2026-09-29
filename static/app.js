const $ = (id) => document.getElementById(id);
const state = { status: "all", todos: [], editingId: null, dragId: null };

// Uses the Flask API when a server is running; otherwise (static hosting such
// as Vercel) falls back to browser storage via local-api.js.
let api = serverApi;
async function pickBackend() {
  try {
    const res = await fetch("/api/stats");
    if (res.ok && (res.headers.get("content-type") || "").includes("application/json")) return "server";
  } catch {}
  api = window.createLocalApi(window.localStorage);
  return "local";
}

async function serverApi(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function queryParams() {
  const p = new URLSearchParams();
  p.set("status", state.status);
  p.set("search", $("searchInput").value.trim());
  p.set("category", $("filterCategory").value);
  p.set("priority", $("filterPriority").value);
  p.set("sort", $("sortSelect").value);
  return p.toString();
}

async function refresh() {
  const [todos, stats] = await Promise.all([
    api("/api/todos?" + queryParams()),
    api("/api/stats"),
  ]);
  state.todos = todos;
  renderTodos(todos);
  renderStats(stats);
}

function renderStats(s) {
  $("statTotal").textContent = s.total;
  $("statActive").textContent = s.active;
  $("statCompleted").textContent = s.completed;
  $("statOverdue").textContent = s.overdue;
  $("progressFill").style.width = s.percent + "%";
  $("progressText").textContent = `${s.percent}% complete`;
  // category filter options (preserve selection)
  const sel = $("filterCategory");
  const cur = sel.value;
  sel.innerHTML = `<option value="all">All categories</option>` +
    s.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "all";
  $("catList").innerHTML = s.categories.map((c) => `<option value="${escapeHtml(c)}">`).join("");
}

function isOverdue(t) {
  if (!t.due_date || t.completed) return false;
  return t.due_date < new Date().toISOString().slice(0, 10);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderTodos(todos) {
  const list = $("todoList");
  $("emptyState").classList.toggle("hidden", todos.length > 0);
  list.innerHTML = "";
  const prioEmoji = { high: "🔴", medium: "🟡", low: "🟢" };
  for (const t of todos) {
    const li = document.createElement("li");
    li.className = "todo" + (t.completed ? " completed" : "");
    li.draggable = true;
    li.dataset.id = t.id;
    li.innerHTML = `
      <input type="checkbox" class="checkbox" ${t.completed ? "checked" : ""} title="Mark done" />
      <div class="todo-body">
        <div class="t-title">${escapeHtml(t.title)}</div>
        ${t.description ? `<div class="t-desc">${escapeHtml(t.description)}</div>` : ""}
        <div class="meta">
          <span class="badge ${t.priority}">${prioEmoji[t.priority] || ""} ${escapeHtml(t.priority)}</span>
          <span class="badge">📁 ${escapeHtml(t.category)}</span>
          ${t.due_date ? `<span class="badge ${isOverdue(t) ? "overdue" : ""}">📅 ${escapeHtml(t.due_date)}${isOverdue(t) ? " — overdue!" : ""}</span>` : ""}
        </div>
      </div>
      <div class="todo-actions">
        <button class="edit" title="Edit">✏️</button>
        <button class="del" title="Delete">🗑️</button>
      </div>`;
    li.querySelector(".checkbox").addEventListener("change", async () => {
      await api(`/api/todos/${t.id}/toggle`, { method: "PATCH" });
      refresh();
    });
    li.querySelector(".del").addEventListener("click", async () => {
      if (confirm("Delete this task?")) {
        await api(`/api/todos/${t.id}`, { method: "DELETE" });
        refresh();
      }
    });
    li.querySelector(".edit").addEventListener("click", () => openEdit(t));
    // drag-drop
    li.addEventListener("dragstart", () => { state.dragId = t.id; li.classList.add("dragging"); });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));
    li.addEventListener("dragover", (e) => e.preventDefault());
    li.addEventListener("drop", async (e) => {
      e.preventDefault();
      const from = state.dragId, to = t.id;
      if (!from || from === to) return;
      const ids = state.todos.map((x) => x.id);
      ids.splice(ids.indexOf(from), 1);
      ids.splice(ids.indexOf(to), 0, from);
      await api("/api/todos/reorder", { method: "POST", body: JSON.stringify({ ids }) });
      refresh();
    });
    list.appendChild(li);
  }
}

function openEdit(t) {
  state.editingId = t.id;
  $("editTitle").value = t.title;
  $("editDesc").value = t.description || "";
  $("editCategory").value = t.category || "General";
  $("editPriority").value = t.priority || "medium";
  $("editDue").value = t.due_date || "";
  $("editModal").classList.remove("hidden");
}

async function saveEdit() {
  const id = state.editingId;
  if (!id) return;
  const title = $("editTitle").value.trim();
  if (!title) { alert("Title cannot be empty"); return; }
  await api(`/api/todos/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      title,
      description: $("editDesc").value.trim(),
      category: $("editCategory").value.trim() || "General",
      priority: $("editPriority").value,
      due_date: $("editDue").value || null,
    }),
  });
  $("editModal").classList.add("hidden");
  refresh();
}

// events
$("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("titleInput").value.trim();
  if (!title) return;
  await api("/api/todos", {
    method: "POST",
    body: JSON.stringify({
      title,
      description: $("descInput").value.trim(),
      category: $("categoryInput").value,
      priority: $("priorityInput").value,
      due_date: $("dueInput").value || null,
    }),
  });
  e.target.reset();
  $("priorityInput").value = "medium";
  $("categoryInput").value = "General";
  refresh();
});

let searchTimer;
$("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refresh, 250);
});
$("statusFilter").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  state.status = btn.dataset.status;
  document.querySelectorAll("#statusFilter button").forEach((b) => b.classList.toggle("active", b === btn));
  refresh();
});
for (const id of ["filterCategory", "filterPriority", "sortSelect"]) {
  $(id).addEventListener("change", refresh);
}
$("clearDone").addEventListener("click", async () => {
  if (confirm("Delete all completed tasks?")) {
    await api("/api/todos/completed", { method: "DELETE" });
    refresh();
  }
});
$("editCancel").addEventListener("click", () => $("editModal").classList.add("hidden"));
$("editSave").addEventListener("click", saveEdit);
$("editModal").addEventListener("click", (e) => {
  if (e.target.id === "editModal") $("editModal").classList.add("hidden");
});

// dark mode (persisted)
const themeBtn = $("themeToggle");
function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  localStorage.setItem("todo-theme", mode);
  themeBtn.textContent = mode === "dark" ? "☀️" : "🌙";
}
themeBtn.addEventListener("click", () =>
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
setTheme(localStorage.getItem("todo-theme") || "light");

pickBackend()
  .then((mode) => {
    $("storageNote").textContent = mode === "server"
      ? "Data saved on the server (todos.json)"
      : "Data saved in this browser";
    return refresh();
  })
  .catch((err) => alert("Backend error: " + err.message));
