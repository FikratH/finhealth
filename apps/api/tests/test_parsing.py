import pytest
from app.services.metrics import parse_number, match_label


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


@pytest.mark.parametrize("label", [
    "Нематериальные активы",
    "Прочие обязательства",
    "Отложенные налоговые обязательства",
    "Net decrease in cash",
    "Cash flows from investing activities",
    "Изменение денежных средств за период",
])
def test_match_label_rejects_false_positives(label):
    assert match_label(label) is None


@pytest.mark.parametrize("label,key", [
    ("Итого активы", "total_assets"),
    ("ИТОГО АКТИВЫ", "total_assets"),
    ("Денежные средства и их эквиваленты", "cash"),
    ("Денежные средства и их эквиваленты на конец периода", "cash"),
    ("Себестоимость реализованной продукции", "cost_of_goods_sold"),
    ("Итого по разделу II", "current_assets"),
    ("Total assets", "total_assets"),
])
def test_match_label_accepts_genuine_labels(label, key):
    m = match_label(label)
    assert m is not None and m[0] == key
