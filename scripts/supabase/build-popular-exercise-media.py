#!/usr/bin/env python3
"""Build static and two-frame WebP derivatives of reviewed exercise cards."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DATE = "2026-11-14"
BASE = ROOT / "supabase/storage-assets/exercise-images/approved" / DATE
ROSTER = ROOT / "supabase/storage-assets/popular-exercises-2026-11-14.json"
CARD_SIZE = (1902, 827)
MOTION_SIZE = (600, 700)
PANELS = ((15, 20, 694, 807), (703, 20, 1381, 807))


def webp_frame_durations(path: Path) -> list[int]:
    data = path.read_bytes()
    assert data[:4] == b"RIFF" and data[8:12] == b"WEBP", path
    offset = 12
    durations = []
    while offset + 8 <= len(data):
        chunk = data[offset : offset + 4]
        size = int.from_bytes(data[offset + 4 : offset + 8], "little")
        if chunk == b"ANMF":
            durations.append(int.from_bytes(data[offset + 20 : offset + 23], "little"))
        offset += 8 + size + (size & 1)
    return durations


def main() -> None:
    exercises = json.loads(ROSTER.read_text())["exercises"]
    assert len(exercises) == 40
    for folder in ("webp-480", "webp-768", "motion-webp"):
        (BASE / folder).mkdir(parents=True, exist_ok=True)

    for exercise in exercises:
        slug = exercise["slug"] + "-benjamin"
        card_path = BASE / "png" / f"{slug}.png"
        with Image.open(card_path) as source:
            assert all(abs(actual - expected) <= 3 for actual, expected in zip(source.size, CARD_SIZE)), (card_path, source.size)
            card = source.convert("RGB")
            if card.size != CARD_SIZE:
                card = card.resize(CARD_SIZE, Image.Resampling.LANCZOS)
                card.save(card_path, "PNG", optimize=True)

        for width in (480, 768):
            height = round(card.height * width / card.width)
            output = BASE / f"webp-{width}" / f"{slug}.webp"
            card.resize((width, height), Image.Resampling.LANCZOS).save(
                output, "WEBP", quality=84, method=6
            )

        frames = [
            card.crop(box).resize(MOTION_SIZE, Image.Resampling.LANCZOS)
            for box in PANELS
        ]
        motion = BASE / "motion-webp" / f"{slug}.webp"
        frames[0].save(
            motion,
            "WEBP",
            save_all=True,
            append_images=[frames[1]],
            duration=[1100, 1100],
            loop=0,
            quality=82,
            method=6,
        )
        with Image.open(motion) as check:
            assert check.size == MOTION_SIZE, motion
            assert check.n_frames == 2, motion
            assert check.info["loop"] == 0, motion
        assert webp_frame_durations(motion) == [1100, 1100], motion

    print(f"Built 120 WebP derivatives from {len(exercises)} reviewed PNG cards.")


if __name__ == "__main__":
    main()
