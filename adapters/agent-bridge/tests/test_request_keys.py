from oar_agent_bridge.models import wakeup_artifact_id, wakeup_request_key


def test_wakeup_keys_are_deterministic():
    args = ("ws", "thread_1", "event_1", "actor_1")
    assert wakeup_request_key(*args) == wakeup_request_key(*args)
    assert wakeup_artifact_id(*args) == wakeup_artifact_id(*args)


def test_wakeup_keys_change_when_inputs_change():
    first = wakeup_request_key("ws", "thread_1", "event_1", "actor_1")
    second = wakeup_request_key("ws", "thread_2", "event_1", "actor_1")
    assert first != second
