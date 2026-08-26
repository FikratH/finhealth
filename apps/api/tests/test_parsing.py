import pytest
from app.services.metrics import parse_number, match_label, CORE_METRICS, ADVANCED_METRICS


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
    # Negative: qualifier "нематериальн" should prevent matching to depreciation_amortization
    "Амортизация нематериальных активов",
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
    # Advanced metrics (new)
    ("Нераспределённая прибыль", "retained_earnings"),
    ("retained earnings", "retained_earnings"),
    ("нераспределенная прибыль", "retained_earnings"),
    ("нераспределенная прибыль (непокрытый убыток)", "retained_earnings"),
    ("Основные средства", "net_ppe"),
    ("property, plant and equipment", "net_ppe"),
    ("основные средства", "net_ppe"),
    ("основные средства (нетто)", "net_ppe"),
    ("Долгосрочные займы", "long_term_debt"),
    ("long-term debt", "long_term_debt"),
    ("долгосрочные займы и кредиты", "long_term_debt"),
    ("долгосрочные кредиты и займы", "long_term_debt"),
    ("долгосрочные заемные средства", "long_term_debt"),
    ("Амортизация", "depreciation_amortization"),
    ("depreciation and amortization", "depreciation_amortization"),
    ("износ и амортизация", "depreciation_amortization"),
    ("амортизация основных средств", "depreciation_amortization"),
    ("Коммерческие и управленческие расходы", "sga_expense"),
    ("selling, general and administrative expenses", "sga_expense"),
    ("sga", "sga_expense"),
    ("коммерческие расходы", "sga_expense"),
    ("управленческие расходы", "sga_expense"),
    ("коммерческие и административные расходы", "sga_expense"),
    ("общие и административные расходы", "sga_expense"),
])
def test_match_label_accepts_genuine_labels(label, key):
    m = match_label(label)
    assert m is not None and m[0] == key


def test_core_metrics_remains_exactly_20_keys():
    """Verify CORE_METRICS retains exactly 20 keys from Plan 1 (unchanged)."""
    assert len(CORE_METRICS) == 20
    # Verify none of the new advanced metrics are in CORE_METRICS
    assert CORE_METRICS.isdisjoint(ADVANCED_METRICS)
    assert not any(m in CORE_METRICS for m in ADVANCED_METRICS)
