import pytest
from datetime import date

import main


SERIES = [
    {"date": "15-08-2026", "nav": "125.0"},
    {"date": "15-08-2025", "nav": "100.0"},
    {"date": "15-08-2024", "nav": "80.0"},
    {"date": "15-08-2023", "nav": "60.0"},
    {"date": "15-08-2021", "nav": "40.0"},
    {"date": "15-08-2016", "nav": "20.0"},
]

# Series that only goes back 3 years -> 5Y is unavailable
YOUNG_SERIES = SERIES[:4]


class _FakeMftool:
    def __init__(self, *args, **kwargs):
        pass

    def get_scheme_historical_nav(self, code):
        return {"data": SERIES}


def _expected_cagr(cur_nav, lb_nav, days):
    return round(((cur_nav / lb_nav) ** (365.25 / days) - 1) * 100, 2)


class TestTrailingReturns:
    TODAY = date(2026, 8, 15)

    def test_all_horizons(self):
        res = main._trailing_returns(SERIES, today=self.TODAY)
        assert res["r1y"] == pytest.approx(_expected_cagr(125, 100, 365), abs=0.01)
        assert res["r2y"] == pytest.approx(_expected_cagr(125, 80, 730), abs=0.01)
        assert res["r3y"] == pytest.approx(_expected_cagr(125, 60, 1096), abs=0.01)
        assert res["r5y"] == pytest.approx(_expected_cagr(125, 40, 1826), abs=0.01)
        assert res["r10y"] == pytest.approx(_expected_cagr(125, 20, 3652), abs=0.01)

    def test_young_fund_returns_none_for_5y(self):
        res = main._trailing_returns(YOUNG_SERIES, today=self.TODAY)
        assert res["r5y"] is None
        assert res["r1y"] is not None
        assert res["r3y"] is not None

    def test_oldest_first_input_is_handled(self):
        res = main._trailing_returns(list(reversed(SERIES)), today=self.TODAY)
        assert res["r1y"] == pytest.approx(_expected_cagr(125, 100, 365), abs=0.01)

    def test_empty_series_returns_all_none(self):
        res = main._trailing_returns([], today=self.TODAY)
        assert res == {"r1y": None, "r2y": None, "r3y": None, "r5y": None, "r10y": None}

    def test_bad_entries_are_ignored(self):
        series = [{"date": "not-a-date", "nav": "x"}, {"nav": "1"}] + SERIES
        res = main._trailing_returns(series, today=self.TODAY)
        assert res["r1y"] is not None

    def test_historical_nav_cache(self, monkeypatch):
        calls = []

        class Fake:
            def get_scheme_historical_nav(self, code):
                calls.append(code)
                return {"data": SERIES}

        main._MF_HIST_CACHE.clear()
        mft = Fake()
        main._get_historical_nav(mft, 100123)
        main._get_historical_nav(mft, 100123)
        assert len(calls) == 1
        main._MF_HIST_CACHE.clear()


class TestReturnsAPI:
    def _patch(self, monkeypatch):
        main._MF_HIST_CACHE.clear()
        monkeypatch.setattr("mftool.Mftool", _FakeMftool)
        monkeypatch.setattr(main, "_get_historical_nav", lambda mft, code: SERIES)

    def test_all_returns_shape_and_avg(self, client, monkeypatch):
        self._patch(monkeypatch)
        resp = client.get("/api/mutual-funds/returns")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3  # HDFC + ICICI + weighted avg row
        avg = data[-1]
        assert avg["Fund_Name"] == "Portfolio (weighted avg)"
        assert avg["AMFI_CODE"] is None
        assert avg["r1y"] is not None
        assert avg["r5y"] is not None

    def test_owner_scoping(self, client, monkeypatch):
        self._patch(monkeypatch)
        u1 = client.get("/api/mutual-funds/returns/user1").json()
        assert len(u1) == 2  # HDFC + avg
        assert u1[0]["Fund_Name"] == "HDFC Mid-Cap"
        assert u1[0]["AMFI_CODE"] == 100123
        assert u1[0]["Category"] == "Equity"

        u2 = client.get("/api/mutual-funds/returns/user2").json()
        assert len(u2) == 2
        assert u2[0]["Fund_Name"] == "ICICI Bluechip"
        assert u2[0]["AMFI_CODE"] == 200456

    def test_invalid_owner_returns_400(self, client, monkeypatch):
        self._patch(monkeypatch)
        resp = client.get("/api/mutual-funds/returns/nobody")
        assert resp.status_code == 400
