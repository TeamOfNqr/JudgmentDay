from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from dashscope import Generation

from app.models.schemas import ChatMessage

logger = logging.getLogger(__name__)


MODEL_NAME = "qwen3-max"  # 多模态模型，占位，需与百炼配置保持一致

# UTCP Shell 工具定义（AI 侧提示词：何时、如何调用 Shell）
SHELL_TOOL = {
    "type": "function",
    "function": {
        "name": "shell_execute",
        "description": (
            "在用户需要执行系统命令、查看或修改文件、安装软件、运行脚本等时，使用本工具执行 Shell 命令。"
            "你拥有完全权限的 Shell，可执行任意命令。工作目录默认为项目根目录。"
            "选择指令执行时，不要只拘束于低级命令，可以尝试使用高级命令来完成任务。"
            "当系统开启 PROJECT_SAVE 时，禁止对项目本体进行写/删操作（即不可在项目根目录下除 tmp 以外的路径创建、修改或删除文件）；"
            "仅允许在 tmp 目录下自由读写。若需写文件请使用 tmp/ 下的路径。"
            "如果指令缺失，你可以尝试使用APT包管理器下载相关软件包，并使用相关命令进行安装。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "要执行的完整 Shell 命令（可包含管道、重定向等），例如 ls -la、cat file、echo hello > tmp/out.txt",
                }
            },
            "required": ["command"],
        },
    },
}


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


def _message_to_api(m: ChatMessage) -> Dict[str, Any]:
    """将 ChatMessage 转为 DashScope API 消息格式。"""
    msg: Dict[str, Any] = {"role": m.role, "content": m.content or ""}
    if m.role == "assistant" and m.tool_calls:
        msg["tool_calls"] = m.tool_calls
    if m.role == "tool" and m.tool_call_id:
        msg["tool_call_id"] = m.tool_call_id
    return msg


def _tool_call_to_dict(tc) -> dict:
    """将 tool_call 项（可能为对象或 dict）转为统一 dict。"""
    if isinstance(tc, dict):
        return tc
    return {
        "id": getattr(tc, "id", ""),
        "type": getattr(tc, "type", "function"),
        "function": getattr(tc, "function", None) or {},
    }


def _get_tool_calls_from_response(rsp) -> List[dict]:
    """从 Generation 响应中提取 tool_calls。DashScope 的 message 为 dict-like，缺键时抛 KeyError。"""
    if not rsp or not getattr(rsp, "output", None):
        return []
    out = rsp.output
    if not getattr(out, "choices", None) or len(out.choices) == 0:
        return []
    msg = getattr(out.choices[0], "message", None)
    if not msg:
        return []
    try:
        # DashScope message 为 dict-like，缺键时用 [] 会抛 KeyError
        tool_calls = msg.get("tool_calls") if isinstance(msg, dict) else msg["tool_calls"]
    except (KeyError, TypeError, AttributeError):
        tool_calls = None
    if isinstance(tool_calls, list):
        return [_tool_call_to_dict(tc) for tc in tool_calls]
    return []


