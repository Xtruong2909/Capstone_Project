from email.message import EmailMessage
from unittest.mock import MagicMock

import pytest

from app.services import email_service


def test_send_otp_email_sends_message_over_tls(monkeypatch: pytest.MonkeyPatch) -> None:
    smtp = MagicMock()
    smtp.__enter__.return_value = smtp
    monkeypatch.setattr(email_service, "SMTP_USERNAME", "sender@example.com")
    monkeypatch.setattr(email_service, "SMTP_PASSWORD", "app-password")
    monkeypatch.setattr(email_service, "SMTP_FROM_EMAIL", "sender@example.com")
    monkeypatch.setattr(email_service.smtplib, "SMTP", MagicMock(return_value=smtp))

    email_service.send_otp_email("user@example.com", "123456")

    smtp.starttls.assert_called_once()
    smtp.login.assert_called_once_with("sender@example.com", "app-password")
    message = smtp.send_message.call_args.args[0]
    assert isinstance(message, EmailMessage)
    assert message["To"] == "user@example.com"
    assert message["From"] == "sender@example.com"
    assert "123456" in message.get_body(preferencelist=("plain",)).get_content()
    assert "5 phút" in message.get_body(preferencelist=("plain",)).get_content()
    html = message.get_body(preferencelist=("html",)).get_content()
    assert "Urban Traffic Analytics" in html
    assert "background-color:#123b72" in html
    assert "border-radius:16px" in html
    assert "letter-spacing:8px" in html


def test_send_initial_credentials_uses_shared_smtp_sender(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    smtp = MagicMock()
    smtp.__enter__.return_value = smtp
    monkeypatch.setattr(email_service, "SMTP_USERNAME", "sender@example.com")
    monkeypatch.setattr(email_service, "SMTP_PASSWORD", "app-password")
    monkeypatch.setattr(email_service, "SMTP_FROM_EMAIL", "sender@example.com")
    monkeypatch.setattr(email_service.smtplib, "SMTP", MagicMock(return_value=smtp))

    email_service.send_initial_credentials(
        "user@example.com",
        "Test User",
        "temporary-password",
    )

    smtp.login.assert_called_once_with("sender@example.com", "app-password")
    message = smtp.send_message.call_args.args[0]
    assert message["To"] == "user@example.com"
    assert message["From"] == "sender@example.com"
    assert "temporary-password" in message.get_body(preferencelist=("plain",)).get_content()
    html = message.get_body(preferencelist=("html",)).get_content()
    assert "Urban Traffic Analytics" in html
    assert "background-color:#123b72" in html
    assert "border-radius:16px" in html


def test_send_otp_email_requires_smtp_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_service, "SMTP_USERNAME", "")

    with pytest.raises(email_service.EmailConfigurationError):
        email_service.send_otp_email("user@example.com", "123456")
