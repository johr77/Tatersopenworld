"""
Primitive wooden + stone axe for a video game.

Clears the scene, builds a Neolithic-style hafted axe (wooden handle,
knapped stone head, rawhide lashing), then saves Primitiveaxe.blend and
Primitiveaxe.glb next to this script.

Scale: metres. Handle ~0.70 m. Origin at the butt of the haft.
Run from Blender: Scripting workspace > Open > Run Script
  or: blender --background --python Primitiveaxe.py
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

try:
    HERE = Path(__file__).resolve().parent
except NameError:
    HERE = Path(r"C:\Users\Danielle\Tatersopenworld\public\models\tools")

BLEND_PATH = HERE / "Primitiveaxe.blend"
GLB_PATH = HERE / "Primitiveaxe.glb"
PREVIEW_PATH = HERE / "Primitiveaxe_preview.png"

HANDLE_LEN = 0.70
HANDLE_R_BUTT = 0.016
HANDLE_R_TOP = 0.0135
SEED = 17


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
    """Keep mesh in place, move object origin to a world-space point."""
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
    """Paint a near-white multiply overlay so chips and grain survive glTF export."""
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

def _ring_verts(bm, radius: float, z: float, segs: int, oval_y: float, t: float, rng: random.Random):
    verts = []
    bend_x = 0.008 * math.sin(t * math.pi * 0.85)
    bend_y = 0.003 * math.cos(t * math.pi * 1.25)
    for s in range(segs):
        ang = s / segs * math.tau
        ridge = 1.0 + 0.055 * math.sin(ang * 6.0 + t * 14.0)
        r = radius * ridge
        if rng.random() < 0.15:
            r += rng.uniform(-0.0007, 0.0010)
        x = r * math.cos(ang) + bend_x
        y = r * oval_y * math.sin(ang) + bend_y
        verts.append(bm.verts.new((x, y, z)))
    return verts


def make_handle(rng: random.Random) -> bpy.types.Object:
    """Hand-carved tapered haft with a pommel and a thicker head-seat."""
    bm = bmesh.new()
    segs = 12
    rings = 16
    ring_list = []
    for i in range(rings):
        t = i / (rings - 1)
        z = t * HANDLE_LEN
        r = HANDLE_R_BUTT * (1.0 - t) + HANDLE_R_TOP * t
        if t < 0.10:
            # Pommel knob at the butt.
            r *= 1.55 - (t / 0.10) * 0.55
        elif t > 0.84:
            # Flaring seat where the stone is lashed on.
            r *= 1.0 + (t - 0.84) / 0.16 * 0.55
        ring_list.append(_ring_verts(bm, r, z, segs, oval_y=0.88, t=t, rng=rng))

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
    return mesh_from_bm("Primitiveaxe_Handle", bm)


def make_stone_head(rng: random.Random) -> bpy.types.Object:
    """Knapped flint celt: thick poll, sharp cutting edge, faceted faces."""
    bm = bmesh.new()
    # Each slice: (x, half_height_z, half_thickness_y)
    slices = [
        (-0.055, 0.032, 0.018),  # poll
        (-0.018, 0.050, 0.020),
        (0.018, 0.056, 0.016),
        (0.055, 0.046, 0.010),
        (0.090, 0.028, 0.0050),
        (0.122, 0.008, 0.0014),  # cutting edge
    ]
    segs = 8
    ring_list = []
    for si, (x, hz, hy) in enumerate(slices):
        t = si / (len(slices) - 1)
        ring = []
        for s in range(segs):
            ang = s / segs * math.tau
            # Squarer ovals so knapped facets read at game distance.
            px = math.copysign(abs(math.cos(ang)) ** 0.65, math.cos(ang))
            py = math.copysign(abs(math.sin(ang)) ** 0.65, math.sin(ang))
            y = hy * px
            z = hz * py
            # Chip the surface.
            y *= 1.0 + 0.08 * math.sin(ang * 3.0 + t * 9.0) + rng.uniform(-0.04, 0.04)
            z *= 1.0 + 0.06 * math.cos(ang * 2.0 + t * 7.0) + rng.uniform(-0.03, 0.03)
            ring.append(bm.verts.new((x + rng.uniform(-0.0015, 0.0015), y, z)))
        ring_list.append(ring)

    for i in range(len(ring_list) - 1):
        a = ring_list[i]
        b = ring_list[i + 1]
        for s in range(segs):
            s2 = (s + 1) % segs
            bm.faces.new((a[s], a[s2], b[s2], b[s]))

    bm.faces.new(list(reversed(ring_list[0])))
    # Collapse the last ring onto a single cutting edge in the XZ plane.
    edge_verts = ring_list[-1]
    for v in edge_verts:
        v.co.y = 0.0
        v.co.x = max(v.co.x, 0.118)
    bmesh.ops.remove_doubles(bm, verts=edge_verts, dist=0.003)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    obj = mesh_from_bm("Primitiveaxe_Head", bm)

    # Side-hafted: poll overlaps the stick, blade stands off to +X.
    obj.location = (0.040, 0.0, HANDLE_LEN - 0.062)
    obj.rotation_euler = (0.08, -0.12, 0.05)
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


def _ellipse_helix(z0, z1, turns, rx, ry, count, cx=0.0, cy=0.0, phase=0.0):
    pts = []
    for i in range(count):
        t = i / (count - 1)
        ang = t * turns * math.tau + phase
        z = z0 + (z1 - z0) * t
        pts.append(Vector((cx + rx * math.cos(ang), cy + ry * math.sin(ang), z)))
    return pts


def make_lashing() -> bpy.types.Object:
    z_lo = HANDLE_LEN - 0.118
    z_hi = HANDLE_LEN - 0.022
    wraps = [
        # Tight wraps around the haft under the head.
        _curve_from_points(
            "LashHaft",
            _ellipse_helix(z_lo, z_lo + 0.038, turns=3.2, rx=0.019, ry=0.0165, count=40, cx=0.0),
            bevel=0.0028,
        ),
        # Wider wraps that bind the stone against the stick.
        _curve_from_points(
            "LashHead",
            _ellipse_helix(z_lo + 0.028, z_hi, turns=4.6, rx=0.058, ry=0.021, count=56, cx=0.032),
            bevel=0.0031,
        ),
        # Opposing wrap so the binding reads as crossed rawhide.
        _curve_from_points(
            "LashHeadB",
            _ellipse_helix(z_lo + 0.034, z_hi - 0.006, turns=3.8, rx=0.052, ry=0.019, count=48, cx=0.028, phase=math.pi),
            bevel=0.0026,
        ),
    ]
    # Figure-eight over the poll.
    eight = [
        Vector((0.062, 0.000, HANDLE_LEN - 0.078)),
        Vector((0.048, 0.018, HANDLE_LEN - 0.052)),
        Vector((0.010, 0.020, HANDLE_LEN - 0.038)),
        Vector((-0.016, 0.008, HANDLE_LEN - 0.046)),
        Vector((-0.014, -0.012, HANDLE_LEN - 0.070)),
        Vector((0.012, -0.020, HANDLE_LEN - 0.094)),
        Vector((0.048, -0.012, HANDLE_LEN - 0.102)),
        Vector((0.064, 0.006, HANDLE_LEN - 0.080)),
    ]
    wraps.append(_curve_from_points("LashEight", eight, bevel=0.0027))

    meshes = [curve_to_mesh(c, c.name + "_Mesh") for c in wraps]
    return join_meshes("Primitiveaxe_Lashing", meshes)


def make_wedge() -> bpy.types.Object:
    """Wooden stop-wedge above the stone so the head cannot slide off."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.018
        v.co.y *= 0.011
        v.co.z *= 0.012
        # Taper toward +X.
        if v.co.x > 0:
            v.co.y *= 0.55
            v.co.z *= 0.70
    obj = mesh_from_bm("Primitiveaxe_Wedge", bm)
    obj.location = (0.010, 0.0, HANDLE_LEN - 0.018)
    obj.rotation_euler = (0.0, 0.35, 0.0)
    bpy.context.view_layer.update()
    apply_world(obj)
    return obj


