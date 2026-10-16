from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordChangeRequest(BaseModel):
    new_password: str = Field(min_length=12, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str
    role_id: str
    is_active: bool
    must_change_password: bool = False
    created_at: datetime | None = None

    @computed_field
    @property
    def role(self) -> str:
        return self.role_id


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    must_change_password: bool = False
class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)


class ResetPasswordWithOtpRequest(BaseModel):
    email: EmailStr
    reset_token: str
    new_password: str = Field(min_length=6, max_length=128)


class MessageResponse(BaseModel):
    message: str
    reset_token: str | None = None

class VerifyOtpProfileRequest(BaseModel):
    otp: str = Field(min_length=6, max_length=6)


class ChangePasswordProfileRequest(BaseModel):
    reset_token: str
    new_password: str = Field(min_length=6, max_length=128)