import bpy, math, bmesh
from mathutils import Vector
s=bpy.context.scene
s.world=bpy.data.worlds.new('FR_StudioWorld');s.world.use_nodes=True
s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(0.025,0.045,0.075,1)
s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=0.6
s.unit_settings.system='METRIC';s.unit_settings.scale_length=1
s.render.engine='BLENDER_EEVEE';s.eevee.taa_render_samples=16
s.view_settings.view_transform='Khronos PBR Neutral';s.view_settings.look='None'
s.render.resolution_x=1200;s.render.resolution_y=900;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG'
def material(name,col,metal=0.0,rough=0.5,emission=None):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*col,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*emission,1);p.inputs['Emission Strength'].default_value=1.5
 return m
M={}
for name,col,metal,rough,em in [
 ('Blue',(0.015,0.34,0.78),0.15,0.32,None),('Cream',(0.93,0.78,0.55),0.1,0.4,None),
 ('Navy',(0.015,0.055,0.13),0.15,0.34,None),('Glass',(0.02,0.18,0.27),0.45,0.18,None),
 ('Coral',(1,0.18,0.11),0.05,0.38,None),('Orange',(1,0.42,0.08),0.05,0.38,None),
 ('Cyan',(0,0.72,0.98),0.1,0.3,(0,0.28,0.5)),('Gold',(1,0.68,0.03),0.1,0.3,(0.35,0.12,0)),
 ('Charcoal',(0.025,0.032,0.045),0.3,0.4,None),('White',(0.9,0.94,0.98),0.1,0.4,None),
 ('Headlight',(0.95,0.9,0.65),0.0,0.3,(0.95,0.80,0.45)),('Steel',(0.3,0.38,0.46),0.65,0.3,None),
 ('Asphalt',(0.045,0.055,0.07),0,0.85,None)]:
 M[name]=material('FR_'+name,col,metal,rough,em)
def coll(name):
 c=bpy.data.collections.new(name);s.collection.children.link(c);return c
C=coll('00_PRESENTATION')
def root(name,loc,c):
 o=bpy.data.objects.new(name,None);c.objects.link(o);o.location=loc
 o['front']='Blender -Y; glTF +Z';o['export_up']='Y';o['units']='authored metres; gameplay scale pending'
 o['collision_status']='visual prototype; fit to existing collision proxies before enabling'
 return o
def mesh(name,verts,faces,mat,c,parent=None,bevel=0):
 me=bpy.data.meshes.new(name+'_mesh');me.from_pydata(verts,[],faces);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 ob=bpy.data.objects.new(name,me);c.objects.link(ob);me.materials.append(M[mat])
 if parent:ob.parent=parent
 if bevel:
  mod=ob.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=2
 return ob
def box(name,loc,size,mat,c,parent=None,bevel=0):
 vs=[(loc[0]+x*size[0]/2,loc[1]+y*size[1]/2,loc[2]+z*size[2]/2) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 return mesh(name,vs,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(4,0,3,7)],mat,c,parent,bevel)
def text(name,body,loc,size,mat,c,parent=None,floor=False):
 cu=bpy.data.curves.new(name+'_text','FONT');cu.body=body;cu.align_x='CENTER';cu.align_y='CENTER';cu.size=size;cu.resolution_u=2;cu.extrude=0;cu.bevel_depth=0
 ob=bpy.data.objects.new(name,cu);c.objects.link(ob);ob.location=loc;ob.rotation_euler=(0,0,0) if floor else (math.pi/2,0,0)
 cu.materials.append(M[mat])
 if parent:ob.parent=parent
 return ob
# Train hull: consistent two skins, one underlying design.
tc=coll('01_TRAIN_A_BLUE');ta=root('Train_A_ROOT',(-5.1,5.2,0),tc)
ring=[(-2.02,1.3),(2.02,1.3),(2.2,1.55),(2.2,5.65),(1.75,6.1),(-1.75,6.1),(-2.2,5.65),(-2.2,1.55)]
vs=[]
for section in range(3):
 for x,z in ring:
  y=(-8+0.16*(z-1.3)) if section==0 else (-5.8 if section==1 else 7.5)
  vs.append((x*(0.92 if section==0 else 1),y,z))
