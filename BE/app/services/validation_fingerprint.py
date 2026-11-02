"""Compact row fingerprints for flat normalized data; JSON for complex types."""

import hashlib
import json
import math
import struct
from collections.abc import Callable
from functools import lru_cache
from typing import Any

import pyarrow as pa


def json_fingerprint(row: tuple[Any, ...]) -> bytes:
    serialized = json.dumps(row, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.blake2b(serialized.encode("utf-8"), digest_size=16).digest()


def row_fingerprinter(schema: pa.Schema) -> Callable[[tuple[Any, ...]], bytes]:
    """Select once per file so fingerprints stay stable across all batches.

    Null flags, length-prefixed UTF-8 and fixed-width numbers are unambiguous.
    Preserve JSON's signed-zero distinction and canonical NaN equality.
    """
    numeric: list[tuple[int, bool]] = []
    strings: list[int] = []
    formats = ["<Q"]
    if len(schema) > 63:
        return json_fingerprint
    for index, field in enumerate(schema):
        dtype = field.type
        if pa.types.is_dictionary(dtype):
            dtype = dtype.value_type
        if pa.types.is_string(dtype) or pa.types.is_large_string(dtype):
            strings.append(index)
            continue
        if pa.types.is_boolean(dtype):
            formats.append("?")
        elif pa.types.is_unsigned_integer(dtype):
            formats.append("Q")
        elif pa.types.is_integer(dtype):
            formats.append("q")
        elif pa.types.is_floating(dtype):
            formats.append("d")
        else:
            return json_fingerprint
        numeric.append((index, pa.types.is_floating(dtype)))
    pack = struct.Struct("".join(formats)).pack
    pack_length = struct.Struct("<q").pack

    @lru_cache(maxsize=1024)
    def encode_text(value: str | None) -> bytes:
        if value is None:
            return pack_length(-1)
        encoded = value.encode("utf-8")
        return pack_length(len(encoded)) + encoded

    def fingerprint(row: tuple[Any, ...]) -> bytes:
        nulls = 0
        values = []
        for index, floating in numeric:
            value = row[index]
            if value is None:
                nulls |= 1 << index
                value = 0
            elif floating and math.isnan(value):
                value = float("nan")
            values.append(value)
        payload = pack(nulls, *values)
        if strings:
            payload += b"".join(encode_text(row[index]) for index in strings)
        return hashlib.blake2b(payload, digest_size=16).digest()

    return fingerprint
