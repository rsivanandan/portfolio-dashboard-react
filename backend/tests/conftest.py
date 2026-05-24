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

    main.app.dependency_overrides[get_current_user] = lambda: MOCK_USER

    with TestClient(main.app) as c:
        yield c

    main.DB_PATH = original
    main.app.dependency_overrides.clear()