fs=[tuple(reversed(range(8))),tuple(range(16,24))]
for section in range(2):
 for j in range(8):fs.append((section*8+j,section*8+(j+1)%8,(section+1)*8+(j+1)%8,(section+1)*8+j))
mesh('Train_A_Body',vs,fs,'Blue',tc,ta,0.065)
box('Train_A_Chassis',(0,0,1.0),(3.5,14,0.7),'Charcoal',tc,ta,0.09)
box('Train_A_Bumper',(0,-7.83,1.32),(3.8,0.48,0.5),'Navy',tc,ta,0.08)
box('Train_A_Coupler',(0,-8.20,0.85),(0.7,0.65,0.35),'Steel',tc,ta,0.04)
box('Train_A_RearBumper',(0,7.60,1.32),(3.8,0.4,0.45),'Navy',tc,ta,0.07)
# Front glazing conforms to the sloped front face.
def frontquad(name,x1,x2,z1,z2,mat,offset=0.045):
 points=[(x1,-8+0.16*(z1-1.3)-offset,z1),(x2,-8+0.16*(z1-1.3)-offset,z1),(x2,-8+0.16*(z2-1.3)-offset,z2),(x1,-8+0.16*(z2-1.3)-offset,z2)]
 return mesh(name,points,[(0,1,2,3)],mat,tc,ta)
frontquad('Train_A_Windshield',-1.62,1.62,3.8,5.42,'Glass')
frontquad('Train_A_CentrePillar',-0.045,0.045,3.8,5.42,'Navy',0.055)
frontquad('Train_A_FrontAccent',-1.7,1.7,2.18,2.56,'Coral')
frontquad('Train_A_RouteBoard',-0.8,0.8,5.6,5.95,'Navy')
text('Train_A_RouteNumber','01 / FINN',(0,-7.36,5.77),0.21,'White',tc,ta)
for x in [-1.35,1.35]:
 box('Train_A_Headlight_'+str(x),(x,-7.84,2.88),(0.68,0.13,0.32),'Headlight',tc,ta,0.055)
for x in [-1.15,1.15]:
 box('Train_A_RoofTrim_'+str(x),(x,0.5,6.14),(0.13,11.3,0.08),'Cream',tc,ta,0.025)
for y in [-2.2,3.2]:
 box('Train_A_RoofAC_'+str(y),(0,y,6.3),(1.7,2.1,0.4),'Navy',tc,ta,0.1)
 for yy in [-0.55,0,0.55]:
  box('Train_A_ACVent_'+str(y)+'_'+str(yy),(0,y+yy,6.512),(1.35,0.075,0.025),'Steel',tc,ta)
# Side glazing and graphic stripes. No transparent windows or cabin interior.
for side in [-1,1]:
 for i,y in enumerate([-4.6,-2.7,1.1,3.0,4.9]):
  box('Train_A_Window_'+str(side)+'_'+str(i),(side*2.214,y,4.55),(0.075,1.45,1.42),'Glass',tc,ta,0.025)
 for y in [-0.85,6.42]:
  box('Train_A_Door_'+str(side)+'_'+str(y),(side*2.222,y,3.65),(0.082,1.38,3.5),'Navy',tc,ta,0.025)
  for dy in [-0.36,0.36]:
   box('Train_A_DoorGlass_'+str(side)+'_'+str(y)+'_'+str(dy),(side*2.27,y+dy,4.40),(0.025,0.56,1.3),'Glass',tc,ta)
  box('Train_A_DoorSeam_'+str(side)+'_'+str(y),(side*2.278,y,3.6),(0.025,0.032,3.1),'Cream',tc,ta)
 box('Train_A_SideStripe_'+str(side),(side*2.243,0.4,2.03),(0.08,13.7,0.36),'Coral',tc,ta,0.025)
 box('Train_A_SidePinstripe_'+str(side),(side*2.244,0.4,2.36),(0.08,13.7,0.08),'Cream',tc,ta)
