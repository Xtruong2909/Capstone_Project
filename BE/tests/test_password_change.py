from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.endpoints import auth
from app.core.security import hash_password
from app.schemas.user import ChangePasswordProfileRequest


def test_profile_password_change_requires_matching_confirmation() -> None:
    with pytest.raises(ValidationError, match="Mật khẩu mới và xác nhận mật khẩu không khớp"):
        ChangePasswordProfileRequest(
            current_password="current-password",
            new_password="new-password",
            confirm_new_password="different-password",
        )


def test_profile_password_change_updates_password_after_current_password_check(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(hashed_password=hash_password("current-password"))
    update_password = Mock()
    db = Mock()
    monkeypatch.setattr(auth.crud_user, "change_user_password", update_password)

    response = auth.change_password_in_profile(
        ChangePasswordProfileRequest(
            current_password="current-password",
            new_password="new-password",
            confirm_new_password="new-password",
        ),
        current_user=user,
        db=db,
    )

    update_password.assert_called_once_with(db, user, "new-password")
    assert response.message == "Đổi mật khẩu thành công! Mật khẩu mới đã có hiệu lực."


def test_profile_password_change_rejects_incorrect_current_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(hashed_password=hash_password("current-password"))
    update_password = Mock()
    monkeypatch.setattr(auth.crud_user, "change_user_password", update_password)

    with pytest.raises(HTTPException) as exc_info:
        auth.change_password_in_profile(
            ChangePasswordProfileRequest(
                current_password="wrong-password",
                new_password="new-password",
                confirm_new_password="new-password",
            ),
            current_user=user,
            db=Mock(),
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Mật khẩu hiện tại không chính xác."
    update_password.assert_not_called()
