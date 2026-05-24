import sqlite3

PROD_DB = "investments.db"
TEST_DB = "test_investments.db"


def copy_schema(prod, test):
    for row in prod.execute("SELECT sql FROM sqlite_master WHERE sql NOT NULL"):
        try:
            test.execute(row[0])
        except:
            pass


def transform_row(row, columns):
    new_row = []
    for col, val in zip(columns, row):
        if val is None:
            new_row.append(val)
        elif col.lower() == "id" or col.lower().endswith("id"):
            new_row.append(val)
        elif isinstance(val, (int, float)):
            new_row.append(val * 5)
        else:
            new_row.append(val)
    return tuple(new_row)


def copy_data(prod, test):
    test.execute("PRAGMA foreign_keys = OFF")

    tables = [
        row[0]
        for row in prod.execute("SELECT name FROM sqlite_master WHERE type='table'")
        if not row[0].startswith("sqlite_")
    ]

    for table in tables:
        try:
            cursor = prod.execute(f'SELECT * FROM "{table}"')
            columns = [desc[0] for desc in cursor.description]

            data = [
                transform_row(row, columns)
                for row in cursor.fetchall()
            ]

            placeholders = ",".join(["?"] * len(columns))
            cols = ",".join(f'"{c}"' for c in columns)

            test.executemany(
                f'INSERT INTO "{table}" ({cols}) VALUES ({placeholders})',
                data
            )

            print(f"✔ {table}")

        except Exception as e:
            print(f"✖ {table}: {e}")

    test.commit()
    test.execute("PRAGMA foreign_keys = ON")


def main():
    with sqlite3.connect(PROD_DB) as prod, sqlite3.connect(TEST_DB) as test:
        copy_schema(prod, test)
        copy_data(prod, test)

    print("Done.")


if __name__ == "__main__":
    main()
    