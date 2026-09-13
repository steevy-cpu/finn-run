#!/usr/bin/env python3
"""Split a static, untextured GLB into named module roots; retain exact geometry.
Usage: python3 extract_modules.py source.glb output_directory
This script uses only Python's standard library. It makes no network requests.
"""
import copy,json,math,struct,sys
from pathlib import Path

def read_glb(path):
    data=Path(path).read_bytes()
    magic,version,total=struct.unpack_from('<4sII',data)
    assert magic==b'glTF' and version==2 and total==len(data), 'Invalid GLB header'
    n,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4e4f534a
    g=json.loads(data[20:20+n])
    size,bkind=struct.unpack_from('<II',data,20+n)
    assert bkind==0x004e4942
    blob=data[28+n:28+n+size]
    assert len(blob)==size
    return g,blob

def write_glb(g,blob,path):
    j=json.dumps(g,separators=(',',':'),ensure_ascii=True).encode()
    j+=b' '*((-len(j))%4)
    b=bytes(blob)+b'\0'*((-len(blob))%4)
    data=struct.pack('<4sII',b'glTF',2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b
    Path(path).write_bytes(data)

def identity():return [[float(i==j) for j in range(4)] for i in range(4)]
def mul(a,b):return [[sum(a[i][k]*b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
def transform(n):
    if 'matrix' in n:return [[n['matrix'][j*4+i] for j in range(4)] for i in range(4)]
    x,y,z,w=n.get('rotation',[0,0,0,1])
    r=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0],
       [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0],
       [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],
       [0,0,0,1]]
    for j,sc in enumerate(n.get('scale',[1,1,1])):
        for i in range(3):r[i][j]*=sc
    for i,t in enumerate(n.get('translation',[0,0,0])):r[i][3]=t
    return r
def decoded(g,blob,index):
    a=g['accessors'][index]; assert 'sparse' not in a
    v=g['bufferViews'][a['bufferView']]
    codes={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}
    dims={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
    fmt='<'+codes[a['componentType']]*dims[a['type']]
    width=struct.calcsize(fmt); stride=v.get('byteStride',width)
    start=v.get('byteOffset',0)+a.get('byteOffset',0)
    assert a.get('byteOffset',0)+(a['count']-1)*stride+width <= v['byteLength']
    return [struct.unpack_from(fmt,blob,start+i*stride) for i in range(a['count'])]
def measure(g,blob):
    bounds=[[float('inf')]*3,[float('-inf')]*3]; triangles=0; primitives=0; mesh_nodes=0
    seen=set()
    def visit(i,parent):
        nonlocal triangles,primitives,mesh_nodes
        assert i not in seen,'Repeated/cyclic scene node'
        seen.add(i); node=g['nodes'][i]; mat=mul(parent,transform(node))
        assert 'camera' not in node and 'skin' not in node
        assert 'KHR_lights_punctual' not in node.get('extensions',{})
        if 'mesh' in node:
            mesh_nodes+=1
            for p in g['meshes'][node['mesh']]['primitives']:
                assert p.get('mode',4)==4
                pos=decoded(g,blob,p['attributes']['POSITION'])
                indices=[x[0] for x in decoded(g,blob,p['indices'])] if 'indices' in p else list(range(len(pos)))
                assert len(indices)%3==0 and min(indices)>=0 and max(indices)<len(pos)
                assert all(math.isfinite(x) for xyz in pos for x in xyz)
                for attr,aid in p['attributes'].items():assert len(decoded(g,blob,aid))==len(pos)
                for pt in pos:
                    out=[sum(mat[row][col]*pt[col] for col in range(3))+mat[row][3] for row in range(3)]
                    for k in range(3):
                        bounds[0][k]=min(bounds[0][k],out[k]); bounds[1][k]=max(bounds[1][k],out[k])
                triangles+=len(indices)//3; primitives+=1
        for child in node.get('children',[]):visit(child,mat)
    for i in g['scenes'][g.get('scene',0)]['nodes']:visit(i,identity())
    assert len(seen)==len(g['nodes'])
    assert abs(bounds[0][1])<1e-4,'Pivot not on ground'
    return {'bounds_min':[round(x,5) for x in bounds[0]],'bounds_max':[round(x,5) for x in bounds[1]],
            'dimensions_xyz':[round(bounds[1][i]-bounds[0][i],5) for i in range(3)],
            'triangles':triangles,'mesh_primitives':primitives,'mesh_nodes':mesh_nodes}
def extract(g,blob,root_id):
    assert not g.get('animations') and not g.get('skins') and not g.get('textures')
    nodes=set()
    def visit(i):
        assert i not in nodes
        nodes.add(i)
        for c in g['nodes'][i].get('children',[]):visit(c)
    visit(root_id)
    nids=sorted(nodes); nm={v:i for i,v in enumerate(nids)}
    mids=sorted({g['nodes'][i]['mesh'] for i in nids if 'mesh' in g['nodes'][i]}); mm={v:i for i,v in enumerate(mids)}
    meshes=[copy.deepcopy(g['meshes'][i]) for i in mids]
    aids=set(); mats=set()
    for m in meshes:
        for p in m['primitives']:
            assert not p.get('targets') and not p.get('extensions')
            aids.update(p['attributes'].values())
            if 'indices' in p:aids.add(p['indices'])
            if 'material' in p:mats.add(p['material'])
    aids=sorted(aids); am={v:i for i,v in enumerate(aids)}
    mats=sorted(mats); mt={v:i for i,v in enumerate(mats)}
    accessors=[copy.deepcopy(g['accessors'][i]) for i in aids]
    vids=sorted({a['bufferView'] for a in accessors}); vm={v:i for i,v in enumerate(vids)}
    views=[]; newblob=bytearray()
    for vid in vids:
        v=copy.deepcopy(g['bufferViews'][vid]); assert v['buffer']==0
        start=v.get('byteOffset',0); size=v['byteLength']
        newblob.extend(b'\0'*((-len(newblob))%4)); v['byteOffset']=len(newblob)
        newblob.extend(blob[start:start+size]); views.append(v)
    for a in accessors:a['bufferView']=vm[a['bufferView']]
    for m in meshes:
        for p in m['primitives']:
            p['attributes']={k:am[v] for k,v in p['attributes'].items()}
            if 'indices' in p:p['indices']=am[p['indices']]
            if 'material' in p:p['material']=mt[p['material']]
    ns=[]
    for i in nids:
        n=copy.deepcopy(g['nodes'][i])
        if 'children' in n:n['children']=[nm[x] for x in n['children']]
        if 'mesh' in n:n['mesh']=mm[n['mesh']]
        n.pop('camera',None)
        n.get('extras',{}).pop('hf_id',None)
        if i==root_id:
            assert 'matrix' not in n
            n['translation']=[0,0,0]
            n.setdefault('extras',{})['export_status']='Standalone asset; runtime fit not validated'
        ns.append(n)
    materials=[copy.deepcopy(g['materials'][i]) for i in mats]
    extensions=sorted({key for mat in materials for key in mat.get('extensions',{})})
    out={'asset':{'version':'2.0','generator':'Finn Run Phase 2 module extraction; source Higgsfield revision 4'},
         'scene':0,'scenes':[{'name':g['nodes'][root_id]['name'].replace('_ROOT',''),'nodes':[nm[root_id]]}],
         'nodes':ns,'meshes':meshes,'materials':materials,'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(newblob)}]}
    if extensions:out['extensionsUsed']=extensions
    return out,newblob

def main(source,outdir):
    outdir=Path(outdir); outdir.mkdir(parents=True,exist_ok=True)
    g,blob=read_glb(source)
    roots=[i for i,n in enumerate(g['nodes']) if n.get('name','').endswith('_ROOT')]
    assert len(roots)==12
    names={'City_Block_A':'city_block_a','City_Block_B':'city_block_b','City_Block_C':'city_block_c',
           'Station_A':'station_a','Bridge_A':'bridge_a','Tunnel_A':'tunnel_a','Palm_A':'palm_a',
           'StreetLamp_A':'streetlamp_a','Fence_A':'fence_a','TransitSign_A':'transit_sign_a','Bench_A':'bench_a','UtilityBox_A':'utility_box_a'}
    rows=[]
    for i in roots:
        asset=g['nodes'][i]['name'].replace('_ROOT',''); file=names[asset]+'.glb'
        out,nb=extract(g,blob,i); before=measure(out,nb)
        path=outdir/file;write_glb(out,nb,path)
        loaded,lb=read_glb(path); after=measure(loaded,lb);assert before==after
        assert all('uri' not in b for b in loaded['buffers'])
        row={'asset_id':asset,'filename':file,'source_root':g['nodes'][i]['name'],'size_bytes':path.stat().st_size,
             'root_translation':[0,0,0],'up_axis':'Y','front_axis':'+Z','pivot':'authored base pivot','materials':len(loaded['materials']),**after}
        row['integration_status']='requires in-game fit and performance checks'
        if asset in ['Bridge_A','Tunnel_A']:row['suggested_initial_uniform_scale']=2.2
        rows.append(row)
    assert sum(r['triangles'] for r in rows)==7176
    return sorted(rows,key=lambda r:r['filename'])
if __name__=='__main__':
    rows=main(sys.argv[1],sys.argv[2])
    Path(sys.argv[2],'asset-manifest.json').write_text(json.dumps({'source_revision':4,'assets':rows},indent=2))
    print(json.dumps({'assets':len(rows),'triangles':sum(r['triangles'] for r in rows),'asset_bytes':sum(r['size_bytes'] for r in rows)}))
