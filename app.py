"""Digital To Do List - Flask backend with JSON file persistence."""
import json
import os
import uuid
from datetime import datetime, date
from flask import Flask, jsonify, request, render_template

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "todos.json")

app = Flask(__name__)


def load_todos():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def save_todos(todos):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(todos, f, indent=2, ensure_ascii=False)


def now_iso():
    return datetime.utcnow().isoformat() + "Z"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/todos", methods=["GET"])
def list_todos():
    todos = load_todos()
    # Query params: search, status (all/active/completed), category, priority, sort
    search = request.args.get("search", "").strip().lower()
    status = request.args.get("status", "all")
    category = request.args.get("category", "all")
    priority = request.args.get("priority", "all")
    sort = request.args.get("sort", "order")  # order, created, due, priority

    filtered = todos
    if status == "active":
        filtered = [t for t in filtered if not t.get("completed")]
    elif status == "completed":
        filtered = [t for t in filtered if t.get("completed")]
    if category != "all":
        filtered = [t for t in filtered if t.get("category", "") == category]
    if priority != "all":
        filtered = [t for t in filtered if t.get("priority", "") == priority]
    if search:
        filtered = [
            t for t in filtered
            if search in t.get("title", "").lower()
            or search in t.get("description", "").lower()
        ]

    priority_rank = {"high": 0, "medium": 1, "low": 2}
    if sort == "due":
        filtered.sort(key=lambda t: (t.get("due_date") or "9999-12-31"))
    elif sort == "priority":
        filtered.sort(key=lambda t: priority_rank.get(t.get("priority", "medium"), 1))
    elif sort == "created":
        filtered.sort(key=lambda t: t.get("created_at", ""), reverse=True)
    else:  # order
        filtered.sort(key=lambda t: t.get("order", 0))

    return jsonify(filtered)


@app.route("/api/todos", methods=["POST"])
def create_todo():
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400

    todos = load_todos()
    max_order = max([t.get("order", 0) for t in todos], default=-1)
    todo = {
        "id": uuid.uuid4().hex[:12],
        "title": title,
        "description": (data.get("description") or "").strip(),
        "completed": False,
        "priority": data.get("priority", "medium") if data.get("priority") in ("low", "medium", "high") else "medium",
        "category": (data.get("category") or "General").strip() or "General",
        "due_date": data.get("due_date") or None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "order": max_order + 1,
    }
    todos.append(todo)
    save_todos(todos)
    return jsonify(todo), 201


@app.route("/api/todos/<todo_id>", methods=["PUT"])
def update_todo(todo_id):
    data = request.get_json(force=True) or {}
    todos = load_todos()
    for t in todos:
        if t["id"] == todo_id:
            for field in ("title", "description", "priority", "category", "due_date", "completed"):
                if field in data:
                    if field == "title" and not str(data[field]).strip():
                        return jsonify({"error": "Title cannot be empty"}), 400
                    t[field] = data[field]
            t["updated_at"] = now_iso()
            save_todos(todos)
            return jsonify(t)
    return jsonify({"error": "Not found"}), 404


@app.route("/api/todos/<todo_id>/toggle", methods=["PATCH"])
def toggle_todo(todo_id):
    todos = load_todos()
    for t in todos:
        if t["id"] == todo_id:
            t["completed"] = not t.get("completed", False)
            t["updated_at"] = now_iso()
            save_todos(todos)
            return jsonify(t)
    return jsonify({"error": "Not found"}), 404


@app.route("/api/todos/<todo_id>", methods=["DELETE"])
def delete_todo(todo_id):
    todos = load_todos()
    new_todos = [t for t in todos if t["id"] != todo_id]
    if len(new_todos) == len(todos):
        return jsonify({"error": "Not found"}), 404
    save_todos(new_todos)
    return jsonify({"ok": True})


@app.route("/api/todos/reorder", methods=["POST"])
def reorder_todos():
    data = request.get_json(force=True) or {}
    ids = data.get("ids", [])
    todos = load_todos()
    by_id = {t["id"]: t for t in todos}
    for i, tid in enumerate(ids):
        if tid in by_id:
            by_id[tid]["order"] = i
    save_todos(todos)
    return jsonify({"ok": True})


@app.route("/api/todos/completed", methods=["DELETE"])
def clear_completed():
    todos = load_todos()
    remaining = [t for t in todos if not t.get("completed")]
    save_todos(remaining)
    return jsonify({"ok": True, "removed": len(todos) - len(remaining)})


@app.route("/api/stats", methods=["GET"])
def stats():
    todos = load_todos()
    total = len(todos)
    completed = sum(1 for t in todos if t.get("completed"))
    active = total - completed
    today = date.today().isoformat()
    overdue = sum(
        1 for t in todos
        if not t.get("completed") and t.get("due_date") and t["due_date"] < today
    )
    categories = sorted({t.get("category", "General") for t in todos})
    pct = round(completed / total * 100) if total else 0
    return jsonify({
        "total": total,
        "completed": completed,
        "active": active,
        "overdue": overdue,
        "percent": pct,
        "categories": categories,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5050)
