import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const JSON_CHUNK=0x4e4f534a,BIN_CHUNK=0x004e4942;
const align4=value=>Math.ceil(value/4)*4;
function requireValue(condition,message){if(!condition)throw new Error(message);}

function parseGLB(input){
  const data=Buffer.isBuffer(input)?input:Buffer.from(input);
  requireValue(data.length>=20&&data.readUInt32LE(0)===0x46546c67,'Expected a GLB file');
  requireValue(data.readUInt32LE(4)===2,'Only glTF 2 GLBs are supported');
  requireValue(data.readUInt32LE(8)===data.length,'GLB length does not match its header');
  let json,bin;
  for(let offset=12;offset<data.length;){
    requireValue(offset+8<=data.length,'Truncated GLB chunk header');
    const length=data.readUInt32LE(offset),type=data.readUInt32LE(offset+4);offset+=8;
    requireValue(length%4===0&&offset+length<=data.length,'Invalid GLB chunk length');
    const payload=data.subarray(offset,offset+length);offset+=length;
    if(type===JSON_CHUNK){requireValue(!json,'Duplicate JSON chunk');json=JSON.parse(payload.toString('utf8').replace(/\0+$/,'').trim());}
    else if(type===BIN_CHUNK){requireValue(!bin,'Duplicate binary chunk');bin=payload;}
    else throw new Error(`Unsupported GLB chunk type ${type}`);
  }
  requireValue(json&&bin,'GLB must contain JSON and binary chunks');
  requireValue(json.buffers?.length===1&&!json.buffers[0].uri,'Only one embedded GLB buffer is supported');
  requireValue(Number.isSafeInteger(json.buffers[0].byteLength)&&json.buffers[0].byteLength<=bin.length,'Invalid embedded buffer length');
  requireValue((json.images||[]).every(image=>!image.uri||image.uri.startsWith('data:')),'External image URIs are not self-contained');
  const compressed=['KHR_draco_mesh_compression','EXT_meshopt_compression'];
  requireValue(!(json.extensionsRequired||[]).some(name=>compressed.includes(name)),'Compressed geometry must be decoded before smoothing');
  for(const view of json.bufferViews||[])requireValue(!view.extensions?.EXT_meshopt_compression,'Meshopt buffer views must be decoded before smoothing');
  for(const mesh of json.meshes||[])for(const primitive of mesh.primitives||[])requireValue(!primitive.extensions?.KHR_draco_mesh_compression,'Draco primitives must be decoded before smoothing');
  return {data,json,bin};
}

function readAccessor(json,bin,index,kind){
  const accessor=json.accessors?.[index];requireValue(accessor,`Missing ${kind} accessor ${index}`);
  requireValue(!accessor.sparse,`Sparse ${kind} accessors are not supported`);
  requireValue(!accessor.normalized,`Normalized ${kind} accessors are not supported`);
  const position=kind==='POSITION',components=position?3:1;
  requireValue(accessor.type===(position?'VEC3':'SCALAR'),`Invalid ${kind} accessor type`);
  const bytes={5121:1,5123:2,5125:4,5126:4}[accessor.componentType];
  requireValue(position?accessor.componentType===5126:[5121,5123,5125].includes(accessor.componentType),`Unsupported ${kind} component type ${accessor.componentType}`);
  requireValue(Number.isSafeInteger(accessor.count)&&accessor.count>0,`Invalid ${kind} count`);
  const view=json.bufferViews?.[accessor.bufferView];requireValue(view&&view.buffer===0,`Missing embedded ${kind} buffer view`);
  const viewOffset=view.byteOffset||0,accessorOffset=accessor.byteOffset||0,stride=view.byteStride||components*bytes;
  requireValue([viewOffset,accessorOffset,view.byteLength,stride].every(value=>Number.isSafeInteger(value)&&value>=0),`Invalid ${kind} byte range`);
  requireValue(stride>=components*bytes&&stride%bytes===0,`Invalid ${kind} byte stride`);
  requireValue(viewOffset+view.byteLength<=json.buffers[0].byteLength,`${kind} view exceeds embedded buffer`);
  const needed=accessorOffset+(accessor.count?((accessor.count-1)*stride+components*bytes):0);
  requireValue(needed<=view.byteLength,`${kind} accessor exceeds its buffer view`);
  const values=position?new Float32Array(accessor.count*3):new Uint32Array(accessor.count);
  for(let vertex=0;vertex<accessor.count;vertex++)for(let component=0;component<components;component++){
    const offset=viewOffset+accessorOffset+vertex*stride+component*bytes;
    const value=position?bin.readFloatLE(offset):bytes===1?bin.readUInt8(offset):bytes===2?bin.readUInt16LE(offset):bin.readUInt32LE(offset);
    requireValue(Number.isFinite(value),`${kind} contains a non-finite value`);values[vertex*components+component]=value;
  }
  return values;
}

