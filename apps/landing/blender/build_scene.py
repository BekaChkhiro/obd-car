"""Builds the scroll-driven hero scene: a driver stumped by his car, until the app
tells him what is wrong.

Run headless:
    blender --background --factory-startup --python build_scene.py -- [--theme light|dark] [--preview 1,40,80,120]

Everything is generated from primitives so the scene is reproducible from source;
there are no binary asset dependencies beyond the app screenshot on the phone.
"""

import bpy, bmesh, math, os, sys
from mathutils import Vector

D = math.radians
HERE = os.path.dirname(os.path.abspath(__file__))
LANDING = os.path.dirname(HERE)

# ---------------------------------------------------------------- palette
# Hexes are lifted from apps/landing/src/app/globals.css so the render and the
# page speak the same colour language.
def srgb(hex_str):
    h = hex_str.lstrip('#')
    lin = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        lin.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*lin, 1.0)

THEME = 'light'
P = {}

def set_theme(name):
    global THEME, P
    THEME = name
    common = {
        'ai':        '#4f46e5',
        'live':      '#0c8554',
        'warn':      '#e0a33a',
        'tyre':      '#1b1b22',
        'glass':     '#2b3040',
        'skin':      '#e2b48c',
        'hair':      '#2a2118',
        'shirt':     '#5a54c9',
        'jeans':     '#2f3550',
        'shoe':      '#22242e',
        'chrome':    '#aab1c4',
    }
    if name == 'light':
        P = dict(common,
            world='#f4f6fa', ground='#cfd6e2', wall='#f4f6fa', wall2='#8e97a8',
            roof='#78829a', car='#aab5cd', door='#bcc4d4', lawn='#93ab8d', sun_energy=4.2,
            fill_energy=110.0, bounce='#ffffff')
    else:
        # Not a night scene -- the same driveway lit for a dark UI. Pitch-black
        # surfaces read as a broken image on the page, so every value is lifted
        # until form survives, and a practical inside the garage carries depth.
        P = dict(common,
            world='#191b26', ground='#2a2e3c', wall='#343a4b', wall2='#232735',
            roof='#3d4358', car='#59627e', door='#2c3140', lawn='#2c3d34',
            sun_energy=4.0, fill_energy=200.0, bounce='#3a3d52')

set_theme('light')

# ---------------------------------------------------------------- helpers
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, hex_str, rough=0.55, metal=0.0, emit=None, emit_strength=1.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(hex_str)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = srgb(emit)
        b.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    return m

def shade(obj, m, smooth=False, bevel=0.0, segments=3):
    obj.data.materials.append(m)
    if bevel > 0:
        b = obj.modifiers.new('bev', 'BEVEL')
        b.width = bevel
        b.segments = segments
        b.limit_method = 'ANGLE'
        b.angle_limit = D(40)
    if smooth:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth()
    return obj

