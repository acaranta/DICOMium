"""Encryption at rest for TOTP secrets.

A TOTP secret is a bearer credential: anyone holding it can mint valid codes forever. So
it must not sit in the database in the clear — a stolen or backed-up `index.db` would
otherwise hand over every user's second factor.

The key is persisted next to the database (`/data/.totp_key`, mode 0600), following the
same pattern as `session_secret` in config.py. This protects against a leaked *database*,
not against an attacker who already owns the whole data volume — which is the realistic
threat for a self-hosted app, and the honest limit of what file-based key storage buys.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

log = logging.getLogger(__name__)

KEY_FILENAME = ".totp_key"


class DecryptionError(RuntimeError):
    """The stored secret could not be decrypted — almost always a lost or changed key."""


@lru_cache
def _fernet() -> Fernet:
    settings = get_settings()
    key_file = settings.data_dir / KEY_FILENAME

    if key_file.exists():
        return Fernet(key_file.read_bytes().strip())

    key = Fernet.generate_key()
    key_file.parent.mkdir(parents=True, exist_ok=True)
    key_file.write_bytes(key)
    key_file.chmod(0o600)
    log.info("generated a new TOTP encryption key at %s", key_file)
    return Fernet(key)


def encrypt(plaintext: str) -> bytes:
    return _fernet().encrypt(plaintext.encode("utf-8"))


def decrypt(ciphertext: bytes) -> str:
    try:
        return _fernet().decrypt(ciphertext).decode("utf-8")
    except InvalidToken as exc:
        # Losing .totp_key means every enrolled TOTP is dead. Say so loudly rather than
        # failing the login with a generic "invalid code", which would be baffling.
        raise DecryptionError(
            "cannot decrypt the TOTP secret — the encryption key at "
            f"{get_settings().data_dir / KEY_FILENAME} is missing or has changed"
        ) from exc
