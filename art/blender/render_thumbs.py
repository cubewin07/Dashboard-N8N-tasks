"""Render deterministic 256x256 WebP wardrobe thumbnails (P07a-T12).

Reads all catalogue files in `src/content/catalog/*.json`:
- Face parts (eyes, brows, mouth; model == null): crops from `face_atlas.png` and
  composites `hair_black` ink onto a soft `skin_03` rounded card (mirrored pair
  for eyes & brows, centred for mouth).
- 3D wardrobe items: imports the GLB (female preferred when both exist), applies
  `tint.defaults` onto `COLOR_0` tint masks (or shifts hair UVs to `hair_brown`),
  frames an orthographic 3/4 front view (-Y front in Blender), and renders with
  transparent background at 256x256 WebP <= 15 KB.

Usage:
    Blender -b --factory-startup --python-exit-code 1 -P art/blender/render_thumbs.py -- [--allow-missing] [--only id1,id2] [--test path.glb]
"""
import argparse
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CATALOG_DIR = os.path.join(ROOT, "src", "content", "catalog")
PALETTE_JSON = os.path.join(ROOT, "src", "content", "palette3d.json")
ATLAS_PNG = os.path.join(ROOT, "public", "assets", "textures", "face_atlas.png")
ASSETS_DIR = os.path.join(ROOT, "public", "assets")
DEFAULT_OUT_DIR = os.path.join(ASSETS_DIR, "thumbs")
DEFAULT_TEST_OUT = os.path.join(ROOT, "art", ".cache", "p07", "thumbs", "test.webp")

SLOT_FILES = [
    "hair.json",
    "top.json",
    "bottom.json",
    "fullbody.json",
    "shoes.json",
    "glasses.json",
    "neck.json",
    "eyes.json",
    "brows.json",
    "mouth.json",
]

THUMB_SIZE = 256
MAX_BYTES = 15 * 1024
QUALITIES = (80, 70, 60, 50, 40)


def _hex_to_srgb(hex_str):
    h = hex_str.lstrip("#")
    return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _load_swatches():
    with open(PALETTE_JSON, encoding="utf-8") as fh:
        data = json.load(fh)
    return {s["key"]: s for s in data["swatches"]}


def _load_catalog_items():
    items = []
    for fname in SLOT_FILES:
        path = os.path.join(CATALOG_DIR, fname)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        items.extend(doc.get("items", []))
    return items


def _reset_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for col in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.armatures,
        bpy.data.worlds,
    ):
        for item in list(col):
            try:
                col.remove(item)
            except Exception:
                pass


