"""Admin endpoints must reject approved-but-non-admin users (403)."""
import main
from auth import get_current_user

NON_ADMIN = {
    "id": 2,
    "username": "regular",
    "email": "user@test.com",
    "is_admin": 0,
    "is_approved": 1,
}

ADMIN_CALLS = [
    ("post", "/api/admin/pf", {"json": {
        "owner": "user1", "account": "X", "employee_contrib": 1,
        "employer_contrib": 1, "interest": 0, "entry_date": "2026-01", "notes": ""}}),
    ("put", "/api/admin/pf-config/user1", {"json": {
        "owner": "user1", "UAN": "", "initial_balance": 0, "initial_month": ""}}),
    ("delete", "/api/admin/pf/user1/1", {}),
    ("post", "/api/admin/mf", {"json": {
        "owner": "user1", "Fund_House": "", "Fund_Name": "F", "Folio_Number": "",
        "AMFI_CODE": None, "Units": 1, "Purchase_NAV": "1", "Purchase_Date": "",
        "Current_NAV": 1, "Value_at_cost": 1, "Value_now": 1}}),
    ("delete", "/api/admin/mf/user1/1", {}),
    ("post", "/api/admin/upload-stocks/user1", {"files": {"file": ("s.csv", b"Ticker,Qty\n", "text/csv")}}),
]


def test_non_admin_rejected_on_admin_routes(client):
    main.app.dependency_overrides[get_current_user] = lambda: NON_ADMIN
    try:
        for method, path, kwargs in ADMIN_CALLS:
            res = getattr(client, method)(path, **kwargs)
            assert res.status_code == 403, f"{method.upper()} {path} -> {res.status_code}"
    finally:
        main.app.dependency_overrides[get_current_user] = lambda: NON_ADMIN  # restored by fixture teardown


def test_non_admin_can_still_use_user_features(client):
    main.app.dependency_overrides[get_current_user] = lambda: NON_ADMIN
    assert client.get("/api/summary").status_code == 200
    assert client.get("/api/retirement").status_code == 200
    r = client.put("/api/retirement/config", json={
        "swr_pct": 4, "inflation_pct": 6, "bucket1_years": 3, "bucket2_years": 5, "cash_amount": 0})
    assert r.status_code == 200


def test_login_rate_limited_after_failures(client):
    import auth
    auth._LOGIN_FAILURES.clear()
    for _ in range(5):
        r = client.post("/api/auth/login", json={"username": "nobody", "password": "wrong"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"username": "nobody", "password": "wrong"})
    assert r.status_code == 429
    # a different username from the same IP is not blocked
    r = client.post("/api/auth/login", json={"username": "someoneelse", "password": "wrong"})
    assert r.status_code == 401
    auth._LOGIN_FAILURES.clear()
