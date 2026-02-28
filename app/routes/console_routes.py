from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings

router = APIRouter(tags=["console"])


@router.get("/api/console/logs")
async def get_console_logs():
    """调试模式下可在此扩展返回最近 N 条日志；当前仅返回调试状态。"""
    settings = get_settings()
    return {
        "debug_mode": settings.debug_mode,
        "message": "当 DEBUG_MODE=True 时，请查看终端输出获取详细日志。",
    }