def _save_webp_with_budget(save_fn, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    scene = bpy.context.scene
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    for q in QUALITIES:
        scene.render.image_settings.quality = q
        save_fn(out_path, scene)
        size = os.path.getsize(out_path)
        if size <= MAX_BYTES:
            return size, q
    return os.path.getsize(out_path), QUALITIES[-1]


# ---------------------------------------------------------------------------
# Face-part thumbnails
# ---------------------------------------------------------------------------


def _resize_bilinear(img_rgba, dst_w, dst_h):
    """Resize (H, W, 4) float32 array using bilinear sampling with premultiplied alpha."""
    src_h, src_w, _ = img_rgba.shape
    premul = img_rgba.copy()
    premul[..., :3] *= premul[..., 3:4]

    ys = (np.arange(dst_h, dtype=np.float32) + 0.5) * (src_h / dst_h) - 0.5
    xs = (np.arange(dst_w, dtype=np.float32) + 0.5) * (src_w / dst_w) - 0.5
    ys = np.clip(ys, 0.0, src_h - 1.0)
    xs = np.clip(xs, 0.0, src_w - 1.0)

    y0 = np.floor(ys).astype(np.int32)
    x0 = np.floor(xs).astype(np.int32)
    y1 = np.minimum(y0 + 1, src_h - 1)
    x1 = np.minimum(x0 + 1, src_w - 1)
    wy = (ys - y0)[:, None, None]
    wx = (xs - x0)[None, :, None]

    c00 = premul[np.ix_(y0, x0)]
    c01 = premul[np.ix_(y0, x1)]
    c10 = premul[np.ix_(y1, x0)]
    c11 = premul[np.ix_(y1, x1)]
    out = (c00 * (1.0 - wx) + c01 * wx) * (1.0 - wy) + (c10 * (1.0 - wx) + c11 * wx) * wy

    a = out[..., 3:4]
    rgb = np.where(a > 1e-6, out[..., :3] / np.maximum(a, 1e-6), 0.0)
    return np.concatenate([np.clip(rgb, 0.0, 1.0), np.clip(a, 0.0, 1.0)], axis=-1)


def _load_atlas_topdown():
    img = bpy.data.images.load(ATLAS_PNG)
    w, h = img.size
    arr = np.array(img.pixels[:], dtype=np.float32).reshape((h, w, 4))
    bpy.data.images.remove(img)
    return arr[::-1, :, :].copy()  # flip from Blender bottom-up to top-down


def _face_card_base(swatches):
    skin = np.array(_hex_to_srgb(swatches["skin_03"]["hex"]), dtype=np.float32)
    rim = np.array(_hex_to_srgb(swatches["skin_03_shadow"]["hex"]), dtype=np.float32)
    border_col = skin * 0.65 + rim * 0.35

    yy, xx = np.mgrid[0:THUMB_SIZE, 0:THUMB_SIZE].astype(np.float32)
    cx = np.abs(xx - (THUMB_SIZE - 1) * 0.5)
    cy = np.abs(yy - (THUMB_SIZE - 1) * 0.5)
    half, rad = 114.0, 38.0
    qx = np.maximum(cx - (half - rad), 0.0)
    qy = np.maximum(cy - (half - rad), 0.0)
    dist = np.sqrt(qx * qx + qy * qy) + np.minimum(np.maximum(cx - (half - rad), cy - (half - rad)), 0.0) - rad

    card_alpha = np.clip(0.5 - dist, 0.0, 1.0)
    rim_mix = np.clip((dist + 3.0) / 2.5, 0.0, 1.0)
    rgb = skin[None, None, :] * (1.0 - rim_mix[..., None]) + border_col[None, None, :] * rim_mix[..., None]
    return np.concatenate([rgb, card_alpha[..., None]], axis=-1)


def _composite_stamp(canvas, stamp, x0, y0, ink_srgb):
    h, w, _ = stamp.shape
    lum = stamp[..., 0:1]  # 0 = ink, 1 = white highlight / teeth
    fg_a = stamp[..., 3:4]
    fg_rgb = ink_srgb[None, None, :] * (1.0 - lum) + 1.0 * lum
    region = canvas[y0:y0 + h, x0:x0 + w]
    region[..., :3] = region[..., :3] * (1.0 - fg_a) + fg_rgb * fg_a


def render_face_thumb(item, atlas_topdown, swatches, out_path):
    _reset_scene()
    col, row = item["faceTile"]["cell"]
    cell = atlas_topdown[row * 64:(row + 1) * 64, col * 64:(col + 1) * 64]
    ink_srgb = np.array(_hex_to_srgb(swatches["hair_black"]["hex"]), dtype=np.float32)

    canvas = _face_card_base(swatches)
    slot = item["slot"]
    if slot == "eyes":
        stamp_r = _resize_bilinear(cell[:, ::-1, :], 96, 96)
        stamp_l = _resize_bilinear(cell, 96, 96)
        _composite_stamp(canvas, stamp_r, 24, 80, ink_srgb)
        _composite_stamp(canvas, stamp_l, 136, 80, ink_srgb)
    elif slot == "brows":
        stamp_r = _resize_bilinear(cell[:, ::-1, :], 104, 104)
        stamp_l = _resize_bilinear(cell, 104, 104)
        _composite_stamp(canvas, stamp_r, 20, 76, ink_srgb)
        _composite_stamp(canvas, stamp_l, 132, 76, ink_srgb)
    else:  # mouth
        stamp = _resize_bilinear(cell, 148, 148)
        _composite_stamp(canvas, stamp, 54, 54, ink_srgb)

    img = bpy.data.images.new(item["id"], width=THUMB_SIZE, height=THUMB_SIZE, alpha=True)
    blender_px = canvas[::-1, :, :].ravel()
    img.pixels.foreach_set(blender_px)

    def _save(p, scene):
        img.save_render(p, scene=scene)

    size, q = _save_webp_with_budget(_save, out_path)
    bpy.data.images.remove(img)
    return size, q


# ---------------------------------------------------------------------------
# 3D wardrobe thumbnails
# ---------------------------------------------------------------------------


def _apply_wardrobe_colors(mesh_objs, item, swatches):
    """Apply tint.defaults (or hair_brown UV shift) onto imported wardrobe meshes."""
    slot = item["slot"]
    tint = item.get("tint")
    defaults = (tint or {}).get("defaults", {})

    def _lin(key):
        if not key or key not in swatches:
            return Vector((1.0, 1.0, 1.0))
        s = _hex_to_srgb(swatches[key]["hex"])
        return Vector((_srgb_to_linear(s[0]), _srgb_to_linear(s[1]), _srgb_to_linear(s[2])))

    c_pri = _lin(defaults.get("primary"))
    c_sec = _lin(defaults.get("secondary"))
    c_acc = _lin(defaults.get("accent"))

    for ob in mesh_objs:
        me = ob.data
        uv_layer = me.uv_layers.active.data if (me.uv_layers and me.uv_layers.active) else None
        # Hair UVs sit in hair_black / hair_black_hi (row 9, col 0..1) -> shift +4 cols to hair_brown
        if slot == "hair" and uv_layer is not None:
            v_lo = 1.0 - 10.0 / 16.0 - 1e-4
            v_hi = 1.0 - 9.0 / 16.0 + 1e-4
            u_hi = 2.0 / 16.0 + 1e-4
            for loop in uv_layer:
                u, v = loop.uv
                if u <= u_hi and v_lo <= v <= v_hi:
                    loop.uv = (u + 4.0 / 16.0, v)

        col_attr = me.color_attributes.active_color or (me.color_attributes[0] if me.color_attributes else None)
        if col_attr is None:
            continue
        # Tinted vertices replace palette.png with tint_rgb * shade, so point their UVs to
        # the pure white cell (row=1, col=11, #FFFFFF) to avoid double-multiplying palette.png.
        white_uv = (11.5 / 16.0, 1.0 - 1.5 / 16.0)
        if tint is not None and uv_layer is not None:
            if col_attr.domain == "CORNER":
                for idx, c in enumerate(col_attr.data):
                    r, g, b, _a = c.color
                    if r + g + b > 0.01:
                        uv_layer[idx].uv = white_uv
            else:
                for loop in me.loops:
                    r, g, b, _a = col_attr.data[loop.vertex_index].color
                    if r + g + b > 0.01:
                        uv_layer[loop.index].uv = white_uv
        for c in col_attr.data:
            r, g, b, a = c.color
            w = r + g + b
            if tint is not None and w > 0.01:
                mask = min(1.0, w)
                tint_rgb = (c_pri * r + c_sec * g + c_acc * b) / w
                rgb = Vector((1.0, 1.0, 1.0)) * (1.0 - mask) + tint_rgb * mask
                c.color = (rgb.x * a, rgb.y * a, rgb.z * a, 1.0)
            else:
                # Untinted face (hair, necklace, fixed-swatch trim): convert mask (0,0,0,shade) -> (shade,shade,shade,1)
                c.color = (a, a, a, 1.0)


def _fix_palette_materials(mesh_objs):
    for ob in mesh_objs:
        for mat in ob.data.materials:
            if not mat or not mat.use_nodes:
                continue
            for node in mat.node_tree.nodes:
                if node.type == "TEX_IMAGE":
                    node.interpolation = "Closest"
                elif node.type == "BSDF_PRINCIPLED":
                    node.inputs["Metallic"].default_value = 0.0
                    node.inputs["Roughness"].default_value = 0.85


def _world_bounds(mesh_objs):
    pts = []
    for ob in mesh_objs:
        pts.extend(ob.matrix_world @ Vector(c) for c in ob.bound_box)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def _setup_thumb_camera(scene, lo, hi):
    cam_data = bpy.data.cameras.new("thumb_cam")
    cam_data.type = "ORTHO"
    cam_data.clip_start = 0.01
    cam_data.clip_end = 100.0
    cam = bpy.data.objects.new("thumb_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    # 3/4 front view: character front is -Y in Blender, left is +X, up is +Z
    az, el = math.radians(25.0), math.radians(18.0)
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    centre = (lo + hi) * 0.5
    cam.location = centre + direction * 20.0
    cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()

    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for cx in (lo.x, hi.x):
        for cy in (lo.y, hi.y):
            for cz in (lo.z, hi.z):
                p = inv @ Vector((cx, cy, cz))
                xs.append(p.x)
                ys.append(p.y)
    wv = max(xs) - min(xs)
    hv = max(ys) - min(ys)
    cam.location += cam.matrix_world.to_3x3() @ Vector(((max(xs) + min(xs)) * 0.5, (max(ys) + min(ys)) * 0.5, 0.0))
    cam_data.ortho_scale = max(wv, hv, 0.05) * 1.20


def _setup_thumb_studio(scene):
    # Warm key sun lighting the -Y front face + soft fill sun, neutral world ambient
    key = bpy.data.objects.new("key_sun", bpy.data.lights.new("key_sun", "SUN"))
    scene.collection.objects.link(key)
    key.data.energy = 2.8
    key.data.angle = math.radians(10.0)
    key.rotation_euler = (math.radians(52.0), math.radians(-14.0), math.radians(22.0))

    fill = bpy.data.objects.new("fill_sun", bpy.data.lights.new("fill_sun", "SUN"))
    scene.collection.objects.link(fill)
    fill.data.energy = 0.7
    fill.data.angle = math.radians(25.0)
    fill.rotation_euler = (math.radians(-35.0), math.radians(18.0), math.radians(155.0))

    world = bpy.data.worlds.new("thumb_world")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.94, 0.94, 0.96, 1.0)
    bg.inputs["Strength"].default_value = 0.75

    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    try:
        scene.eevee.taa_render_samples = 16
    except Exception:
        pass

    scene.render.resolution_x = THUMB_SIZE
    scene.render.resolution_y = THUMB_SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.use_persistent_data = False


def render_3d_thumb(glb_path, out_path, item=None, swatches=None):
    _reset_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(glb_path))
    bpy.context.view_layer.update()

    mesh_objs = [ob for ob in bpy.context.scene.objects if ob.type == "MESH" and ob.visible_get()]
    if not mesh_objs:
        raise RuntimeError(f"No mesh found in GLB: {glb_path}")

    _fix_palette_materials(mesh_objs)
    if item is not None and swatches is not None:
        _apply_wardrobe_colors(mesh_objs, item, swatches)

    lo, hi = _world_bounds(mesh_objs)
    scene = bpy.context.scene
    _setup_thumb_camera(scene, lo, hi)
    _setup_thumb_studio(scene)

    def _save(p, sc):
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)

    return _save_webp_with_budget(_save, out_path)


