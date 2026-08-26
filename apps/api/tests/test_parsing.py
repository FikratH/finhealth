import pytest
from app.services.metrics import parse_number


@pytest.mark.parametrize("raw,expected", [
    ("1 234", 1234.0),
    ("(1 234)", -1234.0),
    ("1,234.56", 1234.56),
    ("1.234,56", 1234.56),
    ("1 234,5", 1234.5),
    ("4.58", 4.58),
    ("0.585", 0.585),          # zero-guard: decimal, not thousands
    ("1.234", 1234.0),         # dot-thousands, mirrors '1,234' handling
    ("12.345", 12345.0),
    ("1.234.567", 1234567.0),  # was None before the fix
    ("n/a", None),
    ("—", None),
])
def test_parse_number(raw, expected):
    assert parse_number(raw) == expected


def test_parse_number_rejects_bools():
    assert parse_number(True) is None
    assert parse_number(False) is None
    assert parse_number(1) == 1.0
