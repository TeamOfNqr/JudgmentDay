from __future__ import annotations

import logging
from typing import Iterable, List, Optional

from dashscope import Generation

from app.models.schemas import ChatMessage

logger = logging.getLogger(__name__)


MODEL_NAME = "qwen3-max"  # 多模态模型，占位，需与百炼配置保持一致


def _extract_text_from_response(rsp) -> str:
    """从单次 Generation 响应中提取文本（兼容 output.text 与 choices[0].message.content）。"""
    if not rsp or not getattr(rsp, "output", None):
        return ""
    out = rsp.output
    if hasattr(out, "text") and out.text:
        return out.text
    if getattr(out, "choices", None) and len(out.choices) > 0 and out.choices[0].message:
        msg = out.choices[0].message
        content = getattr(msg, "content", None)
        if isinstance(content, str):
            return content
        if isinstance(content, list) and content:
            part = content[0]
            return part.get("text", str(part)) if isinstance(part, dict) else str(part)
    return ""


def stream_chat(
    history: List[ChatMessage],
    user_message: ChatMessage,
    api_key_override: Optional[str],
    request_id: str,
    interrupt_flags: dict,
) -> Iterable[str]:
    """
    使用百炼 DashScope 的文本生成接口，流式返回（stream=True），
    每段为服务端下发的增量内容。
    """
    from dashscope.api_entities.dashscope_response import Message, Role

    if not api_key_override:
        logger.warning("DashScope API key is not configured, cannot call model.")
        yield "[模型未配置 API Key，请在设置页面中填写。]"
        return

    messages = []
    for m in history:
        role = Role.ASSISTANT if m.role == "assistant" else Role.USER
        if m.role == "system":
            role = Role.SYSTEM
        messages.append(Message(role=role, content=m.content))
    messages.append(Message(role=Role.USER, content=user_message.content))

    try:
        # 流式调用：stream=True，每块为增量内容（incremental_output 默认 False）
        stream = Generation.call(
            model=MODEL_NAME,
            messages=[{"role": msg.role, "content": msg.content} for msg in messages],
            api_key=api_key_override,
            result_format="message",
            stream=True,
        )
        for rsp in stream:
            if interrupt_flags.get(request_id):
                break
            text = _extract_text_from_response(rsp)
            if text:
                yield text
    except Exception as exc:  # noqa: BLE001
        logger.exception("DashScope call failed: %s", exc)
        yield "[模型调用异常，请检查日志和配置。]"

