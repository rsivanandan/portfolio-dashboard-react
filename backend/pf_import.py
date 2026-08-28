"""EPFO Member Passbook PDF parser.

Parses EPFO passbook PDFs into PF entry rows.  Handles:

* monthly contribution rows, e.g.::

    Mar-2025 01-04-2025 CR Cont. for Due-Month 042025 2,14,998 15,000 25,800 24,550 1,250

* withdrawals (DR rows) which reduce the balance, e.g.::

    May-2021 22-06-2021 DR Claim 0 0 31,23,685 29,59,534 0

* multi-line transfer-in rows, e.g.::

    Mar-2021 01-05-2021 CR
    TRANSFER IN - SAME OFFICE
    ...
    0 0 30,80,051 29,18,193 0

* annual interest rows, e.g.::

    Int. Updated upto 31/03/2026 5,20,614 4,90,547 0

For the balance columns (Employee / Employer / Pension) we always take the
last three numbers in a row as nums[-3], nums[-2], nums[-1].

The two account numbers under one UAN (member account transfer in 2021) are
kept distinct via the ``account`` field, so their rows never overwrite each
other even when a month collides.
"""

import io
import re

from pypdf import PdfReader

MONTHS = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "May": "05", "Jun": "06",
    "Jul": "07", "Aug": "08", "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
}

# A complete single-line transaction row (has content after the CR/DR type).
ROW_FULL_RE = re.compile(r"^([A-Z][a-z]{2})-(\d{4})\s+\d{2}-\d{2}-\d{4}\s+(CR|DR)\s+(\S)")
# A row whose amounts spilled onto following lines, e.g. "Mar-2021 01-05-2021 CR".
ROW_STUB_RE = re.compile(r"^([A-Z][a-z]{2})-(\d{4})\s+\d{2}-\d{2}-\d{4}\s+(CR|DR)\s*$")
INTEREST_RE = re.compile(r"^(Int\.|Interest details)")
DATE_RE = re.compile(r"(\d{2})/(\d{2})/(\d{4})")
NUM_RE = re.compile(r"\d[\d,\.]*")
# EPFO member IDs: 5-letter regional office code + 17 digits (BGBNG = Bengaluru,
# PYKRP = Puducherry, etc.) — must not be pinned to one office.
ACCOUNT_RE = re.compile(r"[A-Z]{5}\d{17}")


def _num(token: str) -> float | None:
    try:
        return float(token.replace(",", ""))
    except ValueError:
        return None


def _nums(line: str) -> list[float]:
    return [n for n in (_num(x) for x in NUM_RE.findall(line)) if n is not None]


def parse_meta(text: str) -> dict:
    """Extract account number, establishment name, UAN and member name."""
    meta = {"account": "", "establishment": "", "UAN": "", "member_name": ""}
    for raw in text.splitlines():
        s = raw.strip()
        if "Member ID/Name" in s:
            m = ACCOUNT_RE.search(s)
            if m:
                meta["account"] = m.group(0)
            m = re.search(r"/\s*(.+)$", s)
            if m:
                meta["member_name"] = m.group(1).strip()
        elif "Establishment ID/Name" in s:
            m = re.search(r"/\s*(.+)$", s)
            if m:
                meta["establishment"] = m.group(1).strip()
        elif re.search(r"\bUAN\b", s):
            m = re.search(r"UAN[:\s]+(\d+)", s)
            if m:
                meta["UAN"] = m.group(1)
    return meta


def parse_passbook_text(text: str) -> tuple[dict, list[dict], list[str]]:
    """Parse passbook text into (meta, rows, warnings).

    Each row has entry_date (YYYY-MM), employee_contrib, employer_contrib,
    interest, notes.  Withdrawals have negative contributions.
    """
    rows: list[dict] = []
    warnings: list[str] = []
    interest_rows: list[dict] = []
    lines = text.splitlines()
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i].strip()
        i += 1
        if not line:
            continue

        if INTEREST_RE.match(line):
            dm = DATE_RE.search(line)
            nums = _nums(line)
            if dm and len(nums) >= 3:
                total = nums[-3] + nums[-2]
                if total:
                    interest_rows.append({
                        "entry_date": f"{dm.group(3)}-{dm.group(2)}",
                        "employee_contrib": 0.0,
                        "employer_contrib": 0.0,
                        "interest": round(total, 2),
                        "notes": "Interest credited",
                    })
            continue

        m = ROW_FULL_RE.match(line)
        if m:
            mon, yr, txn = m.group(1), m.group(2), m.group(3)
            entry_date = f"{yr}-{MONTHS.get(mon, '??')}"
            amount_text = line[m.end():]
            nums = _nums(amount_text)
            if len(nums) < 3:
                warnings.append(f"Skipped row (too few columns): {line[:90]}")
                continue
            emp, emp2 = nums[-3], nums[-2]
            if txn == "DR":
                rows.append({
                    "entry_date": entry_date,
                    "employee_contrib": round(-emp, 2),
                    "employer_contrib": round(-emp2, 2),
                    "interest": 0.0,
                    "notes": "Withdrawal",
                })
            else:
                rows.append({
                    "entry_date": entry_date,
                    "employee_contrib": round(emp, 2),
                    "employer_contrib": round(emp2, 2),
                    "interest": 0.0,
                    "notes": "",
                })
            continue

        m = ROW_STUB_RE.match(line)
        if m:
            mon, yr, txn = m.group(1), m.group(2), m.group(3)
            entry_date = f"{yr}-{MONTHS.get(mon, '??')}"
            parts = [line]
            amount_nums: list[float] | None = None
            while i < n:
                nxt = lines[i].strip()
                if not nxt:
                    i += 1
                    continue
                if ROW_FULL_RE.match(nxt) or ROW_STUB_RE.match(nxt):
                    break
                parts.append(nxt)
                i += 1
                cand = _nums(nxt)
                if len(cand) >= 3:
                    amount_nums = cand
                    break
            joined = " ".join(parts)
            if "TRANSFER IN" in joined:
                if amount_nums is None:
                    warnings.append(f"Skipped transfer-in row (no amounts): {joined[:90]}")
                    continue
                note = "Transfer in (interest)" if "INTEREST" in joined else "Transfer in"
                rows.append({
                    "entry_date": entry_date,
                    "employee_contrib": round(amount_nums[-3], 2),
                    "employer_contrib": round(amount_nums[-2], 2),
                    "interest": 0.0,
                    "notes": note,
                })
            else:
                warnings.append(f"Skipped multi-line row: {joined[:90]}")
            continue

    rows.extend(interest_rows)
    rows.sort(key=lambda r: (r["entry_date"], r["notes"]))
    return parse_meta(text), rows, warnings


def parse_passbook_pdf(file_bytes: bytes) -> tuple[dict, list[dict], list[str]]:
    """Extract text from an EPFO passbook PDF and parse it into PF entry rows."""
    reader = PdfReader(io.BytesIO(file_bytes))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return parse_passbook_text(text)
