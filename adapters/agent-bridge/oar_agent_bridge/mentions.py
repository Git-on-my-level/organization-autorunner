from __future__ import annotations

import re
from collections import OrderedDict

MENTION_RE = re.compile(r"(?<![A-Za-z0-9._-])@([a-z0-9][a-z0-9._-]{0,62})\b")


def extract_mentions(text: str) -> list[str]:
    ordered: OrderedDict[str, None] = OrderedDict()
    for match in MENTION_RE.finditer(text or ""):
        ordered.setdefault(match.group(1), None)
    return list(ordered.keys())
