import bpy,bmesh
s=bpy.context.scene
for prefix in ['Train_A','Train_B']:
 rt=bpy.data.objects[prefix+'_ROOT']
 vs=[(x*0.16,-7.95+y*0.375,1.15+z*0.25) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 fs=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(4,0,3,7)]
 me=bpy.data.meshes.new(prefix+'_CouplerMount_mesh');me.from_pydata(vs,[],fs);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(prefix+'_CouplerMount',me);rt.users_collection[0].objects.link(ob);ob.parent=rt
 me.materials.append(bpy.data.materials['FR_Steel'])
target=artifacts.file(name='phase3_transit_kit_final.png',media_type='image/png');s.render.filepath=target.path
bpy.ops.render.render(write_still=True);target.publish()
result={'expected_materials':{ob.name:[sl.material.name for sl in ob.material_slots] for ob in s.objects if ob.type=='MESH'},'notes':'Coupling mounts connect chassis to forward coupling; static standalone exports will be material-batched.'}
