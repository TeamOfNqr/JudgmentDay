from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.models.schemas import User
from app.security.auth import get_current_user
from app.storage import json_store

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    api_key: Optional[str] = None
    enable_utcp: Optional[bool] = None
    enable_web_search: Optional[bool] = None


def _default_true(value: Optional[bool]) -> bool:
    """缺省时视为 True（默认开启）。"""
    if value is None:
        return True
    return value


@router.get("/me")
async def get_my_settings(request: Request, user: User = Depends(get_current_user)):
    settings_list = json_store.load_settings()
    for item in settings_list:
        if item.get("user_id") == user.id:
            api_key = item.get("api_key")
            enable_utcp = _default_true(item.get("enable_utcp"))
            enable_web_search = _default_true(item.get("enable_web_search"))
            return {
                "api_key_set": bool(api_key),
                "api_key_masked": "*" * 8 if api_key else "",
                "enable_utcp": enable_utcp,
                "enable_web_search": enable_web_search,
            }
    return {
        "api_key_set": False,
        "api_key_masked": "",
        "enable_utcp": True,
        "enable_web_search": True,
    }


@router.post("/me")
async def update_my_settings(
    payload: SettingsUpdate, user: User = Depends(get_current_user)
):
    api_key = (payload.api_key or "").strip()
    settings_list = json_store.load_settings()
    found = False
    for item in settings_list:
        if item.get("user_id") == user.id:
            item["api_key"] = api_key
            if payload.enable_utcp is not None:
                item["enable_utcp"] = payload.enable_utcp
            if payload.enable_web_search is not None:
                item["enable_web_search"] = payload.enable_web_search
            found = True
            break
    if not found:
        new_item: dict = {"user_id": user.id, "api_key": api_key}
        if payload.enable_utcp is not None:
            new_item["enable_utcp"] = payload.enable_utcp
        if payload.enable_web_search is not None:
            new_item["enable_web_search"] = payload.enable_web_search
        settings_list.append(new_item)

    json_store.save_settings(settings_list)
    users = json_store.load_users()
    for u in users:
        if u.get("id") == user.id:
            u["api_key"] = api_key
            break
    json_store.save_users(users)

    return {"status": "ok"}