def make_knot(rng: random.Random) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.0075)
    for v in bm.verts:
        v.co.x *= rng.uniform(0.85, 1.2)
        v.co.y *= rng.uniform(0.80, 1.15)
        v.co.z *= rng.uniform(0.70, 1.10)
    obj = mesh_from_bm("Primitiveaxe_Knot", bm)
    obj.location = (0.022, 0.018, HANDLE_LEN - 0.062)
    bpy.context.view_layer.update()
    apply_world(obj)
    return obj


# ---------------------------------------------------------------------------
# Studio (blend file only — excluded from glTF)
# ---------------------------------------------------------------------------

def setup_studio(target: Vector) -> None:
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 50
    cam_data.clip_start = 0.01
    cam_data.clip_end = 100.0
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = (0.46, -0.88, 0.36)
    link(cam)
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    sun_data = bpy.data.lights.new("Key", "SUN")
    sun_data.energy = 2.4
    sun_data.color = (1.0, 0.97, 0.92)
    sun_data.angle = 0.18
    sun = bpy.data.objects.new("Key", sun_data)
    sun.location = (0.6, -0.5, 1.0)
    sun.rotation_euler = (target - sun.location).to_track_quat("-Z", "Y").to_euler()
    link(sun)

    fill_data = bpy.data.lights.new("Fill", "AREA")
    fill_data.energy = 8.0
    fill_data.color = (0.72, 0.80, 1.0)
    fill_data.size = 0.7
    fill = bpy.data.objects.new("Fill", fill_data)
    fill.location = (-0.45, -0.35, 0.30)
    fill.rotation_euler = (target - fill.location).to_track_quat("-Z", "Y").to_euler()
    link(fill)

    rim_data = bpy.data.lights.new("Rim", "AREA")
    rim_data.energy = 12.0
    rim_data.color = (1.0, 0.94, 0.85)
    rim_data.size = 0.4
    rim = bpy.data.objects.new("Rim", rim_data)
    rim.location = (0.05, 0.55, 0.50)
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


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def save_blend() -> None:
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
    # Blender 4/5 glTF exporter flags differ slightly; try the current set.
    try:
        bpy.ops.export_scene.gltf(
            **kwargs,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
        )
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build() -> bpy.types.Object:
    rng = random.Random(SEED)
    clear_scene()

    wood = pbr_material("M_PrimitiveWood", (0.30, 0.17, 0.08), roughness=0.84, specular=0.26)
    stone = pbr_material("M_PrimitiveStone", (0.27, 0.29, 0.26), roughness=0.92, specular=0.20)
    lash = pbr_material("M_PrimitiveRawhide", (0.16, 0.09, 0.05), roughness=0.76, specular=0.16)

    handle = make_handle(rng)
    head = make_stone_head(rng)
    lashing = make_lashing()
    wedge = make_wedge()
    knot = make_knot(rng)

    assign_mat(handle, wood)
    assign_mat(wedge, wood)
    assign_mat(head, stone)
    assign_mat(lashing, lash)
    assign_mat(knot, lash)

    shade(handle, True)
    shade(wedge, True)
    shade(lashing, True)
    shade(knot, True)
    shade(head, False)

    for obj in (handle, head, lashing, wedge, knot):
        box_uv(obj)
        recalc_normals(obj)

    paint_vertex_colors(handle, rng, 0.18)
    paint_vertex_colors(head, rng, 0.22)
    paint_vertex_colors(lashing, rng, 0.14)
    paint_vertex_colors(wedge, rng, 0.12)
    paint_vertex_colors(knot, rng, 0.16)

    root = bpy.data.objects.new("Primitiveaxe", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.05
    link(root)
    for obj in (handle, head, lashing, wedge, knot):
        obj.parent = root

    # Origin at the butt (bottom of the handle) for world placement / grip.
    bpy.context.view_layer.update()
    set_origin_world(handle, Vector((0.0, 0.0, 0.0)))

    setup_studio(Vector((0.03, 0.0, HANDLE_LEN * 0.52)))
    return root


def main() -> None:
    root = build()
    save_blend()
    export_glb(root)
    render_preview()
    print(f"Saved {BLEND_PATH}")
    print(f"Saved {GLB_PATH}")
    if PREVIEW_PATH.exists():
        print(f"Saved {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
