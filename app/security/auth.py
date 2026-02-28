from __future__ import annotations

import hashlib
import logging
import uuid
from typing import Optional

from fastapi import HTTPException, Request, status

from app.config import get_settings
from app.models.schemas import User
from app.storage import json_store

logger = logging.getLogger(__name__)


SESSION_USER_KEY = "user_id"


def _hash_password(password: str) -> str:
    # 简单哈希，占位实现，后续可替换为更强算法
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(plain: str, password_hash: str) -> bool:
    return _hash_password(plain) == password_hash


def ensure_default_admin() -> None:
    settings = get_settings()
    users = json_store.load_users()
    if users:
        return

    admin_user = User(
        id=str(uuid.uuid4()),
        username=settings.default_admin_username,
        password_hash=_hash_password(settings.default_admin_password),
        email=None,
        api_key=None,
    )
    users.append(admin_user.model_dump())
    json_store.save_users(users)
    logger.info("Default admin user created: %s", settings.default_admin_username)


def authenticate_user(username: str, password: str) -> Optional[User]:
    users = json_store.load_users()
    for u in users:
        if u.get("username") == username:
            user = User(**u)
            if verify_password(password, user.password_hash):
                return user
            break
    return None


def get_current_user(request: Request) -> User:
    user_id = request.session.get(SESSION_USER_KEY)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    users = json_store.load_users()
    for u in users:
        if u.get("id") == user_id:
            return User(**u)

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")


def login_user(request: Request, user: User) -> None:
    request.session[SESSION_USER_KEY] = user.id


def logout_user(request: Request) -> None:
    request.session.pop(SESSION_USER_KEY, None)

