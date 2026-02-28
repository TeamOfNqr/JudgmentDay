from __future__ import annotations

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.config import PROJECT_ROOT
from app.security.auth import authenticate_user, get_current_user, login_user, logout_user

templates = Jinja2Templates(directory=str(PROJECT_ROOT / "templates"))

router = APIRouter()


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@router.post("/login")
async def login_action(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    user = authenticate_user(username, password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    login_user(request, user)
    return RedirectResponse(url="/chat", status_code=status.HTTP_302_FOUND)


@router.get("/logout")
async def logout_action(request: Request):
    logout_user(request)
    return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)


@router.post("/register")
async def register_user():
    # 占位：邮箱验证码注册接口，后续实现
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="用户注册功能暂未实现，接口已预留。",
    )


@router.post("/send_email_verification")
async def send_email_verification():
    # 占位：发送邮箱验证码接口，后续实现
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="邮箱验证码发送功能暂未实现，接口已预留。",
    )


@router.get("/", response_class=HTMLResponse)
async def root(request: Request):
    # 已登录则跳转到对话页，否则跳登录
    try:
        get_current_user(request)
        return RedirectResponse(url="/chat", status_code=status.HTTP_302_FOUND)
    except HTTPException:
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)

