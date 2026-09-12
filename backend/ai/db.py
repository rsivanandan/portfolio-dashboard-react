import os
import sqlite3

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DB_PATH = os.path.join(BACKEND_DIR, "investments.db")
DUMMY_PATH = os.path.join(BACKEND_DIR, "dummy_investments.db")
MODE_FILE = os.path.join(BACKEND_DIR, "db_mode.txt")


def active_db() -> str:
    """Delegate to main.active_db() so the AI layer reads the exact DB the app
    serves — honouring the live/dummy toggle AND test overrides. main is fully
    imported by the time any request runs, so the lazy import is safe."""
    try:
        import main
        return main.active_db()
    except Exception:
        pass
    try:
        if os.path.exists(MODE_FILE):
            with open(MODE_FILE, encoding="utf-8") as fh:
                mode = fh.read().strip()
            if mode == "dummy" and os.path.exists(DUMMY_PATH):
                return DUMMY_PATH
    except OSError:
        pass
    return DB_PATH


def get_conn():
    conn = sqlite3.connect(active_db())
    conn.row_factory = sqlite3.Row
    return conn