from __future__ import annotations

import asyncio
import json
import queue
import threading
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates

from app.config import PROJECT_ROOT
from app.models.schemas import ChatMessage
from app.security.auth import get_current_user
from app.services import chat_service

templates = Jinja2Templates(directory=str(PROJECT_ROOT / "templates"))

router = APIRouter()


@router.get("/chat", response_class=HTMLResponse)
async def chat_page(request: Request):
    user = get_current_user(request)
    if request.query_params.get("new") == "1":
        # 点击「新对话」：仅进入空白对话页，不创建会话；发送首条消息时再创建
        conversations = chat_service.list_conversations_for_user(user.id)
        return templates.TemplateResponse(
            "chat.html",
            {
                "request": request,
                "conversation": None,
                "messages": [],
                "conversations": conversations,
                "current_username": user.username,
            },
        )
    conv_id = request.query_params.get("conversation_id")
    if conv_id:
        conversation = chat_service.get_conversation_by_id(conv_id, user.id)
        if not conversation:
            conversation = chat_service.create_conversation_if_needed(user)
    else:
        conversation = chat_service.create_conversation_if_needed(user)
    history = chat_service.list_messages(conversation.id)
    conversations = chat_service.list_conversations_for_user(user.id)
    return templates.TemplateResponse(
        "chat.html",
        {
            "request": request,
            "conversation": conversation,
            "messages": history,
            "conversations": conversations,
            "current_username": user.username,
        },
    )


@router.post("/api/chat/stream")
async def api_chat_stream(
    request: Request,
    content: str = Form(...),
    request_id: str = Form(...),
    files: Optional[str] = Form(None),
    conversation_id: Optional[str] = Form(None),
):
    user = get_current_user(request)
    conversation = None
    if conversation_id and conversation_id.strip():
        conversation = chat_service.get_conversation_by_id(conversation_id.strip(), user.id)
    if not conversation:
        # 无会话（例如从「新对话」空白页发送首条消息）：此时才创建新会话
        conversation = chat_service.create_new_conversation(user)
    created_new = not (conversation_id and conversation_id.strip())

    file_list: List[str] = []
    if files:
        file_list = [f for f in files.split(",") if f]

    async def event_stream():
        if created_new:
            yield f"data: [CONV_ID]{conversation.id}\n\n"
        chunk_queue: queue.Queue = queue.Queue()

        def run_sync_stream():
            try:
                for chunk in chat_service.stream_model_reply(
                    user=user,
                    conversation=conversation,
                    user_content=content,
                    files=file_list,
                    request_id=request_id,
                ):
                    chunk_queue.put(chunk)
            finally:
                chunk_queue.put(None)

        threading.Thread(target=run_sync_stream, daemon=True).start()
        loop = asyncio.get_event_loop()
        while True:
            chunk = await loop.run_in_executor(None, chunk_queue.get)
            if chunk is None:
                break
            # #region agent log
            try:
                _log_path = Path(PROJECT_ROOT) / ".cursor" / "debug-259787.log"
                _payload = {"sessionId": "259787", "hypothesisId": "A", "location": "chat_routes.py:event_stream", "message": "sse_chunk_before_yield", "data": {"chunk_preview": repr(chunk)[:200], "chunk_has_newline": "\n" in chunk, "chunk_len": len(chunk)}, "timestamp": __import__("time").time() * 1000}
                with _log_path.open("a") as _f:
                    _f.write(json.dumps(_payload, ensure_ascii=False) + "\n")
            except Exception:
                pass
            # #endregion
            # 用 JSON 编码 payload，避免 chunk 内换行或 "data:" 被误解析并显示到界面
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/api/chat/interrupt")
async def api_chat_interrupt(request_id: str = Form(...)):
    chat_service.interrupt_request(request_id)
    return {"status": "ok"}


@router.delete("/api/chat/conversations/{conversation_id}")
async def api_delete_conversation(request: Request, conversation_id: str):
    user = get_current_user(request)
    ok = chat_service.delete_conversation(conversation_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="会话不存在或无权删除")
    return {"status": "ok"}


@router.post("/api/chat/upload")
async def api_chat_upload(files: List[UploadFile] = File(...)):
    upload_root = PROJECT_ROOT / "tmp" / "uploads" / str(uuid.uuid4())
    upload_root.mkdir(parents=True, exist_ok=True)
    stored_files: List[str] = []

    for f in files:
        dest = upload_root / f.filename
        with dest.open("wb") as out:
            out.write(await f.read())
        # 返回相对路径，后续可用于多模态调用
        stored_files.append(str(dest.relative_to(PROJECT_ROOT)))

    return {"files": stored_files}

