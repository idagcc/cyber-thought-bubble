"""Rebuild the offline pearl-cloud sprite from its editable Blender source."""
import bpy, math, os
from mathutils import Vector
root=os.path.dirname(os.path.abspath(__file__))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
verts=[]; faces=[]; rings=72; segments=240
start=(.17,.2)
curves=[(.17,.06,.34,.02,.45,.1),(.57,0,.74,.05,.77,.17),(.94,.13,1,.34,.91,.47),(1,.62,.93,.83,.8,.81),(.75,.97,.57,1,.48,.9),(.36,1,.18,.93,.18,.81),(.03,.84,0,.64,.09,.52),(0,.38,.03,.19,.17,.2)]
outline=[]; point=start
for curve in curves:
    a,b,c,d,e,f=curve
    for k in range(30):
        t=k/30;u=1-t
        x=u**3*point[0]+3*u*u*t*a+3*u*t*t*c+t**3*e
        y=u**3*point[1]+3*u*u*t*b+3*u*t*t*d+t**3*f
        outline.append(((x-.5)*6.2,(.5-y)*3.4))
    point=(e,f)
curve=bpy.data.curves.new('Sculpted cloud outline','CURVE');curve.dimensions='2D';curve.fill_mode='BOTH';curve.extrude=.12;curve.bevel_depth=.14;curve.bevel_resolution=10
spline=curve.splines.new('POLY');spline.points.add(len(outline)-1)
for p,(x,y) in zip(spline.points,outline):p.co=(x,y,0,1)
spline.use_cyclic_u=True
cloud=bpy.data.objects.new('Pearl thought cloud',curve);bpy.context.collection.objects.link(cloud)
mat=bpy.data.materials.new('Pearl · satin white');mat.diffuse_color=(.83,.9,1,1);mat.use_nodes=True
bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bsdf.inputs['Base Color'].default_value=(.79,.87,.98,1)
bsdf.inputs['Roughness'].default_value=.27
bsdf.inputs['Metallic'].default_value=.12
bsdf.inputs['Coat Weight'].default_value=.32
bsdf.inputs['Subsurface Weight'].default_value=.035
cloud.data.materials.append(mat)
bpy.context.view_layer.objects.active=cloud;cloud.select_set(True);bpy.ops.object.convert(target='MESH')
remesh=cloud.modifiers.new('Continuous soft surface','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.035;remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
for v in cloud.data.vertices:
    if v.co.z>0:
        r=(v.co.x/3.05)**2+(v.co.y/1.65)**2
        v.co.z+=.28*max(0,1-r)**1.2
smooth=cloud.modifiers.new('Hand softened edge','SMOOTH');smooth.factor=1;smooth.iterations=5
for p in cloud.data.polygons:p.use_smooth=True
def area(name,location,power,color,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=location
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Large warm key',(-3,4,5),750,(1,.95,.88),5)
area('Cool edge',(4,-1,2),450,(.43,.68,1),3)
area('Front fill',(-1,-2,6),200,(.85,.92,1),4)
camera_data=bpy.data.cameras.new('Sprite camera');camera=bpy.data.objects.new('Sprite camera',camera_data);bpy.context.collection.objects.link(camera)
camera.location=(0,0,10);camera.rotation_euler=(0,0,0);camera_data.type='ORTHO';camera_data.ortho_scale=6.9
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1200;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.film_transparent=True
scene.world.color=(.18,.18,.18);scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.filepath=os.path.join(root,'../../public/bubbles/pearl-cloud.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'pearl-cloud.blend'))
bpy.ops.render.render(write_still=True)
