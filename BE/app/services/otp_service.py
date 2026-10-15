import secrets
from datetime import UTC, datetime, timedelta

# Bộ nhớ tạm lưu OTP & Token: { email: { "otp": "123456", "expires_at": datetime, "reset_token": "..." } }
_otp_store: dict[str, dict] = {}

OTP_EXPIRE_MINUTES = 5
TOKEN_EXPIRE_MINUTES = 10


def generate_otp_for_email(email: str) -> str:
    """Sinh mã OTP 6 chữ số ngẫu nhiên và lưu hạn sử dụng 5 phút."""
    # Sinh ngẫu nhiên từ 100000 đến 999999
    otp = f"{secrets.randbelow(900000) + 100000}"
    expires_at = datetime.now(UTC) + timedelta(minutes=OTP_EXPIRE_MINUTES)

    _otp_store[email] = {
        "otp": otp,
        "expires_at": expires_at,
        "reset_token": None,
    }

    # Trong môi trường phát triển (Dev/Local), in ra terminal để bạn test trực tiếp
    print("\n" + "=" * 50)
    print(f"🔑 [OTP SERVICE] Email: {email} | Mã OTP xác nhận: {otp}")
    print(f"⏳ Hết hạn lúc: {expires_at.strftime('%H:%M:%S UTC')}")
    print("=" * 50 + "\n")

    return otp


def verify_otp_code(email: str, otp: str) -> str | None:
    """Kiểm tra mã OTP. Nếu hợp lệ, trả về reset_token có hiệu lực trong 10 phút."""
    data = _otp_store.get(email)
    if not data:
        return None

    if datetime.now(UTC) > data["expires_at"]:
        _otp_store.pop(email, None)
        return None

    if data["otp"] != otp:
        return None

    # OTP đúng: Cấp reset_token an toàn để người dùng đổi mật khẩu
    reset_token = secrets.token_urlsafe(32)
    data["reset_token"] = reset_token
    data["token_expires_at"] = datetime.now(UTC) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    return reset_token


def verify_reset_token(email: str, reset_token: str) -> bool:
    """Kiểm tra reset_token có hợp lệ và còn hạn hay không."""
    data = _otp_store.get(email)
    if not data or not data.get("reset_token"):
        return False

    if datetime.now(UTC) > data.get("token_expires_at", datetime.min.replace(tzinfo=UTC)):
        _otp_store.pop(email, None)
        return False

    return secrets.compare_digest(data["reset_token"], reset_token)


def clear_otp_session(email: str) -> None:
    """Xóa phiên OTP sau khi đã đổi mật khẩu thành công."""
    _otp_store.pop(email, None)