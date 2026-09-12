import html
import logging
import re
from datetime import date, datetime
from xml.etree import ElementTree

import httpx

logger = logging.getLogger("portfolio.ai")

_TIMEOUT = httpx.Timeout(20.0, connect=10.0)

# India finance feeds. Google News RSS is the most stable; we always try all
# sources and merge whatever succeeds (soft-fail per source).
SOURCES = [
    {
        "name": "Google News · India markets",
        "url": "https://news.google.com/rss/search?q=India%20stock%20market&hl=en-IN&gl=IN&ceid=IN:en",
    },
    {
        "name": "Moneycontrol",
        "url": "https://www.moneycontrol.com/rss/marketnews.xml",
    },
    {
        "name": "Economic Times · Markets",
        "url": "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    },
]

_DATE_FMT = re.compile(r"^([A-Z][a-z]{2}, )?\d{1,2} [A-Z][a-z]{2} \d{4}")
_ISO_FMT = re.compile(r"^\d{4}-\d{2}-\d{2}")


def _parse_item(item) -> dict | None:
    def text(tag: str) -> str:
        node = item.find(tag)
        return node.text or "" if node is not None else ""

    title = html.unescape(text("title")).strip()
    link = text("link").strip()
    pub = text("pubDate").strip()
    if not title or not link:
        return None
    try:
        parsed = (
            datetime.strptime(pub.replace(",", ""), "%d %b %Y %H:%M:%S %z")
            if _DATE_FMT.match(pub)
            else datetime.fromisoformat(pub[:19]) if _ISO_FMT.match(pub) else None
        )
    except ValueError:
        parsed = None
    return {
        "title": title,
        "url": link,
        "source": text("source") or "",
        "published": parsed.isoformat() if parsed else None,
    }


def _fetch(url: str) -> list[dict]:
    with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
        resp = client.get(url, headers={"User-Agent": "Mozilla/5.0 (Samridhi)"})
        resp.raise_for_status()
    root = ElementTree.fromstring(resp.content)
    items = []
    for item in root.iter("item"):
        entry = _parse_item(item)
        if entry:
            items.append(entry)
    return items


def fetch_news(limit: int = 12) -> list[dict]:
    """Merge headlines from all sources, newest first, de-duplicated by title."""
    seen = set()
    merged: list[dict] = []
    for source in SOURCES:
        try:
            raw = _fetch(source["url"])
        except (httpx.HTTPError, ElementTree.ParseError) as exc:
            logger.warning("News source %s failed: %s", source["name"], exc)
            continue
        for entry in raw:
            key = entry["title"].lower().strip()
            if key in seen:
                continue
            seen.add(key)
            if not entry.get("source"):
                entry["source"] = source["name"]
            merged.append(entry)
    merged.sort(key=lambda e: e.get("published") or "", reverse=True)
    return merged[:limit]


def _relative_day(published: str | None) -> str:
    if not published:
        return ""
    try:
        stamp = datetime.fromisoformat(published)
    except ValueError:
        return ""
    return f" ({date(stamp.year, stamp.month, stamp.day).isoformat()})"


def news_context(items: list[dict], max_items: int = 8) -> str:
    """Compact, LLM-friendly rendering of the merged feed."""
    lines = []
    for item in items[:max_items]:
        lines.append(
            f"- [{item['source']}{_relative_day(item.get('published'))}] {item['title']}"
        )
    return "\n".join(lines)