# Eight wheels, low-sided geometry; fixed scenery motion belongs to the game.
def wheel(name,x,y):
 vs=[];faces=[]
 for xx in [x-0.14,x+0.14]:
  for i in range(12):
   angle=2*math.pi*i/12;vs.append((xx,y+0.72*math.cos(angle),0.72+0.72*math.sin(angle)))
 faces.extend([tuple(reversed(range(12))),tuple(range(12,24))])
 for i in range(12):faces.append((i,(i+1)%12,(i+1)%12+12,i+12))
 return mesh(name,vs,faces,'Charcoal',tc,ta)
for side in [-1,1]:
 for y in [-5.2,-3.5,3.5,5.2]:wheel('Train_A_Wheel_'+str(side)+'_'+str(y),side*1.65,y)
# Duplicate linked mesh geometry; only skin materials differ on copied material-bearing meshes.
bc=coll('02_TRAIN_B_CREAM');tb=root('Train_B_ROOT',(5.1,5.2,0),bc)
for old in list(ta.children):
 new=old.copy();new.name=old.name.replace('Train_A_','Train_B_');bc.objects.link(new);new.parent=tb
 mapping={'FR_Blue':'Cream','FR_Coral':'Cyan','FR_Cream':'Blue'}
 if any(mat and mat.name in mapping for mat in old.data.materials):
  new.data=old.data.copy()
  for i,mat in enumerate(new.data.materials):
   if mat and mat.name in mapping:new.data.materials[i]=M[mapping[mat.name]]
 if new.type=='FONT' and 'RouteNumber' in new.name:
  new.data=new.data.copy();new.data.body='02 / COAST'
tb['geometry_family']='Train_A; identical shape, second skin'
# Jump barrier -- no duck-through invitation.
barc=coll('03_BARRIER_A');bar=root('Barrier_A_ROOT',(-4.5,-8.5,0),barc)
for x in [-1.65,1.65]:
 box('Barrier_A_Foot_'+str(x),(x,0,0.15),(1.1,1.8,0.3),'Charcoal',barc,bar,0.04)
 box('Barrier_A_Post_'+str(x),(x,0,1.8),(0.23,0.45,3.3),'Orange',barc,bar,0.035)
 box('Barrier_A_Lamp_'+str(x),(x,0,3.3),(0.4,0.45,0.4),'Gold',barc,bar,0.055)
box('Barrier_A_Panel',(0,0,1.95),(3.9,0.55,2.25),'Orange',barc,bar,0.07)
box('Barrier_A_Inset',(0,-0.30,1.95),(3.6,0.08,1.85),'Navy',barc,bar,0.025)
for x in [-1.2,0,1.2]:
 vs=[(x-0.52,-0.35,1.12),(x+0.0,-0.35,1.12),(x+0.55,-0.35,2.72),(x+0.03,-0.35,2.72)]
 mesh('Barrier_A_Diagonal_'+str(x),vs,[(0,1,2,3)],'Gold',barc,bar)
bar['nominal_visual_height']=3.5
# Maintenance crate: alternate low obstacle candidate, same height, distinct depth.
cc=coll('04_MAINTENANCE_CRATE_A');cr=root('Maintenance_Crate_A_ROOT',(4.5,-8.5,0),cc)
box('Crate_A_Body',(0,0,1.75),(4.2,2.4,3.5),'Orange',cc,cr,0.11)
for x in [-2.0,2.0]:
 for y in [-1.1,1.1]:
  box('Crate_A_Corner_'+str(x)+'_'+str(y),(x,y,1.75),(0.22,0.22,3.5),'Navy',cc,cr,0.02)
for y in [-1.22,1.22]:
 box('Crate_A_UpperBand_'+str(y),(0,y,2.85),(4.2,0.1,0.26),'Navy',cc,cr)
 box('Crate_A_LowerBand_'+str(y),(0,y,0.60),(4.2,0.1,0.26),'Navy',cc,cr)
