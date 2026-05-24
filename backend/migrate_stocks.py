"""Migrate the single Stocks table into User1_Stocks + User2_Stocks.

Copies existing Stocks data into User1_Stocks.
Creates an empty User2_Stocks table with the same schema.
The original Stocks table is kept as a backup.
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "investments.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Check if Stocks table exists
tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]

if "Stocks" not in tables:
    print("No Stocks table found — nothing to migrate.")
else:
    # Create User1_Stocks from existing Stocks
    if "User1_Stocks" not in tables:
        cur.execute("CREATE TABLE User1_Stocks AS SELECT * FROM Stocks")
        print(f"Created User1_Stocks with {cur.execute('SELECT COUNT(*) FROM User1_Stocks').fetchone()[0]} rows")
    else:
        print("User1_Stocks already exists — skipping")

    # Create empty User2_Stocks with same schema
    if "User2_Stocks" not in tables:
        cur.execute("CREATE TABLE User2_Stocks AS SELECT * FROM Stocks WHERE 0")
        print("Created empty User2_Stocks")
    else:
        print("User2_Stocks already exists — skipping")

    conn.commit()
    print("\nDone! Original Stocks table kept as backup.")

conn.close()
