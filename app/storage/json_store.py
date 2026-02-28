from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List

from app.config import PROJECT_ROOT


DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

_locks: Dict[str, Lock] = {}


def _get_lock(name: str) -> Lock:
    if name not in _locks:
        _locks[name] = Lock()
    return _locks[name]


def _read_json(path: Path, default: Any) -> Any:
    lock = _get_lock(str(path))
    with lock:
        if not path.exists():
            return default
        with path.open("r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return default


def _write_json(path: Path, data: Any) -> None:
    lock = _get_lock(str(path))
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with lock:
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        with tmp_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        tmp_path.replace(path)


USERS_FILE = DATA_DIR / "users.json"
CONVERSATIONS_FILE = DATA_DIR / "conversations.json"
MESSAGES_FILE = DATA_DIR / "messages.json"
SETTINGS_FILE = DATA_DIR / "settings.json"


def load_users() -> List[dict]:
    data = _read_json(USERS_FILE, {"users": []})
    return data.get("users", [])


def save_users(users: List[dict]) -> None:
    _write_json(USERS_FILE, {"users": users})


def load_conversations() -> List[dict]:
    data = _read_json(CONVERSATIONS_FILE, {"conversations": []})
    return data.get("conversations", [])


def save_conversations(conversations: List[dict]) -> None:
    _write_json(CONVERSATIONS_FILE, {"conversations": conversations})


def load_messages() -> List[dict]:
    data = _read_json(MESSAGES_FILE, {"messages": []})
    return data.get("messages", [])


def save_messages(messages: List[dict]) -> None:
    _write_json(MESSAGES_FILE, {"messages": messages})


def load_settings() -> List[dict]:
    data = _read_json(SETTINGS_FILE, {"settings": []})
    return data.get("settings", [])


def save_settings(settings: List[dict]) -> None:
    _write_json(SETTINGS_FILE, {"settings": settings})

