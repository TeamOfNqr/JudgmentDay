"""
UTCP Shell 插件：为 AI 提供完全权限的 Shell 执行能力。
当 PROJECT_SAVE=True 时，禁止对项目本体（除 tmp/ 外）的写/删操作。
"""
from __future__ import annotations

import logging
import re
import subprocess
from pathlib import Path
from typing import Optional, Tuple

from app.config import PROJECT_ROOT, get_settings

logger = logging.getLogger(__name__)

# 项目本体受保护目录：PROJECT_ROOT 下除 tmp 以外的所有路径
TMP_DIR = PROJECT_ROOT / "tmp"


def _resolve_path(path_str: str, cwd: Path) -> Optional[Path]:
    """将可能相对或含 ~ 的路径解析为绝对路径。"""
    s = path_str.strip().strip('"\'')
    if not s or s in ("-", ">"):
        return None
    if s.startswith("~"):
        s = str(Path.home()) + s[1:]
    try:
        return (cwd / s).resolve()
    except Exception:
        return None


def _paths_touched_by_command(command: str, cwd: Path) -> list[Tuple[Path, str]]:
    """
    从 shell 命令中粗粒度提取可能被写/删的路径，返回 [(resolved_path, op)]。
    op 为 'write' 或 'delete'。
    """
    touched: list[Tuple[Path, str]] = []
    # 重定向目标
    for m in re.finditer(r"(?:^|[^\d])(>>?)\s+([^\s&|;#]+)", command):
        path = _resolve_path(m.group(2), cwd)
        if path:
            touched.append((path, "write"))
    # rm / unlink 类
    for prog in ("rm", "unlink", "shred"):
        for m in re.finditer(rf"\b{re.escape(prog)}\b\s+([^&|;#]+?)(?=\s*(?:&|\||;|$))", command, re.DOTALL):
            args = m.group(1).strip()
            for part in re.split(r"\s+", args):
                if part.startswith("-"):
                    continue
                p = _resolve_path(part, cwd)
                if p:
                    touched.append((p, "delete"))
    # mv 源与目标
    mv_match = re.search(r"\bmv\s+([^&|;#]+?)(?=\s*(?:&|\||;|$))", command, re.DOTALL)
    if mv_match:
        parts = mv_match.group(1).strip().split()
        for i, part in enumerate(parts):
            if part.startswith("-"):
                continue
            p = _resolve_path(part, cwd)
            if p:
                touched.append((p, "delete" if i == 0 else "write"))
    # cp 目标（最后一个参数视为目标）
    cp_match = re.search(r"\bcp\s+([^&|;#]+?)(?=\s*(?:&|\||;|$))", command, re.DOTALL)
    if cp_match:
        parts = cp_match.group(1).strip().split()
        for part in reversed(parts):
            if part.startswith("-"):
                continue
            p = _resolve_path(part, cwd)
            if p:
                touched.append((p, "write"))
                break
    # touch, mkdir, chmod, install 等写路径
    for prog in ("touch", "mkdir", "chmod", "chown", "install", "ln", "ln -s"):
        name = prog.replace(" ", r"\s+")
        m = re.search(rf"\b{name}\b\s+([^&|;#]+?)(?=\s*(?:&|\||;|$))", command, re.DOTALL)
        if m:
            args = m.group(1).strip().split()
            for part in args:
                if part.startswith("-"):
                    continue
                p = _resolve_path(part, cwd)
                if p:
                    touched.append((p, "write"))
    return touched


def _is_protected_path(path: Path) -> bool:
    """路径在项目本体内且不在 tmp 下则受保护。"""
    try:
        path = path.resolve()
        root = PROJECT_ROOT.resolve()
        tmp = TMP_DIR.resolve()
        if path == root or path == tmp:
            return path == root  # 根受保护，tmp 根不受保护
        try:
            path.relative_to(root)
        except ValueError:
            return False
        try:
            path.relative_to(tmp)
            return False  # 在 tmp 下，不受保护
        except ValueError:
            return True  # 在项目内但不在 tmp 下，受保护
    except Exception:
        return True  # 解析失败则保守视为受保护


def check_command_allowed(command: str, cwd: Path) -> Tuple[bool, str]:
    """
    当 PROJECT_SAVE=True 时检查命令是否允许执行。
    返回 (allowed, error_message)。允许则 error_message 为空。
    """
    settings = get_settings()
    if not settings.project_save:
        return True, ""

    for path, op in _paths_touched_by_command(command, cwd):
        if path is None:
            continue
        if _is_protected_path(path):
            return False, (
                f"[PROJECT_SAVE 已开启] 禁止对项目本体进行写/删操作。"
                f" 路径 {path} 在项目目录内且不在 tmp/ 下，请仅在 tmp/ 下创建或修改文件。"
            )
    return True, ""


def execute(command: str, cwd: Path | None = None) -> Tuple[bool, str]:
    """
    执行 shell 命令。cwd 默认为项目根目录。
    返回 (success, output)，output 为 stdout+stderr 的合并输出。
    """
    base_cwd = cwd or PROJECT_ROOT
    allowed, err = check_command_allowed(command, base_cwd)
    if not allowed:
        return False, err

    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=str(base_cwd),
            capture_output=True,
            text=True,
            timeout=300,
        )
        out = (result.stdout or "") + (result.stderr or "")
        if result.returncode != 0 and not out.strip():
            out = f"[exit code {result.returncode}]"
        elif result.returncode != 0:
            out = f"{out.strip()}\n[exit code {result.returncode}]"
        return result.returncode == 0, out.strip() or "(无输出)"
    except subprocess.TimeoutExpired:
        return False, "[命令执行超时 (300s)]"
    except Exception as e:
        logger.exception("Shell 执行异常: %s", e)
        return False, f"[执行异常] {e!s}"