def box(name, size, loc, m, bevel=0.02, rot=(0, 0, 0), parent=None, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    shade(o, m, bevel=bevel)
    if parent:
        o.parent = parent
    return o

def cyl(name, r, depth, loc, m, rot=(0, 0, 0), parent=None, verts=24, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc,
                                        rotation=rot, vertices=verts)
    o = bpy.context.object
    o.name = name
    shade(o, m, smooth=True, bevel=bevel)
    if parent:
        o.parent = parent
    return o

def sphere(name, r, loc, m, parent=None, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=24, ring_count=12)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    shade(o, m, smooth=True)
    if parent:
        o.parent = parent
    return o

def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.12
    e.location = loc
    bpy.context.collection.objects.link(e)
    if parent:
        # No matrix_parent_inverse: `loc` is deliberately a LOCAL offset, the same
        # convention the mesh helpers use. Setting the inverse here cancelled every
        # ancestor's transform and built the whole figure at the world origin.
        e.parent = parent
    return e

def limb(name, parent, pivot, length, radius, m, axis_len=-1):
    """A bone-like segment: an empty at the joint, with the mesh hanging off it.

    Rotating the empty swings the segment from its joint, which is the whole
    point -- it keeps every pose a plain Euler keyframe on one object.
    """
    j = empty(name + '_j', pivot, parent)
    c = cyl(name, radius, length, (0, 0, axis_len * length / 2), m, verts=16)
    c.parent = j
    c.location = (0, 0, axis_len * length / 2)
    # Rounded cap so joints read as joints, not cut pipes.
    cap = sphere(name + '_cap', radius, (0, 0, axis_len * length), m)
    cap.parent = j
    cap.location = (0, 0, axis_len * length)
    return j

# ---------------------------------------------------------------- set
def build_world():
    w = bpy.data.worlds.new('W')
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = srgb(P['world'])
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0

def build_stage():
    ground = box('ground', (40, 40, 0.2), (0, 0, -0.1), mat('m_ground', P['ground'], rough=0.85), bevel=0)
    # Driveway apron -- a slightly lighter slab the car and the man stand on, so
    # the eye reads a place rather than an infinite plane.
    box('apron', (13, 11, 0.06), (0.9, -2.2, -0.01),
        mat('m_apron', P['wall'], rough=0.9), bevel=0.02)

    box('lawn', (30, 10, 0.10), (0.9, 8.4, 0.01), mat('m_lawn', P['lawn'], rough=0.95), bevel=0.02)
    box('kerb', (30, 0.28, 0.16), (0.9, 3.34, 0.05),
        mat('m_kerb', P['wall2'], rough=0.9), bevel=0.03)

    wall_m = mat('m_wall', P['wall'], rough=0.9)
    wall2_m = mat('m_wall2', P['wall2'], rough=0.9)
    roof_m = mat('m_roof', P['roof'], rough=0.8)
    door_m = mat('m_door', P['door'], rough=0.6)

    # Garage block sits behind the car (+Y) with the door open, so the scene
    # reads as "home driveway" without needing an interior.
    box('garage_back', (9.0, 0.3, 3.4), (-1.2, -8.6, 1.7), wall2_m, bevel=0.03)
    box('garage_left', (0.3, 5.4, 3.4), (-5.6, -6.0, 1.7), wall_m, bevel=0.03)
    box('garage_right', (0.3, 5.4, 3.4), (3.2, -6.0, 1.7), wall_m, bevel=0.03)
    box('garage_header', (9.0, 5.6, 0.28), (-1.2, -6.0, 3.5), wall_m, bevel=0.03)
    # Pitched roof: two slabs meeting at a ridge.
    for sgn in (-1, 1):
        box('roof_%d' % sgn, (5.4, 6.1, 0.18), (-1.2 + sgn * 2.35, -6.1, 4.32),
            roof_m, bevel=0.03, rot=(0, D(sgn * 22), 0))
    box('ridge', (0.5, 6.1, 0.22), (-1.2, -6.1, 5.28), roof_m, bevel=0.05)

    # Rolled-up garage door, hinted by a slatted band under the header.
    for i in range(4):
        box('slat_%d' % i, (8.4, 0.42, 0.16), (-1.2, -3.35, 3.14 - i * 0.19), door_m, bevel=0.03)

    box('side_window', (0.14, 1.30, 0.85), (3.30, -5.6, 2.05),
        mat('m_win', P['glass'], rough=0.15), bevel=0.03)
    box('side_frame', (0.10, 1.48, 1.02), (3.26, -5.6, 2.05), wall_m, bevel=0.03)
    box('downpipe', (0.16, 0.16, 3.3), (3.32, -3.5, 1.65), wall2_m, bevel=0.05)

    # A shelf of clutter inside the garage gives depth behind the car.
    box('bench', (2.6, 0.7, 0.12), (-3.4, -7.9, 0.95), mat('m_bench', P['roof'], rough=0.8), bevel=0.02)
    for i, (dx, h, c) in enumerate([(-0.8, 0.34, P['warn']), (-0.1, 0.26, P['chrome']), (0.55, 0.4, P['ai'])]):
        box('crate_%d' % i, (0.34, 0.34, h), (-3.4 + dx, -7.9, 1.01 + h / 2),
            mat('m_crate_%d' % i, c, rough=0.7), bevel=0.02)

def build_car():
    """A stylized hatchback. Front points +X; the hood is a child of an empty at
    its rear edge so `hood_pivot.rotation_euler.y` is the only open/close knob."""
    body_m = mat('m_car', P['car'], rough=0.32, metal=0.25)
    glass_m = mat('m_glass', P['glass'], rough=0.12, metal=0.1)
    tyre_m = mat('m_tyre', P['tyre'], rough=0.85)
    rim_m = mat('m_rim', P['chrome'], rough=0.3, metal=0.8)
    dark_m = mat('m_cardark', P['tyre'], rough=0.6)

    root = empty('car', (0, 0, 0))

    lower = box('car_lower', (4.30, 1.76, 0.62), (0, 0, 0.72), body_m, bevel=0.10, parent=root)
    sill = box('car_sill', (4.10, 1.86, 0.22), (0, 0, 0.52), body_m, bevel=0.06, parent=root)
    cabin = box('car_cabin', (2.05, 1.60, 0.66), (-0.45, 0, 1.32), body_m, bevel=0.16, parent=root)
    # Glass band: one dark box inset a hair inside the cabin reads as all the
    # windows at this scale, and costs nothing.
    box('car_glass', (1.95, 1.63, 0.44), (-0.45, 0, 1.36), glass_m, bevel=0.10, parent=root)
    box('car_pillar', (0.16, 1.64, 0.50), (-1.42, 0, 1.34), body_m, bevel=0.05, parent=root)
    box('car_roof', (1.90, 1.58, 0.10), (-0.50, 0, 1.66), body_m, bevel=0.06, parent=root)

    # Hood -- separate, hinged at its rear edge (x = 0.55).
    hood_pivot = empty('hood_pivot', (0.55, 0, 1.06), root)
    hood = box('car_hood', (1.62, 1.66, 0.13), (0.55 + 0.81, 0, 0), body_m, bevel=0.06)
    hood.parent = hood_pivot
    hood.location = (0.81, 0, 0)

    # Engine bay: a dark well plus a few lumps, only ever seen from above.
    box('bay', (1.55, 1.55, 0.34), (1.36, 0, 0.84), dark_m, bevel=0.03, parent=root)
    box('engine', (0.85, 1.05, 0.30), (1.30, 0.05, 1.02), mat('m_eng', P['roof'], rough=0.55, metal=0.5), bevel=0.04, parent=root)
    cyl('eng_cap', 0.10, 0.12, (1.72, -0.35, 1.20), mat('m_cap', P['warn'], rough=0.4), parent=root)
    box('battery', (0.34, 0.42, 0.26), (1.02, -0.52, 1.00), mat('m_batt', P['tyre'], rough=0.7), bevel=0.02, parent=root)

    box('car_bumper_f', (0.30, 1.82, 0.30), (2.14, 0, 0.64), body_m, bevel=0.07, parent=root)
    box('car_valance_f', (0.26, 1.68, 0.26), (2.11, 0, 0.40), dark_m, bevel=0.05, parent=root)
    box('car_bumper_r', (0.28, 1.80, 0.28), (-2.14, 0, 0.66), body_m, bevel=0.07, parent=root)
    box('car_valance_r', (0.24, 1.66, 0.24), (-2.11, 0, 0.42), dark_m, bevel=0.05, parent=root)
    box('car_grille', (0.10, 1.26, 0.24), (2.25, 0, 0.98), dark_m, bevel=0.04, parent=root)
    box('car_plate', (0.06, 0.46, 0.16), (2.31, 0, 0.64),
        mat('m_plate', '#f2f4f8', rough=0.4), bevel=0.02, parent=root)

    head_m = mat('m_head', '#fdf6e3', rough=0.15, emit='#fdf6e3', emit_strength=0.6)
    tail_m = mat('m_tail', '#c0392b', rough=0.2, emit='#c0392b', emit_strength=0.5)
    for sgn in (-1, 1):
        box('headlight_%d' % sgn, (0.14, 0.34, 0.17), (2.22, sgn * 0.68, 0.98), head_m, bevel=0.05, parent=root)
        box('taillight_%d' % sgn, (0.10, 0.30, 0.20), (-2.22, sgn * 0.70, 1.00), tail_m, bevel=0.05, parent=root)
        box('mirror_%d' % sgn, (0.20, 0.26, 0.12), (0.42, sgn * 0.92, 1.34), body_m, bevel=0.04, parent=root)

    for x in (1.35, -1.42):
        for y in (-0.94, 0.94):
            w = cyl('tyre_%.1f_%.1f' % (x, y), 0.40, 0.26, (x, y, 0.40), tyre_m,
                    rot=(D(90), 0, 0), parent=root, verts=28)
            r = cyl('rim_%.1f_%.1f' % (x, y), 0.22, 0.28, (x, y, 0.40), rim_m,
                    rot=(D(90), 0, 0), parent=root, verts=20)
            # Wheel arch cut-outs would need booleans; a dark inner ring is enough.
            cyl('arch_%.1f_%.1f' % (x, y), 0.50, 0.02, (x, y * 0.99, 0.40), dark_m,
                rot=(D(90), 0, 0), parent=root, verts=24)

    return root, hood_pivot

def build_man(loc, facing_deg):
    """Stylized figure, facing +X at rest. Every joint is an empty, so posing is
    a matter of keyframing rotation_euler -- no armature, no weight painting."""
    skin = mat('m_skin', P['skin'], rough=0.62)
    shirt = mat('m_shirt', P['shirt'], rough=0.7)
    jeans = mat('m_jeans', P['jeans'], rough=0.8)
    shoe = mat('m_shoe', P['shoe'], rough=0.6)
    hair = mat('m_hair', P['hair'], rough=0.75)

    root = empty('man', loc)
    root.rotation_euler = (0, 0, D(facing_deg))

    hips = empty('m_hips', (0, 0, 0.90), root)
    box('m_pelvis', (0.28, 0.40, 0.22), (0, 0, 0.02), jeans, bevel=0.07, parent=hips)
    spine = empty('m_spine', (0, 0, 0.10), hips)
    box('m_torso', (0.29, 0.44, 0.50), (0, 0, 0.25), shirt, bevel=0.09, parent=spine)
    chest = empty('m_chest', (0, 0, 0.48), spine)
    box('m_shoulders', (0.28, 0.52, 0.16), (0, 0, 0.02), shirt, bevel=0.07, parent=chest)

    head_j = empty('m_head_j', (0, 0, 0.10), chest)
    cyl('m_neck', 0.068, 0.13, (0, 0, 0.05), skin, parent=head_j, verts=14)
    sphere('m_head', 0.148, (0.005, 0, 0.235), skin, parent=head_j, scale=(0.92, 0.88, 1.06))
    sphere('m_hair', 0.155, (-0.014, 0, 0.262), hair, parent=head_j, scale=(0.90, 0.90, 0.88))
    eye = mat('m_eye', '#20222c', rough=0.25)
    for sgn in (-1, 1):
        sphere('m_ear_%d' % sgn, 0.034, (-0.01, sgn * 0.129, 0.228), skin, parent=head_j)
        sphere('m_eye_%d' % sgn, 0.021, (0.124, sgn * 0.055, 0.248), eye, parent=head_j,
               scale=(0.7, 1.0, 1.0))
        box('m_brow_%d' % sgn, (0.018, 0.052, 0.015), (0.128, sgn * 0.055, 0.290), hair,
            bevel=0.005, parent=head_j)

    arms = {}
    for side, sgn in (('r', -1), ('l', 1)):
        sh = limb('m_arm_' + side, chest, (0, sgn * 0.235, 0.0), 0.30, 0.055, shirt)
        fa = limb('m_fore_' + side, sh, (0, 0, -0.30), 0.28, 0.048, skin)
        hand = sphere('m_hand_' + side, 0.062, (0, 0, -0.30), skin, parent=fa,
                      scale=(0.8, 0.62, 1.15))
        arms[side] = (sh, fa, hand)

    legs = {}
    for side, sgn in (('r', -1), ('l', 1)):
        up = limb('m_leg_' + side, hips, (0, sgn * 0.115, 0.0), 0.45, 0.072, jeans)
        lo = limb('m_shin_' + side, up, (0, 0, -0.45), 0.42, 0.060, jeans)
        box('m_foot_' + side, (0.24, 0.11, 0.07), (0.06, 0, -0.45), shoe, bevel=0.03, parent=lo)
        legs[side] = (up, lo)

    return dict(root=root, hips=hips, spine=spine, chest=chest, head=head_j,
                arms=arms, legs=legs)


def build_phone(hand_parent):
    """Phone in the right hand, screen textured with a real app capture."""
    shell = mat('m_phone', '#0f1016', rough=0.35, metal=0.4)
    root = empty('phone', (0, 0, 0), hand_parent)
    body = box('phone_body', (0.094, 0.011, 0.190), (0, 0, 0), shell, bevel=0.008, segments=4)
    body.parent = root

    screen_m = bpy.data.materials.new('m_screen')
    screen_m.use_nodes = True
    nt = screen_m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    shot = os.path.join(LANDING, 'public', 'screens', 'codes-en.png')
    if os.path.exists(shot):
        tex.image = bpy.data.images.load(shot)
    tex.extension = 'EXTEND'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Roughness'].default_value = 0.08
    bsdf.inputs['Emission Strength'].default_value = 0.0   # animated: screen wakes up

    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0), rotation=(D(90), 0, 0))
    scr = bpy.context.object
    scr.name = 'phone_screen'
    scr.scale = (0.085, 0.176, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    scr.data.materials.append(screen_m)
    scr.parent = root
    scr.location = (0, -0.0068, 0)
    return root, bsdf


def orient_phone(phone_root, fore_j, cam_loc, frames, tilt=-20.0):
    """Keyframe the phone so its screen faces the camera at each beat.

    The phone hangs off a forearm that is itself swinging, so a fixed local
    rotation points the screen somewhere different in every pose. Solving the
    local rotation per keyframe from the forearm's world matrix keeps the screen
    readable throughout without hand-tuning six sets of Euler angles.
    """
    from mathutils import Matrix
    scn = bpy.context.scene
    for f in frames:
        scn.frame_set(f)
        bpy.context.view_layer.update()
        pos = phone_root.matrix_world.translation
        n = (Vector(cam_loc) - pos).normalized()
        y = -n                                    # screen normal is local -Y
        up = Vector((0, 0, 1))
        z = (up - up.dot(y) * y)
        z = z.normalized() if z.length > 1e-4 else Vector((1, 0, 0))
        x = y.cross(z)
        world_rot = Matrix((x, y, z)).transposed().to_3x3()
        world_rot = world_rot @ Matrix.Rotation(D(tilt), 3, 'X')
        local = fore_j.matrix_world.to_3x3().inverted() @ world_rot
        phone_root.rotation_euler = local.to_euler()
        phone_root.keyframe_insert('rotation_euler', frame=f)


def build_badge(loc, face_deg):
    """Floating status disc above the engine bay: amber '!' becomes a green tick.
    Both states exist at once and are swapped by scaling one out, one in."""
    warn_root = empty('badge_warn', loc)
    ok_root = empty('badge_ok', loc)
    # The discs are modelled facing +Y, so turning the root to (bearing - 90)
    # squares them up with the camera wherever it is.
    for r in (warn_root, ok_root):
        r.rotation_euler = (0, 0, D(face_deg - 90))

    def disc(name, parent, color):
        c = cyl(name, 0.30, 0.055, (0, 0, 0), mat('m_' + name, color, rough=0.3,
                emit=color, emit_strength=1.35), rot=(D(90), 0, 0), parent=parent, verts=40)
        cyl(name + '_ring', 0.345, 0.02, (0, -0.02, 0), mat('m_' + name + '_r', '#ffffff',
            rough=0.35), rot=(D(90), 0, 0),
            parent=parent, verts=40)
        return c

    disc('warn_disc', warn_root, P['warn'])
    disc('ok_disc', ok_root, P['live'])

    white = mat('m_glyph', '#ffffff', rough=0.4, emit='#ffffff', emit_strength=2.0)
    # Bang: bar plus dot, cheaper and crisper at this size than a text object.
    box('glyph_bar', (0.042, 0.03, 0.140), (0, 0.045, 0.045), white, bevel=0.012, parent=warn_root)
    box('glyph_dot', (0.048, 0.03, 0.048), (0, 0.045, -0.088), white, bevel=0.014, parent=warn_root)
    # Tick: two rotated bars.
    box('tick_a', (0.046, 0.03, 0.112), (-0.086, 0.045, -0.062), white, bevel=0.016,
        rot=(0, D(140), 0), parent=ok_root)
    box('tick_b', (0.046, 0.03, 0.268), (0.036, 0.045, -0.014), white, bevel=0.016,
        rot=(0, D(32), 0), parent=ok_root)

    ok_root.scale = (0, 0, 0)
    return warn_root, ok_root


def build_think(loc, face_deg):
    """A '?' that pops above his head while he is stumped."""
    root = empty('think', loc)
    root.rotation_euler = (0, 0, D(face_deg - 90))
    cyl('think_disc', 0.185, 0.05, (0, 0, 0), mat('m_think_disc', '#ffffff', rough=0.35,
        emit='#ffffff', emit_strength=0.5), rot=(D(90), 0, 0), parent=root, verts=32)
    for i, (r, dz, dy) in enumerate(((0.062, -0.30, 0.0), (0.040, -0.44, 0.0))):
        cyl('think_tail_%d' % i, r, 0.05, (-0.10, dy, dz), mat('m_think_t_%d' % i, '#ffffff',
            rough=0.35, emit='#ffffff', emit_strength=0.5), rot=(D(90), 0, 0),
            parent=root, verts=20)
    m = mat('m_think', P['tyre'], rough=0.5)
    bpy.ops.object.text_add(location=(0, 0, 0), rotation=(D(90), 0, 0))
    t = bpy.context.object
    t.name = 'think_q'
    t.data.body = '?'
    t.data.align_x = 'CENTER'
    t.data.align_y = 'CENTER'
    t.data.size = 0.24
    t.data.extrude = 0.012
    t.data.font = bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Arial Bold.ttf')
    t.data.materials.append(m)
    t.parent = root
    t.location = (0, 0.05, 0)
    root.scale = (0, 0, 0)
    return root


def build_link(a, b, n=7):
    """Data dots that travel from the car's OBD port to the phone."""
    m = mat('m_dot', P['ai'], rough=0.3, emit=P['ai'], emit_strength=7.0)
    dots = []
    for i in range(n):
        t = (i + 0.5) / n
        p = Vector(a).lerp(Vector(b), t)
        p.z += 0.34 * math.sin(math.pi * t)
        s = sphere('dot_%d' % i, 0.042, p, m)
        s.scale = (0, 0, 0)
        dots.append(s)
    port = sphere('obd_port', 0.062, a, m)
    port.scale = (0, 0, 0)
    return dots, port

# ---------------------------------------------------------------- animation
F_END = 120

def action_fcurves(obj):
    """Blender 5 moved F-Curves into slotted action layers; keep both shapes working."""
    ad = getattr(obj, 'animation_data', None)
    act = ad.action if ad else None
    if not act:
        return []
    if hasattr(act, 'fcurves'):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in getattr(strip, 'channelbags', []):
                out.extend(cb.fcurves)
    return out


def key(obj, f, loc=None, rot=None, scale=None, interp='BEZIER'):
    if loc is not None:
        obj.location = loc
        obj.keyframe_insert('location', frame=f)
    if rot is not None:
        obj.rotation_euler = [D(a) for a in rot]
        obj.keyframe_insert('rotation_euler', frame=f)
    if scale is not None:
        s = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
        obj.scale = s
        obj.keyframe_insert('scale', frame=f)
    for fc in action_fcurves(obj):
        for kp in fc.keyframe_points:
            kp.interpolation = interp
            kp.easing = 'EASE_IN_OUT'

# Joint angles per beat, in degrees. Read this table as the storyboard.
POSES = {
    #                 spine       head        r_sh          r_fore       l_sh          l_fore      r_leg     l_leg
    'stumped':  dict(spine=(0, 15, 0),  head=(0, 15, -7),
                     r_sh=(-18, -138, 0), r_fore=(0, -104, 0),
                     l_sh=(20, 14, 0),    l_fore=(-30, -74, 0),
                     r_leg=(0, -6, 0),    l_leg=(0, 9, 0)),
    'stand':    dict(spine=(0, 5, 0),   head=(0, 2, 0),
                     r_sh=(-6, -10, 0),   r_fore=(0, -26, 0),
                     l_sh=(8, 2, 0),      l_fore=(-8, -18, 0),
                     r_leg=(0, -3, 0),    l_leg=(0, 5, 0)),
    'pocket':   dict(spine=(0, 7, 0),   head=(0, 10, 4),
                     r_sh=(-4, 16, 0),    r_fore=(0, -46, 0),
                     l_sh=(8, 2, 0),      l_fore=(-8, -18, 0),
                     r_leg=(0, -3, 0),    l_leg=(0, 5, 0)),
    'raise':    dict(spine=(0, 6, 0),   head=(0, 26, 2),
                     r_sh=(-8, -50, 0),   r_fore=(0, -76, 0),
                     l_sh=(10, 4, 0),     l_fore=(-12, -22, 0),
                     r_leg=(0, -3, 0),    l_leg=(0, 5, 0)),
    'read':     dict(spine=(0, 4, 0),   head=(0, 24, 0),
                     r_sh=(-10, -64, 0),  r_fore=(0, -70, 0),
                     l_sh=(10, 5, 0),     l_fore=(-12, -24, 0),
                     r_leg=(0, -3, 0),    l_leg=(0, 5, 0)),
    'relief':   dict(spine=(0, -2, 0),  head=(0, 16, 0),
                     r_sh=(-12, -60, 0),  r_fore=(0, -74, 0),
                     l_sh=(12, 2, 0),     l_fore=(-12, -20, 0),
                     r_leg=(0, -3, 0),    l_leg=(0, 5, 0)),
}

def apply_pose(man, name, f):
    p = POSES[name]
    key(man['spine'], f, rot=p['spine'])
    key(man['head'], f, rot=p['head'])
    key(man['arms']['r'][0], f, rot=p['r_sh'])
    key(man['arms']['r'][1], f, rot=p['r_fore'])
    key(man['arms']['l'][0], f, rot=p['l_sh'])
    key(man['arms']['l'][1], f, rot=p['l_fore'])
    key(man['legs']['r'][0], f, rot=p['r_leg'])
    key(man['legs']['l'][0], f, rot=p['l_leg'])


def animate(man, phone_root, screen_bsdf, warn, ok, think, dots, port, cam, target,
            face_start, face_end):
    # --- body beats
    apply_pose(man, 'stumped', 1)
    apply_pose(man, 'stumped', 30)
    apply_pose(man, 'stand', 44)
    apply_pose(man, 'pocket', 54)
    apply_pose(man, 'raise', 70)
    apply_pose(man, 'read', 84)
    apply_pose(man, 'read', 96)
    apply_pose(man, 'relief', 110)
    apply_pose(man, 'relief', F_END)

    # A small scratch wobble so the stumped beat is not a freeze-frame.
    for f, a in ((1, -104), (10, -96), (19, -106), (28, -97), (34, -104)):
        key(man['arms']['r'][1], f, rot=(0, a, 0))

    # --- turn toward camera as the phone comes up
    key(man['root'], 1, rot=(0, 0, face_start))
    key(man['root'], 46, rot=(0, 0, face_start))
    key(man['root'], 74, rot=(0, 0, face_end))
    key(man['root'], F_END, rot=(0, 0, face_end))

    # --- phone: hidden until it leaves the pocket
    key(phone_root, 1, scale=0.0)
    key(phone_root, 55, scale=0.0)
    key(phone_root, 62, scale=1.0)
    key(phone_root, F_END, scale=1.0)

    # --- screen wakes up
    for f, e in ((1, 0.0), (64, 0.0), (76, 0.5), (F_END, 0.5)):
        screen_bsdf.inputs['Emission Strength'].default_value = e
        screen_bsdf.inputs['Emission Strength'].keyframe_insert('default_value', frame=f)

    # --- "?" pops while he is stumped, gone once he reaches for the phone
    key(think, 1, scale=0.0)
    key(think, 8, scale=1.12)
    key(think, 13, scale=1.0)
    key(think, 40, scale=1.0)
    key(think, 48, scale=0.0)

    # --- warning badge: on from the start, pulsing, replaced by the tick
    key(warn, 1, scale=0.0)
    key(warn, 12, scale=1.15)
    key(warn, 18, scale=1.0)
    for f, s in ((26, 1.06), (34, 0.98), (42, 1.06), (50, 1.0)):
        key(warn, f, scale=s)
    key(warn, 92, scale=1.0)
    key(warn, 99, scale=0.0)
    key(ok, 1, scale=0.0)
    key(ok, 99, scale=0.0)
    key(ok, 106, scale=1.18)
    key(ok, 113, scale=1.0)
    key(ok, F_END, scale=1.0)
    # Badge bobs, so it floats rather than hangs.
    bz = warn.location.z
    for r in (warn, ok):
        for f, dz in ((1, 0.0), (30, 0.07), (60, 0.0), (90, 0.07), (F_END, 0.0)):
            key(r, f, loc=(r.location.x, r.location.y, bz + dz))

    # --- OBD port lights up, then dots stream to the phone
    key(port, 1, scale=0.0)
    key(port, 74, scale=0.0)
    key(port, 80, scale=1.0)
    key(port, F_END, scale=1.0)
    for i, d in enumerate(dots):
        a = 78 + i * 3
        key(d, 1, scale=0.0)
        key(d, a, scale=0.0)
        key(d, a + 5, scale=1.0)
        key(d, a + 16, scale=1.0)
        key(d, a + 22, scale=0.0)
        key(d, F_END, scale=0.0)

    # --- camera: a slow push-in that hands the frame from the engine to the phone
    key(cam, 1, loc=(9.7, 8.7, 3.95))
    key(cam, 60, loc=(9.0, 8.1, 3.6))
    key(cam, F_END, loc=(8.6, 7.7, 3.25))
    key(target, 1, loc=(1.10, -0.50, 1.35))
    key(target, 60, loc=(1.60, -0.70, 1.40))
    key(target, F_END, loc=(1.70, -0.75, 1.48))
    for f, mm in ((1, 44.0), (60, 47.0), (F_END, 50.0)):
        cam.data.lens = mm
        cam.data.keyframe_insert('lens', frame=f)

# ---------------------------------------------------------------- assembly
MAN_LOC = (2.45, -1.22, 0.0)
FACE_START = 131.0      # leaning in over the front-right fender, into the bay
FACE_END = 64.0         # turned up toward the lens, phone in hand
BADGE_LOC = (2.72, -0.62, 2.74)
THINK_LOC = (2.55, -2.10, 2.30)
THINK_FACE = 55.0
BADGE_FACE = 55.0

def aim(obj, at):
    t = empty(obj.name + '_aim', at)
    c = obj.constraints.new('TRACK_TO')
    c.target = t
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'


def build_lights():
    sun_data = bpy.data.lights.new('sun', 'SUN')
    sun_data.energy = P['sun_energy']
    sun_data.use_shadow = True
    sun_data.angle = D(1.4)
    sun_data.color = srgb('#fff6e8')[:3]
    sun = bpy.data.objects.new('sun', sun_data)
    bpy.context.collection.objects.link(sun)
    sun.location = (7.0, 9.0, 9.0)
    aim(sun, (0.6, -0.6, 0.8))

    fill_data = bpy.data.lights.new('fill', 'AREA')
    fill_data.energy = P['fill_energy']
    fill_data.size = 9.0
    fill_data.color = srgb('#e8eeff')[:3]
    fill = bpy.data.objects.new('fill', fill_data)
    fill.location = (11.0, 8.0, 5.0)
    bpy.context.collection.objects.link(fill)
    aim(fill, (2.2, -0.9, 1.3))

    rim_data = bpy.data.lights.new('rim', 'AREA')
    rim_data.energy = 140.0 if THEME == 'light' else 220.0
    rim_data.size = 5.0
    rim_data.color = srgb(P['ai'])[:3]
    rim = bpy.data.objects.new('rim', rim_data)
    rim.location = (-7.0, -5.0, 4.5)
    bpy.context.collection.objects.link(rim)
    aim(rim, (-0.5, 0.2, 1.2))



# The web sequence is framed for a wide box. A square or 9:16 crop throws away
# the sides of that frame, so each video format gets its own push-in and its own
# look-at height rather than a letterboxed version of the same shot.
ASPECTS = {
    'wide':     dict(res=(1920, 1200), lens=(44, 47, 50), lift=0.00,
                     cam=((9.7, 8.7, 3.95), (9.0, 8.1, 3.60), (8.0, 7.1, 3.05))),
    'square':   dict(res=(1080, 1080), lens=(36, 39, 42), lift=0.10,
                     cam=((9.2, 8.2, 3.70), (8.6, 7.7, 3.40), (7.7, 6.9, 3.00))),
    'vertical': dict(res=(1080, 1920), lens=(30, 33, 36), lift=0.22,
                     cam=((8.4, 7.5, 3.40), (7.9, 7.0, 3.15), (7.2, 6.4, 2.85))),
}
ASPECT = 'wide'


def build_camera():
    a = ASPECTS[ASPECT]
    target = empty('cam_target', (1.10, -0.50, 1.35 + a['lift']))
    cd = bpy.data.cameras.new('cam')
    cd.lens = a['lens'][0]
    # Fit to the horizontal axis so the lens numbers keep meaning the same thing
    # as the frame gets taller.
    cd.sensor_fit = 'HORIZONTAL'
    cam = bpy.data.objects.new('cam', cd)
    cam.location = a['cam'][0]
    bpy.context.collection.objects.link(cam)
    c = cam.constraints.new('TRACK_TO')
    c.target = target
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'
    bpy.context.scene.camera = cam
    return cam, target


def configure_render(res=(1600, 1000), samples=48):
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.render.fps = 24
    scn.frame_start, scn.frame_end = 1, F_END
    scn.render.image_settings.file_format = 'WEBP'
    scn.render.image_settings.quality = 82
    ee = scn.eevee
    for attr, val in (('taa_render_samples', samples), ('use_raytracing', True),
                      ('use_shadows', True), ('use_bloom', True),
                      ('shadow_ray_count', 2), ('shadow_step_count', 6)):
        if hasattr(ee, attr):
            try:
                setattr(ee, attr, val)
            except Exception:
                pass
    scn.view_settings.view_transform = 'AgX'
    scn.view_settings.look = ('AgX - Medium High Contrast' if THEME == 'light'
                              else 'AgX - Base Contrast')


def build_all(theme):
    set_theme(theme)
    clear_scene()
    build_world()
    build_stage()
    car, hood_pivot = build_car()
    hood_pivot.rotation_euler = (0, D(-46), 0)   # hood stays up: he is looking in

    man = build_man(MAN_LOC, FACE_START)
    phone_root, screen_bsdf = build_phone(man['arms']['r'][1])
    phone_root.location = (0.03, -0.02, -0.34)
    phone_root.rotation_euler = (D(-16), D(70), D(0))

    warn, ok = build_badge(BADGE_LOC, BADGE_FACE)
    think = build_think(THINK_LOC, THINK_FACE)

    # OBD port sits in the driver footwell; the glow reads through the glass.
    port_p = (1.50, -0.76, 1.16)     # OBD dongle on the bay's near edge
    phone_p = (2.66, -0.80, 1.36)
    dots, port = build_link(port_p, phone_p, n=5)

    build_lights()
    if THEME == 'dark':
        # A warm strip light inside the garage: without it the whole opening
        # collapses to one black rectangle.
        gd = bpy.data.lights.new('garage_lamp', 'AREA')
        gd.energy = 420.0
        gd.size = 4.0
        gd.color = srgb('#ffd9a8')[:3]
        lamp = bpy.data.objects.new('garage_lamp', gd)
        lamp.location = (-1.2, -6.0, 3.2)
        bpy.context.collection.objects.link(lamp)
        aim(lamp, (-1.0, -4.5, 0.6))
    cam, target = build_camera()
    animate(man, phone_root, screen_bsdf, warn, ok, think, dots, port, cam, target,
            FACE_START, FACE_END)
    orient_phone(phone_root, man['arms']['r'][1], (8.6, 7.8, 3.4),
                 (62, 70, 84, 96, 110, F_END))
    configure_render()
    return man


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    theme = 'light'
    preview = None
    outdir = os.path.join(HERE, 'out')
    render_all = False
    i = 0
    while i < len(argv):
        if argv[i] == '--theme':
            theme = argv[i + 1]; i += 2
        elif argv[i] == '--preview':
            preview = [int(x) for x in argv[i + 1].split(',')]; i += 2
        elif argv[i] == '--out':
            outdir = argv[i + 1]; i += 2
        elif argv[i] == '--render':
            render_all = True; i += 1
        elif argv[i] == '--res':
            w, h = argv[i + 1].split('x')
            os.environ['SEQ_RES'] = '%s,%s' % (w, h); i += 2
        else:
            i += 1

    build_all(theme)
    if os.environ.get('SEQ_RES'):
        w, h = os.environ['SEQ_RES'].split(',')
        bpy.context.scene.render.resolution_x = int(w)
        bpy.context.scene.render.resolution_y = int(h)

    os.makedirs(outdir, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'hero_%s.blend' % theme))

    scn = bpy.context.scene
    if preview:
        scn.render.image_settings.file_format = 'PNG'
        for f in preview:
            scn.frame_set(f)
            scn.render.filepath = os.path.join(outdir, 'preview_%s_%03d' % (theme, f))
            bpy.ops.render.render(write_still=True)
    elif render_all:
        scn.render.filepath = os.path.join(outdir, 'f')
        bpy.ops.render.render(animation=True)

main()
