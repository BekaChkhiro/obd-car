from __future__ import annotations

from unittest.mock import patch

import pytest


async def test_register_login_and_me_flow(client):
    payload = {"email": "alice@example.com", "password": "supersecret1", "locale": "en"}

    resp = await client.post("/auth/register", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["user"]["email"] == "alice@example.com"
    assert body["tokens"]["access_token"]
    assert body["tokens"]["refresh_token"]
    access = body["tokens"]["access_token"]

    # /auth/me with the access token works
    resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "alice@example.com"

    # Login returns a fresh pair
    resp = await client.post(
        "/auth/login", json={"email": "alice@example.com", "password": "supersecret1"}
    )
    assert resp.status_code == 200
    assert resp.json()["tokens"]["access_token"]


async def test_register_duplicate_email_rejected(client):
    payload = {"email": "dup@example.com", "password": "supersecret1"}
    r1 = await client.post("/auth/register", json=payload)
    assert r1.status_code == 201
    r2 = await client.post("/auth/register", json=payload)
    assert r2.status_code == 409


async def test_login_wrong_password_rejected(client):
    await client.post(
        "/auth/register", json={"email": "bob@example.com", "password": "supersecret1"}
    )
    resp = await client.post(
        "/auth/login", json={"email": "bob@example.com", "password": "wrongpassword"}
    )
    assert resp.status_code == 401


async def test_me_requires_bearer(client):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_me_rejects_invalid_token(client):
    resp = await client.get("/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert resp.status_code == 401


async def test_refresh_rotates_tokens_and_revokes_old(client):
    reg = await client.post(
        "/auth/register",
        json={"email": "carol@example.com", "password": "supersecret1"},
    )
    refresh_token = reg.json()["tokens"]["refresh_token"]

    # First refresh succeeds and returns a new pair
    r1 = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r1.status_code == 200, r1.text
    new_pair = r1.json()
    assert new_pair["refresh_token"] != refresh_token

    # Reusing the original (now-rotated) token must fail
    r2 = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r2.status_code == 401


async def test_refresh_invalid_token_rejected(client):
    resp = await client.post("/auth/refresh", json={"refresh_token": "nope"})
    assert resp.status_code == 401


async def test_google_sign_in_creates_user(client):
    fake_claims = {
        "sub": "google-sub-123",
        "email": "dave@example.com",
        "email_verified": True,
        "locale": "fr",
    }
    with patch("app.auth.routes.verify_google_id_token", return_value=fake_claims):
        resp = await client.post("/auth/google", json={"id_token": "fake"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user"]["email"] == "dave@example.com"
    assert body["user"]["locale"] == "fr"


async def test_google_sign_in_links_existing_email(client):
    # User registers via email first
    await client.post(
        "/auth/register",
        json={"email": "eve@example.com", "password": "supersecret1"},
    )
    fake_claims = {
        "sub": "google-sub-eve",
        "email": "eve@example.com",
        "email_verified": True,
    }
    with patch("app.auth.routes.verify_google_id_token", return_value=fake_claims):
        resp = await client.post("/auth/google", json={"id_token": "fake"})
    assert resp.status_code == 200
    # Second time with same sub should return same user (no duplicate)
    with patch("app.auth.routes.verify_google_id_token", return_value=fake_claims):
        resp2 = await client.post("/auth/google", json={"id_token": "fake"})
    assert resp2.status_code == 200
    assert resp.json()["user"]["id"] == resp2.json()["user"]["id"]


async def test_google_sign_in_rejects_unverified_email(client):
    from app.security import GoogleAuthError

    with patch(
        "app.auth.routes.verify_google_id_token",
        side_effect=GoogleAuthError("email not verified by Google"),
    ):
        resp = await client.post("/auth/google", json={"id_token": "fake"})
    assert resp.status_code == 401


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "password": "supersecret1"},
        {"email": "ok@example.com", "password": "short"},
    ],
)
async def test_register_validation_errors(client, payload):
    resp = await client.post("/auth/register", json=payload)
    assert resp.status_code == 422


async def test_delete_account_removes_user_and_returns_204(client):
    reg = await client.post(
        "/auth/register",
        json={"email": "del@example.com", "password": "supersecret1"},
    )
    assert reg.status_code == 201
    access = reg.json()["tokens"]["access_token"]

    resp = await client.delete("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert resp.status_code == 204

    # Account no longer exists — login must fail
    login = await client.post(
        "/auth/login", json={"email": "del@example.com", "password": "supersecret1"}
    )
    assert login.status_code == 401


async def test_delete_account_requires_auth(client):
    resp = await client.delete("/auth/me")
    assert resp.status_code == 401


async def test_delete_account_cascades_refresh_tokens(client):
    reg = await client.post(
        "/auth/register",
        json={"email": "cascade@example.com", "password": "supersecret1"},
    )
    refresh_token = reg.json()["tokens"]["refresh_token"]
    access = reg.json()["tokens"]["access_token"]

    await client.delete("/auth/me", headers={"Authorization": f"Bearer {access}"})

    # Old refresh token must be invalid after deletion
    r = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 401
