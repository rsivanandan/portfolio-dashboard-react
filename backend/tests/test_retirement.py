"""Tests for the 3-bucket retirement waterfall (/api/retirement)."""


def _get(client):
    res = client.get("/api/retirement")
    assert res.status_code == 200
    return res.json()


def test_money_is_conserved(client):
    d = _get(client)
    bucket_total = sum(d["buckets"][b]["actual"] for b in ("cash", "safety", "growth"))
    assert abs(bucket_total - d["corpus"]) < 0.05
    # every bucket's slices reconcile to its actual
    for b in ("cash", "safety", "growth"):
        slice_sum = sum(s["amount"] for s in d["buckets"][b]["slices"])
        assert abs(slice_sum - d["buckets"][b]["actual"]) < 0.05


def test_every_holding_fully_allocated(client):
    d = _get(client)
    alloc = {}
    for b in ("cash", "safety", "growth"):
        for s in d["buckets"][b]["slices"]:
            alloc[(s["entity"], s["key"])] = alloc.get((s["entity"], s["key"]), 0) + s["amount"]
    for h in d["holdings"]:
        assert abs(alloc.get((h["entity"], h["key"]), 0) - h["value"]) < 0.05, h["name"]


def test_affordable_spend_derived_from_corpus(client):
    d = _get(client)
    cfg = d["config"]
    assert abs(d["annual_affordable"] - d["corpus"] * cfg["swr_pct"] / 100) < 0.05
    assert abs(d["monthly_affordable"] - d["annual_affordable"] / 12) < 0.05


def test_targets_are_inflation_adjusted(client):
    d = _get(client)
    cfg = d["config"]
    annual = d["annual_affordable"]
    i = cfg["inflation_pct"] / 100
    y1, y2 = int(cfg["bucket1_years"]), int(cfg["bucket2_years"])
    exp_b1 = annual * sum((1 + i) ** k for k in range(0, y1))
    exp_b2 = annual * sum((1 + i) ** k for k in range(y1, y1 + y2))
    assert abs(d["buckets"]["cash"]["target"] - exp_b1) < 0.05
    assert abs(d["buckets"]["safety"]["target"] - exp_b2) < 0.05
    assert d["buckets"]["growth"]["target"] is None


def test_buckets_fill_to_target_within_ui_ranges(client):
    """Targets are a fraction of corpus, so B1/B2 must come out exactly full."""
    d = _get(client)
    for b in ("cash", "safety"):
        assert abs(d["buckets"][b]["actual"] - d["buckets"][b]["target"]) < 0.05
    # a full bucket covers exactly its configured horizon
    assert d["buckets"]["cash"]["years_covered"] == d["config"]["bucket1_years"]
    assert d["buckets"]["safety"]["years_covered"] == d["config"]["bucket2_years"]


def test_pf_pours_first_by_default(client):
    d = _get(client)
    cash_slices = d["buckets"]["cash"]["slices"]
    assert cash_slices, "bucket 1 should not be empty"
    assert cash_slices[0]["entity"] == "pf"
    assert cash_slices[0]["priority"] == "cash"


def test_partial_flag_marks_straddling_holdings(client):
    d = _get(client)
    for b in ("cash", "safety", "growth"):
        for s in d["buckets"][b]["slices"]:
            h = next(x for x in d["holdings"] if (x["entity"], x["key"]) == (s["entity"], s["key"]))
            if s["partial"]:
                assert s["amount"] < h["value"] - 0.005
            else:
                # non-partial slices carry the holding's full value
                assert abs(s["amount"] - h["value"]) < 0.05


def test_assignment_sets_pour_priority_not_location(client):
    """Assigning a holding changes pour ORDER; the waterfall still owns placement."""
    r = client.put("/api/retirement/assign", json={"entity": "stock", "key": "INFY", "bucket": "cash"})
    assert r.status_code == 200
    d = _get(client)
    infy = next(h for h in d["holdings"] if h["key"] == "INFY")
    assert infy["bucket"] == "cash"  # priority recorded
    # money conservation still holds after reassignment
    bucket_total = sum(d["buckets"][b]["actual"] for b in ("cash", "safety", "growth"))
    assert abs(bucket_total - d["corpus"]) < 0.05
    # INFY's slices carry priority 'cash' wherever they landed
    for b in ("cash", "safety", "growth"):
        for s in d["buckets"][b]["slices"]:
            if s["key"] == "INFY":
                assert s["priority"] == "cash"


def test_cash_amount_pours_before_everything(client):
    cfg = _get(client)["config"]
    r = client.put("/api/retirement/config", json={
        "swr_pct": cfg["swr_pct"], "inflation_pct": cfg["inflation_pct"],
        "bucket1_years": cfg["bucket1_years"], "bucket2_years": cfg["bucket2_years"],
        "cash_amount": 100,
    })
    assert r.status_code == 200
    d = _get(client)
    first = d["buckets"]["cash"]["slices"][0]
    assert first["entity"] == "cash" and first["key"] == "manual"
    assert d["corpus"] == _corpus_from_holdings(d) + 100


def _corpus_from_holdings(d):
    return round(sum(h["value"] for h in d["holdings"]), 2)


def test_config_validation_rejects_out_of_model_values(client):
    base = {"swr_pct": 4, "inflation_pct": 6, "bucket1_years": 3, "bucket2_years": 5, "cash_amount": 0}
    for bad in (
        {**base, "swr_pct": 10},
        {**base, "swr_pct": 0},
        {**base, "inflation_pct": 12},
        {**base, "bucket1_years": 6},
        {**base, "bucket2_years": 9},
        {**base, "cash_amount": -5},
    ):
        assert client.put("/api/retirement/config", json=bad).status_code == 400, bad


def test_config_roundtrip(client):
    payload = {"swr_pct": 3.5, "inflation_pct": 7, "bucket1_years": 2, "bucket2_years": 4, "cash_amount": 5000}
    assert client.put("/api/retirement/config", json=payload).status_code == 200
    cfg = _get(client)["config"]
    for k, v in payload.items():
        assert cfg[k] == v


def test_assign_validation(client):
    assert client.put("/api/retirement/assign", json={"entity": "stock", "key": "INFY", "bucket": "nope"}).status_code == 400
    assert client.put("/api/retirement/assign", json={"entity": "bond", "key": "X", "bucket": "cash"}).status_code == 400
