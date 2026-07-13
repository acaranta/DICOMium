"""Application settings, loaded from the environment."""

from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Configuration comes from the environment only — set it in docker-compose.yml.
    # No .env file, so there is exactly one place to look.
    model_config = SettingsConfigDict(extra="ignore")

    # Storage
    data_dir: Path = Path("/data")
    dicom_root: Path = Path("/dicomfiles")

    # Auth
    registration_enabled: bool = True
    session_ttl_hours: int = 168
    cookie_secure: bool = False
    min_password_length: int = 12
    admin_email: str = ""
    admin_password: str = ""

    # bcrypt cost. 12 is the sane production default. The test suite lowers it, because
    # issuing 10 recovery codes means 10 deliberately-slow hashes per enrolment.
    bcrypt_rounds: int = 12

    # MFA
    #
    # WebAuthn binds a credential to a domain (the Relying Party ID). Left unset, both are
    # derived from the request's Origin header, so passkeys work at localhost:8080 and
    # behind a reverse proxy on any domain with zero configuration. Set them to pin the
    # RP explicitly.
    #
    # Note: browsers only permit WebAuthn in a secure context — HTTPS, or localhost. It
    # will not work over plain HTTP on a LAN address, whatever these are set to.
    webauthn_rp_id: str = ""
    webauthn_origin: str = ""
    webauthn_rp_name: str = "DICOMium"
    # The label an authenticator app shows next to the code.
    totp_issuer: str = "DICOMium"

    # Upload / ingest limits
    max_upload_mb: int = 8192
    max_extract_mb: int = 20480
    max_extract_members: int = 200_000
    commit_batch_size: int = 50

    # DICOMweb
    dicomweb_transcode: str = "auto"  # auto | always | never

    thumbnail_size: int = 128
    log_level: str = "INFO"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "index.db"

    @property
    def thumbs_dir(self) -> Path:
        return self.data_dir / "thumbs"

    @property
    def staging_root(self) -> Path:
        """Staging lives on the same filesystem as the store so placement is a rename."""
        return self.dicom_root / ".tmp"

    @property
    def session_secret(self) -> str:
        """Persisted across restarts so sessions survive a container recreate."""
        secret_file = self.data_dir / ".session_secret"
        if secret_file.exists():
            return secret_file.read_text().strip()
        secret = secrets.token_urlsafe(48)
        secret_file.parent.mkdir(parents=True, exist_ok=True)
        secret_file.write_text(secret)
        secret_file.chmod(0o600)
        return secret


@lru_cache
def get_settings() -> Settings:
    return Settings()
