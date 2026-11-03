"""Executed by Blender's bundled Python; no pip dependencies required."""

import json
import sys
from pathlib import Path
import bpy
from mathutils import Vector

folder = Path(sys.argv[sys.argv.index("--") + 1])
mesh = json.loads((folder / "mesh.json").read_text())
manifest = json.loads((folder / "manifest.json").read_text())
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 32
scene.cycles.use_denoising = False
scene.render.resolution_x = 800
scene.render.resolution_y = 650
scene.render.resolution_percentage = 100
scene.world.color = (0.28, 0.28, 0.28)
metal = bpy.data.materials.new("Satin aluminium")
metal.diffuse_color = (0.36, 0.43, 0.52, 1)
metal.use_nodes = True
bsdf = metal.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.36, 0.43, 0.52, 1)
bsdf.inputs["Metallic"].default_value = 0.72
bsdf.inputs["Roughness"].default_value = 0.3
machined = metal.copy()
machined.name = "Machined finish"
machined.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.16
highlight = metal.copy()
highlight.diffuse_color = (0.95, 0.45, 0.06, 1)
highlight.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (
    0.95,
    0.45,
    0.06,
    1,
)
analysis = manifest["analysis"]
low = Vector(analysis["bounding_box"]["min"])
high = Vector(analysis["bounding_box"]["max"])
center = (low + high) / 2
size = max(high - low)
for face in mesh["faces"]:
    data = bpy.data.meshes.new(face["id"])
    data.from_pydata(face["positions"], [], face["triangles"])
    data.update()
    obj = bpy.data.objects.new(face["id"], data)
    scene.collection.objects.link(obj)
    finish = manifest.get("appearance", {}).get(face["id"])
    obj.data.materials.append(
        machined
        if finish == "machined"
        else highlight
        if finish == "highlight"
        else metal
    )
bpy.ops.mesh.primitive_plane_add(
    size=size * 200, location=(center.x, center.y, low.z - size * 0.015)
)
plane = bpy.context.object
mat = bpy.data.materials.new("Studio floor")
mat.diffuse_color = (0.075, 0.09, 0.12, 1)
plane.data.materials.append(mat)
for loc, power, scale in [
    ((1, -2, 3), 1100, 2),
    ((-2, -1, 1), 700, 2),
    ((0, 2, 2), 1500, 1.5),
]:
    bpy.ops.object.light_add(type="AREA", location=center + Vector(loc) * size)
    light = bpy.context.object
    light.data.energy = power * size**2
    light.data.shape = "DISK"
    light.data.size = size * scale
    light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
bpy.ops.object.camera_add()
camera = bpy.context.object
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = size * 1.9
for name, direction in [
    ("isometric", (1, -1, 0.85)),
    ("front", (0, -1, 0)),
    ("top", (0, 0, 1)),
    ("side", (1, 0, 0)),
]:
    camera.location = center + Vector(direction).normalized() * size * 4
    camera.rotation_euler = (
        (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    )
    scene.render.filepath = str(folder / (name + ".png"))
    bpy.ops.render.render(write_still=True)
