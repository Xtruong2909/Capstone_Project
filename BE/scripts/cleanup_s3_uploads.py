"""Run daily to abort expired browser uploads and clean unreferenced objects."""
from app.database.database import SessionLocal
from app.services.direct_upload_service import cleanup_expired_uploads


def main() -> None:
    with SessionLocal() as db:
        print({'expired_uploads_cleaned': cleanup_expired_uploads(db)})


if __name__ == '__main__':
    main()
