from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel
import os


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseModel):
    web_port: int = 443
    debug_mode: bool = True
    project_save: bool = True
    dashscope_api_key: str | None = None
    ssl_cert_file: str = "certs/server.crt"
    ssl_key_file: str = "certs/server.key"
    default_admin_username: str = "admin"
    default_admin_password: str = "admin123"

    @property
    def cert_paths(self) -> tuple[Path, Path]:
        return PROJECT_ROOT / self.ssl_cert_file, PROJECT_ROOT / self.ssl_key_file


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        load_dotenv(env_path)

    return Settings(
        web_port=int(os.getenv("WEB_PORT", "443")),
        debug_mode=os.getenv("DEBUG_MODE", "True").lower() == "true",
        project_save=os.getenv("PROJECT_SAVE", "True").lower() == "true",
        dashscope_api_key=os.getenv("DASH_SCOPE_API_KEY") or None,
        ssl_cert_file=os.getenv("SSL_CERT_FILE", "certs/server.crt"),
        ssl_key_file=os.getenv("SSL_KEY_FILE", "certs/server.key"),
        default_admin_username=os.getenv("DEFAULT_ADMIN_USERNAME", "admin"),
        default_admin_password=os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123"),
    )

