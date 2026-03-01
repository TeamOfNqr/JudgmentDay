from __future__ import annotations

import logging
import uuid
from typing import Dict, Iterable, List, Optional

from app.config import get_settings
from app.models.schemas import ChatMessage, Conversation, User
from app.storage import json_store
from app.services import dashscope_client

logger = logging.getLogger(__name__)

_interrupt_flags: Dict[str, bool] = {}


def create_conversation_if_needed(user: User) -> Conversation:
    """若用户尚无任何会话则创建一个并返回，否则返回其第一个会话（用于默认进入页）。"""
    conversations = [Conversation(**c) for c in json_store.load_conversations()]
    for conv in conversations:
        if conv.user_id == user.id:
            return conv

    conv = Conversation(id=str(uuid.uuid4()), user_id=user.id, title="默认会话")
    conversations.append(conv)
    json_store.save_conversations([c.model_dump(mode="json") for c in conversations])
    return conv


def create_new_conversation(user: User) -> Conversation:
    """始终创建并返回一个新会话，不删除旧数据。"""
    from datetime import datetime

    conv = Conversation(
        id=str(uuid.uuid4()),
        user_id=user.id,
        title="新对话",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    raw = json_store.load_conversations()
    raw.append(conv.model_dump(mode="json"))
    json_store.save_conversations(raw)
    return conv


def append_message(message: ChatMessage) -> None:
    messages = json_store.load_messages()
    messages.append(message.model_dump(mode="json"))
    json_store.save_messages(messages)

    conversations = [Conversation(**c) for c in json_store.load_conversations()]
    for conv in conversations:
        if conv.id == message.conversation_id:
            conv.message_ids.append(message.id)
            conv.updated_at = message.created_at
            break
    json_store.save_conversations([c.model_dump(mode="json") for c in conversations])


def get_conversation_by_id(conversation_id: str, user_id: str) -> Optional[Conversation]:
    """获取指定会话（仅当属于该用户时返回）。"""
    raw = json_store.load_conversations()
    for c in raw:
        if c.get("id") == conversation_id and c.get("user_id") == user_id:
            return Conversation(**c)
    return None


def list_conversations_for_user(user_id: str) -> List[Conversation]:
    """返回某用户的会话列表（按更新时间倒序），供左侧历史栏使用。"""
    raw = json_store.load_conversations()
    convs = [Conversation(**c) for c in raw if c.get("user_id") == user_id]
    convs.sort(key=lambda c: c.updated_at, reverse=True)
    return convs


def delete_conversation(conversation_id: str, user_id: str) -> bool:
    """删除指定会话（仅当属于该用户时）。同时从 messages 中移除该会话的消息。返回是否删除成功。"""
    raw_conv = json_store.load_conversations()
    new_conv = [c for c in raw_conv if not (c.get("id") == conversation_id and c.get("user_id") == user_id)]
    if len(new_conv) == len(raw_conv):
        return False
    json_store.save_conversations(new_conv)
    messages = json_store.load_messages()
    new_messages = [m for m in messages if m.get("conversation_id") != conversation_id]
    json_store.save_messages(new_messages)
    return True


def list_messages(conversation_id: str) -> List[ChatMessage]:
    messages = [ChatMessage(**m) for m in json_store.load_messages() if m.get("conversation_id") == conversation_id]
    return messages


def stream_model_reply(
    user: User,
    conversation: Conversation,
    user_content: str,
    files: Optional[List[str]],
    request_id: str,
) -> Iterable[str]:
    logger.debug("Starting model reply stream, request_id=%s", request_id)
    _interrupt_flags[request_id] = False

    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        conversation_id=conversation.id,
        user_id=user.id,
        role="user",
        content=user_content,
        files=files or [],
    )
    history = list_messages(conversation.id)
    append_message(user_msg)
    enable_utcp, enable_web_search = _get_user_feature_flags(user.id)

    full_reply: List[str] = []
    try:
        for chunk in dashscope_client.stream_chat_with_tools(
            history=history,
            user_message=user_msg,
            api_key_override=_get_user_api_key(user),
            request_id=request_id,
            interrupt_flags=_interrupt_flags,
            enable_utcp=enable_utcp,
            enable_web_search=enable_web_search,
        ):
            if _interrupt_flags.get(request_id):
                logger.info("Interrupted model streaming, request_id=%s", request_id)
                break
            full_reply.append(chunk)
            yield chunk
    finally:
        _interrupt_flags.pop(request_id, None)
        # 流式结束后将完整助手回复持久化
        if full_reply:
            assistant_msg = ChatMessage(
                id=str(uuid.uuid4()),
                conversation_id=conversation.id,
                user_id=user.id,
                role="assistant",
                content="".join(full_reply),
                files=[],
            )
            append_message(assistant_msg)


def interrupt_request(request_id: str) -> None:
    logger.debug("Set interrupt flag for request_id=%s", request_id)
    _interrupt_flags[request_id] = True


def _get_user_api_key(user: User) -> Optional[str]:
    if user.api_key:
        return user.api_key
    settings = get_settings()
    return settings.dashscope_api_key


def _get_user_feature_flags(user_id: str) -> tuple[bool, bool]:
    """从用户设置中读取 enable_utcp、enable_web_search，缺省为 True。"""
    for item in json_store.load_settings():
        if item.get("user_id") == user_id:
            enable_utcp = item.get("enable_utcp")
            enable_web_search = item.get("enable_web_search")
            return (
                enable_utcp if isinstance(enable_utcp, bool) else True,
                enable_web_search if isinstance(enable_web_search, bool) else True,
            )
    return True, True

