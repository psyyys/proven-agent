from proven.findings import FindingRegistry, check_report, extract_numbers, matches, unsupported_numbers


def nums(text):
    return [n.raw for n in extract_numbers(text)]


def test_extract_skips_dates_citations_and_ordinals():
    text = "2023年3月的销售额为 1,234.5 元 [F1]，前 5 名客户贡献了 23.4% 的收入。2013-01-01 起。"
    assert nums(text) == ["1,234.5", "23.4%"]


def test_extract_units():
    [n] = extract_numbers("总收入约 1.2万 元")
    assert n.value == 12000 and n.unit == "万"


def test_matches_rounding_and_percent():
    [n] = extract_numbers("复购率 23.4%")
    assert matches(n, 0.2341)
    assert matches(n, 23.43)
    assert not matches(n, 0.25)
    [m] = extract_numbers("均值 523.17")
    assert matches(m, 523.1712)
    assert not matches(m, 523.2)


def test_unsupported_numbers_in_claim():
    evidence = "total    2328.6\nmean      5.65\n"
    assert unsupported_numbers("总销售额 2,328.6，平均单价 5.65", evidence) == []
    assert unsupported_numbers("总销售额 2,328.6，同比增长 12.5%", evidence) == ["12.5%"]


def test_check_report():
    reg = FindingRegistry()
    reg.add("2025 年总销售额为 2328.6 美元", "cell", "C3", 2328.6)
    reg.add("美国客户数为 13", "cell", "C4", 13)
    ok = check_report("2025 年总销售额为 2,328.6 美元 [F1]，美国有 13 位客户 [F2]。", reg)
    assert ok.ok and ok.checked == 2
    bad = check_report("总销售额为 2,328.6 美元 [F1]，增长 18.2% [F7]。", reg)
    assert [b["number"] for b in bad.unsupported] == ["18.2%"]
    assert bad.unknown_citations == ["F7"]


def test_question_numbers_allowed():
    reg = FindingRegistry()
    r = check_report("按 P=1% 计算的设计流量见下表。", reg, extra_allowed=["P=1% 的设计流量是多少"])
    assert r.ok


def test_numbers_next_to_chinese_and_not_dates():
    assert [n.value for n in extract_numbers("销售额为2328.6美元", skip_trivial=False)] == [2328.6]
    assert nums("2025年Q4的值为2328.6，2025.03.01 起统计") == ["2328.6"]
    assert nums("在2023的基础上") == []
