"""Sync endpoint coverage — push, pull, and the conflict resolution rules."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta


async def _register_and_auth(client, email: str = "syncer@example.com") -> str:
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": "supersecret1"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["tokens"]["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat()


async def test_push_requires_auth(client):
    resp = await client.post("/sync/push", json={"vehicles": []})
    assert resp.status_code == 401


async def test_pull_requires_auth(client):
    resp = await client.get("/sync/pull")
    assert resp.status_code == 401


async def test_push_new_rows_are_accepted_and_pullable(client):
    token = await _register_and_auth(client)
    now = datetime.now(UTC)

    vehicle_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    message_id = str(uuid.uuid4())
    tool_call_id = str(uuid.uuid4())

    push_body = {
        "vehicles": [
            {
                "id": vehicle_id,
                "make": "Toyota",
                "model": "Corolla",
                "year": 2020,
                "vin": None,
                "created_at": _iso(now),
                "updated_at": _iso(now),
                "deleted_at": None,
            }
        ],
        "sessions": [{"id": session_id, "vehicle_id": vehicle_id, "created_at": _iso(now)}],
        "messages": [
            {
                "id": message_id,
                "session_id": session_id,
                "role": "user",
                "content": "hello",
                "created_at": _iso(now),
            }
        ],
        "tool_calls": [
            {
                "id": tool_call_id,
                "message_id": message_id,
                "tool_name": "read_pid",
                "input": "{}",
                "output": None,
                "created_at": _iso(now),
            }
        ],
    }

    resp = await client.post("/sync/push", json=push_body, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert all(ack["accepted"] for ack in body["vehicles"])
    assert all(ack["accepted"] for ack in body["sessions"])
    assert all(ack["accepted"] for ack in body["messages"])
    assert all(ack["accepted"] for ack in body["tool_calls"])

    # Pull with no cursor returns everything we just pushed.
    resp = await client.get("/sync/pull", headers=_auth(token))
    assert resp.status_code == 200, resp.text
    pull = resp.json()
    assert {v["id"] for v in pull["vehicles"]} == {vehicle_id}
    assert {s["id"] for s in pull["sessions"]} == {session_id}
    assert {m["id"] for m in pull["messages"]} == {message_id}
    assert {t["id"] for t in pull["tool_calls"]} == {tool_call_id}
    assert "server_time" in pull


async def test_vehicle_lww_conflict_returns_server_newer(client):
    token = await _register_and_auth(client, "lww@example.com")
    now = datetime.now(UTC)
    vehicle_id = str(uuid.uuid4())

    # Initial push at T0.
    resp = await client.post(
        "/sync/push",
        json={
            "vehicles": [
                {
                    "id": vehicle_id,
                    "make": "Honda",
                    "model": "Civic",
                    "year": 2018,
                    "vin": None,
                    "created_at": _iso(now),
                    "updated_at": _iso(now),
                    "deleted_at": None,
                }
            ]
        },
        headers=_auth(token),
    )
    assert resp.status_code == 200

    # Server now has a newer version (T0 + 60s).
    newer = now + timedelta(seconds=60)
    resp = await client.post(
        "/sync/push",
        json={
            "vehicles": [
                {
                    "id": vehicle_id,
                    "make": "Honda",
                    "model": "Civic (Updated)",
                    "year": 2018,
                    "vin": None,
                    "created_at": _iso(now),
                    "updated_at": _iso(newer),
                    "deleted_at": None,
                }
            ]
        },
        headers=_auth(token),
    )
    assert resp.status_code == 200

    # Stale client push at T0 - 30s should be rejected as server-newer.
    older = now - timedelta(seconds=30)
    resp = await client.post(
        "/sync/push",
        json={
            "vehicles": [
                {
                    "id": vehicle_id,
                    "make": "Stale",
                    "model": "Stale",
                    "year": 2000,
                    "vin": None,
                    "created_at": _iso(now),
                    "updated_at": _iso(older),
                    "deleted_at": None,
                }
            ]
        },
        headers=_auth(token),
    )
    assert resp.status_code == 200
    ack = resp.json()["vehicles"][0]
    assert ack["accepted"] is False
    assert ack["conflict"] == "server-newer"

    # Pull confirms the canonical (newer) row survived.
    resp = await client.get("/sync/pull", headers=_auth(token))
    assert resp.status_code == 200
    vehicles = resp.json()["vehicles"]
    assert len(vehicles) == 1
    assert vehicles[0]["model"] == "Civic (Updated)"


async def test_message_push_is_server_wins(client):
    token = await _register_and_auth(client, "msg@example.com")
    now = datetime.now(UTC)
    session_id = str(uuid.uuid4())
    message_id = str(uuid.uuid4())

    setup = {
        "sessions": [{"id": session_id, "vehicle_id": None, "created_at": _iso(now)}],
        "messages": [
            {
                "id": message_id,
                "session_id": session_id,
                "role": "user",
                "content": "first",
                "created_at": _iso(now),
            }
        ],
    }
    resp = await client.post("/sync/push", json=setup, headers=_auth(token))
    assert resp.status_code == 200

    # Re-push the same message id with a different body — server keeps the original.
    resp = await client.post(
        "/sync/push",
        json={
            "messages": [
                {
                    "id": message_id,
                    "session_id": session_id,
                    "role": "user",
                    "content": "tampered",
                    "created_at": _iso(now),
                }
            ]
        },
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["messages"][0]["accepted"] is True

    pull = await client.get("/sync/pull", headers=_auth(token))
    messages = pull.json()["messages"]
    assert len(messages) == 1
    assert messages[0]["content"] == "first"


async def test_pull_since_cursor_skips_already_seen(client):
    token = await _register_and_auth(client, "cursor@example.com")
    now = datetime.now(UTC)
    vehicle_id_a = str(uuid.uuid4())

    await client.post(
        "/sync/push",
        json={
            "vehicles": [
                {
                    "id": vehicle_id_a,
                    "make": "A",
                    "model": "A",
                    "year": 2020,
                    "vin": None,
                    "created_at": _iso(now),
                    "updated_at": _iso(now),
                    "deleted_at": None,
                }
            ]
        },
        headers=_auth(token),
    )

    first_pull = await client.get("/sync/pull", headers=_auth(token))
    assert first_pull.status_code == 200
    cursor = first_pull.json()["server_time"]
    assert len(first_pull.json()["vehicles"]) == 1

    # Push a second vehicle strictly after the cursor.
    later = datetime.now(UTC) + timedelta(seconds=1)
    vehicle_id_b = str(uuid.uuid4())
    await client.post(
        "/sync/push",
        json={
            "vehicles": [
                {
                    "id": vehicle_id_b,
                    "make": "B",
                    "model": "B",
                    "year": 2021,
                    "vin": None,
                    "created_at": _iso(later),
                    "updated_at": _iso(later),
                    "deleted_at": None,
                }
            ]
        },
        headers=_auth(token),
    )

    second_pull = await client.get(
        "/sync/pull",
        params={"since": cursor},
        headers=_auth(token),
    )
    assert second_pull.status_code == 200
    body = second_pull.json()
    ids = {v["id"] for v in body["vehicles"]}
    assert vehicle_id_b in ids
    assert vehicle_id_a not in ids


async def test_pull_scopes_to_authenticated_user(client):
    alice_token = await _register_and_auth(client, "alice2@example.com")
    bob_token = await _register_and_auth(client, "bob2@example.com")
    now = datetime.now(UTC)
    alice_vehicle = str(uuid.uuid4())

    await client.post(
        "/sync/push",
        json={
            "vehicles": [
                {
                    "id": alice_vehicle,
                    "make": "Alice",
                    "model": "Car",
                    "year": 2020,
                    "vin": None,
                    "created_at": _iso(now),
                    "updated_at": _iso(now),
                    "deleted_at": None,
                }
            ]
        },
        headers=_auth(alice_token),
    )

    bob_pull = await client.get("/sync/pull", headers=_auth(bob_token))
    assert bob_pull.status_code == 200
    assert bob_pull.json()["vehicles"] == []
