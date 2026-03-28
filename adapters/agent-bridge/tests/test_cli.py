import pytest

from oar_agent_bridge import __version__
from oar_agent_bridge.cli import build_parser


def test_version_flag_prints_package_version(capsys):
    parser = build_parser()

    with pytest.raises(SystemExit) as excinfo:
        parser.parse_args(["--version"])

    assert excinfo.value.code == 0
    captured = capsys.readouterr()
    assert f"oar-agent-bridge {__version__}" in captured.out
