from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, computed_field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str
    role_id: str
    is_active: bool
    created_at: datetime | None = None

    @computed_field
    @property
    def role(self) -> str:
        return self.role_id


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
