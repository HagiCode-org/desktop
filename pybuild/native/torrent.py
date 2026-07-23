from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

DEFAULT_PIECE_LENGTH = 1024 * 1024


@dataclass
class TorrentSidecarResult:
    sidecar_path: str
    info_hash: str


class RawBencodedValue:
    def __init__(self, data: bytes) -> None:
        self.data = data


def _write_bytes(buf: bytearray, data: bytes) -> None:
    buf.extend(f"{len(data)}:".encode("ascii"))
    buf.extend(data)


def _write_integer(buf: bytearray, value: int) -> None:
    buf.extend(f"i{value}e".encode("ascii"))


def _write_bencoded(buf: bytearray, value: Any) -> None:
    if value is None:
        raise ValueError("Cannot bencode null values")
    if isinstance(value, RawBencodedValue):
        buf.extend(value.data)
        return
    if isinstance(value, (bytes, bytearray)):
        _write_bytes(buf, bytes(value))
        return
    if isinstance(value, str):
        _write_bytes(buf, value.encode("utf-8"))
        return
    if isinstance(value, bool):
        raise ValueError("Cannot bencode bool")
    if isinstance(value, int):
        _write_integer(buf, value)
        return
    if isinstance(value, dict):
        buf.append(ord("d"))
        for key in sorted(value.keys(), key=lambda item: str(item)):
            _write_bencoded(buf, str(key))
            _write_bencoded(buf, value[key])
        buf.append(ord("e"))
        return
    if isinstance(value, (list, tuple)):
        buf.append(ord("l"))
        for item in value:
            _write_bencoded(buf, item)
        buf.append(ord("e"))
        return
    raise ValueError(f"Unsupported bencode type: {type(value)!r}")


def bencode(value: Any) -> bytes:
    buf = bytearray()
    _write_bencoded(buf, value)
    return bytes(buf)


def compute_piece_hashes(source_path: Path, piece_length: int = DEFAULT_PIECE_LENGTH) -> bytes:
    hashes: list[bytes] = []
    with source_path.open("rb") as handle:
        while True:
            chunk = handle.read(piece_length)
            if not chunk:
                break
            hashes.append(hashlib.sha1(chunk).digest())
    return b"".join(hashes)


def generate_torrent_sidecar(
    *,
    source_path: Path,
    sidecar_path: Path,
    display_name: str,
    web_seeds: Iterable[str],
    created_by: str = "HagiCode Desktop",
    piece_length: int = DEFAULT_PIECE_LENGTH,
) -> TorrentSidecarResult:
    if not source_path.is_file():
        raise FileNotFoundError(f"Source artifact not found: {source_path}")

    seeds = [seed for seed in web_seeds if seed]
    if not seeds:
        raise ValueError("At least one web seed is required to generate a trackerless torrent sidecar.")

    pieces = compute_piece_hashes(source_path, piece_length)
    info_dictionary = {
        "length": source_path.stat().st_size,
        "name": display_name,
        "piece length": piece_length,
        "pieces": pieces,
    }
    info_bytes = bencode(info_dictionary)
    info_hash = hashlib.sha1(info_bytes).hexdigest().lower()

    torrent_dictionary = {
        "comment": "Trackerless hybrid distribution via DHT/LSD + webSeeds",
        "created by": created_by,
        "creation date": int(time.time()),
        "info": RawBencodedValue(info_bytes),
        "url-list": seeds[0] if len(seeds) == 1 else list(seeds),
    }
    torrent_bytes = bencode(torrent_dictionary)
    sidecar_path.parent.mkdir(parents=True, exist_ok=True)
    sidecar_path.write_bytes(torrent_bytes)
    return TorrentSidecarResult(sidecar_path=str(sidecar_path), info_hash=info_hash)
