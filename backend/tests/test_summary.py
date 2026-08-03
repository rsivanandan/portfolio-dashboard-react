class TestSummary:
    def test_summary_structure(self, client):
        resp = client.get("/api/summary")
        assert resp.status_code == 200
        data = resp.json()
        expected_keys = {
            "mf_invested", "mf_now", "mf_returns", "mf_pct",
            "sto_invested", "sto_now", "sto_returns", "sto_pct",
            "pf_invested", "pf_now", "pf_returns", "pf_pct",
            "total_invested", "total_now", "total_returns", "total_pct",
            "appreciation_x",
        }
        assert expected_keys.issubset(data.keys())

    def test_summary_math(self, client):
        data = client.get("/api/summary").json()
        assert data["mf_invested"] == 5275.0
        assert data["mf_now"] == 6000.0
        assert data["sto_invested"] == 32500.0
        # User1 initial=10000, contrib=(5000+3000)+(5000+3000)=16000 → pf_inv=26000
        # User2 initial=5000, contrib=(4000+2500)=6500 → pf_inv=11500
        assert data["pf_invested"] == 37500.0
        # User1 interest=1000+500=1500 → pf_now=26000+1500=27500
        # User2 interest=800 → pf_now=11500+800=12300
        assert data["pf_now"] == 39800.0


class TestMutualFundEndpoints:
    def test_all_mutual_funds(self, client):
        resp = client.get("/api/mutual-funds")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1

    def test_user1_mf(self, client):
        resp = client.get("/api/mutual-funds/user1")
        assert resp.status_code == 200
        data = resp.json()
        names = [r["Fund_Name"] for r in data if r["Fund_Name"]]
        assert "HDFC Mid-Cap" in names

    def test_user2_mf(self, client):
        resp = client.get("/api/mutual-funds/user2")
        assert resp.status_code == 200
        data = resp.json()
        names = [r["Fund_Name"] for r in data if r["Fund_Name"]]
        assert "ICICI Bluechip" in names

    def test_mf_enrichment(self, client):
        data = client.get("/api/mutual-funds/user1").json()
        for row in data:
            if not row["Fund_Name"]:
                continue
            assert "Returns" in row
            assert "Returns_pct" in row
            assert "Category" in row

    def test_categories(self, client):
        resp = client.get("/api/mutual-funds/categories")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        cats = [r["Category"] for r in data]
        assert "Equity" in cats or "Other" in cats


class TestAnalytics:
    def test_timeline(self, client):
        resp = client.get("/api/analytics/timeline")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert "year" in data[0]
        assert "gains" in data[0]

    def test_monthly(self, client):
        resp = client.get("/api/analytics/monthly")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert "month" in data[0]

    def test_snapshots_empty(self, client):
        resp = client.get("/api/analytics/snapshots")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_save_snapshot(self, client):
        resp = client.post("/api/analytics/snapshots")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"

        snaps = client.get("/api/analytics/snapshots").json()
        assert len(snaps) == 1
        assert snaps[0]["mf_invested"] == 5275.0
        assert snaps[0]["pf_invested"] == 37500.0
        assert snaps[0]["pf_value"] == 39800.0


class TestPFEndpoints:
    def test_all_pf(self, client):
        resp = client.get("/api/pf")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3

    def test_user1_pf(self, client):
        resp = client.get("/api/pf/user1")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        for row in data:
            assert "total_contrib" in row

    def test_user2_pf(self, client):
        resp = client.get("/api/pf/user2")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        # running_balance = initial_balance(5000) + contrib(6500) + interest(800) = 12300
        assert data[0]["running_balance"] == 12300.0


class TestAMFILookup:
    def test_lookup_invalid_code(self, client):
        resp = client.get("/api/amfi-lookup/0")
        assert resp.status_code in (404, 500)
