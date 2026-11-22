import sqlite3
import zlib

import pytest

import main
from pf_import import parse_passbook_text

SAMPLE_META = [
    "Member ID/Name: BGBNG01234567890123456 / RAJESH S",
    "Establishment ID/Name: BGBNG00000000000000123 / Acme Corp",
    "UAN: 100296804732",
]

SAMPLE_ROWS = [
    "Mar-2025 01-04-2025 CR Cont. for Due-Month 042025 2,14,998 15,000 25,800 24,550 1,250",
    "Apr-2025 01-05-2025 CR Cont. for Due-Month 052025 2,14,998 15,000 25,800 24,550 1,250",
]


def _make_pdf(lines: list[str]) -> bytes:
    return _make_pdf_with_meta(lines)


def _make_pdf_with_meta(lines: list[str], meta: list[str] | None = None) -> bytes:
    all_lines = (meta or SAMPLE_META) + lines
    return _build_pdf_bytes(all_lines)


def _build_pdf_bytes(lines: list[str]) -> bytes:
    """Build a minimal single-page PDF containing the given text lines."""
    content = b"BT /F1 12 Tf 72 720 Td\n"
    for ln in lines:
        content += f"({ln}) Tj\n0 -18 Td\n".encode("latin-1")
    content += b"ET"
    content = zlib.compress(content)

    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(content) + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = b"%PDF-1.4\n"
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_pos = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_pos}\n%%EOF").encode()
    return out


class TestParseText:
    def test_parses_contribution_rows(self):
        meta, rows, warnings = parse_passbook_text("\n".join(SAMPLE_META + SAMPLE_ROWS))
        assert warnings == []
        assert meta["account"] == "BGBNG01234567890123456"
        assert meta["UAN"] == "100296804732"
        assert len(rows) == 2
        assert rows[0] == {
            "entry_date": "2025-03",
            "employee_contrib": 25800.0,
            "employer_contrib": 24550.0,
            "interest": 0.0,
            "notes": "",
        }
        assert rows[1]["entry_date"] == "2025-04"

    def test_parses_annual_interest(self):
        text = "\n".join(SAMPLE_META + SAMPLE_ROWS) + "\nInt. Updated upto 31/03/2026 5,20,614 4,90,547 0"
        meta, rows, _ = parse_passbook_text(text)
        assert meta["account"] == "BGBNG01234567890123456"
        interest = [r for r in rows if r["interest"]]
        assert len(interest) == 1
        assert interest[0]["entry_date"] == "2026-03"
        assert interest[0]["interest"] == 1011161.0
        assert interest[0]["notes"] == "Interest credited"

    def test_zero_interest_line_is_skipped(self):
        text = "Interest details N/A 0 0 0"
        meta, rows, _ = parse_passbook_text(text)
        assert rows == []

    def test_opening_and_closing_lines_ignored(self):
        text = (
            "OB Int. Updated upto 31/03/2025 61,63,408 58,05,837 1,02,500\n"
            + "\n".join(SAMPLE_META + SAMPLE_ROWS)
            + "\nTotal Contributions for the year [ 2025 ] 3,34,470 3,19,470 15,000\n"
            + "Closing Balance as on 31/03/2026 70,18,492 66,15,854 1,17,500"
        )
        meta, rows, _ = parse_passbook_text(text)
        assert len(rows) == 2

    def test_row_with_too_few_numbers_gives_warning(self):
        text = "Mar-2025 01-04-2025 CR Cont. for Due-Month"
        meta, rows, warnings = parse_passbook_text(text)
        assert rows == []
        assert len(warnings) == 1

    def test_withdrawal_row_is_negative(self):
        text = "\n".join(SAMPLE_META) + "\nMay-2021 22-06-2021 DR Claim 0 0 31,23,685 29,59,534 0"
        meta, rows, _ = parse_passbook_text(text)
        assert len(rows) == 1
        assert rows[0]["employee_contrib"] == -3123685.0
        assert rows[0]["employer_contrib"] == -2959534.0
        assert rows[0]["notes"] == "Withdrawal"

    def test_multi_line_transfer_in(self):
        text = (
            "\n".join(SAMPLE_META)
            + "\nMar-2021 01-05-2021 CR\nTRANSFER IN - SAME OFFICE\n\n"
            + "0 0 30,80,051 29,18,193 0"
        )
        meta, rows, _ = parse_passbook_text(text)
        assert len(rows) == 1
        assert rows[0]["notes"] == "Transfer in"
        assert rows[0]["employee_contrib"] == 3080051.0
        assert rows[0]["employer_contrib"] == 2918193.0