def stream_chat_with_tools(
    history: List[ChatMessage],
    user_message: ChatMessage,
    api_key_override: Optional[str],
    request_id: str,
    interrupt_flags: dict,
    enable_utcp: bool = True,
    enable_web_search: bool = True,
) -> Iterable[str]:
    """
    带 UTCP Shell 工具调用的流式对话：若模型返回 tool_calls 则执行 Shell 并继续对话，
    直到模型返回纯文本；最终将整轮对话（含 tool 消息）持久化并流式返回最后一段文本。
    enable_utcp=False 时不传 tools，仅文本对话；enable_web_search=False 时不开启联网搜索。
    """
    from app.services import utcp_shell

    if not api_key_override:
        logger.warning("DashScope API key is not configured, cannot call model.")
        yield "[模型未配置 API Key，请在设置页面中填写。]"
        return

    api_messages: List[Dict[str, Any]] = []
    for m in history:
        api_messages.append(_message_to_api(m))
    user_content = user_message.content or ""
    if getattr(user_message, "files", None) and isinstance(user_message.files, list) and user_message.files:
        file_list = "\n".join("- " + f for f in user_message.files)
        user_content = (
            user_content.rstrip()
            + "\n\n【用户在本条消息中附带了以下文件（路径相对于项目根目录，可直接在 Shell 中使用）：】\n"
            + file_list
        )
    api_messages.append({"role": "user", "content": user_content})

    full_reply_chunks: List[str] = []

    try:
        while True:
            if interrupt_flags.get(request_id):
                break

            call_kwargs: Dict[str, Any] = {
                "model": MODEL_NAME,
                "messages": api_messages,
                "api_key": api_key_override,
                "result_format": "message",
                "stream": False,
            }
            if enable_utcp:
                call_kwargs["tools"] = [SHELL_TOOL]
                call_kwargs["tool_choice"] = "auto"
            if enable_web_search:
                call_kwargs["enable_search"] = True

            rsp = Generation.call(**call_kwargs)

            text = _extract_text_from_response(rsp)
            if text:
                full_reply_chunks.append(text)
                # #region agent log
                try:
                    _log = Path(__file__).resolve().parent.parent.parent / ".cursor" / "debug-0f4b4c.log"
                    with _log.open("a") as _f:
                        _f.write(json.dumps({"sessionId": "0f4b4c", "hypothesisId": "H1", "location": "dashscope_client:yield_text", "message": "backend_yield", "data": {"kind": "text", "len": len(text), "ts": time.time()}, "timestamp": int(time.time() * 1000)}, ensure_ascii=False) + "\n")
                except Exception:
                    pass
                # #endregion
                yield text

            tool_calls = _get_tool_calls_from_response(rsp)
            if not tool_calls:
                # 无工具调用，结束；最终回复为 assistant_content_so_far
                break

            # 把 assistant 消息（含 tool_calls）加入 api_messages
            assistant_msg = {
                "role": "assistant",
                "content": text or "",
                "tool_calls": [
                    {
                        "id": tc.get("id", ""),
                        "type": "function",
                        "function": {
                            "name": (tc.get("function") or {}).get("name", ""),
                            "arguments": (tc.get("function") or {}).get("arguments", "{}"),
                        },
                    }
                    for tc in tool_calls
                ],
            }
            api_messages.append(assistant_msg)

            for tc in tool_calls:
                if interrupt_flags.get(request_id):
                    break
                name = (tc.get("function") or {}).get("name", "")
                args_str = (tc.get("function") or {}).get("arguments", "{}")
                tid = tc.get("id", "")

                if name != "shell_execute":
                    api_messages.append({"role": "tool", "tool_call_id": tid, "content": "[未知工具]"})
                    continue

                try:
                    args = json.loads(args_str) if isinstance(args_str, str) else args_str
                    command = args.get("command", "")
                except (json.JSONDecodeError, TypeError):
                    api_messages.append({"role": "tool", "tool_call_id": tid, "content": "[参数解析失败]"})
                    continue

                # #region agent log
                try:
                    _log = Path(__file__).resolve().parent.parent.parent / ".cursor" / "debug-0f4b4c.log"
                    with _log.open("a") as _f:
                        _f.write(json.dumps({"sessionId": "0f4b4c", "hypothesisId": "H2", "location": "dashscope_client:yield_shell", "message": "backend_yield", "data": {"kind": "shell_cmd", "ts": time.time()}, "timestamp": int(time.time() * 1000)}, ensure_ascii=False) + "\n")
                except Exception:
                    pass
                # #endregion
                yield f"[执行 Shell] {command}\n\n"
                ok, out = utcp_shell.execute(command)
                result = out if ok else f"[失败] {out}"
                api_messages.append({"role": "tool", "tool_call_id": tid, "content": result})
                # #region agent log
                try:
                    _log = Path(__file__).resolve().parent.parent.parent / ".cursor" / "debug-0f4b4c.log"
                    with _log.open("a") as _f:
                        _f.write(json.dumps({"sessionId": "0f4b4c", "hypothesisId": "H3", "location": "dashscope_client:yield_shell_out", "message": "backend_yield", "data": {"kind": "shell_output", "ts": time.time()}, "timestamp": int(time.time() * 1000)}, ensure_ascii=False) + "\n")
                except Exception:
                    pass
                # #endregion
                yield f"[Shell 输出]\n{result}\n\n"
                yield "[Shell 输出结束]\n"

        # 模型文本已在每轮响应时即时 yield，此处无需再输出 full_reply_chunks
        if interrupt_flags.get(request_id):
            return
    except Exception as exc:  # noqa: BLE001
        logger.exception("DashScope tool call failed: %s", exc)
        yield "[模型或工具调用异常，请检查日志和配置。]"
    # 持久化由 chat_service 完成：只保存最终 assistant 文本为一条消息


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

