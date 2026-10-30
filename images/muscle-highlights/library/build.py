"""Render the live exercise library's muscle combinations as reusable PNGs."""

from copy import deepcopy
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
ICON_ROOT = ROOT.parent / "icons"
MANIFEST = json.loads((ROOT / "manifest.json").read_text())
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
TAG = lambda name: f"{{{NS}}}{name}"
PRIMARY = "#009FE8"
SUPPORTING = "#73D8FA"
NEUTRAL = "#39434D"
INK = "#181D24"
OUTLINE = "#111820"
PATH_TOKEN = re.compile(r"[MLQCZ]|-?\d+(?:\.\d+)?")


def source(view):
    root = ET.parse(ICON_ROOT / ("chest.svg" if view == "front" else "back.svg")).getroot()
    body = next(node for node in root if node.tag == TAG("g"))
    regions = [node.get("d") for node in root if node.tag == TAG("path") and node.get("fill") != "none"]
    return body, regions


FRONT_BODY, front_paths = source("front")
BACK_BODY, back_paths = source("back")
assert len(front_paths) == 16 and len(back_paths) == 14

FRONT_REGIONS = [
    (front_paths[0:2], ("shoulders",)),
    (front_paths[2:4], ("chest",)),
    (front_paths[4:6], ("biceps",)),
    (front_paths[6:8], ("core",)),
    (front_paths[8:10], ("core", "obliques")),
    (front_paths[10:12], ("quads",)),
    (front_paths[12:14], ("adductors",)),
    (front_paths[14:16], ("calves",)),
    (["M15.3 33 L18.8 34 L16 39 L13.5 37 Z", "M48.7 33 L45.2 34 L48 39 L50.5 37 Z"], ("forearms",)),
    (["M24.7 36 L28 38 L27 43 L24 41 Z", "M39.3 36 L36 38 L37 43 L40 41 Z"], ("hips",)),
    (["M28 38 L31 39 L30 44 L27 42 Z", "M36 38 L33 39 L34 44 L37 42 Z"], ("hip_flexors",)),
    (["M29 13 L31 14 L31 18 L28 17 Z", "M35 13 L33 14 L33 18 L36 17 Z"], ("neck",)),
    (["M25 55 L29 55 L29 59 L25 59 Z", "M35 55 L39 55 L39 59 L35 59 Z"], ("ankles",)),
]
BACK_REGIONS = [
    (back_paths[0:2], ("shoulders",)),
    (back_paths[2:4], ("back", "upper_back")),
    (back_paths[4:6], ("lats",)),
    (back_paths[6:8], ("triceps",)),
    (back_paths[8:10], ("glutes",)),
    (back_paths[10:12], ("hamstrings",)),
    (back_paths[12:14], ("calves",)),
    (["M15.3 33 L18.8 34 L16 39 L13.5 37 Z", "M48.7 33 L45.2 34 L48 39 L50.5 37 Z"], ("forearms",)),
    (["M24.7 36 L28 38 L27 43 L24 41 Z", "M39.3 36 L36 38 L37 43 L40 41 Z"], ("hips",)),
    (["M22 19 L25 20 L24 24 L21 23 Z", "M42 19 L39 20 L40 24 L43 23 Z"], ("rear_delts",)),
    (["M29 13 L31 14 L31 18 L28 17 Z", "M35 13 L33 14 L33 18 L36 17 Z"], ("neck",)),
    (["M25 55 L29 55 L29 59 L25 59 Z", "M35 55 L39 55 L39 59 L35 59 Z"], ("ankles",)),
]


def fill_for(tags, primary, supporting):
    if "full_body" in primary or any(tag in primary for tag in tags):
        return PRIMARY
    if "full_body" in supporting or any(tag in supporting for tag in tags):
        return SUPPORTING
    return NEUTRAL


def figure_parts(view, primary, supporting):
    body = FRONT_BODY if view == "front" else BACK_BODY
    regions = FRONT_REGIONS if view == "front" else BACK_REGIONS
    parts = []
    for paths, tags in regions:
        for path in paths:
            parts.append((path, fill_for(tags, primary, supporting)))
    return body, parts