class TestWrappedContributionRows:
    def test_amounts_on_following_line_are_parsed(self):
        text = "\n".join([
            *SAMPLE_META,
            "Mar-2026 01-04-2026 CR Cont. for the",
            "Due-Month 042026 2,67,028 15,000 32,043 30,793 1,250",
            "Apr-2026 01-05-2026 CR Cont. for the",
            "Due-Month 052026 2,67,028 15,000 32,043 30,793 1,250",
        ])
        _, rows, warnings = parse_passbook_text(text)
        assert warnings == []
        assert len(rows) == 2
        assert [(r["entry_date"], r["employee_contrib"], r["employer_contrib"]) for r in rows] == [
            ("2026-03", 32043.0, 30793.0),
            ("2026-04", 32043.0, 30793.0),
        ]

    def test_wrapped_row_stops_at_totals_and_interest(self):
        text = "\n".join([
            *SAMPLE_META,
            "Mar-2026 01-04-2026 CR Cont. for the",
            "Due-Month 042026 2,67,028 15,000 32,043 30,793 1,250",
            "Total Contributions for the year [ 2026 ] 1,28,172 1,23,172 5,000",
            "Int. Updated upto 31/03/2026 5,20,614 4,90,547 0",
        ])
        _, rows, warnings = parse_passbook_text(text)
        assert warnings == []
        assert [(r["entry_date"], r["notes"]) for r in rows] == [
            ("2026-03", ""),
            ("2026-03", "Interest credited"),
        ]
        assert rows[1]["interest"] == 1011161.0


