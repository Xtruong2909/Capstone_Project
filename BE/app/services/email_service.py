import smtplib
import ssl
from email.message import EmailMessage
from html import escape

from app.core.config import (
    SMTP_FROM_EMAIL,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_TIMEOUT_SECONDS,
    SMTP_USERNAME,
)


class EmailConfigurationError(RuntimeError):
    """Raised when required outgoing-email settings are missing."""


def send_initial_credentials(email: str, full_name: str, password: str) -> None:
    """Send a new user's temporary credentials over the configured SMTP service."""
    if not SMTP_USERNAME or not SMTP_PASSWORD or not SMTP_FROM_EMAIL:
        raise EmailConfigurationError(
            "Missing SMTP_USERNAME, SMTP_PASSWORD, or SMTP_FROM_EMAIL configuration"
        )

    message = EmailMessage()
    message["Subject"] = "Thông tin tài khoản Urban Traffic"
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = email
    message.set_content(
        f"""Xin chào {full_name},

Tài khoản Urban Traffic Analytics của bạn đã được tạo.

Email đăng nhập: {email}
Mật khẩu tạm thời: {password}

Vui lòng đăng nhập bằng thông tin trên và đổi mật khẩu ngay trong lần đăng nhập đầu tiên.

Nếu bạn không yêu cầu tạo tài khoản này, vui lòng liên hệ quản trị viên hệ thống.
"""
    )
    message.add_alternative(
        f"""\
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Thông tin tài khoản Urban Traffic</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background-color:#123b72;padding:28px 36px;color:#ffffff;">
                <div style="font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#c9dcf7;">Urban Traffic Analytics</div>
                <div style="font-size:25px;line-height:1.3;font-weight:700;margin-top:10px;">Tài khoản của bạn đã sẵn sàng</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 36px 12px;">
                <p style="font-size:16px;line-height:1.6;margin:0 0 12px;">Xin chào <strong>{escape(full_name)}</strong>,</p>
                <p style="font-size:15px;line-height:1.7;color:#526079;margin:0;">Quản trị viên đã tạo tài khoản cho bạn. Dùng thông tin bên dưới để đăng nhập.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 36px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px 8px;font-size:12px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#64748b;">Email đăng nhập</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 18px;font-size:16px;color:#172033;word-break:break-word;">{escape(email)}</td>
                  </tr>
                  <tr>
                    <td style="padding:16px 20px 8px;border-top:1px solid #e2e8f0;font-size:12px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#64748b;">Mật khẩu tạm thời</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 20px;">
                      <code style="display:inline-block;background-color:#eaf2ff;border:1px solid #c9dcf7;border-radius:7px;padding:10px 12px;color:#123b72;font-size:16px;word-break:break-all;">{escape(password)}</code>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fff7e6;border-left:4px solid #f0a928;">
                  <tr>
                    <td style="padding:14px 16px;font-size:14px;line-height:1.6;color:#704d08;">
                      <strong>Bắt buộc:</strong> Vì lý do bảo mật, bạn cần đổi mật khẩu ngay sau lần đăng nhập đầu tiên.
                    </td>
                  </tr>
                </table>
                <p style="font-size:13px;line-height:1.6;color:#64748b;margin:22px 0 0;">Nếu bạn không yêu cầu tạo tài khoản này, vui lòng liên hệ quản trị viên hệ thống.</p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 36px;font-size:12px;line-height:1.6;color:#94a3b8;">
                Email tự động từ Urban Traffic Analytics. Vui lòng không trả lời trực tiếp email này.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""",
        subtype="html",
    )

    context = ssl.create_default_context()
    with smtplib.SMTP(
        SMTP_HOST,
        SMTP_PORT,
        timeout=SMTP_TIMEOUT_SECONDS,
    ) as smtp:
        smtp.ehlo()
        smtp.starttls(context=context)
        smtp.ehlo()
        smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
        smtp.send_message(message)
