"""Georgian mobile phone number parsing.

Only Georgian mobile numbers are in scope — sender.ge is a Georgian SMS
gateway and the product has no other market yet. Storing E.164 means every
lookup compares one canonical string regardless of how the number was typed.
"""

from __future__ import annotations

import re

_DIGIT_GROUPS = re.compile(r"\d+")


class PhoneNumberError(ValueError):
    """Raised when a string is not a valid Georgian mobile number."""


def normalize_georgian_phone(raw: str) -> str:
    """Parse `raw` into E.164 (`+9955XXXXXXXX`).

    Accepts a bare national number (555123456), the same with the country
    code (995555123456), or full E.164 (+995555123456) — with arbitrary
    spaces or dashes in between, since that is how people actually type
    numbers. Anything that is not a 9-digit Georgian mobile number (starting
    with 5) after normalising is rejected.
    """
    digits = "".join(_DIGIT_GROUPS.findall(raw))

    if len(digits) == 12 and digits.startswith("995"):
        digits = digits[3:]

    if len(digits) != 9 or not digits.startswith("5"):
        raise PhoneNumberError(f"not a Georgian mobile number: {raw!r}")

    return f"+995{digits}"
