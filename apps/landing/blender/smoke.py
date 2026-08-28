import bpy, sys
scn = bpy.context.scene
eng = sys.argv[-1]
scn.render.engine = eng
if eng == 'CYCLES':
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
        print("DEVICE:", d.name, d.type)
    scn.cycles.device = 'GPU'
    scn.cycles.samples = 16
scn.render.resolution_x = 320
scn.render.resolution_y = 200
scn.render.filepath = '/Users/beqolozi/Developer/obd-car/apps/landing/blender/out/smoke_' + eng
bpy.ops.render.render(write_still=True)
print("OK", eng)
