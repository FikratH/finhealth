from app.services.metrics import detect_scale, match_label, parse_number
from app.services.ratios import Inputs, compute_all, safe_div, _roe, _quick_ratio, altman_z
from app.schemas import Scale


def r(results, key):
    return next(x for x in results if x.key == key)


def test_safe_div_zero_and_none():
    assert safe_div(10, 0) is None
    assert safe_div(None, 5) is None
    assert safe_div(10, None) is None
    assert safe_div(10, 4) == 2.5


def test_number_formats():
    assert parse_number("1 234") == 1234
    assert parse_number("1,234.56") == 1234.56
    assert parse_number("1.234,56") == 1234.56
    assert parse_number("1 234,5") == 1234.5
    assert parse_number("(2 271 100)") == -2271100
    assert parse_number("—") is None
    assert parse_number("n/a") is None
    assert parse_number("") is None
    assert parse_number(15.5) == 15.5


def test_scale_detection():
    assert detect_scale("Все суммы в тыс. тенге") == Scale.thousands
    assert detect_scale("in millions of USD") == Scale.millions
    assert detect_scale("amounts in units") == Scale.units


def test_label_matching_priority():
    assert match_label("Итого активы")[0] == "total_assets"
    assert match_label("Оборотные активы")[0] == "current_assets"
    assert match_label("Итого по разделу II")[0] == "current_assets"
    assert match_label("Total Current Liabilities")[0] == "current_liabilities"
    assert match_label("Чистая прибыль (убыток)")[0] == "net_income"
    assert match_label("Какая-то посторонняя строка") is None


def test_missing_metric_is_none_not_zero():
    i = Inputs(latest={"current_assets": 100.0}, previous={})
    res = compute_all(i)
    cr = r(res, "current_ratio")
    assert cr.value is None            # no denominator => N/A, never 0
    assert cr.inputs["current_liabilities"] is None


def test_division_by_zero_liabilities():
    i = Inputs(latest={"current_assets": 100.0, "current_liabilities": 0.0}, previous={})
    assert r(compute_all(i), "current_ratio").value is None


def test_negative_equity_makes_dte_na():
    i = Inputs(latest={"total_debt": 500.0, "shareholders_equity": -100.0}, previous={})
    res = r(compute_all(i), "debt_to_equity")
    assert res.value is None
    assert any("отрицателен" in w for w in res.warnings)


def test_pe_not_computed_without_market_data():
    i = Inputs(latest={"net_income": 100.0, "revenue": 1000.0}, previous={})
    pe = r(compute_all(i), "pe")
    assert pe.value is None
    assert pe.applicable is False


def test_pe_computed_with_market_data():
    i = Inputs(latest={"net_income": 100.0, "market_cap": 1500.0}, previous={})
    pe = r(compute_all(i), "pe")
    assert pe.applicable is True
    assert pe.value == 15.0


def test_average_uses_previous_period():
    i = Inputs(latest={"net_income": 100.0, "total_assets": 1200.0},
               previous={"total_assets": 800.0})
    roa = r(compute_all(i), "roa")
    assert abs(roa.value - 10.0) < 1e-9   # 100 / ((1200+800)/2) * 100%


def test_average_fallback_warns_without_previous():
    i = Inputs(latest={"net_income": 100.0, "total_assets": 1000.0}, previous={})
    roa = r(compute_all(i), "roa")
    assert abs(roa.value - 10.0) < 1e-9
    assert roa.warnings  # reduced-accuracy warning present


def test_roe_na_when_average_equity_negative():
    i = Inputs(latest={"net_income": 100, "shareholders_equity": 100},
               previous={"shareholders_equity": -500})
    value, _, warnings = _roe(i)
    assert value is None
    assert any("капитал" in w.lower() for w in warnings)


def test_quick_ratio_warns_for_each_zeroed_component():
    i = Inputs(latest={"accounts_receivable": 100, "current_liabilities": 200},
               previous={})
    value, _, warnings = _quick_ratio(i)
    assert value == 0.5
    joined = " ".join(warnings).lower()
    assert "денежные средства" in joined      # missing cash disclosed
    assert "нижн" in joined                    # explicit lower-bound wording


def test_altman_uses_private_z_prime_without_market_data():
    i = Inputs(latest={
        "total_assets": 2456800, "current_assets": 808750,
        "current_liabilities": 486200, "operating_income": 356400,
        "shareholders_equity": 1430600, "total_liabilities": 1026200,
        "revenue": 3245900}, previous={})
    r = altman_z(i, "manufacturing")
    ta = 2456800
    expected = (0.717 * ((808750 - 486200) / ta) + 3.107 * (356400 / ta)
                + 0.420 * (1430600 / 1026200) + 0.998 * (3245900 / ta))
    assert abs(r.value - expected) < 1e-9
    assert "Z′" in r.name or "Z'" in r.name
    # Z′ grey zone is 1.23–2.9
    assert r.status.value == ("good" if expected > 2.9 else
                              "attention" if expected >= 1.23 else "critical")
