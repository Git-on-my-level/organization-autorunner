from types import SimpleNamespace

from oar_agent_bridge.oar_client import OARClient


class DummyAuthManager:
    def __init__(self):
        self.state = SimpleNamespace(actor_id="actor-123")

    def access_token(self, _client):
        return "token"


def test_create_event_includes_actor_id_from_auth_state(monkeypatch):
    client = OARClient("http://oar.test", auth_manager=DummyAuthManager())
    captured = {}

    def fake_raw_request(method, path, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["body"] = kwargs["json_body"]
        return {}

    monkeypatch.setattr(client, "raw_request", fake_raw_request)

    client.create_event(event={"type": "message_posted"})

    assert captured["method"] == "POST"
    assert captured["path"] == "/events"
    assert captured["body"]["actor_id"] == "actor-123"


def test_create_document_includes_actor_id_from_auth_state(monkeypatch):
    client = OARClient("http://oar.test", auth_manager=DummyAuthManager())
    captured = {}

    def fake_raw_request(method, path, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["body"] = kwargs["json_body"]
        return {}

    monkeypatch.setattr(client, "raw_request", fake_raw_request)

    client.create_document(document={"document_id": "doc-1"}, content={"ok": True})

    assert captured["path"] == "/docs"
    assert captured["body"]["actor_id"] == "actor-123"


def test_upsert_document_omits_document_id_on_patch(monkeypatch):
    client = OARClient("http://oar.test", auth_manager=DummyAuthManager())
    captured = {}

    monkeypatch.setattr(client, "get_document", lambda _document_id: {"revision": {"revision_id": "rev-1"}})

    def fake_update_document(document_id, **kwargs):
        captured["document_id"] = document_id
        captured["kwargs"] = kwargs
        return {"ok": True}

    monkeypatch.setattr(client, "update_document", fake_update_document)

    client.upsert_document(
        "doc-1",
        document={"document_id": "doc-1", "title": "Title", "status": "active"},
        content={"ok": True},
    )

    assert captured["document_id"] == "doc-1"
    assert captured["kwargs"]["document"] == {"title": "Title", "status": "active"}
    assert captured["kwargs"]["if_base_revision"] == "rev-1"
