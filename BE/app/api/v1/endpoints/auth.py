from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User, UserRole
from app.schemas.user import LoginRequest, Token, UserResponse

router = APIRouter()


@router.post("/login", response_model=Token, summary="Đăng nhập tài khoản")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Đăng nhập bằng Email và Password, trả về JWT Access Token kèm thông tin Role."""
    user = db.query(User).filter(User.email == request.email).first()
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị vô hiệu hóa hoặc khóa",
        )

    token_data = {"sub": str(user.id), "role": user.role.value, "email": user.email}
    access_token = create_access_token(data=token_data)

    return Token(
        access_token=access_token, token_type="bearer", user=UserResponse.model_validate(user)
    )


@router.get("/me", response_model=UserResponse, summary="Lấy thông tin User hiện tại")
def get_profile(current_user: User = Depends(get_current_user)):
    """Xem thông tin tài khoản và vai trò đang đăng nhập."""
    return UserResponse.model_validate(current_user)


@router.post("/seed-users", summary="Khởi tạo sẵn 4 tài khoản mẫu đại diện 4 vai trò mới")
def seed_default_users(db: Session = Depends(get_db)):
    """Tạo nhanh 4 tài khoản mẫu đại diện cho 4 Role nếu DB chưa có."""
    default_users = [
        {
            "email": "admin@metroflow.ai",
            "name": "Quản Trị Viên (Admin)",
            "role": UserRole.ADMIN,
            "pwd": "123",
        },
        {
            "email": "engineer@metroflow.ai",
            "name": "Kỹ Sư Dữ Liệu (Data Engineer)",
            "role": UserRole.DATA_ENGINEER,
            "pwd": "123",
        },
        {
            "email": "scientist@metroflow.ai",
            "name": "Nhà Khoa Học Dữ Liệu (Data Scientist)",
            "role": UserRole.DATA_SCIENTIST,
            "pwd": "123",
        },
        {
            "email": "business@metroflow.ai",
            "name": "Người Dùng Nghiệp Vụ (Business User)",
            "role": UserRole.BUSINESS_USER,
            "pwd": "123",
        },
    ]

    created = []
    for item in default_users:
        existing = db.query(User).filter(User.email == item["email"]).first()
        if not existing:
            u = User(
                email=item["email"],
                full_name=item["name"],
                role=item["role"],
                hashed_password=hash_password(item["pwd"]),
                is_active=True,
            )
            db.add(u)
            created.append(f"{item['name']} ({item['email']})")

    db.commit()
    return {"message": "Đã khởi tạo tài khoản mẫu thành công", "created_users": created}
