#!/usr/bin/env python3
"""Create a demo copy of investments.db with every value inflated by a factor.

Usage:
    python make_dummy_db.py [FACTOR]     # default factor = 10
Output:
    backend/dummy_investments.db  (never touches the live investments.db)

Only monetary/quantity columns are scaled.  Keys, dates, AMFI codes, UANs,
account numbers, user flags (is_admin/is_approved) and networth_history
year/month are left untouched.  To use it, back up investments.db and copy
dummy_investments.db over it.
"""
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "investments.db")
DST = os.path.join(HERE, "dummy_investments.db")
FACTOR = float(sys.argv[1]) if len(sys.argv) > 1 else 10.0

SCALE_COLS = {
    "User1_MF": ["Units", "Purchase_NAV", "Current_NAV", "Value_at_cost",
                 "Total_at_cost", "Value_now", "Total_value_now", "Previous_NAV"],
    "User2_MF": ["Units", "Purchase_NAV", "Current_NAV", "Value_at_cost",
                 "Total_at_cost", "Value_now", "Total_value_now", "Previous_NAV"],
    "MF_Summary": ["Units", "Value_at_cost", "Value_now", "Lowest_NAV",
                   "Highest_NAV", "Current_NAV"],
    "User1_Stocks": ["Qty", "Purchase_cost", "LTP", "Value_now", "Value_at_cost"],
    "User2_Stocks": ["Qty", "Purchase_cost", "LTP", "Value_now", "Value_at_cost"],
    "Stocks": ["Qty", "Purchase_cost", "LTP", "Value_now", "Value_at_cost"],
    "User1_PF": ["employee_contrib", "employer_contrib", "interest"],
    "User2_PF": ["employee_contrib", "employer_contrib", "interest"],
    "PF_Config": ["initial_balance"],
    "PF_Accounts": ["opening_balance"],
    "networth_history": ["total_invested", "total_value", "mf_invested",
                         "mf_value", "stock_invested", "stock_value",
                         "pf_invested", "pf_value"],
}


def main():
    if not os.path.exists(SRC):
        sys.exit(f"Source DB not found: {SRC}")
    if os.path.exists(DST):
        os.remove(DST)

    src = sqlite3.connect(SRC)
    dst = sqlite3.connect(DST)
    src.backup(dst)
    src.close()

    tables = {r[0] for r in dst.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}

    for table, cols in SCALE_COLS.items():
        if table not in tables:
            print(f"  skip {table} (not present)")
            continue
        for col in cols:
            dst.execute(
                f'UPDATE "{table}" SET "{col}" = CASE '
                f'WHEN "{col}" IS NULL OR "{col}" = \'\' THEN "{col}" '
                f'ELSE CAST("{col}" AS REAL) * ? END',
                (FACTOR,))
        dst.commit()
        print(f"  scaled {table}: {len(cols)} columns")

    dst.close()

    for table, col in [("User1_MF", "Value_now"),
                       ("User2_MF", "Value_now"),
                       ("User1_Stocks", "Value_now"),
                       ("User2_Stocks", "Value_now")]:
        s = _sum(SRC, table, col)
        d = _sum(DST, table, col)
        print(f"{table}.{col}: {s:,.2f} -> {d:,.2f}  (x{d/s:.1f})")

    pf = _sum(DST, "User1_PF", "employee_contrib")
    pf2 = _sum(DST, "User2_PF", "employee_contrib")
    print(f"PF contributions (User1+User2): {pf + pf2:,.2f}")
    print(f"Created {DST}")


def _sum(db_path, table, col):
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute(f'SELECT COALESCE(SUM("{col}"), 0) FROM "{table}"').fetchone()[0]
    finally:
        conn.close()


if __name__ == "__main__":
    main()
