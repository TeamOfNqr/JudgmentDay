from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .config import PROJECT_ROOT, get_settings
from .security.auth import ensure_default_admin
from .utils.logging import configure_logging


def create_app() -> FastAPI:
    """
    Application factory.
    """
    settings = get_settings()
    configure_logging(debug=settings.debug_mode)

    app = FastAPI(title="JudgmentDay Security Assistant", debug=settings.debug_mode)

    # Session for login status
    app.add_middleware(
        SessionMiddleware,
        secret_key="judgmentday-secret-key",  # 可从环境加载，当前为占位
        https_only=True,
    )

    # Static and image mounts
    app.mount(
        "/static",
        StaticFiles(directory=str(PROJECT_ROOT / "static")),
        name="static",
    )
    app.mount(
        "/images",
        StaticFiles(directory=str(PROJECT_ROOT / "images")),
        name="images",
    )

    # Ensure default admin user exists
    ensure_default_admin()

    # Routers
    from .routes import auth_routes, chat_routes, settings_routes, console_routes

    app.include_router(auth_routes.router)
    app.include_router(chat_routes.router)
    app.include_router(settings_routes.router)
    app.include_router(console_routes.router)

    return app