def _pick_model_path(item):
    model = item.get("model")
    if not model:
        return None
    rel = model.get("female") or next(iter(model.values()), None)
    return os.path.join(ASSETS_DIR, rel) if rel else None


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Render 256x256 WebP wardrobe thumbnails.")
    p.add_argument("--allow-missing", action="store_true", help="Skip missing GLBs with a warning instead of failing.")
    p.add_argument("--only", default="", help="Comma-separated list of catalog item ids to render.")
    p.add_argument("--out", default="", help="Override output directory (or file path with --test).")
    p.add_argument("--test", default="", help="Render one GLB directly to art/.cache/p07/thumbs/test.webp.")
    args = p.parse_args(argv)

    if args.test:
        glb_path = os.path.abspath(args.test)
        if not os.path.exists(glb_path):
            print(f"ERROR: test GLB not found: {glb_path}", file=sys.stderr)
            sys.exit(1)
        out_path = os.path.abspath(args.out) if args.out else DEFAULT_TEST_OUT
        size, q = render_3d_thumb(glb_path, out_path)
        print(f"TEST_THUMB {os.path.relpath(out_path, ROOT)} ({size} bytes, q={q})")
        return

    out_dir = os.path.abspath(args.out) if args.out else DEFAULT_OUT_DIR
    only = {s.strip() for s in args.only.split(",") if s.strip()} if args.only else None

    swatches = _load_swatches()
    items = _load_catalog_items()
    if only:
        items = [it for it in items if it["id"] in only]

    atlas_topdown = _load_atlas_topdown()
    missing = []
    rendered = []

    for item in items:
        item_id = item["id"]
        out_path = os.path.join(out_dir, f"{item_id}.webp")
        if item.get("model") is None:
            size, q = render_face_thumb(item, atlas_topdown, swatches, out_path)
            rendered.append((item_id, size, q))
            print(f"THUMB {item_id} -> {os.path.relpath(out_path, ROOT)} ({size} bytes, q={q})")
            continue

        glb_path = _pick_model_path(item)
        if not glb_path or not os.path.exists(glb_path):
            rel = os.path.relpath(glb_path, ROOT) if glb_path else "(none)"
            missing.append((item_id, rel))
            if args.allow_missing:
                print(f"WARNING: skipping {item_id}; missing GLB {rel}", file=sys.stderr)
            continue

        size, q = render_3d_thumb(glb_path, out_path, item=item, swatches=swatches)
        rendered.append((item_id, size, q))
        print(f"THUMB {item_id} -> {os.path.relpath(out_path, ROOT)} ({size} bytes, q={q})")

    if missing and not args.allow_missing:
        print(f"ERROR: {len(missing)} missing wardrobe GLB(s):", file=sys.stderr)
        for item_id, rel in missing:
            print(f"  - {item_id}: {rel}", file=sys.stderr)
        sys.exit(1)

    over = [(i, s) for i, s, _ in rendered if s > MAX_BYTES]
    if over:
        print(f"ERROR: {len(over)} thumbnail(s) exceed {MAX_BYTES} bytes: {over}", file=sys.stderr)
        sys.exit(1)

    print(f"thumbs: {len(rendered)} rendered, {len(missing)} skipped")


if __name__ == "__main__":
    main()