class TestImportEndpoints:
    def test_preview_returns_parsed_rows(self, client):
        pdf = _make_pdf(SAMPLE_ROWS)
        resp = client.post(
            "/api/admin/pf-import/preview/user1",
            files={"file": ("passbook.pdf", pdf, "application/pdf")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["count"] == 2
        assert body["rows"][0]["entry_date"] == "2025-03"
        assert body["rows"][0]["account"] == "BGBNG01234567890123456"
        assert body["meta"]["UAN"] == "100296804732"

    def test_import_inserts_entries(self, client):
        pdf = _make_pdf(SAMPLE_ROWS)
        resp = client.post(
            "/api/admin/pf-import/user1",
            files={"file": ("passbook.pdf", pdf, "application/pdf")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["inserted"] == 2
        assert body["updated"] == 0

        rows = client.get("/api/admin/pf/user1").json()
        months = {r["entry_date"] for r in rows}
        assert "2025-03" in months
        assert "2025-04" in months

    def test_reimport_updates_instead_of_duplicating(self, client):
        pdf = _make_pdf(SAMPLE_ROWS)
        client.post(
            "/api/admin/pf-import/user1",
            files={"file": ("passbook.pdf", pdf, "application/pdf")},
        )
        resp = client.post(
            "/api/admin/pf-import/user1",
            files={"file": ("passbook.pdf", pdf, "application/pdf")},
        )
        body = resp.json()
        assert body["inserted"] == 0
        assert body["updated"] == 2

        rows = client.get("/api/admin/pf/user1").json()
        months = [r["entry_date"] for r in rows if r["entry_date"].startswith("2025")]
        assert months.count("2025-03") == 1
        assert months.count("2025-04") == 1

    def test_same_month_different_accounts_both_exist(self, client):
        pdf_a = _make_pdf(SAMPLE_ROWS)
        pdf_b = _make_pdf_with_meta(
            SAMPLE_ROWS, meta=[ln.replace("BGBNG01234567890123456", "BGBNG01234567890987654")
                               for ln in SAMPLE_META]
        )
        client.post("/api/admin/pf-import/user1", files={"file": ("a.pdf", pdf_a, "application/pdf")})
        resp = client.post("/api/admin/pf-import/user1", files={"file": ("b.pdf", pdf_b, "application/pdf")})
        assert resp.json()["inserted"] == 2

        rows = client.get("/api/admin/pf/user1").json()
        months = [r["entry_date"] for r in rows if r["entry_date"].startswith("2025")]
        assert months.count("2025-03") == 2
        assert months.count("2025-04") == 2

    def test_import_keeps_existing_other_months(self, client):
        pdf = _make_pdf(SAMPLE_ROWS)
        client.post(
            "/api/admin/pf-import/user1",
            files={"file": ("passbook.pdf", pdf, "application/pdf")},
        )
        rows = client.get("/api/admin/pf/user1").json()
        months = [r["entry_date"] for r in rows]
        # conftest seeds 2026-01 and 2026-02
        assert "2026-01" in months
        assert "2026-02" in months

    def test_admin_pf_list_returns_rowid(self, client):
        rows = client.get("/api/admin/pf/user1").json()
        assert rows
        for r in rows:
            assert "rowid" in r

    def test_import_invalid_extension(self, client):
        resp = client.post(
            "/api/admin/pf-import/user1",
            files={"file": ("passbook.txt", b"hello", "text/plain")},
        )
        assert resp.status_code == 400

    def test_import_invalid_owner(self, client):
        pdf = _make_pdf(SAMPLE_ROWS)
        resp = client.post(
            "/api/admin/pf-import/nobody",
            files={"file": ("passbook.pdf", pdf, "application/pdf")},
        )
        assert resp.status_code == 400

    def test_bulk_import_processes_all_files(self, client):
        pdf_a = _make_pdf(SAMPLE_ROWS)
        pdf_b = _make_pdf_with_meta(
            ["Feb-2025 01-03-2025 CR Cont. for Due-Month 032025 2,00,000 10,000 20,000 19,000 1,000"],
            meta=[ln.replace("BGBNG01234567890123456", "BGBNG01234567890987654")
                  for ln in SAMPLE_META],
        )
        resp = client.post(
            "/api/admin/pf-import/bulk/user1",
            files=[
                ("files", ("a.pdf", pdf_a, "application/pdf")),
                ("files", ("b.pdf", pdf_b, "application/pdf")),
            ],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert len(body["results"]) == 2
        assert all(r["status"] == "ok" for r in body["results"])
        assert sum(r["inserted"] for r in body["results"]) == 3
        assert {r["account"] for r in body["results"]} == {
            "BGBNG01234567890123456", "BGBNG01234567890987654"
        }

    def test_bulk_import_reports_bad_file(self, client):
        pdf = _make_pdf(SAMPLE_ROWS)
        resp = client.post(
            "/api/admin/pf-import/bulk/user1",
            files=[
                ("files", ("a.pdf", pdf, "application/pdf")),
                ("files", ("b.txt", b"hello", "text/plain")),
            ],
        )
        assert resp.status_code == 200
        results = resp.json()["results"]
        assert len(results) == 2
        statuses = {r["status"] for r in results}
        assert statuses == {"ok", "error"}


class TestPFSeparation:
    def test_pf_endpoint_splits_by_account(self, client):
        pdf_a = _make_pdf(SAMPLE_ROWS)
        client.post("/api/admin/pf-import/user1", files={"file": ("a.pdf", pdf_a, "application/pdf")})
        rows = client.get("/api/pf/user1").json()
        accounts = {r["account"] for r in rows}
        # conftest seeds account BGBNG00000000000000001; import uses the SAMPLE account
        assert "BGBNG01234567890123456" in accounts
        assert "BGBNG00000000000000001" in accounts
        for r in rows:
            assert "running_balance" in r
            assert "total_contrib" in r


class TestAdminPFRowidDrift:
    @pytest.fixture()
    def drift_db(self, client, tmp_path):
        original = main.DB_PATH
        path = str(tmp_path / "pf_drift.db")
        conn = sqlite3.connect(path)
        conn.execute("""
            CREATE TABLE User1_PF (
                id INTEGER, account TEXT, employee_contrib REAL, employer_contrib REAL,
                interest REAL, entry_date TEXT, notes TEXT
            )
        """)
        conn.executemany(
            "INSERT INTO User1_PF (id, account, employee_contrib, entry_date) VALUES (?, ?, ?, ?)",
            [(99, "ACC1", 1000, "2026-01"), (1, "ACC2", 2000, "2026-02")],
        )
        conn.commit()
        conn.close()
        main.DB_PATH = path
        yield path
        main.DB_PATH = original

    def test_list_and_delete_use_real_rowid(self, drift_db, client):
        rows = client.get("/api/admin/pf/user1").json()
        by_account = {r["account"]: r["rowid"] for r in rows}
        assert by_account == {"ACC1": 1, "ACC2": 2}

        resp = client.delete(f"/api/admin/pf/user1/{by_account['ACC1']}")
        assert resp.status_code == 200
        conn = sqlite3.connect(drift_db)
        try:
            remaining = conn.execute("SELECT rowid, account FROM User1_PF").fetchall()
        finally:
            conn.close()
        assert remaining == [(2, "ACC2")]
