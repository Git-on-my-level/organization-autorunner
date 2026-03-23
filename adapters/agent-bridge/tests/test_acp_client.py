import os

from oar_agent_bridge.adapters.acp_client import ACPProcessClient


def test_build_env_merges_with_parent_environment(monkeypatch):
    monkeypatch.setenv("PATH", "/usr/bin")
    monkeypatch.setenv("OAR_PARENT", "present")
    client = ACPProcessClient(command=["hermes", "acp"], cwd="/tmp", env={"OAR_CHILD": "set"})

    env = client._build_env()

    assert env["PATH"] == os.environ["PATH"]
    assert env["OAR_PARENT"] == "present"
    assert env["OAR_CHILD"] == "set"
