"""Endpoint tests for the Flask API. Each test uses its own temporary todos.json."""
from datetime import date, timedelta

import pytest

import app as todo_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(todo_app, "DATA_FILE", str(tmp_path / "todos.json"))
    todo_app.app.config["TESTING"] = True
    with todo_app.app.test_client() as c:
        yield c


def add(client, **fields):
    fields.setdefault("title", "Task")
    res = client.post("/api/todos", json=fields)
    assert res.status_code == 201
    return res.get_json()


def test_index_page(client):
    res = client.get("/")
    assert res.status_code == 200
    assert b"Digital To Do List" in res.data


def test_create_todo_with_notes(client):
    todo = add(client, title="  Buy milk ", description="2 litres", priority="high",
               category="Shopping", due_date="2030-01-01")
    assert todo["title"] == "Buy milk"
    assert todo["description"] == "2 litres"
    assert todo["priority"] == "high"
    assert todo["category"] == "Shopping"
    assert todo["due_date"] == "2030-01-01"
    assert todo["completed"] is False
    assert todo["id"]


def test_create_defaults_and_invalid_priority(client):
    todo = add(client, title="x", priority="urgent")
    assert todo["priority"] == "medium"
    assert todo["category"] == "General"
    assert todo["description"] == ""
    assert todo["due_date"] is None


def test_create_requires_title(client):
    for body in ({}, {"title": ""}, {"title": "   "}):
        res = client.post("/api/todos", json=body)
        assert res.status_code == 400
        assert res.get_json()["error"] == "Title is required"


def test_list_todos(client):
    a = add(client, title="First")
    b = add(client, title="Second")
    res = client.get("/api/todos")
    assert res.status_code == 200
    assert [t["id"] for t in res.get_json()] == [a["id"], b["id"]]


def test_list_filters_and_search(client):
    add(client, title="Report", description="quarterly numbers", category="Work", priority="high")
    done = add(client, title="Groceries", category="Shopping", priority="low")
    client.patch(f"/api/todos/{done['id']}/toggle")

    def titles(query):
        return [t["title"] for t in client.get("/api/todos?" + query).get_json()]

    assert titles("status=active") == ["Report"]
    assert titles("status=completed") == ["Groceries"]
    assert titles("category=Shopping") == ["Groceries"]
    assert titles("priority=high") == ["Report"]
    assert titles("search=QUARTERLY") == ["Report"]  # searches notes, case-insensitive
    assert titles("search=nothing-matches") == []


def test_list_sorting(client):
    add(client, title="Low later", priority="low", due_date="2030-05-01")
    add(client, title="High none", priority="high")
    add(client, title="Med soon", priority="medium", due_date="2030-01-01")

    def titles(sort):
        return [t["title"] for t in client.get(f"/api/todos?sort={sort}").get_json()]

    assert titles("priority") == ["High none", "Med soon", "Low later"]
    assert titles("due") == ["Med soon", "Low later", "High none"]
    assert titles("order") == ["Low later", "High none", "Med soon"]


def test_update_todo(client):
    todo = add(client, title="Old")
    res = client.put(f"/api/todos/{todo['id']}",
                     json={"title": "New", "description": "updated notes", "priority": "low"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["title"] == "New"
    assert body["description"] == "updated notes"
    assert body["priority"] == "low"
    listed = client.get("/api/todos").get_json()[0]
    assert listed["description"] == "updated notes"


def test_update_rejects_empty_title(client):
    todo = add(client)
    res = client.put(f"/api/todos/{todo['id']}", json={"title": "  "})
    assert res.status_code == 400


def test_update_missing_returns_404(client):
    assert client.put("/api/todos/nope", json={"title": "x"}).status_code == 404


def test_toggle_todo(client):
    todo = add(client)
    res = client.patch(f"/api/todos/{todo['id']}/toggle")
    assert res.status_code == 200 and res.get_json()["completed"] is True
    res = client.patch(f"/api/todos/{todo['id']}/toggle")
    assert res.get_json()["completed"] is False
    assert client.patch("/api/todos/nope/toggle").status_code == 404


def test_delete_todo(client):
    todo = add(client)
    res = client.delete(f"/api/todos/{todo['id']}")
    assert res.status_code == 200 and res.get_json() == {"ok": True}
    assert client.get("/api/todos").get_json() == []
    assert client.delete(f"/api/todos/{todo['id']}").status_code == 404


def test_reorder(client):
    a, b, c = (add(client, title=t) for t in "ABC")
    res = client.post("/api/todos/reorder", json={"ids": [c["id"], a["id"], b["id"]]})
    assert res.status_code == 200
    assert [t["title"] for t in client.get("/api/todos").get_json()] == ["C", "A", "B"]


def test_clear_completed(client):
    keep = add(client, title="keep")
    gone = add(client, title="gone")
    client.patch(f"/api/todos/{gone['id']}/toggle")
    res = client.delete("/api/todos/completed")
    assert res.status_code == 200 and res.get_json()["removed"] == 1
    assert [t["id"] for t in client.get("/api/todos").get_json()] == [keep["id"]]


def test_stats(client):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    add(client, title="late", due_date=yesterday, category="Work")
    done = add(client, title="done", category="Home")
    client.patch(f"/api/todos/{done['id']}/toggle")
    res = client.get("/api/stats")
    assert res.status_code == 200
    assert res.get_json() == {
        "total": 2, "completed": 1, "active": 1, "overdue": 1,
        "percent": 50, "categories": ["Home", "Work"],
    }


def test_stats_empty(client):
    assert client.get("/api/stats").get_json()["percent"] == 0
