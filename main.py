from pathlib import Path

import uvicorn

from app import create_app
from app.config import get_settings, PROJECT_ROOT
from app.utils.certs import ensure_self_signed_cert


def prepare_directories() -> None:
    for dirname in ("tmp", "data", "certs", "static", "templates"):
        (PROJECT_ROOT / dirname).mkdir(parents=True, exist_ok=True)


def main() -> None:
    settings = get_settings()
    prepare_directories()

    cert_path, key_path = settings.cert_paths
    ensure_self_signed_cert(cert_path, key_path)

    app = create_app()

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=settings.web_port,
        ssl_certfile=str(cert_path),
        ssl_keyfile=str(key_path),
    )


if __name__ == "__main__":
    main()