def svg_card(entry):
    primary, supporting = set([entry["primary"]]), set(entry["secondary"])
    root = ET.Element(TAG("svg"), {"viewBox": "0 0 160 100", "role": "img",
        "aria-label": f'Primary {entry["primary"]}; supporting {", ".join(entry["secondary"]) or "none"}'})
    ET.SubElement(root, TAG("rect"), {"x": "1", "y": "1", "width": "158", "height": "98", "rx": "15", "fill": "#FFD400"})
    for view, offset in (("front", 0), ("back", 80)):
        body, parts = figure_parts(view, primary, supporting)
        group = ET.SubElement(root, TAG("g"), {"transform": f"translate({offset} 8) scale(1.25)"})
        group.append(deepcopy(body))
        for path, fill in parts:
            ET.SubElement(group, TAG("path"), {"d": path, "fill": fill, "stroke": OUTLINE,
                "stroke-width": ".6", "stroke-linejoin": "round"})
    ET.SubElement(root, TAG("path"), {"d": "M80 9 V88", "stroke": INK, "stroke-opacity": ".3", "stroke-width": "1"})
    for x, label in ((40, "FRONT"), (120, "BACK")):
        node = ET.SubElement(root, TAG("text"), {"x": str(x), "y": "94", "text-anchor": "middle",
            "font-family": "system-ui, sans-serif", "font-size": "6", "font-weight": "700",
            "letter-spacing": "1", "fill": INK})
        node.text = label
    ET.ElementTree(root).write(ROOT / (entry["key"] + ".svg"), encoding="unicode", xml_declaration=True)


def path_points(path):
    tokens = PATH_TOKEN.findall(path)
    points = []
    pos = (0.0, 0.0)
    start = pos
    index = 0
    while index < len(tokens):
        command = tokens[index]
        index += 1
        if command in ("M", "L"):
            pos = (float(tokens[index]), float(tokens[index + 1]))
            index += 2
            points.append(pos)
            if command == "M":
                start = pos
        elif command == "Q":
            control = (float(tokens[index]), float(tokens[index + 1]))
            end = (float(tokens[index + 2]), float(tokens[index + 3]))
            index += 4
            x0, y0 = pos
            for step in range(1, 17):
                t = step / 16
                u = 1 - t
                points.append((u * u * x0 + 2 * u * t * control[0] + t * t * end[0],
                               u * u * y0 + 2 * u * t * control[1] + t * t * end[1]))
            pos = end
        elif command == "C":
            c1 = (float(tokens[index]), float(tokens[index + 1]))
            c2 = (float(tokens[index + 2]), float(tokens[index + 3]))
            end = (float(tokens[index + 4]), float(tokens[index + 5]))
            index += 6
            x0, y0 = pos
            for step in range(1, 17):
                t = step / 16
                u = 1 - t
                points.append((u**3*x0 + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t**3*end[0],
                               u**3*y0 + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t**3*end[1]))
            pos = end
        elif command == "Z":
            points.append(start)
            pos = start
        else:
            raise ValueError(f"Unsupported SVG path token {command!r} in {path!r}")
    return points


def draw_path(draw, path, fill, offset, scale):
    points = [((offset + x * 1.25) * scale, (8 + y * 1.25) * scale) for x, y in path_points(path)]
    draw.polygon(points, fill=fill)
    draw.line(points, fill=OUTLINE, width=max(1, round(scale * .6)), joint="curve")


def png_card(entry):
    scale = 3
    image = Image.new("RGB", (160 * scale, 100 * scale), "#171B20")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((scale, scale, 159 * scale, 99 * scale), radius=15 * scale, fill="#FFD400")
    primary, supporting = set([entry["primary"]]), set(entry["secondary"])
    for view, offset in (("front", 0), ("back", 80)):
        body, parts = figure_parts(view, primary, supporting)
        for node in body:
            if node.tag == TAG("circle"):
                cx, cy, radius = (float(node.get(attr)) for attr in ("cx", "cy", "r"))
                box = ((offset + (cx-radius)*1.25)*scale, (8+(cy-radius)*1.25)*scale,
                       (offset + (cx+radius)*1.25)*scale, (8+(cy+radius)*1.25)*scale)
                draw.ellipse(box, fill=INK, outline=OUTLINE, width=2)
            elif node.tag == TAG("path"):
                draw_path(draw, node.get("d"), INK, offset, scale)
        for path, fill in parts:
            draw_path(draw, path, fill, offset, scale)
    draw.line((80*scale, 9*scale, 80*scale, 88*scale), fill="#9B8B18", width=2)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 6 * scale)
    except OSError:
        font = ImageFont.load_default()
    for x, label in ((40, "FRONT"), (120, "BACK")):
        draw.text((x*scale, 94*scale), label, fill=INK, font=font, anchor="mm")
    image.resize((320, 200), Image.Resampling.LANCZOS).save(ROOT / (entry["key"] + ".png"), optimize=True)


for entry in MANIFEST["combinations"]:
    if not re.fullmatch(r"[a-z0-9_]+(?:--[a-z0-9_]+)*", entry["key"]):
        raise ValueError(f'Unsafe image key: {entry["key"]}')
    svg_card(entry)
    png_card(entry)

print(f'Built {len(MANIFEST["combinations"])} SVG and PNG pairs')
