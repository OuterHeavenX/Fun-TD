"""Render the FUN TD sprite sheet set from procedural Blender geometry.

Everything the battlefield draws is modelled here from primitives, lit once, and
rendered straight down with an orthographic camera so the 2D game can rotate a
turret sprite on top of a static base sprite and keep the perspective honest.

    blender -b -noaudio --python tools/blender/build_sprites.py -- --out assets/sprites

Output is one PNG per part plus manifest.json describing the pixels-per-unit
scale the runtime needs to place them.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

# ---------------------------------------------------------------- arguments

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[argv.index("--out") + 1] if "--out" in argv else "assets/sprites")
ONLY = argv[argv.index("--only") + 1].split(",") if "--only" in argv else None
SAMPLES = int(argv[argv.index("--samples") + 1] if "--samples" in argv else 320)
# --gltf exports the same procedural geometry as .glb models for the 3D stage
# instead of rendering it to sprites. Same shapes, same materials, no Cycles.
GLTF = "--gltf" in argv
os.makedirs(OUT, exist_ok=True)

# The world is modelled so one tower deck spans 2.0 units across.  The camera
# frames ORTHO units, and every sprite is square, so pixels-per-unit is simply
# resolution / ortho_scale.  The runtime reads that back out of the manifest.
ORTHO = 3.1

MANIFEST = {"orthoScale": ORTHO, "parts": {}}
MODELS = {}

# A --only run renders a subset, so start from the manifest already on disk:
# otherwise writing it back would drop every part this run did not touch.
if ONLY:
    try:
        with open(os.path.join(OUT, "manifest.json")) as _f:
            MANIFEST["parts"] = json.load(_f).get("parts", {})
    except (OSError, ValueError):
        pass


# ------------------------------------------------------------------- helpers

_materials = {}


def clear():
    _materials.clear()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def mat(name, color, metallic=0.7, roughness=0.35, emission=None, strength=0.0, alpha=1.0):
    key = (name, color, metallic, roughness, emission, strength, alpha)
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    _materials[key] = m
    return m


# Sprite renders are stills, so the primitives above are built at whatever
# density looks smooth under Cycles. The 3D stage draws the same shapes sixty
# times a second on a phone, where a 52x14 torus for a decorative collar is
# thousands of triangles nobody can see. LOD scales every segment count and
# bevel down for the glTF pass only, which takes the gun tower's level 4 base
# from 851KB to something a browser can load a whole campaign of.
LOD = 0.45 if GLTF else 1.0
BEVEL_SEGMENTS = 1 if GLTF else 3


def seg(n, floor=6):
    """Scale a segment count for the current output, never below `floor`."""
    return max(floor, int(round(n * LOD)))


def finish(obj, material, bevel=0.012, segments=BEVEL_SEGMENTS, shade_smooth=False):
    obj.data.materials.append(material)
    if bevel:
        b = obj.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = segments
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(40)
    if shade_smooth:
        bpy.ops.object.shade_smooth()
    return obj


def cyl(r, h, loc=(0, 0, 0), rot=(0, 0, 0), verts=48, material=None, bevel=0.012, smooth=True):
    # An 8-vertex cylinder is a deliberate octagon in several models, so a
    # low count is kept exactly rather than scaled into a different shape.
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts if verts <= 12 else seg(verts, 12),
                                        radius=r, depth=h, location=loc, rotation=rot)
    o = bpy.context.object
    if smooth:
        bpy.ops.object.shade_smooth()
        o.data.use_auto_smooth = True
        o.data.auto_smooth_angle = math.radians(35)
    return finish(o, material, bevel)


def box(size, loc=(0, 0, 0), rot=(0, 0, 0), material=None, bevel=0.014):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, material, bevel)


def ball(r, loc=(0, 0, 0), material=None, segments=32):
    segments = seg(segments, 10)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segments, ring_count=segments // 2)
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    return finish(o, material, 0)


def ring(major, minor, loc=(0, 0, 0), rot=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, location=loc, rotation=rot,
        major_segments=seg(52, 16), minor_segments=seg(14, 6))
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    return finish(o, material, 0)


def cone(r1, r2, h, loc=(0, 0, 0), rot=(0, 0, 0), material=None, verts=40):
    bpy.ops.mesh.primitive_cone_add(vertices=verts if verts <= 8 else seg(verts, 10),
                                    radius1=r1, radius2=r2, depth=h, location=loc, rotation=rot)
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    o.data.use_auto_smooth = True
    o.data.auto_smooth_angle = math.radians(35)
    return finish(o, material, 0.01)


def polar(n, radius, z, fn):
    """Place fn(index, x, y, angle) evenly around a circle."""
    for i in range(n):
        a = i * math.tau / n
        fn(i, math.cos(a) * radius, math.sin(a) * radius, a)


# --------------------------------------------------------------------- scene

def setup_scene(ortho=ORTHO):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    # The distribution build ships without OpenImageDenoise, so lean on adaptive
    # sampling instead of a denoise pass.
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.01
    scene.cycles.max_bounces = 6
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 90
    # Standard, not Filmic: these are game sprites, so the authored albedo should
    # survive to the canvas instead of being tone-mapped towards white.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    # Slightly under-expose: sprites are composited over a bright desert, and
    # blown highlights cost more readability than crushed shadows do.
    scene.view_settings.exposure = -0.45

    # A thin dark contour gives the renders the same illustrative edge as the
    # hand-drawn scenery they sit on.
    scene.render.use_freestyle = True
    vl = scene.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(132)
    lineset = fs.linesets.new("outline")
    lineset.select_silhouette = True
    lineset.select_border = True
    lineset.select_crease = True
    style = lineset.linestyle
    style.color = (0.035, 0.048, 0.070)
    style.thickness = 1.9
    style.alpha = 0.92

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.20, 0.26, 0.36, 1.0)
    bg.inputs[1].default_value = 0.30

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = (0, 0, 9)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def light(kind, name, loc, rot, energy, color, size=3.0):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        d.color = color
        if kind == "AREA":
            d.size = size
        if kind == "SUN":
            d.angle = math.radians(14)
        o = bpy.data.objects.new(name, d)
        o.location = loc
        o.rotation_euler = Euler(rot)
        scene.collection.objects.link(o)
        return o

    # Key light sits up and to the screen's upper-left so every static base
    # sprite carries the same shadow direction as the hand-drawn scenery.
    light("SUN", "key", (-3, 3.4, 6), (math.radians(36), 0, math.radians(-138)), 2.1, (1.0, 0.95, 0.86))
    light("AREA", "fill", (2.4, -2.2, 3.6), (math.radians(32), 0, math.radians(48)), 55, (0.60, 0.76, 1.0), 5.0)
    light("AREA", "top", (0, 0, 4.4), (0, 0, 0), 70, (1.0, 0.98, 0.94), 4.5)
    light("AREA", "rim", (0, 2.8, 1.2), (math.radians(74), 0, 0), 35, (0.52, 0.84, 1.0), 3.5)


def shadow_catcher():
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -0.001))
    p = bpy.context.object
    p.is_shadow_catcher = True
    return p


def render(name, resolution, note="", ortho=ORTHO):
    scene = bpy.context.scene
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    path = os.path.join(OUT, name + ".png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    MANIFEST["parts"][name] = {
        "file": name + ".png",
        "size": resolution,
        # The runtime scales every sprite by this, so parts may be framed
        # individually without the game needing to know which is which.
        "pixelsPerUnit": round(resolution / ortho, 3),
        "note": note,
    }
    print("rendered", name)


def export_gltf(name, ortho=ORTHO):
    """Write the current scene's geometry as a .glb.

    Only the meshes go: no camera, no lights, no shadow catcher, because the
    3D stage lights and frames the scene itself. Materials survive the trip -
    glTF carries base colour, metallic, roughness and emission natively, which
    is exactly the set the Principled BSDF above uses."""
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,          # bake the bevel and mirror modifiers in
        export_yup=True,            # Blender is Z-up, three.js is Y-up
        export_cameras=False,
        export_lights=False,
    )
    # The camera span each part was framed in. The 2D layer draws a sprite at a
    # width in pixels; dividing by this gives pixels-per-Blender-unit, which is
    # what the 3D stage needs to place the same model at the same size.
    MODELS[name] = {"file": name + ".glb", "ortho": ortho}
    print("exported", name)


def build(name, resolution, fn, catcher=True, note="", ortho=ORTHO):
    if ONLY and not any(name.startswith(p) for p in ONLY):
        return
    clear()
    if GLTF:
        # No scene setup at all: a shadow catcher plane and a set of lights
        # would otherwise be exported as part of the model.
        fn()
        export_gltf(name, ortho)
        return
    setup_scene(ortho)
    if catcher:
        shadow_catcher()
    fn()
    render(name, resolution, note, ortho)


# ------------------------------------------------------------------ palettes

PAL = {
    "gun":    {"hull": (0.09, 0.12, 0.16), "plate": (0.20, 0.28, 0.36), "trim": (0.06, 0.42, 0.72), "glow": (0.24, 0.72, 1.0)},
    "cannon": {"hull": (0.13, 0.08, 0.06), "plate": (0.44, 0.22, 0.09), "trim": (0.82, 0.32, 0.05), "glow": (1.0, 0.48, 0.10)},
    "frost":  {"hull": (0.08, 0.16, 0.22), "plate": (0.24, 0.42, 0.54), "trim": (0.12, 0.55, 0.76), "glow": (0.40, 0.86, 1.0)},
    "arc":    {"hull": (0.11, 0.08, 0.19), "plate": (0.26, 0.21, 0.42), "trim": (0.42, 0.16, 0.86), "glow": (0.66, 0.36, 1.0)},
    "flak":   {"hull": (0.16, 0.13, 0.06), "plate": (0.40, 0.34, 0.16), "trim": (0.86, 0.62, 0.10), "glow": (1.0, 0.82, 0.28)},
    "rail":   {"hull": (0.10, 0.13, 0.15), "plate": (0.34, 0.41, 0.46), "trim": (0.70, 0.92, 1.0), "glow": (0.80, 0.96, 1.0)},
    "void":   {"hull": (0.10, 0.05, 0.13), "plate": (0.28, 0.14, 0.34), "trim": (0.86, 0.16, 0.62), "glow": (1.0, 0.34, 0.80)},
}

STEEL = (0.30, 0.33, 0.36)
DARK = (0.07, 0.08, 0.10)
GOLD = (0.95, 0.72, 0.20)


# --------------------------------------------------------------- tower bases

def tower_base(kind, level):
    """The static platform a turret sits on.

    It never rotates, so it may carry a baked directional shadow, asymmetric
    detail, and the wide concentric rings that would read as ground decals if
    they were attached to the spinning turret instead."""
    p = PAL[kind]
    hull = mat("hull", p["hull"], 0.45, 0.48)
    plate = mat("plate", p["plate"], 0.62, 0.34)
    trim = mat("trim", p["trim"], 0.25, 0.30, p["glow"], 1.1)
    dark = mat("dark", DARK, 0.35, 0.60)
    steel = mat("steel", STEEL, 0.85, 0.30)

    # Foundation pad: an octagon reads as "built" rather than "drawn".
    cyl(1.04 + level * 0.012, 0.10, (0, 0, 0.05), verts=8, material=dark, bevel=0.03, smooth=False)
    cyl(0.95, 0.14, (0, 0, 0.13), verts=8, material=hull, bevel=0.03, smooth=False)
    ring(0.91, 0.048, (0, 0, 0.21), material=steel)

    # Deck, left broad so the family colour survives under the turret.
    cyl(0.78, 0.18, (0, 0, 0.25), material=plate)
    ring(0.60, 0.05, (0, 0, 0.35), material=trim)
    cyl(0.44, 0.07, (0, 0, 0.35), material=dark)

    # Anchor bolts around the foundation.
    polar(8, 0.87, 0, lambda i, x, y, a: cyl(0.058, 0.10, (x, y, 0.23), material=steel, bevel=0.006))

    # Armour wedges grow with the level so upgrades read at a glance.
    polar(4 + level, 0.80, 0, lambda i, x, y, a: box((0.22, 0.11, 0.15), (x, y, 0.28), (0, 0, a), material=plate))

    # Level pips: emissive studs along the front lip.
    for i in range(level):
        a = math.radians(-54 + i * 36)
        cyl(0.055, 0.06, (math.cos(a) * 0.69, math.sin(a) * 0.69, 0.37), material=trim, bevel=0.008)

    # A veteran platform gets buttresses and a gilded collar.
    if level >= 3:
        polar(4, 0.90, 0, lambda i, x, y, a: box((0.20, 0.34, 0.20), (x, y, 0.22), (0, 0, a + math.pi / 4), material=hull))
    if level >= 4:
        ring(1.06, 0.055, (0, 0, 0.12), material=mat("gold", GOLD, 0.85, 0.28, GOLD, 0.5))
        polar(8, 1.02, 0, lambda i, x, y, a: cyl(0.05, 0.14, (x, y, 0.20), material=trim, bevel=0.006))


# ------------------------------------------------------------------- turrets
#
# Every turret is modelled for a camera looking straight down, so silhouette
# does all the work: mass at the pivot, a clear forward axis along +X, and
# side detail wide enough to survive at 70 screen pixels.  Vertical stacks and
# ground-plane rings belong on the base, not here -- from above they collapse
# into circles that read as decals.

def _yoke(p, width=0.52, length=0.44):
    hull = mat("hull", p["hull"], 0.45, 0.45)
    plate = mat("plate", p["plate"], 0.60, 0.34)
    box((length, width, 0.30), (-0.06, 0, 0.54), material=hull)
    cyl(0.29, 0.26, (-0.06, 0, 0.57), material=plate)
    return hull, plate


def turret_gun(level):
    p = PAL["gun"]
    hull, _ = _yoke(p)
    steel = mat("steel", STEEL, 0.90, 0.26)
    trim = mat("trim", p["trim"], 0.25, 0.28, p["glow"], 1.2)
    length = 0.64 + level * 0.08
    for side in (-1, 1):
        cyl(0.075, length, (0.30 + length / 2 - 0.16, side * 0.12, 0.56),
            rot=(0, math.radians(90), 0), material=steel, bevel=0.008)
        cyl(0.105, 0.11, (0.30 + length - 0.14, side * 0.12, 0.56),
            rot=(0, math.radians(90), 0), material=hull, bevel=0.01)
    box((0.28, 0.36, 0.14), (0.16, 0, 0.72), material=steel)
    box((0.16, 0.20, 0.08), (0.06, 0, 0.80), material=trim)
    if level >= 2:
        for side in (-1, 1):  # ammunition drums
            cyl(0.14, 0.26, (-0.18, side * 0.32, 0.54), rot=(math.radians(90), 0, 0), material=hull)
            cyl(0.06, 0.28, (-0.18, side * 0.32, 0.54), rot=(math.radians(90), 0, 0), material=trim)
    if level >= 3:
        box((0.56, 0.09, 0.07), (0.26, 0, 0.74), material=trim)
        for side in (-1, 1):
            box((0.30, 0.10, 0.10), (0.30, side * 0.26, 0.66), material=steel)
    if level >= 4:
        cyl(0.055, 1.00, (0.74, 0, 0.74), rot=(0, math.radians(90), 0), material=steel, bevel=0.006)
        cyl(0.095, 0.14, (1.20, 0, 0.74), rot=(0, math.radians(90), 0), material=trim, bevel=0.01)


def turret_cannon(level):
    p = PAL["cannon"]
    hull, plate = _yoke(p, width=0.56, length=0.46)
    steel = mat("steel", (0.26, 0.26, 0.28), 0.88, 0.34)
    trim = mat("trim", p["trim"], 0.30, 0.30, p["glow"], 1.2)
    bore = 0.175 + level * 0.012
    length = 0.74 + level * 0.07
    # Mantlet, then a tapered bore that flares into a muzzle brake.
    box((0.32, 0.50, 0.34), (0.19, 0, 0.58), material=plate)
    cone(bore, bore * 0.86, length, (0.35 + length / 2, 0, 0.58), (0, math.radians(90), 0), material=steel)
    cyl(bore * 1.36, 0.17, (0.35 + length - 0.04, 0, 0.58), rot=(0, math.radians(90), 0), material=hull, bevel=0.014)
    cyl(bore * 0.72, 0.06, (0.35 + length + 0.03, 0, 0.58), rot=(0, math.radians(90), 0),
        material=mat("bore", (0.02, 0.02, 0.03), 0.2, 0.9))
    # Recoil cylinders flank the bore and give the top-down view its width.
    for side in (-1, 1):
        cyl(0.06, 0.56, (0.36, side * 0.22, 0.76), rot=(0, math.radians(90), 0), material=steel, bevel=0.006)
        cyl(0.075, 0.09, (0.62, side * 0.22, 0.76), rot=(0, math.radians(90), 0), material=trim, bevel=0.008)
    if level >= 2:
        for side in (-1, 1):
            box((0.24, 0.14, 0.22), (-0.18, side * 0.32, 0.54), material=hull)
    if level >= 3:
        for side in (-1, 1):  # ready shells racked along the hull
            for j in range(3):
                cyl(0.05, 0.22, (-0.24 + j * 0.11, side * 0.32, 0.68),
                    rot=(0, math.radians(90), 0), material=trim, bevel=0.005)
    if level >= 4:
        box((0.20, 0.62, 0.16), (0.34, 0, 0.78), material=trim)
        cyl(bore * 1.5, 0.11, (0.35 + length * 0.55, 0, 0.58), rot=(0, math.radians(90), 0), material=hull, bevel=0.01)


def turret_frost(level):
    p = PAL["frost"]
    hull, plate = _yoke(p, width=0.50, length=0.42)
    ice = mat("ice", (0.30, 0.62, 0.80), 0.10, 0.12, p["glow"], 0.55)
    pipe = mat("pipe", (0.26, 0.38, 0.46), 0.90, 0.24)
    trim = mat("trim", p["trim"], 0.25, 0.28, p["glow"], 1.0)
    # A forward crystal lance flanked by swept vanes: the whole shape points +X
    # even when flattened by the overhead camera.
    cone(0.23, 0.03, 0.74, (0.48, 0, 0.66), (0, math.radians(90), 0), material=ice)
    box((0.30, 0.34, 0.24), (0.20, 0, 0.66), material=plate)
    for side in (-1, 1):
        cone(0.12, 0.02, 0.52, (0.40, side * 0.26, 0.60), (0, math.radians(90), math.radians(side * -26)), material=ice)
        cyl(0.055, 0.46, (0.14, side * 0.27, 0.52), rot=(0, math.radians(90), 0), material=pipe, bevel=0.006)
    if level >= 2:
        for side in (-1, 1):  # coolant tanks
            cyl(0.12, 0.30, (-0.20, side * 0.30, 0.54), rot=(0, math.radians(90), 0), material=pipe)
            cyl(0.055, 0.32, (-0.20, side * 0.30, 0.54), rot=(0, math.radians(90), 0), material=trim)
    if level >= 3:
        for side in (-1, 1):
            cone(0.09, 0.02, 0.40, (0.30, side * 0.42, 0.56), (0, math.radians(90), math.radians(side * -44)), material=ice)
    if level >= 4:
        cone(0.13, 0.02, 0.44, (0.36, 0, 0.94), (0, math.radians(90), math.radians(-20)), material=ice)
        box((0.18, 0.56, 0.10), (0.06, 0, 0.82), material=trim)


def turret_arc(level):
    p = PAL["arc"]
    hull, plate = _yoke(p, width=0.54, length=0.46)
    coil = mat("coil", (0.72, 0.36, 0.08), 0.55, 0.34)
    glow = mat("glow", (0.48, 0.20, 0.92), 0.10, 0.18, p["glow"], 0.75)
    steel = mat("steel", STEEL, 0.88, 0.28)
    # Three forward emitter prongs at staggered reach make the chain direction
    # unmistakable from above; the coils wrap the prongs rather than stacking up.
    reach = (0.62, 0.80, 0.62)
    for i, side in enumerate((-1, 0, 1)):
        cyl(0.045, reach[i], (0.28 + reach[i] / 2, side * 0.22, 0.64),
            rot=(0, math.radians(90), 0), material=steel, bevel=0.005)
        ball(0.095, (0.28 + reach[i], side * 0.22, 0.64), material=glow)
        for j in range(2 + level // 2):
            cyl(0.085, 0.045, (0.36 + j * 0.13, side * 0.22, 0.64),
                rot=(0, math.radians(90), 0), material=coil, bevel=0.006)
    box((0.26, 0.62, 0.18), (0.20, 0, 0.72), material=plate)
    if level >= 2:
        for side in (-1, 1):  # capacitor banks
            box((0.28, 0.16, 0.24), (-0.20, side * 0.32, 0.56), material=hull)
            box((0.20, 0.07, 0.07), (-0.20, side * 0.32, 0.70), material=glow)
    if level >= 3:
        for side in (-1, 1):
            cyl(0.04, 0.44, (0.30, side * 0.40, 0.60), rot=(0, math.radians(90), 0), material=steel, bevel=0.005)
            ball(0.075, (0.52, side * 0.40, 0.60), material=glow)
    if level >= 4:
        box((0.34, 0.34, 0.20), (-0.06, 0, 0.84), material=hull)
        ball(0.15, (-0.06, 0, 1.00), material=glow)


def turret_flak(level):
    """Anti-air battery: twin autocannons on a high elevated mount.

    An overhead camera foreshortens elevation to nothing, so the barrels are
    pitched only slightly and instead say "anti-air" through shape: long thin
    tubes with muzzle brakes, a stepped riser that lifts them clear of the
    deck, an exposed ammunition drum, and a radar dish - none of which any
    ground turret in this set has."""
    p = PAL["flak"]
    hull, plate = _yoke(p, width=0.56, length=0.44)
    steel = mat("steel", STEEL, 0.88, 0.28)
    brass = mat("brass", (0.72, 0.54, 0.16), 0.80, 0.30)
    trim = mat("trim", p["trim"], 0.30, 0.28, p["glow"], 1.2)
    dark = mat("dark", DARK, 0.35, 0.60)

    # A riser under the cradle: the reason the barrels clear everything else.
    box((0.34, 0.50, 0.30), (-0.04, 0, 0.62), material=hull)
    box((0.40, 0.66, 0.20), (0.06, 0, 0.80), material=plate)

    # Twin barrels: long, thin and only gently pitched, so they stay long on
    # screen while the shallow rise still separates them from the deck.
    for side in (-1, 1):
        cyl(0.055, 0.96, (0.60, side * 0.21, 0.94), rot=(0, math.radians(78), 0),
            material=steel, bevel=0.006)
        for j in range(3):                                   # muzzle brake vents
            cyl(0.085, 0.035, (0.86 + j * 0.09, side * 0.21, 1.00),
                rot=(0, math.radians(78), 0), material=dark, bevel=0.005)
        cyl(0.095, 0.10, (1.06, side * 0.21, 1.04), rot=(0, math.radians(78), 0),
            material=trim, bevel=0.01)
        box((0.20, 0.13, 0.12), (0.22, side * 0.21, 0.90), material=dark)   # breech

    cyl(0.19, 0.24, (-0.26, 0, 0.86), material=brass, bevel=0.02)           # ammo drum
    ring(0.19, 0.045, (-0.26, 0, 0.99), material=trim)
    for i in range(6):                                                      # shell belt
        a = math.radians(i * 60)
        cyl(0.03, 0.09, (-0.26 + math.cos(a) * 0.13, math.sin(a) * 0.13, 1.02), material=brass)

    if level >= 2:                                                          # radar dish
        cyl(0.035, 0.26, (-0.40, 0.30, 0.82), material=steel, bevel=0.004)
        cone(0.26, 0.05, 0.14, (-0.40, 0.30, 0.98), (math.radians(28), 0, 0), material=plate)
        ball(0.05, (-0.40, 0.30, 1.04), material=trim)
    if level >= 3:
        for side in (-1, 1):                                                # loader boxes
            box((0.30, 0.16, 0.20), (-0.10, side * 0.42, 0.70), material=hull)
            box((0.22, 0.07, 0.06), (-0.10, side * 0.42, 0.82), material=trim)
    if level >= 4:                                                          # third barrel
        cyl(0.058, 0.92, (0.58, 0, 1.14), rot=(0, math.radians(80), 0), material=steel, bevel=0.006)
        cyl(0.095, 0.10, (1.02, 0, 1.22), rot=(0, math.radians(80), 0), material=trim, bevel=0.01)
        box((0.26, 0.30, 0.14), (0.10, 0, 1.06), material=plate)


def turret_rail(level):
    """Unlockable long-range gun: one enormous accelerator down the +X axis.

    Where the flak battery says "up", this says "far".  The whole model is a
    single unbroken line from breech to muzzle, longer than any other turret
    in the set, with the capacitor mass pulled back behind the pivot so the
    barrel visibly outweighs its own mounting."""
    p = PAL["rail"]
    hull, plate = _yoke(p, width=0.50, length=0.40)
    steel = mat("steel", (0.42, 0.47, 0.52), 0.92, 0.22)
    trim = mat("trim", p["trim"], 0.20, 0.20, p["glow"], 1.4)
    dark = mat("dark", DARK, 0.35, 0.58)

    # Twin rails with a lit accelerator gap running between them.
    for side in (-1, 1):
        box((1.50, 0.09, 0.11), (0.52, side * 0.11, 0.64), material=steel)
        box((0.14, 0.11, 0.13), (1.22, side * 0.11, 0.64), material=dark)
    box((1.34, 0.05, 0.05), (0.48, 0, 0.64), material=trim)

    # Breech and capacitor mass, counterweighted behind the pivot.
    box((0.40, 0.40, 0.26), (-0.10, 0, 0.62), material=plate)
    for side in (-1, 1):
        cyl(0.13, 0.34, (-0.34, side * 0.20, 0.60), rot=(0, math.radians(90), 0), material=hull)
        cyl(0.06, 0.36, (-0.34, side * 0.20, 0.60), rot=(0, math.radians(90), 0), material=trim)
    box((0.20, 0.52, 0.14), (-0.52, 0, 0.62), material=plate)

    if level >= 2:                                   # rangefinder mast
        cyl(0.03, 0.24, (0.10, 0.26, 0.76), material=steel, bevel=0.004)
        box((0.16, 0.07, 0.07), (0.16, 0.26, 0.88), material=trim)
    if level >= 3:                                   # heat sinks along the rails
        for side in (-1, 1):
            for j in range(4):
                box((0.06, 0.20, 0.14), (0.20 + j * 0.26, side * 0.11, 0.72), material=plate)
    if level >= 4:                                   # second stage on the muzzle
        for side in (-1, 1):
            box((0.40, 0.08, 0.09), (1.44, side * 0.11, 0.64), material=steel)
        ring(0.20, 0.05, (1.30, 0, 0.64), rot=(0, math.radians(90), 0), material=trim)
        box((0.26, 0.36, 0.18), (-0.14, 0, 0.84), material=hull)


def turret_void(level):
    """Unlockable area denier: a caged singularity on a three-pronged claw.

    It has no barrel at all, which is the point - among a set of guns, the one
    silhouette with nothing pointing out of it reads instantly as "not a gun".
    The claw is modelled *above* the orb rather than beside it, because from
    directly overhead anything at the orb's own height is simply swallowed by
    it, and the forward prong is longer than the other two so the tower still
    has a facing at 40 pixels."""
    p = PAL["void"]
    hull, plate = _yoke(p, width=0.58, length=0.48)
    core = mat("core", (0.90, 0.14, 0.60), 0.05, 0.12, p["glow"], 2.4)
    trim = mat("trim", p["trim"], 0.25, 0.26, p["glow"], 1.1)
    steel = mat("steel", (0.34, 0.29, 0.38), 0.88, 0.30)

    cyl(0.34, 0.22, (0, 0, 0.52), verts=6, material=hull, bevel=0.03, smooth=False)
    ball(0.26, (0, 0, 0.74), material=core)                    # the singularity

    # Claw arms, rising over the orb and closing above it. Drawn last and
    # highest so they stay on top of the glow instead of behind it.
    for angle, reach in ((0, 0.86), (128, 0.62), (-128, 0.62)):
        r = math.radians(angle)
        for t, z, w in ((0.55, 0.72, 0.15), (0.92, 0.98, 0.12)):
            box((reach * 0.62, w, 0.13), (math.cos(r) * reach * t, math.sin(r) * reach * t, z),
                (0, math.radians(-30), r), material=steel)
        ball(0.10, (math.cos(r) * reach, math.sin(r) * reach, 0.66), material=trim)
    # The forward prong gets a lance tip so front and back never look alike.
    cone(0.11, 0.02, 0.30, (1.02, 0, 0.66), (0, math.radians(96), 0), material=trim)

    # Containment rings, tilted so they read as a cage rather than a plate.
    ring(0.42, 0.045, (0, 0, 0.74), rot=(math.radians(62), 0, 0), material=steel)
    ring(0.42, 0.045, (0, 0, 0.74), rot=(math.radians(62), 0, math.radians(90)), material=steel)

    if level >= 2:
        ring(0.52, 0.04, (0, 0, 0.74), material=trim)
    if level >= 3:
        polar(6, 0.56, math.radians(30),
              lambda i, x, y, a: cyl(0.055, 0.22, (x, y, 0.58), material=trim, bevel=0.006))
    if level >= 4:
        # A wider outer ring, not a bigger ball: the orb must not grow enough
        # to swallow the claw it is caged by.
        ring(0.68, 0.05, (0, 0, 0.80), rot=(math.radians(24), 0, 0), material=trim)
        for angle in (52, 180, -52):
            r = math.radians(angle)
            ball(0.09, (math.cos(r) * 0.68, math.sin(r) * 0.68, 0.88), material=core)


TURRETS = {"gun": turret_gun, "cannon": turret_cannon, "frost": turret_frost,
           "arc": turret_arc, "flak": turret_flak, "rail": turret_rail, "void": turret_void}


# --------------------------------------------------------------------- enemy
#
# Same overhead-camera discipline as the turrets, and it matters more here: a
# unit is 30-60px on screen.  Detail therefore goes on the *top* surface, the
# forward axis pokes past the body outline in +X, and limbs break the silhouette
# in +/-Y.  Anything modelled at low z simply disappears under the torso.

def _eye(color=(0.85, 1.0, 0.55), strength=1.3):
    return mat("eye", color, 0.05, 0.2, color, strength)


def enemy_grunt():
    body = mat("b", (0.16, 0.52, 0.24), 0.25, 0.50)
    dark = mat("d", (0.06, 0.18, 0.10), 0.30, 0.62)
    steel = mat("s", (0.22, 0.24, 0.24), 0.85, 0.36)
    eye = _eye()
    # Legs and boots sit wide so they clear the torso from directly above.
    for side in (-1, 1):
        box((0.40, 0.15, 0.14), (-0.14, side * 0.34, 0.14), material=dark)
        box((0.17, 0.19, 0.12), (0.10, side * 0.36, 0.16), material=steel)
    cyl(0.27, 0.24, (-0.06, 0, 0.30), material=body)           # torso
    for side in (-1, 1):                                        # shoulder plates
        box((0.24, 0.15, 0.14), (-0.04, side * 0.27, 0.40), material=steel)
    box((0.22, 0.30, 0.15), (-0.31, 0, 0.36), material=dark)    # pack
    ball(0.155, (0.16, 0, 0.50), material=mat("h", (0.30, 0.68, 0.36), 0.2, 0.5))
    box((0.09, 0.19, 0.08), (0.27, 0, 0.52), material=eye)      # visor faces +X
    # Rifle breaks the outline forward and to one side.
    cyl(0.042, 0.58, (0.44, -0.25, 0.42), rot=(0, math.radians(90), 0), material=steel, bevel=0.005)
    box((0.15, 0.10, 0.10), (0.14, -0.25, 0.42), material=dark)


def enemy_scout():
    body = mat("b", (0.38, 0.78, 0.26), 0.35, 0.40)
    dark = mat("d", (0.08, 0.24, 0.10), 0.35, 0.52)
    steel = mat("s", (0.26, 0.30, 0.28), 0.88, 0.32)
    eye = _eye((0.92, 1.0, 0.50), 1.6)
    cone(0.26, 0.05, 0.88, (0.16, 0, 0.26), (0, math.radians(90), 0), material=body)
    box((0.34, 0.20, 0.14), (-0.10, 0, 0.38), material=dark)      # spine
    for side in (-1, 1):                                          # swept fins
        box((0.46, 0.30, 0.07), (-0.14, side * 0.28, 0.26), (0, 0, math.radians(side * -26)), material=dark)
        cyl(0.09, 0.22, (-0.34, side * 0.20, 0.24), rot=(0, math.radians(90), 0), material=steel)
        ball(0.055, (-0.45, side * 0.20, 0.24), material=eye)     # thrusters
    box((0.12, 0.16, 0.08), (0.22, 0, 0.42), material=eye)


def enemy_armored():
    body = mat("b", (0.12, 0.46, 0.26), 0.40, 0.44)
    plate = mat("p", (0.34, 0.40, 0.37), 0.88, 0.32)
    trim = mat("t", (0.55, 0.62, 0.58), 0.90, 0.28)
    eye = _eye((1.0, 0.66, 0.28), 1.4)
    cyl(0.52, 0.30, (-0.04, 0, 0.24), verts=6, material=body, bevel=0.03, smooth=False)
    # One clean raised spine along the travel axis, and nothing else on top —
    # crossed detail at this size just reads as noise.
    box((0.92, 0.20, 0.20), (0.04, 0, 0.44), material=plate)
    cyl(0.13, 0.16, (-0.30, 0, 0.54), material=trim, bevel=0.012)
    for side in (-1, 1):
        box((0.74, 0.13, 0.28), (-0.04, side * 0.50, 0.20), material=plate)   # side skirts
    # A blunt arrowhead glacis pushes past the hull and fixes the facing.
    cone(0.40, 0.10, 0.42, (0.62, 0, 0.30), (0, math.radians(90), 0), verts=4, material=plate)
    for side in (-1, 1):
        ball(0.06, (0.52, side * 0.22, 0.42), material=eye)


def enemy_heavy():
    body = mat("b", (0.09, 0.38, 0.22), 0.42, 0.46)
    plate = mat("p", (0.26, 0.30, 0.28), 0.90, 0.32)
    tread = mat("t", (0.09, 0.10, 0.11), 0.35, 0.78)
    hot = _eye((1.0, 0.42, 0.18), 1.8)
    box((1.02, 0.78, 0.36), (0, 0, 0.26), material=body)
    for side in (-1, 1):
        box((1.18, 0.26, 0.34), (-0.02, side * 0.56, 0.22), material=plate)
        for j in range(6):                                        # tread blocks, on top
            box((0.10, 0.30, 0.10), (-0.48 + j * 0.19, side * 0.56, 0.40), material=tread)
    box((0.52, 0.52, 0.20), (-0.06, 0, 0.50), material=plate)      # turret ring
    cyl(0.26, 0.22, (-0.02, 0, 0.60), material=body)
    cyl(0.10, 0.62, (0.44, 0, 0.62), rot=(0, math.radians(90), 0), material=plate, bevel=0.008)
    cyl(0.14, 0.10, (0.72, 0, 0.62), rot=(0, math.radians(90), 0), material=tread, bevel=0.01)
    box((0.30, 0.66, 0.16), (0.52, 0, 0.28), (0, math.radians(-20), 0), material=plate)
    for side in (-1, 1):
        ball(0.075, (-0.44, side * 0.24, 0.50), material=hot)      # exhausts


def enemy_boss():
    body = mat("b", (0.07, 0.32, 0.20), 0.50, 0.42)
    plate = mat("p", (0.24, 0.28, 0.27), 0.90, 0.30)
    core = mat("c", (0.90, 0.22, 0.16), 0.10, 0.15, (1.0, 0.30, 0.20), 2.2)
    gold = mat("g", GOLD, 0.92, 0.24, GOLD, 0.6)
    cyl(0.96, 0.52, (0, 0, 0.34), verts=8, material=body, bevel=0.04, smooth=False)
    ring(0.94, 0.09, (0, 0, 0.60), material=plate)
    cyl(0.52, 0.28, (0, 0, 0.72), verts=8, material=plate, bevel=0.03, smooth=False)
    ball(0.28, (0, 0, 0.92), material=core)
    box((0.58, 1.28, 0.30), (0.66, 0, 0.44), (0, math.radians(-14), 0), material=plate)
    for side in (-1, 1):
        cyl(0.15, 0.88, (0.66, side * 0.44, 0.62), rot=(0, math.radians(90), 0), material=plate)
        ball(0.13, (1.08, side * 0.44, 0.62), material=core)
        box((0.34, 0.34, 0.62), (-0.62, side * 0.66, 0.42), (0, 0, math.radians(side * 30)), material=plate)
    polar(8, 0.90, 0, lambda i, x, y, a: cyl(0.07, 0.16, (x, y, 0.68), material=gold, bevel=0.008))


def enemy_splitter():
    """Splits into mites when killed, so the seam is the whole read."""
    body = mat("b", (0.14, 0.50, 0.42), 0.30, 0.46)
    shell = mat("s", (0.30, 0.60, 0.52), 0.55, 0.38)
    seam = _eye((0.55, 1.0, 0.85), 1.5)
    dark = mat("d", (0.05, 0.20, 0.17), 0.30, 0.60)
    for side in (-1, 1):
        # Two half-shells with a lit gap between them.
        cyl(0.44, 0.34, (-0.02, side * 0.20, 0.28), material=shell)
        box((0.60, 0.16, 0.20), (0.02, side * 0.42, 0.30), material=body)
        box((0.30, 0.13, 0.12), (-0.30, side * 0.30, 0.20), material=dark)
    box((0.86, 0.10, 0.24), (0.02, 0, 0.34), material=seam)
    cone(0.26, 0.05, 0.34, (0.52, 0, 0.30), (0, math.radians(90), 0), verts=4, material=body)
    ball(0.10, (0.30, 0, 0.48), material=seam)


def enemy_mite():
    """What a splitter leaves behind: small, fast, and mostly legs."""
    body = mat("b", (0.36, 0.74, 0.44), 0.25, 0.48)
    dark = mat("d", (0.08, 0.26, 0.16), 0.30, 0.58)
    eye = _eye((0.80, 1.0, 0.55), 1.6)
    for side in (-1, 1):
        for j, ang in enumerate((34, -12)):
            box((0.34, 0.09, 0.08), (-0.06 + j * 0.16, side * 0.28, 0.10),
                (0, 0, math.radians(side * ang)), material=dark)
    ball(0.26, (0, 0, 0.26), material=body)
    bpy.context.object.scale = (1.15, 0.92, 0.72)
    cone(0.14, 0.02, 0.26, (0.30, 0, 0.24), (0, math.radians(90), 0), material=dark)
    ball(0.075, (0.14, 0, 0.38), material=eye)


def enemy_surger():
    """Storm-charged: arc nodes ride on top where the camera can see them."""
    body = mat("b", (0.16, 0.46, 0.62), 0.35, 0.36)
    fin = mat("f", (0.28, 0.62, 0.76), 0.55, 0.30)
    spark = _eye((0.55, 0.92, 1.0), 2.0)
    dark = mat("d", (0.06, 0.18, 0.26), 0.35, 0.55)
    cone(0.32, 0.06, 0.86, (0.12, 0, 0.28), (0, math.radians(90), 0), material=body)
    for side in (-1, 1):
        box((0.50, 0.34, 0.08), (-0.08, side * 0.30, 0.30), (0, 0, math.radians(side * -30)), material=fin)
        ball(0.075, (-0.26, side * 0.42, 0.36), material=spark)
    box((0.46, 0.16, 0.14), (0.02, 0, 0.44), material=dark)
    for j in range(3):
        ball(0.07, (-0.14 + j * 0.20, 0, 0.54), material=spark)
    box((0.20, 0.24, 0.10), (-0.34, 0, 0.30), material=dark)


def enemy_warden():
    """Carries a shield wider than its hull; that overhang is the silhouette."""
    body = mat("b", (0.20, 0.16, 0.34), 0.45, 0.44)
    plate = mat("p", (0.36, 0.34, 0.48), 0.88, 0.30)
    shield = mat("s", (0.52, 0.44, 0.72), 0.70, 0.26)
    glow = _eye((0.72, 0.52, 1.0), 1.5)
    cyl(0.46, 0.34, (-0.10, 0, 0.26), verts=8, material=body, bevel=0.03, smooth=False)
    box((0.66, 0.26, 0.20), (-0.10, 0, 0.44), material=plate)
    for side in (-1, 1):
        box((0.44, 0.16, 0.24), (-0.16, side * 0.40, 0.24), material=plate)
    # Shield: a broad slab standing proud of the nose.
    box((0.20, 1.16, 0.44), (0.46, 0, 0.32), material=shield)
    box((0.10, 1.00, 0.10), (0.58, 0, 0.50), material=glow)
    for side in (-1, 1):
        box((0.16, 0.16, 0.30), (0.46, side * 0.50, 0.36), material=plate)
    ball(0.09, (-0.10, 0, 0.50), material=glow)


# (builder, resolution, ortho framing) — each unit is framed to fill its sprite.
def enemy_drone():
    """Flying scout. Rotors and a cast shadow are the whole read: from above a
    flier must not be mistakable for something walking the road."""
    body = mat("b", (0.20, 0.58, 0.52), 0.35, 0.42)
    dark = mat("d", (0.05, 0.20, 0.20), 0.35, 0.55)
    steel = mat("s", (0.28, 0.32, 0.32), 0.88, 0.30)
    eye = _eye((0.60, 1.0, 0.90), 1.6)
    # Fuselage rides high; the rotors are the widest thing and sit higher still.
    cone(0.20, 0.06, 0.66, (0.10, 0, 0.72), (0, math.radians(90), 0), material=body)
    box((0.26, 0.22, 0.14), (-0.16, 0, 0.78), material=dark)
    for side in (-1, 1):
        for fx in (0.24, -0.26):
            cyl(0.035, 0.16, (fx, side * 0.34, 0.74), material=steel, bevel=0.004)
            ring(0.20, 0.028, (fx, side * 0.38, 0.86), material=steel)   # rotor guard
            for blade in range(2):
                box((0.36, 0.05, 0.018), (fx, side * 0.38, 0.87),
                    (0, 0, math.radians(38 + blade * 90)), material=dark)
    ball(0.075, (0.34, 0, 0.74), material=eye)                            # nose sensor
    for side in (-1, 1):
        ball(0.04, (-0.30, side * 0.14, 0.70), material=eye)


def enemy_gunship():
    """Flying heavy. Broad, armoured and slow, with underslung guns."""
    body = mat("b", (0.14, 0.42, 0.44), 0.42, 0.44)
    plate = mat("p", (0.28, 0.34, 0.34), 0.90, 0.30)
    dark = mat("d", (0.06, 0.18, 0.20), 0.35, 0.58)
    hot = _eye((1.0, 0.56, 0.30), 1.7)
    cyl(0.34, 0.34, (-0.04, 0, 0.72), verts=6, material=body, bevel=0.03, smooth=False)
    cone(0.34, 0.12, 0.52, (0.44, 0, 0.72), (0, math.radians(90), 0), verts=6, material=plate)
    box((0.62, 0.24, 0.16), (-0.32, 0, 0.80), material=plate)             # tail boom
    box((0.14, 0.52, 0.10), (-0.60, 0, 0.84), material=dark)              # tailplane
    for side in (-1, 1):
        box((0.30, 0.62, 0.12), (0.02, side * 0.42, 0.66), material=plate)   # stub wing
        cyl(0.13, 0.26, (0.02, side * 0.58, 0.60), rot=(0, math.radians(90), 0), material=dark)
        ring(0.28, 0.035, (0.02, side * 0.62, 0.94), material=plate)         # rotor guard
        for blade in range(3):
            box((0.52, 0.06, 0.02), (0.02, side * 0.62, 0.95),
                (0, 0, math.radians(blade * 60 + 20)), material=dark)
        cyl(0.05, 0.34, (0.24, side * 0.30, 0.52), rot=(0, math.radians(90), 0), material=plate)
        ball(0.055, (0.44, side * 0.30, 0.52), material=hot)                 # gun pods
    ball(0.08, (0.56, 0, 0.80), material=hot)


def enemy_brute():
    """Ground tanker: a walking siege carapace.

    The first attempt was a slab torso, and from overhead a slab is a plain
    rectangle that says nothing.  This is built instead as a hexagonal
    carapace with radial plating - a shape the eye reads as armour at 40px -
    with two forward horns that fix the facing, four legs breaking the
    outline at the corners, and heat vents trailing behind."""
    body = mat("b", (0.10, 0.34, 0.20), 0.45, 0.48)
    plate = mat("p", (0.34, 0.38, 0.35), 0.90, 0.30)
    heavy = mat("h", (0.16, 0.18, 0.18), 0.75, 0.42)
    hot = _eye((1.0, 0.36, 0.22), 1.9)

    # Legs first, at the four corners, so they sit under the carapace edge.
    for side in (-1, 1):
        for fx, lift in ((0.34, 0.20), (-0.36, 0.18)):
            cyl(0.12, 0.28, (fx, side * 0.62, lift), material=heavy, bevel=0.02)
            box((0.30, 0.22, 0.14), (fx + 0.10, side * 0.70, 0.10), material=plate)

    # Hexagonal carapace, tapered forward, with a raised inner deck.
    cyl(0.72, 0.40, (-0.06, 0, 0.34), verts=6, material=body, bevel=0.04, smooth=False)
    cyl(0.46, 0.22, (-0.06, 0, 0.58), verts=6, material=plate, bevel=0.03, smooth=False)
    ring(0.70, 0.07, (-0.06, 0, 0.52), material=heavy)

    # Radial plating: six wedges keyed to the carapace corners.
    polar(6, 0.52, math.radians(30),
          lambda i, x, y, a: box((0.34, 0.14, 0.20), (x - 0.06, y, 0.50), (0, 0, a), material=plate))

    # Forward horns. Two prongs pushed well past the body outline are the
    # single clearest facing cue this silhouette can carry.
    for side in (-1, 1):
        cone(0.13, 0.03, 0.62, (0.86, side * 0.24, 0.42),
             (0, math.radians(84), math.radians(side * -12)), material=plate)
        box((0.26, 0.16, 0.22), (0.58, side * 0.26, 0.42), material=heavy)
    box((0.24, 0.46, 0.18), (0.62, 0, 0.56), (0, math.radians(-22), 0), material=plate)

    # Head sunk between the horns, eyes visible from directly above.
    cyl(0.17, 0.18, (0.44, 0, 0.64), material=body)
    for side in (-1, 1):
        ball(0.06, (0.54, side * 0.11, 0.72), material=hot)

    # Exhaust stacks trailing behind, so front and back never look alike.
    for side in (-1, 1):
        cyl(0.09, 0.30, (-0.70, side * 0.26, 0.50), material=heavy, bevel=0.01)
        ball(0.07, (-0.70, side * 0.26, 0.66), material=hot)
    box((0.22, 0.34, 0.12), (-0.84, 0, 0.42), material=plate)


ENEMIES = {
    "grunt": (enemy_grunt, 160, 1.7),
    "drone": (enemy_drone, 160, 1.7),
    "gunship": (enemy_gunship, 208, 2.0),
    "brute": (enemy_brute, 224, 2.1),
    "scout": (enemy_scout, 160, 1.7),
    "armored": (enemy_armored, 192, 1.9),
    "heavy": (enemy_heavy, 224, 2.0),
    "boss": (enemy_boss, 320, 2.9),
    "splitter": (enemy_splitter, 176, 1.9),
    "mite": (enemy_mite, 112, 1.3),
    "surger": (enemy_surger, 176, 1.9),
    "warden": (enemy_warden, 192, 2.0),
}


# ------------------------------------------------------------- world objects

def command_core():
    shell = mat("s", (0.14, 0.20, 0.27), 0.6, 0.45)
    plate = mat("p", (0.62, 0.70, 0.76), 0.85, 0.28)
    glass = mat("g", (0.30, 0.72, 1.0), 0.2, 0.10, (0.35, 0.80, 1.0), 3.2)
    steel = mat("t", STEEL, 0.92, 0.25)
    warn = mat("w", GOLD, 0.9, 0.25, GOLD, 1.4)
    cyl(1.34, 0.14, (0, 0, 0.07), verts=8, material=shell, bevel=0.04, smooth=False)
    ring(1.26, 0.07, (0, 0, 0.18), material=steel)
    cyl(1.05, 0.24, (0, 0, 0.24), verts=8, material=plate, bevel=0.04, smooth=False)
    polar(8, 1.16, 0, lambda i, x, y, a: box((0.30, 0.16, 0.16), (x, y, 0.26), (0, 0, a), material=steel))
    box((1.10, 1.10, 0.42), (0, 0, 0.50), material=plate)
    box((0.78, 0.78, 0.20), (0, 0, 0.76), material=shell)
    ball(0.34, (0, 0, 0.92), material=glass)
    ring(0.52, 0.05, (0, 0, 0.80), material=glass)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(0.09, 0.34, (sx * 0.62, sy * 0.62, 0.78), material=warn, bevel=0.01)


def prop_rock():
    stone = mat("s", (0.36, 0.25, 0.17), 0.1, 0.85)
    lit = mat("l", (0.55, 0.39, 0.25), 0.1, 0.80)
    box((0.90, 0.74, 0.52), (0, 0, 0.26), (math.radians(6), math.radians(-9), math.radians(22)), material=stone, bevel=0.07)
    box((0.52, 0.46, 0.34), (0.28, 0.24, 0.44), (0, math.radians(14), math.radians(-30)), material=lit, bevel=0.06)
    box((0.40, 0.36, 0.26), (-0.34, -0.20, 0.30), (0, 0, math.radians(12)), material=lit, bevel=0.05)


def prop_crate():
    wood = mat("w", (0.40, 0.26, 0.14), 0.1, 0.72)
    band = mat("b", (0.32, 0.34, 0.36), 0.9, 0.35)
    box((0.86, 0.86, 0.72), (0, 0, 0.36), material=wood, bevel=0.03)
    for a in (0, math.pi / 2):
        box((0.92, 0.10, 0.76), (0, 0, 0.36), (0, 0, a), material=band, bevel=0.012)
    box((0.66, 0.66, 0.06), (0, 0, 0.74), material=band, bevel=0.012)


def prop_barrel():
    drum = mat("d", (0.55, 0.36, 0.12), 0.75, 0.38)
    band = mat("b", (0.20, 0.21, 0.22), 0.9, 0.4)
    cyl(0.40, 0.86, (0, 0, 0.43), material=drum, bevel=0.02)
    for z in (0.24, 0.62):
        ring(0.41, 0.04, (0, 0, z), material=band)
    cyl(0.12, 0.08, (0.16, 0, 0.87), material=band, bevel=0.01)


def prop_sandbags():
    bag = mat("b", (0.62, 0.52, 0.33), 0.05, 0.85)
    dark = mat("d", (0.48, 0.40, 0.25), 0.05, 0.88)
    for row, z in ((3, 0.16), (2, 0.46)):
        for i in range(row):
            x = (i - (row - 1) / 2) * 0.50
            ball(0.28, (x, 0, z), material=bag if (i + row) % 2 else dark)
            bpy.context.object.scale = (1.0, 0.62, 0.55)


WORLD = {
    "core": (command_core, 384, 3.1),
    "prop_rock": (prop_rock, 128, 1.5),
    "prop_crate": (prop_crate, 128, 1.4),
    "prop_barrel": (prop_barrel, 128, 1.3),
    "prop_sandbags": (prop_sandbags, 160, 1.9),
}


# ---------------------------------------------------------------------- main

def main():
    for kind in ("gun", "cannon", "frost", "arc", "flak", "rail", "void"):
        for level in (1, 2, 3, 4):
            build(f"{kind}_base_l{level}", 256,
                  lambda k=kind, l=level: tower_base(k, l),
                  note="static platform, drawn unrotated")
            build(f"{kind}_turret_l{level}", 256,
                  lambda k=kind, l=level: TURRETS[k](l),
                  catcher=False, note="pivots at image centre, muzzle points +X")

    for name, (fn, res, ortho) in ENEMIES.items():
        build("enemy_" + name, res, fn, catcher=False, note="faces +X", ortho=ortho)

    for name, (fn, res, ortho) in WORLD.items():
        build(name, res, fn, note="static", ortho=ortho)

    if GLTF:
        with open(os.path.join(OUT, "models.json"), "w") as f:
            json.dump({"models": MODELS}, f, indent=2, sort_keys=True)
        print("model manifest written with", len(MODELS), "models")
        return

    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(MANIFEST, f, indent=2, sort_keys=True)
    print("manifest written with", len(MANIFEST["parts"]), "parts")


main()
