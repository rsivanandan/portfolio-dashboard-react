import io
import csv


class TestStockEndpoints:
    def test_all_stocks(self, client):
        resp = client.get("/api/stocks")
        assert resp.status_code == 200
        data = resp.json()
        tickers = [r["Ticker"] for r in data]
        assert "INFY" in tickers
        assert "TCS" in tickers

    def test_user1_stocks(self, client):
        resp = client.get("/api/stocks/user1")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["Ticker"] == "INFY"

    def test_user2_stocks(self, client):
        resp = client.get("/api/stocks/user2")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["Ticker"] == "TCS"

    def test_stock_enrichment(self, client):
        data = client.get("/api/stocks/user1").json()
        row = data[0]
        assert "Returns" in row
        assert "Returns_pct" in row
        assert row["Returns"] == round(row["Value_now"] - row["Value_at_cost"], 2)


def _make_csv(rows: list[dict]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode()


class TestUploadStocks:
    def test_upload_csv_basic(self, client):
        csv_bytes = _make_csv([
            {"Ticker": "RELIANCE", "Qty": 10, "Purchase_cost": 2500},
            {"Ticker": "WIPRO", "Qty": 20, "Purchase_cost": 400},
        ])
        resp = client.post(
            "/api/admin/upload-stocks/user1",
            files={"file": ("stocks.csv", csv_bytes, "text/csv")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["rows"] == 2

        rows = client.get("/api/stocks/user1").json()
        assert len(rows) == 2
        tickers = {r["Ticker"] for r in rows}
        assert tickers == {"RELIANCE", "WIPRO"}

    def test_upload_computes_value_at_cost(self, client):
        csv_bytes = _make_csv([
            {"Ticker": "HDFCBANK", "Qty": 5, "Purchase_cost": 1600},
        ])
        client.post(
            "/api/admin/upload-stocks/user1",
            files={"file": ("stocks.csv", csv_bytes, "text/csv")},
        )
        rows = client.get("/api/stocks/user1").json()
        assert rows[0]["Value_at_cost"] == 5 * 1600

    def test_upload_sets_ltp_and_value_now_to_zero(self, client):
        csv_bytes = _make_csv([
            {"Ticker": "HDFCBANK", "Qty": 5, "Purchase_cost": 1600},
        ])
        client.post(
            "/api/admin/upload-stocks/user1",
            files={"file": ("stocks.csv", csv_bytes, "text/csv")},
        )
        rows = client.get("/api/stocks/user1").json()
        assert rows[0]["LTP"] == 0
        assert rows[0]["Value_now"] == 0

    def test_upload_broker_format(self, client):
        csv_bytes = _make_csv([
            {"Instrument": "TATAMOTORS", "Qty.": 15, "Avg. cost": 600, "LTP": 700, "Cur. val": 10500, "P&L": 1500},
        ])
        resp = client.post(
            "/api/admin/upload-stocks/user2",
            files={"file": ("broker.csv", csv_bytes, "text/csv")},
        )
        assert resp.status_code == 200

        rows = client.get("/api/stocks/user2").json()
        assert len(rows) == 1
        assert rows[0]["Ticker"] == "TATAMOTORS"
        assert rows[0]["Qty"] == 15
        assert rows[0]["Value_at_cost"] == 15 * 600

    def test_upload_replaces_existing_data(self, client):
        csv_bytes = _make_csv([
            {"Ticker": "NEWSTOCK", "Qty": 1, "Purchase_cost": 100},
        ])
        client.post(
            "/api/admin/upload-stocks/user1",
            files={"file": ("stocks.csv", csv_bytes, "text/csv")},
        )
        rows = client.get("/api/stocks/user1").json()
        assert len(rows) == 1
        assert rows[0]["Ticker"] == "NEWSTOCK"

    def test_upload_missing_columns_returns_400(self, client):
        csv_bytes = _make_csv([
            {"Name": "INFY", "Amount": 10},
        ])
        resp = client.post(
            "/api/admin/upload-stocks/user1",
            files={"file": ("bad.csv", csv_bytes, "text/csv")},
        )
        assert resp.status_code == 400
        assert "Missing required columns" in resp.json()["detail"]

    def test_upload_invalid_extension(self, client):
        resp = client.post(
            "/api/admin/upload-stocks/user1",
            files={"file": ("data.json", b"{}", "application/json")},
        )
        assert resp.status_code == 400

    def test_upload_invalid_owner(self, client):
        csv_bytes = _make_csv([{"Ticker": "X", "Qty": 1, "Purchase_cost": 1}])
        resp = client.post(
            "/api/admin/upload-stocks/nobody",
            files={"file": ("stocks.csv", csv_bytes, "text/csv")},
        )
        assert resp.status_code == 400

    def test_upload_does_not_affect_other_owner(self, client):
        csv_bytes = _make_csv([{"Ticker": "NEWSTOCK", "Qty": 1, "Purchase_cost": 100}])
        client.post(
            "/api/admin/upload-stocks/user1",
            files={"file": ("stocks.csv", csv_bytes, "text/csv")},
        )
        user2 = client.get("/api/stocks/user2").json()
        assert len(user2) == 1
        assert user2[0]["Ticker"] == "TCS"
