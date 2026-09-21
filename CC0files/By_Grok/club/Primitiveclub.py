"""
Primitive wooden club with a grass-strand grip and an embedded stone.

Clears the scene, builds a knobbed war-club (thick striking head, grass
grip, knapped stone set into the head and bound with grass), then saves
Primitiveclub.blend, .glb, .svg and a preview PNG next to this script.

Scale: metres. Club ~0.78 m. Origin at the butt of the haft.
Run from Blender: Scripting workspace > Open > Run Script
  or: blender --background --python Primitiveclub.py
"""

from __future__ import annotations

import math
import random
import shutil
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

try:
    HERE = Path(__file__).resolve().parent
except NameError:
    HERE = Path(r"C:\Users\Danielle\Tatersopenworld\public\models\tools")

BLEND_PATH = HERE / "Primitiveclub.blend"
GLB_PATH = HERE / "Primitiveclub.glb"
PREVIEW_PATH = HERE / "Primitiveclub_preview.png"
SVG_PATH = HERE / "Primitiveclub.svg"
GAME_COPY = Path(r"C:\Users\Danielle\Tatersopenworld\public\models\tools")

CLUB_LEN = 0.78
SEED = 31


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------

def clear_scene() -> None:
    if bpy.ops.object.mode_set.poll():
        bpy.ops.object.mode_set(mode="OBJECT")

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    for coll in list(bpy.data.collections):
        if coll.name not in {"Collection", "Scene Collection"}:
            try:
                bpy.data.collections.remove(coll)
            except Exception:
                pass

    for datablock in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.images,
        bpy.data.armatures,
    ):
        for item in list(datablock):
            datablock.remove(item)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = 30
    scene.render.engine = "BLENDER_EEVEE"


def link(obj: bpy.types.Object) -> bpy.types.Object:
    coll = bpy.context.collection
    if obj.name not in coll.objects:
        coll.objects.link(obj)
    return obj


def mesh_from_bm(name: str, bm: bmesh.types.BMesh) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    return link(obj)


def apply_world(obj: bpy.types.Object) -> None:
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()


def shade(obj: bpy.types.Object, smooth: bool) -> None:
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    obj.data.update()


def box_uv(obj: bpy.types.Object) -> None:
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                uv_layer[li].uv = (co.x * 4.0 + 0.5, co.y * 4.0 + 0.5)
            elif ay >= ax:
                uv_layer[li].uv = (co.x * 4.0 + 0.5, co.z * 1.4)
            else:
                uv_layer[li].uv = (co.y * 4.0 + 0.5, co.z * 1.4)


def recalc_normals(obj: bpy.types.Object) -> None:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def set_origin_world(obj: bpy.types.Object, world_point: Vector) -> None:
    mw = obj.matrix_world.copy()
    local = mw.inverted() @ world_point
    obj.data.transform(Matrix.Translation(-local))
    obj.matrix_world.translation = world_point
    obj.data.update()


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def _mix_color_output(mix: bpy.types.Node):
    for key in ("Result", "Color"):
        if key in mix.outputs:
            return mix.outputs[key]
    return mix.outputs[0]


def _mix_factor_input(mix: bpy.types.Node):
    for key in ("Factor", "Fac"):
        if key in mix.inputs:
            return mix.inputs[key]
    return None


