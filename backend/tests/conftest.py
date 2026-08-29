import sqlite3
import pytest
from fastapi.testclient import TestClient

import main
from auth import get_current_user


MOCK_USER = {
    "id": 1,
    "username": "testadmin",
    "email": "admin@test.com",
    "is_admin": 1,
    "is_approved": 1,
}


def _seed_db(conn: sqlite3.Connection):
    for tbl in ("User1_MF", "User2_MF"):
        conn.execute(f"""
            CREATE TABLE {tbl} (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                Fund_House        TEXT,
                Fund_Name         TEXT,
                Folio_Number      TEXT,
                AMFI_CODE         REAL,
                Units             REAL,
                Purchase_NAV      TEXT,
                Purchase_Date     TEXT,
                Current_NAV       REAL,
                Value_at_cost     REAL,
                Total_at_cost     REAL,
                Value_now         REAL,
                Total_value_now   REAL,
                NAV_Date          TEXT
            )
        """)

    conn.execute("""
        INSERT INTO User1_MF (Fund_House, Fund_Name, Folio_Number, AMFI_CODE,
                                Units, Purchase_NAV, Purchase_Date, Current_NAV,
                                Value_at_cost, Value_now)
        VALUES ('HDFC', 'HDFC Mid-Cap', '1234', 100123, 50, '25.5', '2024-01-01', 30.0, 1275, 1500)
    """)
    conn.execute("""
        INSERT INTO User2_MF (Fund_House, Fund_Name, Folio_Number, AMFI_CODE,
                                 Units, Purchase_NAV, Purchase_Date, Current_NAV,
                                 Value_at_cost, Value_now)
        VALUES ('ICICI', 'ICICI Bluechip', '5678', 200456, 100, '40', '2024-03-01', 45.0, 4000, 4500)
    """)

    conn.execute("INSERT INTO User1_MF (Fund_House, Fund_Name) VALUES ('', NULL)")

    for tbl in ("User1_PF", "User2_PF"):
        conn.execute(f"""
            CREATE TABLE {tbl} (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                account          TEXT DEFAULT '',
                employee_contrib REAL DEFAULT 0,
                employer_contrib REAL DEFAULT 0,
                interest         REAL DEFAULT 0,
                entry_date       TEXT,
                notes            TEXT
            )
        """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS PF_Config (
            user            TEXT PRIMARY KEY,
            UAN             TEXT DEFAULT '',
            initial_balance REAL DEFAULT 0,
            initial_month   TEXT DEFAULT ''
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS PF_Accounts (
            user            TEXT,
            account         TEXT,
            establishment   TEXT DEFAULT '',
            opening_balance REAL DEFAULT 0,
            opening_month   TEXT DEFAULT '',
            UAN             TEXT DEFAULT '',
            UNIQUE(user, account)
        )
    """)

    conn.execute("""
        INSERT INTO PF_Config (user, UAN, initial_balance, initial_month)
        VALUES ('user1', 'UAN001', 10000, '2025-12')
    """)
    conn.execute("""
        INSERT INTO PF_Config (user, UAN, initial_balance, initial_month)
        VALUES ('user2', 'UAN002', 5000, '2025-12')
    """)

    conn.execute("""
        INSERT INTO PF_Accounts (user, account, establishment, opening_balance, opening_month, UAN)
        VALUES ('user1', 'BGBNG00000000000000001', 'Acme Corp', 10000, '2025-12', 'UAN001')
    """)
    conn.execute("""
        INSERT INTO PF_Accounts (user, account, establishment, opening_balance, opening_month, UAN)
        VALUES ('user2', 'BGBNG00000000000000002', 'Beta Ltd', 5000, '2025-12', 'UAN002')
    """)

    conn.execute("""
        INSERT INTO User1_PF (account, employee_contrib, employer_contrib, interest, entry_date)
        VALUES ('BGBNG00000000000000001', 5000, 3000, 1000, '2026-01')
    """)
    conn.execute("""
        INSERT INTO User1_PF (account, employee_contrib, employer_contrib, interest, entry_date)
        VALUES ('BGBNG00000000000000001', 5000, 3000, 500, '2026-02')
    """)

    conn.execute("""
        INSERT INTO User2_PF (account, employee_contrib, employer_contrib, interest, entry_date)
        VALUES ('BGBNG00000000000000002', 4000, 2500, 800, '2026-01')
    """)

    for tbl in ("User1_Stocks", "User2_Stocks"):
        conn.execute(f"""
            CREATE TABLE {tbl} (
                Ticker         TEXT,
                Instrument     TEXT,
                Qty            REAL,
                Purchase_cost  REAL,
                LTP            REAL,
                Value_now      REAL,
                Value_at_cost  REAL
            )
        """)

    conn.execute("""
        INSERT INTO User1_Stocks VALUES ('INFY', 'Infosys', 10, 1500, 1600, 16000, 15000)
    """)
    conn.execute("""
        INSERT INTO User2_Stocks VALUES ('TCS', 'TCS Ltd', 5, 3500, 3700, 18500, 17500)
    """)

    conn.execute("""
        CREATE TABLE MF_Summary (
            AMFI_CODE  REAL,
            Fund_Name  TEXT,
            Category   TEXT,
            Sub_Category TEXT,
            Fund_House TEXT,
            NAV        REAL,
            NAV_Date   TEXT,
            AUM        REAL,
            Expense    REAL,
            Returns_1Y REAL,
            Returns_3Y REAL
        )
    """)
    conn.execute("""
        INSERT INTO MF_Summary (AMFI_CODE, Fund_Name, Category) VALUES (100123, 'HDFC Mid-Cap', 'Equity')
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS networth_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            month INTEGER,
            total_invested REAL,
            total_value REAL,
            mf_invested REAL,
            mf_value REAL,
            stock_invested REAL,
            stock_value REAL,
            pf_invested REAL,
            pf_value REAL,
            recorded_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(year, month)
        )
    """)

    conn.commit()


@pytest.fixture()
def client(tmp_path):
    db_file = str(tmp_path / "test.db")

    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    _seed_db(conn)
    conn.close()

    original = main.DB_PATH
    main.DB_PATH = db_file
    # Force the live-DB path regardless of the demo toggle: active_db() reads
    # MODE_FILE, and with mode=dummy the whole suite would silently read AND
    # WRITE the real dummy_investments.db instead of this tmp fixture.
    original_mode_file = main.MODE_FILE
    main.MODE_FILE = str(tmp_path / "nonexistent_mode.txt")
    original_dummy = main.DUMMY_PATH
    main.DUMMY_PATH = str(tmp_path / "nonexistent_dummy.db")
    # Stub the NIFTY 12m market-gate cache so tests never hit the network
    import time as _time
    original_nifty = dict(main._nifty_12m_cache)
    main._nifty_12m_cache.update(ts=_time.time() + 10**9, pct=5.0)

    main.app.dependency_overrides[get_current_user] = lambda: MOCK_USER

    with TestClient(main.app) as c:
        yield c

    main.DB_PATH = original
    main.MODE_FILE = original_mode_file
    main.DUMMY_PATH = original_dummy
    main._nifty_12m_cache.clear()
    main._nifty_12m_cache.update(original_nifty)
    main.app.dependency_overrides.clear()
