import pytest


class TestAdminListMF:
    def test_list_user1_returns_seeded_row(self, client):
        resp = client.get("/api/admin/mf/user1")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["Fund_Name"] == "HDFC Mid-Cap"

    def test_list_user2(self, client):
        resp = client.get("/api/admin/mf/user2")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["Fund_Name"] == "ICICI Bluechip"

    def test_list_filters_null_fund_name(self, client):
        resp = client.get("/api/admin/mf/user1")
        names = [r["Fund_Name"] for r in resp.json()]
        assert all(n for n in names)

    def test_list_invalid_owner_returns_400(self, client):
        resp = client.get("/api/admin/mf/unknown")
        assert resp.status_code == 400

    def test_rows_include_rowid(self, client):
        resp = client.get("/api/admin/mf/user1")
        assert "rowid" in resp.json()[0]


class TestAdminCreateMF:
    PAYLOAD = {
        "owner": "user1",
        "Fund_House": "SBI",
        "Fund_Name": "SBI Small Cap",
        "Folio_Number": "9999",
        "AMFI_CODE": 300789,
        "Units": 25,
        "Purchase_NAV": "50",
        "Purchase_Date": "2024-06-01",
        "Current_NAV": 55,
        "Value_at_cost": 1250,
        "Value_now": 1375,
    }

    def test_create_success(self, client):
        resp = client.post("/api/admin/mf", json=self.PAYLOAD)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert "rowid" in body

    def test_create_appears_in_list(self, client):
        client.post("/api/admin/mf", json=self.PAYLOAD)
        rows = client.get("/api/admin/mf/user1").json()
        names = [r["Fund_Name"] for r in rows]
        assert "SBI Small Cap" in names

    def test_create_user2(self, client):
        payload = {**self.PAYLOAD, "owner": "user2", "Fund_Name": "Kotak Flexi"}
        resp = client.post("/api/admin/mf", json=payload)
        assert resp.status_code == 200
        rows = client.get("/api/admin/mf/user2").json()
        names = [r["Fund_Name"] for r in rows]
        assert "Kotak Flexi" in names

    def test_create_invalid_owner(self, client):
        payload = {**self.PAYLOAD, "owner": "nobody"}
        resp = client.post("/api/admin/mf", json=payload)
        assert resp.status_code == 400

    def test_create_missing_fund_name_fails(self, client):
        payload = {k: v for k, v in self.PAYLOAD.items() if k != "Fund_Name"}
        resp = client.post("/api/admin/mf", json=payload)
        assert resp.status_code == 422


class TestAdminUpdateMF:
    def test_update_existing(self, client):
        rows = client.get("/api/admin/mf/user1").json()
        rid = rows[0]["rowid"]

        updated = {
            "owner": "user1",
            "Fund_House": "HDFC",
            "Fund_Name": "HDFC Mid-Cap Updated",
            "Folio_Number": "1234",
            "AMFI_CODE": 100123,
            "Units": 60,
            "Purchase_NAV": "25.5",
            "Purchase_Date": "2024-01-01",
            "Current_NAV": 32,
            "Value_at_cost": 1530,
            "Value_now": 1920,
        }
        resp = client.put(f"/api/admin/mf/user1/{rid}", json=updated)
        assert resp.status_code == 200

        rows = client.get("/api/admin/mf/user1").json()
        assert rows[0]["Fund_Name"] == "HDFC Mid-Cap Updated"
        assert rows[0]["Units"] == 60

    def test_update_invalid_owner(self, client):
        resp = client.put(
            "/api/admin/mf/nobody/1",
            json={"owner": "nobody", "Fund_Name": "X"},
        )
        assert resp.status_code == 400


class TestAdminDeleteMF:
    def test_delete_existing(self, client):
        rows = client.get("/api/admin/mf/user1").json()
        rid = rows[0]["rowid"]

        resp = client.delete(f"/api/admin/mf/user1/{rid}")
        assert resp.status_code == 200

        rows = client.get("/api/admin/mf/user1").json()
        assert len(rows) == 0

    def test_delete_nonexistent_returns_ok(self, client):
        resp = client.delete("/api/admin/mf/user1/99999")
        assert resp.status_code == 200

    def test_delete_invalid_owner(self, client):
        resp = client.delete("/api/admin/mf/nobody/1")
        assert resp.status_code == 400
