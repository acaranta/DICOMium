"""Application errors, carrying a code the browser can translate.

A plain ``HTTPException(detail="Invalid email or password")`` can only ever be shown in English.
It is also the most-seen message in the app, so it is the worst one to leave untranslatable.

``AppError`` sends a machine-readable code alongside the English text::

    {"detail": {"code": "auth.invalid_credentials",
                "message": "Invalid email or password",
                "params": {}}}

The frontend looks the code up in its catalogue and falls back to ``message`` when it meets a
code it does not know — so a client that is a version behind still shows something sensible
rather than a blank box or a raw key.

``params`` carries the numbers a message needs to interpolate (a size limit, a count). They are
sent separately rather than baked into the string, because the sentence around them is a
different shape in every language.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException


class CodedError(RuntimeError):
    """A domain error that knows its own code.

    The services raise these; the routes turn them into an :class:`AppError`. Without the code
    the route would have nothing to translate but ``str(exc)``, which is how the whole problem
    started.
    """

    #: Used when a subclass raises without naming one.
    default_code = "generic.failed"

    def __init__(self, message: str, code: str | None = None, **params: Any) -> None:
        super().__init__(message)
        self.code = code or self.default_code
        self.params = params


class AppError(HTTPException):
    """An HTTP error with a translatable code.

    The English message is written here, once, and doubles as the fallback for clients that
    cannot translate the code.
    """

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        **params: Any,
    ) -> None:
        self.code = code
        self.params = params

        super().__init__(
            status_code=status_code,
            detail={"code": code, "message": message, "params": params},
        )

    @classmethod
    def of(cls, status_code: int, exc: CodedError) -> AppError:
        """Wrap a domain error, keeping its code, its English text and its params."""
        return cls(status_code, exc.code, str(exc), **exc.params)