def pbr_material(
    name: str,
    color: tuple[float, float, float],
    roughness: float,
    metallic: float = 0.0,
    specular: float = 0.4,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    spec_key = "Specular IOR Level" if "Specular IOR Level" in bsdf.inputs else "Specular"
    if spec_key in bsdf.inputs:
        bsdf.inputs[spec_key].default_value = specular

    rgb = nt.nodes.new("ShaderNodeRGB")
    rgb.outputs[0].default_value = (*color, 1.0)
    rgb.location = (-420, 80)

    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "Col"
    attr.location = (-420, 280)

    try:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
    except Exception:
        mix = nt.nodes.new("ShaderNodeMixRGB")
        mix.blend_type = "MULTIPLY"
    mix.location = (-200, 180)
    fac = _mix_factor_input(mix)
    if fac is not None:
        fac.default_value = 1.0
    a_in = mix.inputs.get("A") or mix.inputs.get("Color1")
    b_in = mix.inputs.get("B") or mix.inputs.get("Color2")
    nt.links.new(attr.outputs["Color"], a_in)
    nt.links.new(rgb.outputs[0], b_in)
    nt.links.new(_mix_color_output(mix), bsdf.inputs["Base Color"])

    mat.diffuse_color = (*color, 1.0)
    return mat


def assign_mat(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def paint_vertex_colors(obj: bpy.types.Object, rng: random.Random, variation: float) -> None:
    mesh = obj.data
    attr = mesh.color_attributes.get("Col")
    if attr is None:
        attr = mesh.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
    for poly in mesh.polygons:
        jitter = 1.0 + (rng.random() - 0.5) * variation
        c = max(0.55, min(1.0, jitter))
        col = (c, c, c, 1.0)
        for li in poly.loop_indices:
            attr.data[li].color = col


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def _shaft_radius(t: float) -> float:
    """Thin grip that swells into a heavy striking knob."""
    if t < 0.08:
        r = 0.018 * (1.32 - t / 0.08 * 0.32)
    elif t < 0.50:
        u = (t - 0.08) / 0.42
        r = 0.0145 + 0.003 * u
    elif t < 0.62:
        u = (t - 0.50) / 0.12
        r = 0.0175 + (0.042 - 0.0175) * (u * u * (3 - 2 * u))
    elif t < 0.86:
        u = (t - 0.62) / 0.24
        r = 0.042 + 0.018 * math.sin(u * math.pi)
        r = 0.054 - 0.006 * abs(u - 0.45)
    else:
        u = (t - 0.86) / 0.14
        r = 0.048 * (1.0 - 0.55 * u)
    return r


def _bend(t: float) -> tuple[float, float]:
    return (
        0.010 * math.sin(t * math.pi * 0.55),
        0.004 * math.cos(t * math.pi * 0.9),
    )


def _ring_verts(bm, radius: float, z: float, segs: int, t: float, rng: random.Random, socket: bool):
    verts = []
    bx, by = _bend(t)
    for s in range(segs):
        ang = s / segs * math.tau
        ridge = 1.0 + 0.06 * math.sin(ang * 4.0 + t * 9.0)
        r = radius * ridge
        if rng.random() < 0.14:
            r += rng.uniform(-0.0009, 0.0014)
        # Carve a socket on +X of the knob so the stone sits in the wood.
        if socket and t > 0.66 and t < 0.90:
            cx = math.cos(ang)
            if cx > 0.05:
                dent = (cx - 0.05) / 0.95
                r *= 1.0 - 0.32 * dent * dent
        x = r * math.cos(ang) + bx
        y = r * 0.92 * math.sin(ang) + by
        verts.append(bm.verts.new((x, y, z)))
    return verts


def make_club(rng: random.Random) -> bpy.types.Object:
    bm = bmesh.new()
    segs = 14
    rings = 20
    ring_list = []
    for i in range(rings):
        t = i / (rings - 1)
        z = t * CLUB_LEN
        ring_list.append(_ring_verts(bm, _shaft_radius(t), z, segs, t, rng, socket=True))

    bm.verts.ensure_lookup_table()
    for i in range(len(ring_list) - 1):
        a = ring_list[i]
        b = ring_list[i + 1]
        for s in range(segs):
            s2 = (s + 1) % segs
            bm.faces.new((a[s], a[s2], b[s2], b[s]))

    bm.faces.new(list(reversed(ring_list[0])))
    bm.faces.new(ring_list[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm("Primitiveclub_Body", bm)


def make_stone(rng: random.Random) -> bpy.types.Object:
    """Knapped cobble seated in the knob socket, proud of the wood."""
    bm = bmesh.new()
    slices = [
        (-0.032, 0.024, 0.020),
        (-0.010, 0.036, 0.030),
        (0.016, 0.040, 0.032),
        (0.040, 0.030, 0.022),
        (0.058, 0.016, 0.010),
    ]
    segs = 8
    ring_list = []
    for si, (x, hz, hy) in enumerate(slices):
        t = si / (len(slices) - 1)
        ring = []
        for s in range(segs):
            ang = s / segs * math.tau
            px = math.copysign(abs(math.cos(ang)) ** 0.62, math.cos(ang))
            py = math.copysign(abs(math.sin(ang)) ** 0.62, math.sin(ang))
            y = hy * px
            z = hz * py
            y *= 1.0 + 0.10 * math.sin(ang * 3.0 + t * 8.0) + rng.uniform(-0.05, 0.05)
            z *= 1.0 + 0.08 * math.cos(ang * 2.0 + t * 6.0) + rng.uniform(-0.04, 0.04)
            ring.append(bm.verts.new((x + rng.uniform(-0.0012, 0.0012), y, z)))
        ring_list.append(ring)

    for i in range(len(ring_list) - 1):
        a = ring_list[i]
        b = ring_list[i + 1]
        for s in range(segs):
            s2 = (s + 1) % segs
            bm.faces.new((a[s], a[s2], b[s2], b[s]))

    bm.faces.new(list(reversed(ring_list[0])))
    bm.faces.new(ring_list[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    obj = mesh_from_bm("Primitiveclub_Stone", bm)

    t = 0.78
    bx, by = _bend(t)
    # Poll at the haft axis, striking face proud of the knob.
    obj.location = (bx + 0.030, by, t * CLUB_LEN)
    obj.rotation_euler = (0.18, -0.28, 0.12)
    bpy.context.view_layer.update()
    apply_world(obj)
    return obj


def _curve_from_points(name: str, points: list[Vector], bevel: float) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.fill_mode = "FULL"
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
    curve.resolution_u = 6
    curve.twist_mode = "Z_UP"
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for i, p in enumerate(points):
        spline.points[i].co = (p.x, p.y, p.z, 1.0)
    obj = bpy.data.objects.new(name, curve)
    return link(obj)


def curve_to_mesh(obj: bpy.types.Object, name: str) -> bpy.types.Object:
    deps = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(deps)
    mesh = bpy.data.meshes.new_from_object(eval_obj)
    mesh.name = name
    new_obj = bpy.data.objects.new(name, mesh)
    link(new_obj)
    bpy.data.objects.remove(obj, do_unlink=True)
    return new_obj


def join_meshes(name: str, objects: list[bpy.types.Object]) -> bpy.types.Object:
    if len(objects) == 1:
        objects[0].name = name
        objects[0].data.name = name
        return objects[0]

    bm = bmesh.new()
    for obj in objects:
        apply_world(obj)
        bm.from_mesh(obj.data)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    out = bpy.data.objects.new(name, mesh)
    link(out)
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    return out


def _helix_on_shaft(z0, z1, turns, pad, count, phase, rng, peel=0.006):
    pts = []
    for i in range(count):
        t = i / (count - 1)
        ang = t * turns * math.tau + phase
        z = z0 + (z1 - z0) * t
        st = z / CLUB_LEN
        bx, by = _bend(st)
        r = _shaft_radius(st) + pad
        r *= 1.0 + 0.05 * math.sin(ang * 3.5 + phase) + rng.uniform(-0.03, 0.03)
        flare = 1.0
        if t < 0.10:
            flare = 1.0 + (peel / max(r, 0.008)) * (1.0 - t / 0.10)
        elif t > 0.90:
            flare = 1.0 + (peel / max(r, 0.008)) * ((t - 0.90) / 0.10)
        pts.append(Vector((bx + r * flare * math.cos(ang), by + r * 0.92 * flare * math.sin(ang), z)))
    return pts


def _tuft(origin: Vector, direction: Vector, length: float, rng: random.Random, n=6):
    pts = [origin]
    d = direction.normalized()
    side = Vector((-d.y, d.x, 0.12)).normalized()
    for i in range(1, n):
        t = i / (n - 1)
        wobble = side * math.sin(t * math.pi) * rng.uniform(0.002, 0.006)
        drop = Vector((0.0, 0.0, -0.004 * t * t))
        pts.append(origin + d * (length * t) + wobble + drop)
    return pts


def make_grass_grip(rng: random.Random) -> bpy.types.Object:
    z0, z1 = 0.08, 0.32
    coils = [
        (z0, z1, 10.8, 0.0020, 70, 0.00, 0.0029, 0.003),
        (z0 + 0.004, z1 - 0.004, 9.8, 0.0032, 66, 0.90, 0.0026, 0.003),
        (z0 + 0.008, z1 - 0.008, -8.8, 0.0044, 62, 1.80, 0.0023, 0.003),
        (z0 + 0.002, z1 - 0.010, 11.6, 0.0026, 74, 2.70, 0.0021, 0.002),
        (z0 + 0.010, z1 - 0.006, 8.2, 0.0054, 58, 3.60, 0.0019, 0.004),
        (z0 + 0.006, z1 - 0.012, -7.4, 0.0038, 56, 4.50, 0.0017, 0.003),
    ]
    strands = []
    for i, (a, b, turns, pad, count, phase, bevel, peel) in enumerate(coils):
        strands.append(
            _curve_from_points(f"Grip{i}", _helix_on_shaft(a, b, turns, pad, count, phase, rng, peel), bevel)
        )
    bx, by = _bend(0.11)
    r = _shaft_radius(0.11) + 0.006
    strands.append(
        _curve_from_points(
            "GripTuft",
            _tuft(Vector((bx + r * 0.85, by, z0 + 0.012)), Vector((0.038, 0.016, -0.048)), 0.052, rng),
            0.0012,
        )
    )
    meshes = [curve_to_mesh(c, c.name + "_Mesh") for c in strands]
    return join_meshes("Primitiveclub_GrassGrip", meshes)


def _knob_helix(z0, z1, turns, radius, count, phase, rng, cx=0.0):
    """Tight wraps on the undented knob envelope so they don't fall into the socket."""
    pts = []
    for i in range(count):
        t = i / (count - 1)
        ang = t * turns * math.tau + phase
        z = z0 + (z1 - z0) * t
        st = z / CLUB_LEN
        bx, by = _bend(st)
        r = radius * (1.0 + 0.035 * math.sin(ang * 3.0 + phase) + rng.uniform(-0.02, 0.02))
        pts.append(Vector((bx + cx + r * math.cos(ang), by + r * 0.90 * math.sin(ang), z)))
    return pts


def _ring_pts(cx, cy, cz, rx, ry, count, phase=0.0, z_wobble=0.0):
    pts = []
    for i in range(count):
        t = i / (count - 1)
        ang = t * math.tau + phase
        pts.append(Vector((cx + rx * math.cos(ang), cy + ry * math.sin(ang), cz + z_wobble * math.sin(ang * 2.0))))
    return pts


def make_grass_bind(rng: random.Random) -> bpy.types.Object:
    """Grass wrapping the knob that keeps the stone seated in the socket."""
    z0, z1 = 0.72, 0.84
    knob_r = 0.053
    strands = [
        _curve_from_points("BindA", _knob_helix(z0, z1, 3.6, knob_r, 48, 0.2, rng), 0.0025),
        _curve_from_points("BindB", _knob_helix(z0 + 0.006, z1 - 0.006, -2.8, knob_r + 0.0025, 42, 1.9, rng), 0.0022),
    ]
    t = 0.78
    bx, by = _bend(t)
    z = t * CLUB_LEN
    # Tight rings around the stone-and-wood junction.
    strands.append(
        _curve_from_points("StoneRingA", _ring_pts(bx + 0.034, by, z - 0.004, 0.036, 0.030, 28, 0.0, 0.006), 0.0023)
    )
    strands.append(
        _curve_from_points("StoneRingB", _ring_pts(bx + 0.030, by, z + 0.010, 0.032, 0.028, 26, 1.1, 0.005), 0.0020)
    )
    eight = [
        Vector((bx - 0.006, by + 0.044, z - 0.012)),
        Vector((bx + 0.034, by + 0.032, z + 0.002)),
        Vector((bx + 0.072, by + 0.006, z + 0.010)),
        Vector((bx + 0.070, by - 0.024, z + 0.004)),
        Vector((bx + 0.032, by - 0.044, z - 0.010)),
        Vector((bx - 0.004, by - 0.020, z - 0.018)),
        Vector((bx + 0.018, by + 0.018, z - 0.016)),
        Vector((bx + 0.048, by + 0.028, z - 0.002)),
    ]
    strands.append(_curve_from_points("BindEight", eight, 0.00205))

    strands.append(
        _curve_from_points(
            "BindTuft",
            _tuft(Vector((bx + 0.058, by + 0.022, z + 0.016)), Vector((0.02, 0.03, 0.028)), 0.04, rng),
            0.0012,
        )
    )
    meshes = [curve_to_mesh(c, c.name + "_Mesh") for c in strands]
    return join_meshes("Primitiveclub_GrassBind", meshes)


def make_knot(rng: random.Random) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.007)
    for v in bm.verts:
        v.co.x *= rng.uniform(0.85, 1.3)
        v.co.y *= rng.uniform(0.75, 1.15)
        v.co.z *= rng.uniform(0.65, 1.10)
    obj = mesh_from_bm("Primitiveclub_Knot", bm)
    t = 0.11
    bx, by = _bend(t)
    r = _shaft_radius(t) + 0.004
    obj.location = (bx + r * 0.4, by + r * 0.85, t * CLUB_LEN)
    bpy.context.view_layer.update()
    apply_world(obj)
    return obj


# ---------------------------------------------------------------------------
# Studio / export
# ---------------------------------------------------------------------------

def setup_studio(target: Vector) -> None:
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 50
    cam_data.clip_start = 0.01
    cam_data.clip_end = 100.0
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = (0.64, -0.98, 0.38)
    link(cam)
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    sun_data = bpy.data.lights.new("Key", "SUN")
    sun_data.energy = 2.4
    sun_data.color = (1.0, 0.97, 0.92)
    sun_data.angle = 0.18
    sun = bpy.data.objects.new("Key", sun_data)
    sun.location = (0.7, -0.45, 1.0)
    sun.rotation_euler = (target - sun.location).to_track_quat("-Z", "Y").to_euler()
    link(sun)

    fill_data = bpy.data.lights.new("Fill", "AREA")
    fill_data.energy = 8.0
    fill_data.color = (0.72, 0.80, 1.0)
    fill_data.size = 0.7
    fill = bpy.data.objects.new("Fill", fill_data)
    fill.location = (-0.45, -0.35, 0.28)
    fill.rotation_euler = (target - fill.location).to_track_quat("-Z", "Y").to_euler()
    link(fill)

    rim_data = bpy.data.lights.new("Rim", "AREA")
    rim_data.energy = 12.0
    rim_data.color = (1.0, 0.94, 0.85)
    rim_data.size = 0.4
    rim = bpy.data.objects.new("Rim", rim_data)
    rim.location = (0.08, 0.55, 0.52)
    rim.rotation_euler = (target - rim.location).to_track_quat("-Z", "Y").to_euler()
    link(rim)

    world = bpy.data.worlds.new("StudioWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.10, 0.105, 0.11, 1.0)
        bg.inputs["Strength"].default_value = 0.25
    bpy.context.scene.world = world
    vs = bpy.context.scene.view_settings
    for transform in ("AgX", "Filmic", "Standard"):
        try:
            vs.view_transform = transform
            break
        except Exception:
            continue


def render_preview() -> None:
    scene = bpy.context.scene
    scene.render.filepath = str(PREVIEW_PATH)
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as exc:
        print("Preview render skipped:", exc)


def write_icon_svg() -> None:
    """Compact HUD icon: knobbed club, grass grip, embedded stone."""
    svg = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40">
  <path d="M10 34 L38 16" fill="none" stroke="#8a6240" stroke-width="4.4" stroke-linecap="round"/>
  <path d="M10 34 L38 16" fill="none" stroke="#6d4a30" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <ellipse cx="46" cy="12.5" rx="10.5" ry="8.2" fill="#7a5533"/>
  <ellipse cx="44" cy="11.2" rx="4.2" ry="3.1" fill="#9a7048" opacity="0.55"/>
  <ellipse cx="51.5" cy="11.8" rx="6.2" ry="5.0" fill="#8b8680"/>
  <ellipse cx="50" cy="10.4" rx="2.4" ry="1.8" fill="#a8a29c" opacity="0.7"/>
  <path d="M18 30 C20 27.5 24 25.5 27 23" fill="none" stroke="#6a8f3a" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M19 31 C23 28 26 26 29 23.5" fill="none" stroke="#8aaa4a" stroke-width="2.0" stroke-linecap="round"/>
  <path d="M17 29 C21 27 25 24.5 28 22" fill="none" stroke="#5c7a32" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M42 16 C44 18 48 17 51 15" fill="none" stroke="#6a8f3a" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M41 14 C45 16.5 49 16 52 13.5" fill="none" stroke="#5c7a32" stroke-width="1.4" stroke-linecap="round"/>
  <circle cx="19.2" cy="30.4" r="1.3" fill="#5c7a32"/>
</svg>
"""
    SVG_PATH.write_text(svg, encoding="utf-8")


def save_blend() -> None:
    HERE.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))


def export_glb(root: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root

    kwargs = dict(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
    )
    try:
        bpy.ops.export_scene.gltf(
            **kwargs,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
        )
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)

    if GAME_COPY.is_dir() and GLB_PATH.resolve() != (GAME_COPY / GLB_PATH.name).resolve():
        shutil.copy2(GLB_PATH, GAME_COPY / GLB_PATH.name)


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build() -> bpy.types.Object:
    rng = random.Random(SEED)
    clear_scene()

    wood = pbr_material("M_PrimitiveWood", (0.30, 0.17, 0.08), roughness=0.84, specular=0.26)
    grass = pbr_material("M_PrimitiveGrass", (0.32, 0.46, 0.16), roughness=0.78, specular=0.18)
    stone = pbr_material("M_PrimitiveStone", (0.27, 0.29, 0.26), roughness=0.92, specular=0.20)

    body = make_club(rng)
    head = make_stone(rng)
    grip = make_grass_grip(rng)
    bind = make_grass_bind(rng)
    knot = make_knot(rng)

    assign_mat(body, wood)
    assign_mat(head, stone)
    assign_mat(grip, grass)
    assign_mat(bind, grass)
    assign_mat(knot, grass)

    shade(body, True)
    shade(grip, True)
    shade(bind, True)
    shade(knot, True)
    shade(head, False)

    for obj in (body, head, grip, bind, knot):
        box_uv(obj)
        recalc_normals(obj)

    paint_vertex_colors(body, rng, 0.18)
    paint_vertex_colors(head, rng, 0.24)
    paint_vertex_colors(grip, rng, 0.22)
    paint_vertex_colors(bind, rng, 0.20)
    paint_vertex_colors(knot, rng, 0.16)

    root = bpy.data.objects.new("Primitiveclub", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.05
    link(root)
    for obj in (body, head, grip, bind, knot):
        obj.parent = root

    bpy.context.view_layer.update()
    set_origin_world(body, Vector((0.0, 0.0, 0.0)))

    setup_studio(Vector((0.04, 0.0, CLUB_LEN * 0.44)))
    return root


def main() -> None:
    HERE.mkdir(parents=True, exist_ok=True)
    root = build()
    write_icon_svg()
    save_blend()
    export_glb(root)
    render_preview()
    print(f"Saved {BLEND_PATH}")
    print(f"Saved {GLB_PATH}")
    print(f"Saved {SVG_PATH}")
    if PREVIEW_PATH.exists():
        print(f"Saved {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
