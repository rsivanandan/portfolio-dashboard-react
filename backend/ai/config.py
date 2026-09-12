import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_dotenv():
    """Minimal .env loader — reads backend/.env if present, never overrides
    real environment variables."""
    path = os.path.join(BACKEND_DIR, ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_dotenv()


def api_key() -> str:
    """Gemini key by default, but honour a generic LLM key so swapping
    providers is a config change, not a code change."""
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("LLM_API_KEY") or ""


def base_url() -> str:
    """Default is Gemini's OpenAI-compatible endpoint; override for
    Groq/OpenRouter/OpenAI/Ollama etc."""
    return os.environ.get(
        "LLM_BASE_URL",
        "https://generativelanguage.googleapis.com/v1beta/openai",
    )


def model() -> str:
    return os.environ.get("LLM_MODEL", "gemini-3.6-flash")


def enabled() -> bool:
    return bool(api_key())


# Seconds before the LLM-backed responses are considered stale.
BRIEFING_TTL = 6 * 3600
INSIGHTS_TTL = 6 * 3600

# Cache time for a DETERMINISTIC fallback produced when the LLM failed — short
# enough that narration retries cheaply once the provider recovers, long enough
# that a brief outage doesn't re-attempt the LLM on every page load.
FALLBACK_TTL = 20 * 60

# Seconds to pause ALL narration after an LLM failure (429/503/timeout) so a
# degraded provider isn't hammered by the dashboard's parallel cards.
LLM_COOLDOWN_S = 90