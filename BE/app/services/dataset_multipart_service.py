"""Receive multipart uploads directly into the dataset volume, one write per byte."""

import hashlib
from collections.abc import AsyncIterable
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import BinaryIO

from python_multipart.multipart import parse_options_header
from starlette.datastructures import FormData, Headers, UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from app.core.config import MAX_DATASET_UPLOAD_BYTES


class StreamedUploadFile:
    """A named upload file that hashes bytes as Starlette's parser writes them."""

    # UploadFile delegates disk I/O to a worker thread when _rolled is true.
    _rolled = True

    def __init__(self, staging_dir: Path, *, csv_only: bool) -> None:
        staging_dir.mkdir(parents=True, exist_ok=True)
        self._file: BinaryIO = NamedTemporaryFile(  # noqa: SIM115 - closed after parsing
            mode="w+b", prefix="upload-", suffix=".csv",
            dir=staging_dir, delete=False,
        )
        self.path = Path(self._file.name)
        self.size = 0
        self._digest = hashlib.sha256()
        self.error: str | None = None
        self._csv_only = csv_only
        self._contains_nul = False
        self._claimed = False

    def write(self, data: bytes) -> int:
        self.size += len(data)
        if self.error is not None:
            return len(data)
        if self.size > MAX_DATASET_UPLOAD_BYTES:
            self.error = f"File vượt quá {MAX_DATASET_UPLOAD_BYTES} byte"
            return len(data)
        if b"\x00" in data:
            self._contains_nul = True
            if self._csv_only:
                self.error = "Nội dung không phải CSV văn bản"
                return len(data)
        self._digest.update(data)
        return self._file.write(data)

    def read(self, size: int = -1) -> bytes:
        return self._file.read(size)

    def seek(self, offset: int, whence: int = 0) -> int:
        return self._file.seek(offset, whence)

    def tell(self) -> int:
        return self._file.tell()

    def flush(self) -> None:
        self._file.flush()

    def fileno(self) -> int:
        return self._file.fileno()

    def seekable(self) -> bool:
        return self._file.seekable()

    def claim(self) -> tuple[Path, int, str]:
        """Keep the temporary path after FormData closes its file handles."""
        if self.error is not None:
            raise ValueError(self.error)
        if self._contains_nul:
            raise ValueError("Nội dung không phải CSV văn bản")
        if self.size == 0:
            raise ValueError("File CSV trống")
        self._file.flush()
        self._claimed = True
        # Windows cannot rename or remove a file while the parser still has it open.
        self._file.close()
        return self.path, self.size, self._digest.hexdigest()

    def close(self) -> None:
        self._file.close()
        if not self._claimed:
            self.path.unlink(missing_ok=True)


class DatasetMultipartParser(MultiPartParser):
    """Use the mounted dataset volume instead of anonymous /tmp spool files."""

    def __init__(
        self, headers: Headers, stream: AsyncIterable[bytes], staging_dir: Path,
    ) -> None:
        super().__init__(headers, stream, max_files=float("inf"), max_fields=20)
        self.staging_dir = staging_dir

    def on_headers_finished(self) -> None:
        _disposition, options = parse_options_header(self._current_part.content_disposition)
        try:
            field_name = options[b"name"].decode("utf-8")
        except (KeyError, UnicodeDecodeError) as exc:
            raise MultiPartException("Multipart field name is invalid") from exc
        self._current_part.field_name = field_name
        if b"filename" not in options:
            self._current_fields += 1
            if self._current_fields > self.max_fields:
                raise MultiPartException("Too many metadata fields")
            self._current_part.file = None
            return

        self._current_files += 1
        filename = options[b"filename"].decode("utf-8", errors="replace")
        file = StreamedUploadFile(self.staging_dir, csv_only=field_name == "files")
        self._files_to_close_on_error.append(file)
        self._current_part.file = UploadFile(
            file=file, size=0, filename=filename,
            headers=Headers(raw=self._current_part.item_headers),
        )


async def receive_dataset_form(
    headers: Headers, stream: AsyncIterable[bytes], upload_dir: Path,
) -> FormData:
    """Parse form fields and stream file parts to the persistent upload volume."""
    parser = DatasetMultipartParser(headers, stream, upload_dir / ".staging")
    return await parser.parse()
