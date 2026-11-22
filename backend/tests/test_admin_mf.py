import sqlite3

import pytest

import main


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


class TestAdminRowidDrift:
    """Legacy DBs have an `id` column that can differ from SQLite's rowid."""

    @pytest.fixture()
    def drift_db(self, client, tmp_path):
        original = main.DB_PATH
        path = str(tmp_path / "drift.db")
        conn = sqlite3.connect(path)
        conn.execute("""
            CREATE TABLE User1_MF (
                id INTEGER, Fund_House TEXT, Fund_Name TEXT, Folio_Number TEXT,
                AMFI_CODE REAL, Units REAL, Purchase_NAV TEXT, Purchase_Date TEXT,
                Current_NAV REAL, Value_at_cost REAL, Total_at_cost REAL,
                Value_now REAL, Total_value_now REAL, NAV_Date TEXT, Previous_NAV REAL
            )
        """)
        conn.executemany(
            """
            INSERT INTO User1_MF
                (id, Fund_House, Fund_Name, Folio_Number, Units,
                 Purchase_NAV, Purchase_Date, Current_NAV, Value_at_cost, Value_now)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (99, 'HDFC', 'Legacy Drift Fund', '1', 10, '10', '2024-01-01', 12, 100, 120),
                (1, 'ICICI', 'Other Fund', '2', 20, '20', '2024-02-01', 22, 400, 440),
                (None, 'SBI', 'Newly Added Fund', '3', 30, '30', '2024-03-01', 32, 900, 960),
            ],
        )
        conn.commit()
        conn.close()
        main.DB_PATH = path
        yield path
        main.DB_PATH = original

    def _names_by_rowid(self, path):
        conn = sqlite3.connect(path)
        try:
            return dict(conn.execute("SELECT rowid, Fund_Name FROM User1_MF").fetchall())
        finally:
            conn.close()

    def test_list_returns_real_rowids(self, drift_db, client):
        rows = client.get("/api/admin/mf/user1").json()
        by_name = {r["Fund_Name"]: r["rowid"] for r in rows}
        assert by_name == {
            "Legacy Drift Fund": 1,
            "Other Fund": 2,
            "Newly Added Fund": 3,
        }

    def test_update_edits_the_intended_row(self, drift_db, client):
        rows = client.get("/api/admin/mf/user1").json()
        rid = next(r["rowid"] for r in rows if r["Fund_Name"] == "Legacy Drift Fund")
        payload = {
            "owner": "user1",
            "Fund_House": "HDFC",
            "Fund_Name": "Renamed Drift Fund",
            "Folio_Number": "1",
            "AMFI_CODE": 1,
            "Units": 10,
            "Purchase_NAV": "10",
            "Purchase_Date": "2024-01-01",
            "Current_NAV": 12,
            "Value_at_cost": 100,
            "Value_now": 120,
        }
        resp = client.put(f"/api/admin/mf/user1/{rid}", json=payload)
        assert resp.status_code == 200
        assert self._names_by_rowid(drift_db) == {
            1: "Renamed Drift Fund",
            2: "Other Fund",
            3: "Newly Added Fund",
        }

    def test_delete_removes_the_intended_row(self, drift_db, client):
        rows = client.get("/api/admin/mf/user1").json()
        rid = next(r["rowid"] for r in rows if r["Fund_Name"] == "Newly Added Fund")
        resp = client.delete(f"/api/admin/mf/user1/{rid}")
        assert resp.status_code == 200
        assert self._names_by_rowid(drift_db) == {
            1: "Legacy Drift Fund",
            2: "Other Fund",
        }
