import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
/** Imported, photo-derived textured model. No primitive-built face or sleeves. */
export function buildImportedPerformer(T, scene, options = {}) {
  const root = new T.Group(); root.name = 'Photographic standing performer'; root.position.set(0,0,-1); scene.add(root);
  const motion = new T.Group(); motion.name = 'Gentle planted sway'; root.add(motion);
  const state=root.userData;
  Object.assign(state,{technology:'image-to-3D textured GLB',textureStatus:'loading',height:1.92,reference:'Image 8 standing singing pose'});
  const loader=options.loader||new GLTFLoader();
  if(loader instanceof GLTFLoader)loader.setMeshoptDecoder(MeshoptDecoder);
  const url=options.url||'./assets/performer/standing.glb?v=20261113-r3';
  const ready=new Promise(resolve=>{
    let settled=false;
    function notify(name,value){try{options[name]?.(value);}catch(error){console.warn(`Performer ${name} callback failed`,error);}}
    function fail(error){
      if(settled)return;settled=true;
      const problem=error instanceof Error?error:new Error(String(error||'Unknown performer load error'));
      Object.assign(state,{textureStatus:'error',error:problem.message});
      console.error('Performer model failed to load',problem);resolve(false);notify('onError',problem);
    }
    function loaded(gltf){
      if(settled)return;
      try{
    if(!gltf?.scene?.isObject3D)throw new Error('Performer asset has no valid scene');
    const model=new T.Group();model.name='Reconstructed performer';model.add(gltf.scene);model.rotation.order='YXZ';model.rotation.set(options.upAxis==='Z'?-Math.PI/2:0,options.rotationY??0,0);
    // The exported asset uses glTF's +Y up. Normalize the actual mesh bounds,
    // not arbitrary head anchors, so boots meet the floor and stool stays in scale.
    model.updateMatrixWorld(true);
    const original=new T.Box3().setFromObject(model),size=original.getSize(new T.Vector3());
    if(![...original.min,...original.max].every(Number.isFinite)||size.y<=0)throw new Error('Performer asset has invalid or empty mesh bounds');
    const scale=state.height/size.y;model.scale.multiplyScalar(scale);model.updateMatrixWorld(true);
    const scaled=new T.Box3().setFromObject(model),center=scaled.getCenter(new T.Vector3());
    model.position.x-=center.x;model.position.z-=center.z;model.position.y-=scaled.min.y;
    let triangles=0,textures=[],materialInfo=[];const seenTextures=new Set(),seenMaterials=new Set();
    model.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=false;
      triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;
      const materials=Array.isArray(o.material)?o.material:[o.material];
      for(const m of materials){
        if(options.environment&&m.isMeshStandardMaterial){m.envMap=options.environment;m.envMapIntensity=options.environmentIntensity??.45;}
        if(m.map){
          const map=m.map,width=map.image?.width,height=map.image?.height;
          if(!map.isTexture||![width,height].every(value=>Number.isFinite(value)&&value>0))throw new Error('Performer base-color texture did not decode to a valid image');
          const uvName=map.channel>0?`uv${map.channel}`:'uv';
          if(!o.geometry.getAttribute(uvName))throw new Error(`Performer textured mesh is missing ${uvName} coordinates`);
          map.anisotropy=8;
          if(!seenTextures.has(map)){seenTextures.add(map);textures.push([width,height]);}
        }
        m.needsUpdate=true;
        if(!seenMaterials.has(m)){seenMaterials.add(m);materialInfo.push({type:m.type,color:m.color?.getHexString?.(),colorSpace:m.map?.colorSpace,flipY:m.map?.flipY,transparent:m.transparent,opacity:m.opacity,metalness:m.metalness,roughness:m.roughness,environmentIntensity:m.envMap?m.envMapIntensity:0});}
      }
    });
    if(!textures.length)throw new Error('Performer asset has no valid base-color texture');
    motion.add(model);scene.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(model);
    Object.assign(state,{textureStatus:'loaded',progress:1,triangles,textures,materials:materialInfo,dimensions:bounds.getSize(new T.Vector3()).toArray(),asset:url});
    settled=true;resolve(true);notify('onProgress',1);
      }catch(error){fail(error);}
    }
    function progress(event){
      if(settled)return;
      const fraction=event.total>0&&Number.isFinite(event.total)&&Number.isFinite(event.loaded)?Math.max(0,Math.min(1,event.loaded/event.total)):null;
      state.progress=fraction;notify('onProgress',fraction);
    }
    try{loader.load(url,loaded,progress,fail);}catch(error){fail(error);}
  });
  function update(t){
    // Tiny weight shifts around the floor; no detached body parts or independent hat.
    motion.rotation.z=Math.sin(t*.62)*.003;
    motion.rotation.y=Math.sin(t*.39)*.009;
  }
  return {object:root,ready,update,collider:{minX:-.39,maxX:.39,minZ:-1.3,maxZ:-.65,minY:0,maxY:2.03}};
}