box('Crate_A_FrontPlate',(0,-1.28,1.75),(1.45,0.09,1.4),'Navy',cc,cr,0.04)
text('Crate_A_TransitMark','FR',(0,-1.34,1.78),0.72,'Gold',cc,cr)
for x in [-1.35,1.35]:
 box('Crate_A_Handle_'+str(x),(x,-1.32,1.92),(0.58,0.16,0.15),'Steel',cc,cr,0.02)
cr['nominal_visual_height']=3.5
# Display platform; not part of any asset export.
box('Presentation_Ground',(0,1,-0.35),(25,33,0.7),'Asphalt',C,None,0.1)
for x in [-5.1,5.1]:
 # simple rails used only to contextualize the trains
 for dx in [-1.65,1.65]:
  box('Display_Rail_'+str(x)+'_'+str(dx),(x+dx,5.1,0.035),(0.07,17.2,0.07),'Steel',C)
text('Display_Title','FINN RUN / TRANSIT KIT',(0,-13.55,0.015),0.82,'White',C,floor=True)
text('Display_Subtitle','PHASE 3 / VISUAL ASSETS / COLLISION FIT PENDING',(0,-14.65,0.015),0.25,'Cyan',C,floor=True)
for title,pos in [('01 / OCEAN LINE',(-5.1,-4.0,0.02)),('02 / COAST LINE',(5.1,-4.0,0.02)),('JUMP BARRIER',(-4.5,-10.6,0.02)),('MAINTENANCE CRATE',(4.5,-10.6,0.02))]:
 text('Display_'+title,title,pos,0.33,'Cyan' if pos[0]<0 else 'Gold',C,floor=True)
# Portable lighting, no bloom or texture memory.
for name,energy,color,angles in [('Key',2.5,(1,0.82,0.66),(32,-18,-35)),('Fill',1.4,(0.6,0.78,1),(35,-25,-140)),('Rim',0.9,(1,0.7,0.42),(25,15,160))]:
 d=bpy.data.lights.new(name,'SUN');d.energy=energy;d.color=color;d.use_shadow=name=='Key'
 ob=bpy.data.objects.new(name,d);s.collection.objects.link(ob);ob.rotation_euler=tuple(math.radians(v) for v in angles)
camd=bpy.data.cameras.new('DeliveryCamera');cam=bpy.data.objects.new('DeliveryCamera',camd);s.collection.objects.link(cam)
cam.location=(23,-39,30);cam.rotation_euler=(Vector((0,1,2))-cam.location).to_track_quat('-Z','Y').to_euler()
camd.type='ORTHO';camd.ortho_scale=44;s.camera=cam
s['project_phase']='Phase 3 visual candidates; train and obstacle hitbox fitting pending'
s['game_report']='15-unit road, lane centres -5/0/+5; train scale legacy 0.3 must not be blindly reused'
s['export_material_rule']='All material assignments use mesh DATA slots'
target=artifacts.file(name='phase3_transit_kit_preview.png',media_type='image/png')
s.render.filepath=target.path;bpy.ops.render.render(write_still=True);target.publish()
dg=bpy.context.evaluated_depsgraph_get();rows=[]
for rt in [ta,tb,bar,cr]:
 tri=0;pts=[]
 for ob in rt.children_recursive:
  if ob.type not in {'MESH','FONT','CURVE'}:continue
  ev=ob.evaluated_get(dg);me=ev.to_mesh();me.calc_loop_triangles();tri+=len(me.loop_triangles)
  pts.extend([rt.matrix_world.inverted()@ev.matrix_world@v.co for v in me.vertices]);ev.to_mesh_clear()
 rows.append({'asset':rt.name,'triangles':tri,'parts':len(rt.children_recursive),'bounds_blender':[[round(min(v[i] for v in pts),5) for i in range(3)],[round(max(v[i] for v in pts),5) for i in range(3)]]})
result={'modules':rows,'expected_materials':{ob.name:[sl.material.name for sl in ob.material_slots] for ob in s.objects if ob.type=='MESH'},'textures':0,'animations':0}
