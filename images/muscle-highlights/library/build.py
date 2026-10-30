"""Render detailed anatomy highlights from the approved library's muscle tags.

The grayscale anatomy base and biceps reference were made with image generation from
an image supplied by the site owner. All other highlights are deterministic masks
on that same anatomy, so the 99 library combinations stay visually consistent.
"""

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / "manifest.json").read_text())
BASE = Image.open(ROOT / "anatomy-base.png").convert("RGB")
BICEPS = Image.open(ROOT / "anatomy-biceps-reference.png").convert("RGB")
assert BASE.size == BICEPS.size == (1536, 1024)
SIZE = (1152, 768)
FRONT_X, BACK_X = 448, 1088


def mirrored(points, center):
    return points, [(2 * center - x, y) for x, y in points]


def paired(points, view="front"):
    return mirrored(points, FRONT_X if view == "front" else BACK_X)


# Boundaries follow the named muscles in the generated front/back atlas.
# Soft mask edges preserve the fiber shading and avoid a flat sticker appearance.
REGIONS = {
    "chest": [
        *paired([(334, 189), (359, 178), (404, 177), (438, 193), (441, 253), (421, 270), (383, 280), (344, 263), (329, 236)]),
    ],
    "shoulders": [
        *paired([(328, 171), (360, 164), (390, 179), (383, 208), (352, 243), (315, 244), (293, 222), (294, 197)]),
        *paired([(960, 171), (992, 162), (1017, 178), (1008, 214), (981, 243), (951, 243), (933, 217), (939, 188)], "back"),
    ],
    "biceps": [],  # Extracted from the image-generated reference below.
    "triceps": [
        *paired([(926, 245), (944, 236), (962, 251), (966, 286), (950, 332), (930, 348), (919, 332), (920, 284)], "back"),
    ],
    "forearms": [
        *paired([(280, 348), (300, 354), (297, 384), (282, 424), (256, 472), (236, 461), (247, 423), (263, 378)]),
        *paired([(914, 347), (933, 355), (931, 388), (908, 435), (883, 471), (865, 461), (879, 414), (898, 370)], "back"),
    ],
    "core": [
        [(397, 277), (441, 274), (444, 457), (431, 484), (403, 472), (395, 434)],
        [(455, 274), (498, 277), (502, 434), (494, 472), (466, 484), (452, 457)],
        *paired([(368, 287), (392, 292), (394, 426), (382, 449), (358, 417)]),
    ],
    "obliques": [
        *paired([(350, 280), (383, 287), (393, 322), (385, 389), (366, 431), (350, 403), (340, 342)]),
    ],
    "back": [
        [(1012, 147), (1068, 181), (1078, 389), (1035, 430), (976, 386), (959, 287), (976, 209)],
        [(1107, 181), (1164, 147), (1200, 209), (1217, 287), (1200, 386), (1141, 430), (1098, 389)],
    ],
    "upper_back": [
        [(1009, 150), (1068, 178), (1081, 286), (1024, 280), (978, 247), (968, 209)],
        [(1108, 178), (1167, 150), (1208, 209), (1198, 247), (1152, 280), (1095, 286)],
    ],
    "lats": [
        *paired([(988, 258), (1040, 282), (1075, 329), (1071, 399), (1036, 428), (986, 382), (971, 318)], "back"),
    ],
    "rear_delts": [
        *paired([(957, 198), (1002, 200), (1021, 221), (1009, 258), (970, 244), (946, 224)], "back"),
    ],
    "glutes": [
        *paired([(988, 421), (1035, 405), (1074, 428), (1080, 490), (1068, 546), (1020, 553), (979, 529), (967, 468)], "back"),
    ],
    "hamstrings": [
        *paired([(984, 536), (1027, 552), (1073, 548), (1070, 604), (1047, 671), (1015, 688), (985, 654), (973, 593)], "back"),
    ],
    "quads": [
        *paired([(358, 495), (389, 501), (427, 522), (429, 574), (406, 655), (386, 678), (353, 660), (331, 609), (338, 541)]),
    ],
    "adductors": [
        *paired([(404, 505), (438, 496), (442, 526), (425, 628), (406, 642), (394, 601)]),
    ],
    "calves": [
        *paired([(334, 709), (370, 713), (389, 739), (381, 801), (366, 855), (337, 850), (319, 801), (318, 755)]),
        *paired([(993, 703), (1027, 711), (1046, 737), (1038, 805), (1019, 856), (988, 849), (973, 800), (974, 751)], "back"),
    ],
    "hips": [
        *paired([(353, 436), (384, 456), (384, 498), (365, 531), (343, 514), (337, 480)]),
        *paired([(969, 409), (1007, 417), (992, 488), (969, 508), (956, 471)], "back"),
    ],
    "hip_flexors": [
        *paired([(390, 460), (425, 488), (412, 550), (387, 536), (372, 495)]),
    ],
    "ankles": [
        *paired([(345, 849), (377, 849), (375, 906), (347, 908)]),
        *paired([(988, 846), (1021, 846), (1017, 912), (990, 913)], "back"),
    ],
    "neck": [
        [(415, 107), (448, 111), (479, 107), (482, 153), (463, 177), (431, 177), (412, 153)],
        [(1059, 84), (1088, 92), (1117, 84), (1123, 144), (1109, 176), (1067, 176), (1053, 144)],
    ],
}


