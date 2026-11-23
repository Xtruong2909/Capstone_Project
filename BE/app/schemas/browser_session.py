from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.user import LoginRequest, UserResponse


class BrowserLoginRequest(LoginRequest):
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = False


class BrowserSessionResponse(BaseModel):
    user: UserResponse
    must_change_password: bool
    csrf_token: str
    expires_at: datetime
