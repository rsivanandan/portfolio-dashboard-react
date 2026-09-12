import json
import logging
import re

import httpx

from . import config

logger = logging.getLogger("portfolio.ai")

_TIMEOUT = httpx.Timeout(90.0, connect=15.0)


class LLMError(Exception):
    """Raised when the LLM is unavailable, misconfigured, or returns garbage
    that cannot be salvaged."""


def _post(messages: list[dict], max_tokens: int = 1200) -> str:
    key = config.api_key()
    if not key:
        raise LLMError("LLM not configured — set GEMINI_API_KEY in backend/.env")

    url = config.base_url().rstrip("/") + "/chat/completions"
    payload = {
        "model": config.model(),
        "messages": messages,
        "temperature": 0.3,
        # Gemini's OpenAI-compatible endpoint returns an EMPTY message when
        # max_tokens is set (finish_reason=length, 0 tokens) — and rejects
        # max_output_tokens. Prompts bound length themselves, so only third-party
        # providers get an explicit cap.
        "max_tokens": max_tokens,
    }
    if "generativelanguage.googleapis.com" in config.base_url():
        del payload["max_tokens"]
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("LLM request failed: %s", exc)
        raise LLMError("LLM request failed") from exc

    if resp.status_code != 200:
        logger.warning("LLM returned %s: %s", resp.status_code, resp.text[:300])
        raise LLMError(f"LLM returned HTTP {resp.status_code}")

    try:
        return resp.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        logger.warning("Unexpected LLM response shape: %s", resp.text[:300])
        raise LLMError("Unexpected LLM response shape") from exc


def complete(system: str, user: str, max_tokens: int = 1200) -> str:
    return _post(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        max_tokens=max_tokens,
    )


def complete_json(system: str, user: str, max_tokens: int = 1200) -> dict:
    """Ask for a JSON object and parse it defensively.

    Providers differ in JSON-mode support (Gemini's OpenAI endpoint ignores
    response_format), so we strip fences / leading prose and take the first
    balanced JSON object, then fall back to a plain object scan.
    """
    text = _post(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        max_tokens=max_tokens,
    )
    parsed = _extract_json(text)
    if parsed is None:
        raise LLMError("LLM did not return parseable JSON")
    return parsed


def _extract_json(text: str) -> dict | None:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else None
    except ValueError:
        pass
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    value = json.loads(text[start:i + 1])
                    return value if isinstance(value, dict) else None
                except ValueError:
                    return None
    return None