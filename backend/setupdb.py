import os
import sys

import pandas as pd
from sqlalchemy import create_engine

# ── Configuration ──────────────────────────────────────────────────────────

# Path to your Excel file — update this to match your setup
EXCEL_PATH = os.path.expanduser(
    os.getenv("INVESTMENTS_XLSX", "~/Dropbox/EXCEL/My_Investments.xlsx")
)

# Output DB — writes to same folder as this script (portfolio/backend/)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "investments.db")

# Sheet definitions: Excel sheet name → DB table name, columns, skiprows
SHEETS = [
    {"sheet": "Rajesh Funds",  "table": "User1_MF",  "columns": "B:N", "skiprows": 9},
    {"sheet": "Sandhya Funds", "table": "User2_MF", "columns": "C:O", "skiprows": 9},
    {"sheet": "MF_Summary",    "table": "MF_Summary",  "columns": "A:J", "skiprows": 1},
    {"sheet": "Stocks",        "table": "Stocks",       "columns": "A:G", "skiprows": 1},
]

# ── Helpers ────────────────────────────────────────────────────────────────

def read_sheet(filepath: str, sheet: str, columns: str, skiprows: int) -> pd.DataFrame | None:
    try:
        df = pd.read_excel(
            io=filepath,
            engine="openpyxl",
            sheet_name=sheet,
            skiprows=skiprows,
            usecols=columns,
        )
        # Drop completely empty rows
        df = df.dropna(how="all").reset_index(drop=True)
        return df
    except Exception as e:
        print(f"  ✗ Error reading sheet '{sheet}': {e}")
        return None


def write_table(df: pd.DataFrame, table: str, engine) -> bool:
    try:
        if df is None or df.empty:
            print(f"  ⚠ No data for table '{table}' — skipping")
            return False
        df.to_sql(table, con=engine, if_exists="replace", index=False)
        print(f"  ✓ {table}: {len(df)} rows written")
        return True
    except Exception as e:
        print(f"  ✗ Error writing table '{table}': {e}")
        return False


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    # Allow overriding Excel path from command line: python setupdb.py /path/to/file.xlsx
    filepath = sys.argv[1] if len(sys.argv) > 1 else EXCEL_PATH

    print(f"\n📂 Excel file : {filepath}")
    print(f"💾 Database   : {DB_PATH}\n")

    if not os.path.exists(filepath):
        print(f"✗ Excel file not found: {filepath}")
        print("  Pass the path as an argument: python setupdb.py /path/to/My_Investments.xlsx")
        sys.exit(1)

    engine = create_engine(f"sqlite:///{DB_PATH}")

    success = 0
    for s in SHEETS:
        print(f"→ Processing '{s['sheet']}' → '{s['table']}'")
        df = read_sheet(filepath, s["sheet"], s["columns"], s["skiprows"])
        if write_table(df, s["table"], engine):
            success += 1

    print(f"\n{'✅' if success == len(SHEETS) else '⚠'} Done — {success}/{len(SHEETS)} tables updated")
    print("  Run 'Refresh NAV' and 'Refresh Stocks' in the dashboard to get current prices.\n")


if __name__ == "__main__":
    main()