function repack(json,bin){
  const text=Buffer.from(JSON.stringify(json)),jsonData=Buffer.alloc(align4(text.length),0x20);text.copy(jsonData);
  const binary=Buffer.alloc(align4(bin.length));bin.copy(binary);
  const length=12+8+jsonData.length+8+binary.length;requireValue(length<=0xffffffff,'Result exceeds the GLB size limit');
  const out=Buffer.allocUnsafe(length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(length,8);
  out.writeUInt32LE(jsonData.length,12);out.writeUInt32LE(JSON_CHUNK,16);jsonData.copy(out,20);
  const offset=20+jsonData.length;out.writeUInt32LE(binary.length,offset);out.writeUInt32LE(BIN_CHUNK,offset+4);binary.copy(out,offset+8);
  return out;
}

/** Add missing normals without welding geometry or rewriting UVs/indices/images.
 * Face cross products provide area weights. Only normal accumulation is shared
 * between coincident positions, including UV/material seams within each mesh.
 */
export function smoothGLB(input,{tolerance=1e-6}={}){
  requireValue(Number.isFinite(tolerance)&&tolerance>0,'Position tolerance must be positive and finite');
  const {data,json,bin}=parseGLB(input),append=[];
  json.accessors??=[];json.bufferViews??=[];
  let byteLength=bin.length,addedPrimitives=0,addedVertices=0,weldedVertices=0,degenerateTriangles=0,fallbackNormals=0;
  for(const mesh of json.meshes||[]){
    const primitives=mesh.primitives||[];
    if(!primitives.some(primitive=>primitive.attributes?.NORMAL===undefined))continue;
    const records=[];
    for(const primitive of primitives){
      const missing=primitive.attributes?.NORMAL===undefined;
      if((primitive.mode??4)!==4){requireValue(!missing,'Only triangle primitives can receive smooth normals');continue;}
      const positions=readAccessor(json,bin,primitive.attributes?.POSITION,'POSITION'),count=positions.length/3;
      const indices=primitive.indices===undefined?Uint32Array.from({length:count},(_,i)=>i):readAccessor(json,bin,primitive.indices,'indices');
      requireValue(indices.length%3===0,'Triangle index count must be a multiple of three');
      requireValue(indices.every(index=>index<count),'Triangle index exceeds vertex count');
      records.push({primitive,missing,positions,indices,groups:new Uint32Array(count)});
    }
    const total=records.reduce((sum,record)=>sum+record.groups.length,0);
    const anchors=new Float64Array(total*3),sums=new Float64Array(total*3),buckets=new Map();let groupCount=0;
    const key=(x,y,z)=>`${x},${y},${z}`;
    function findGroup(bucket,x,y,z){
      if(!bucket)return -1;
      for(const group of bucket){const k=group*3,dx=anchors[k]-x,dy=anchors[k+1]-y,dz=anchors[k+2]-z;if(dx*dx+dy*dy+dz*dz<=tolerance*tolerance)return group;}
      return -1;
    }
    for(const record of records)for(let i=0;i<record.groups.length;i++){
      const k=i*3,x=record.positions[k],y=record.positions[k+1],z=record.positions[k+2];
      const bx=Math.round(x/tolerance),by=Math.round(y/tolerance),bz=Math.round(z/tolerance);
      requireValue([bx,by,bz].every(Number.isSafeInteger),'Position magnitude exceeds the welding precision');
      const ownKey=key(bx,by,bz);let group=findGroup(buckets.get(ownKey),x,y,z);
      // Adjacent buckets matter when equal positions straddle a rounding boundary.
      if(group<0)search:for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
        if(dx===0&&dy===0&&dz===0)continue;
        group=findGroup(buckets.get(key(bx+dx,by+dy,bz+dz)),x,y,z);if(group>=0)break search;
      }
      if(group<0){group=groupCount++;const at=group*3;anchors[at]=x;anchors[at+1]=y;anchors[at+2]=z;if(!buckets.has(ownKey))buckets.set(ownKey,[]);buckets.get(ownKey).push(group);}
      record.groups[i]=group;
    }
    weldedVertices+=total-groupCount;
    for(const {positions:p,indices,groups} of records)for(let i=0;i<indices.length;i+=3){
      const ai=indices[i],bi=indices[i+1],ci=indices[i+2],a=ai*3,b=bi*3,c=ci*3;
      const abx=p[b]-p[a],aby=p[b+1]-p[a+1],abz=p[b+2]-p[a+2],acx=p[c]-p[a],acy=p[c+1]-p[a+1],acz=p[c+2]-p[a+2];
      const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
      if(nx===0&&ny===0&&nz===0){degenerateTriangles++;continue;}
      for(const vertex of [ai,bi,ci]){const at=groups[vertex]*3;sums[at]+=nx;sums[at+1]+=ny;sums[at+2]+=nz;}
    }
    for(let i=0;i<groupCount;i++){
      const k=i*3,length=Math.hypot(sums[k],sums[k+1],sums[k+2]);
      if(length>0){sums[k]/=length;sums[k+1]/=length;sums[k+2]/=length;}
      else{sums[k+1]=1;fallbackNormals++;}
    }
    for(const {primitive,missing,groups} of records){
      if(!missing)continue;
      const normals=Buffer.alloc(groups.length*12);
      for(let i=0;i<groups.length;i++)for(let component=0;component<3;component++)normals.writeFloatLE(sums[groups[i]*3+component],i*12+component*4);
      const viewIndex=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:normals.length,target:34962});
      primitive.attributes.NORMAL=json.accessors.length;json.accessors.push({bufferView:viewIndex,componentType:5126,count:groups.length,type:'VEC3'});
      append.push(normals);byteLength+=normals.length;addedPrimitives++;addedVertices+=groups.length;
    }
  }
  const report={addedPrimitives,addedVertices,weldedVertices,degenerateTriangles,fallbackNormals,originalBinaryBytes:bin.length,addedBinaryBytes:byteLength-bin.length,tolerance};
  if(!addedPrimitives)return {buffer:Buffer.from(data),report};
  json.buffers[0].byteLength=byteLength;
  return {buffer:repack(json,Buffer.concat([bin,...append],byteLength)),report};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const [input,output]=process.argv.slice(2);
  try{
    requireValue(input&&output,'Usage: node scripts/smooth-model.mjs input.glb output.glb');
    requireValue(resolve(input)!==resolve(output),'Use a separate output path to preserve the original model');
    const {buffer,report}=smoothGLB(readFileSync(input));mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(output,buffer);
    console.log(JSON.stringify({input,output,bytes:buffer.length,...report},null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