def body_mask():
    # Body pixels are gray/dark; the atlas backdrop is nearly white.
    return BASE.convert("L").point(lambda value: 255 if value < 230 else 0)


BODY_MASK = body_mask()


def region_mask(tag):
    if tag == "full_body":
        return BODY_MASK.copy()
    if tag == "biceps":
        red, green, blue = BICEPS.split()
        mask = Image.new("L", BASE.size)
        source = BICEPS.load()
        target = mask.load()
        for y in range(220, 370):
            for x in list(range(265, 345)) + list(range(550, 630)):
                r, g, b = source[x, y]
                if b - r > 65 and b - g > 10:
                    target[x, y] = 255
        return mask.filter(ImageFilter.GaussianBlur(1.5))
    if tag not in REGIONS:
        raise ValueError(f"No anatomy mask for {tag}")
    mask = Image.new("L", BASE.size)
    draw = ImageDraw.Draw(mask)
    for points in REGIONS[tag]:
        draw.polygon(points, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(3))
    return ImageChops.multiply(mask, BODY_MASK)


MASKS = {tag: region_mask(tag) for tag in {entry["primary"] for entry in MANIFEST["combinations"]}
         | {tag for entry in MANIFEST["combinations"] for tag in entry["secondary"]}}


def tinted(primary):
    gray = BASE.convert("L")
    if primary:
        channels = (
            gray.point([min(28, max(0, round((n - 80) * .18))) for n in range(256)]),
            gray.point([min(245, round(40 + n * .95)) for n in range(256)]),
            gray.point([min(255, round(190 + n * .55)) for n in range(256)]),
        )
    else:
        channels = (
            gray.point([min(150, round(30 + n * .45)) for n in range(256)]),
            gray.point([min(250, round(100 + n * .8)) for n in range(256)]),
            gray.point([min(255, round(200 + n * .45)) for n in range(256)]),
        )
    return Image.merge("RGB", channels)


PRIMARY_IMAGE, SECONDARY_IMAGE = tinted(True), tinted(False)


def render(entry):
    image = BASE.copy()
    for tag in entry["secondary"]:
        image.paste(SECONDARY_IMAGE, mask=MASKS[tag])
    if entry["primary"] == "biceps":
        image.paste(BICEPS, mask=MASKS["biceps"])
    else:
        image.paste(PRIMARY_IMAGE, mask=MASKS[entry["primary"]])
    image = image.resize(SIZE, Image.Resampling.LANCZOS)
    image = image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    image.save(ROOT / f'{entry["key"]}.png', optimize=True)


if __name__ == "__main__":
    for entry in MANIFEST["combinations"]:
        render(entry)
    print(f'Rendered {len(MANIFEST["combinations"])} anatomy PNGs at {SIZE[0]}×{SIZE[1]}')
