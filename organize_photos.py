#!/usr/bin/env python3
"""Organize photos in ./images into YYYY-MM subfolders based on EXIF capture date.

Extraction priority per file:
  1. exifread (EXIF DateTimeOriginal / DateTimeDigitized / Image DateTime)
  2. Pillow getexif() tags 36867 / 36868 / 306
  3. exiftool binary (best effort, covers formats Pillow can't decode, e.g. HEIC)

Images without a usable capture date move to ./images/Uncategorized/.
Outputs ./gallery-data.json describing the categorized layout.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from collections import OrderedDict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMAGES_DIR = ROOT / "images"
OUTPUT_JSON = ROOT / "gallery-data.json"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".avif"}

EXIF_DT_ORIGINAL = "EXIF DateTimeOriginal"
EXIF_DT_DIGITIZED = "EXIF DateTimeDigitized"
TAG_DT_ORIGINAL = 36867
TAG_DT_DIGITIZED = 36868
TAG_DT = 306

DATE_RE = re.compile(r"^(\d{4}):(\d{2}):(\d{2})[\s\s](\d{2}):(\d{2}):(\d{2})")

EXIFTOOL = shutil.which("exiftool")


def _normalize_date(value) -> str | None:
    """Return normalized 'YYYY-MM-DD HH:MM:SS' or None."""
    if not value:
        return None
    text = str(value).strip().strip('"')
    match = DATE_RE.match(text)
    if match:
        return "{0}-{1}-{2} {3}:{4}:{5}".format(*match.groups())
    return None


def exif_date_exifread(path: Path) -> str | None:
    try:
        import exifread
    except ImportError:
        return None
    try:
        with open(path, "rb") as fh:
            tags = exifread.process_file(fh, details=False)
    except Exception:
        return None
    for key in (EXIF_DT_ORIGINAL, EXIF_DT_DIGITIZED, "Image DateTime"):
        tag = tags.get(key)
        if tag:
            normalized = _normalize_date(tag)
            if normalized:
                return normalized
    return None


def exif_date_pillow(path: Path) -> str | None:
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS
    except ImportError:
        return None
    try:
        with Image.open(path) as img:
            exif = img.getexif()
    except Exception:
        return None
    if not exif:
        return None
    for tag_id in (TAG_DT_ORIGINAL, TAG_DT_DIGITIZED, TAG_DT):
        value = exif.get(tag_id)
        if value:
            normalized = _normalize_date(value)
            if normalized:
                return normalized
    return None


def exif_date_exiftool(path: Path) -> str | None:
    if not EXIFTOOL:
        return None
    try:
        proc = subprocess.run(
            [EXIFTOOL, "-DateTimeOriginal", "-CreateDate", "-DateTimeDigitized", "-json", str(path)],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except Exception:
        return None
    if proc.returncode != 0:
        return None
    try:
        records = json.loads(proc.stdout)
    except (json.JSONDecodeError, TypeError):
        return None
    if not records:
        return None
    record = records[0]
    for key in ("DateTimeOriginal", "CreateDate", "DateTimeDigitized"):
        value = record.get(key)
        if value:
            normalized = _normalize_date(value)
            if normalized:
                return normalized
    return None


def extract_capture_date(path: Path) -> str | None:
    for reader in (exif_date_exifread, exif_date_pillow, exif_date_exiftool):
        normalized = reader(path)
        if normalized:
            return normalized
    return None


def find_images(source: Path) -> list[Path]:
    images = []
    for root, _dirs, files in os.walk(source):
        for name in files:
            if Path(name).suffix.lower() in IMAGE_EXTS:
                images.append(Path(root) / name)
    return sorted(images)


def unique_destination(dest_dir: Path, name: str, source: Path) -> Path:
    candidate = dest_dir / name
    if not candidate.exists() or candidate.resolve() == source.resolve():
        return candidate
    stem, suffix = os.path.splitext(name)
    counter = 1
    while True:
        candidate = dest_dir / f"{stem}_{counter}{suffix}"
        if not candidate.exists() or candidate.resolve() == source.resolve():
            return candidate
        counter += 1


def main() -> int:
    if not IMAGES_DIR.exists():
        print(f"[info] {IMAGES_DIR} does not exist; nothing to organize.")
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    images = find_images(IMAGES_DIR)
    if not images:
        print("[info] No images found; writing empty gallery-data.json.")
        OUTPUT_JSON.write_text(
            json.dumps(
                {"generated": datetime.now().isoformat(timespec="seconds"), "albums": [], "uncategorized": []},
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"[ok] Wrote {OUTPUT_JSON.relative_to(ROOT)}")
        return 0

    albums: "OrderedDict[str, list[Path]]" = OrderedDict()
    uncategorized: list[Path] = []

    for image in images:
        capture = extract_capture_date(image)
        if not capture:
            uncategorized.append(image)
            continue
        month_key = capture[:7]  # YYYY-MM
        month_dir = IMAGES_DIR / month_key
        month_dir.mkdir(parents=True, exist_ok=True)
        destination = unique_destination(month_dir, image.name, image)
        if image.resolve() != destination.resolve():
            image.rename(destination)
            print(f"[move] {image.relative_to(ROOT)} -> {destination.relative_to(ROOT)}")
        albums.setdefault(month_key, []).append(destination)

    if uncategorized:
        uncat_dir = IMAGES_DIR / "Uncategorized"
        uncat_dir.mkdir(parents=True, exist_ok=True)
        moved_uncategorized = []
        for image in uncategorized:
            destination = unique_destination(uncat_dir, image.name, image)
            if image.resolve() != destination.resolve():
                image.rename(destination)
                print(f"[move] {image.relative_to(ROOT)} -> {destination.relative_to(ROOT)}")
            moved_uncategorized.append(destination)
        uncategorized = moved_uncategorized

    def label_for(month_key: str) -> str:
        return datetime.strptime(month_key, "%Y-%m").strftime("%B %Y")

    albums_json = [
        {
            "key": month_key,
            "label": label_for(month_key),
            "photos": [str(p.relative_to(ROOT)) for p in sorted(paths)],
        }
        for month_key, paths in sorted(albums.items(), reverse=True)
    ]

    data = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "albums": albums_json,
        "uncategorized": [str(p.relative_to(ROOT)) for p in uncategorized],
    }

    OUTPUT_JSON.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"\n[ok] Processed {len(images)} image(s): {len(albums)} album(s), {len(uncategorized)} uncategorized.")
    print(f"[ok] Wrote {OUTPUT_JSON.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())