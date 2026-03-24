from oar_agent_bridge.mentions import extract_mentions


def test_extract_mentions_dedupes_and_preserves_order():
    text = "ping @hermes and @zeroclaw then @hermes again"
    assert extract_mentions(text) == ["hermes", "zeroclaw"]


def test_extract_mentions_ignores_email_like_patterns():
    text = "email a@b.com but tag @real_agent"
    assert extract_mentions(text) == ["real_agent"]


def test_extract_mentions_supports_max_length_handle():
    handle = "a" + ("b" * 63)
    text = f"ping @{handle}"
    assert len(handle) == 64
    assert extract_mentions(text) == [handle]
