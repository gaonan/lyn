import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothGLB} from '../scripts/smooth-model.mjs';

const align4=n=>Math.ceil(n/4)*4;
function pack(json,bin){
  const text=Buffer.from(JSON.stringify(json)),jsonData=Buffer.alloc(align4(text.length),0x20);text.copy(jsonData);
  const binary=Buffer.alloc(align4(bin.length));bin.copy(binary);
  const out=Buffer.alloc(28+jsonData.length+binary.length);
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(jsonData.length,12);out.writeUInt32LE(0x4e4f534a,16);jsonData.copy(out,20);
  const offset=20+jsonData.length;out.writeUInt32LE(binary.length,offset);out.writeUInt32LE(0x004e4942,offset+4);binary.copy(out,offset+8);
  return out;
}
function unpack(buffer){
  const length=buffer.readUInt32LE(12),offset=20+length;
  return {json:JSON.parse(buffer.subarray(20,offset).toString().trim()),bin:buffer.subarray(offset+8)};
}
function fixture(componentType=5123,{nonIndexed=false,seamOffset=0,firstOffset=0}={}){
  const positions=[[firstOffset,0,0],[2,0,0],[0,2,0],[seamOffset,0,0],[0,0,1],[2,0,0]];
  const uvs=[[0,0],[1,0],[0,1],[.75,.75],[.5,1],[.25,.5]];
  // Attribute data is deliberately interleaved with a sentinel and nonzero
  // bufferView/accessor offsets, as it can be in real exported assets.
  const vertices=Buffer.alloc(4+6*24,0xa5);
  positions.forEach((position,i)=>{const offset=4+i*24;vertices.writeFloatLE(99,offset);position.forEach((x,k)=>vertices.writeFloatLE(x,offset+4+k*4));uvs[i].forEach((x,k)=>vertices.writeFloatLE(x,offset+16+k*4));});
  const width={5121:1,5123:2,5125:4}[componentType],indices=Buffer.alloc(align4(7*width),0x99);
  [0,1,2,3,4,5].forEach((index,i)=>{const offset=(i+1)*width;if(width===1)indices.writeUInt8(index,offset);else if(width===2)indices.writeUInt16LE(index,offset);else indices.writeUInt32LE(index,offset);});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  const bin=Buffer.concat([vertices,indices,png]);
  const json={asset:{version:'2.0',generator:'test fixture'},buffers:[{byteLength:bin.length}],
    bufferViews:[{buffer:0,byteOffset:4,byteLength:144,byteStride:24,target:34962},{buffer:0,byteOffset:vertices.length,byteLength:7*width,target:34963},{buffer:0,byteOffset:vertices.length+indices.length,byteLength:png.length}],
    accessors:[{bufferView:0,byteOffset:4,componentType:5126,count:6,type:'VEC3'},{bufferView:0,byteOffset:16,componentType:5126,count:6,type:'VEC2'},{bufferView:1,byteOffset:width,componentType,count:6,type:'SCALAR'}],
    meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},...(nonIndexed?{}:{indices:2}),material:0}]}],
    nodes:[{mesh:0,translation:[2,0,1]}],scenes:[{nodes:[0]}],scene:0,
    images:[{bufferView:2,mimeType:'image/png'}],textures:[{source:0,sampler:0}],samplers:[{magFilter:9729,minFilter:9987}],
    materials:[{name:'preserved leather',pbrMetallicRoughness:{baseColorTexture:{index:0},baseColorFactor:[.7,.6,.5,1],metallicFactor:.2,roughnessFactor:.55},doubleSided:true}]};
  return {json,bin,buffer:pack(json,bin)};
}
function normals(output,primitiveIndex=0){
  const {json,bin}=unpack(output),primitive=json.meshes[0].primitives[primitiveIndex],accessor=json.accessors[primitive.attributes.NORMAL],view=json.bufferViews[accessor.bufferView];
  return Array.from({length:accessor.count},(_,i)=>Array.from({length:3},(_,k)=>bin.readFloatLE(view.byteOffset+i*12+k*4)));
}
function nearVector(actual,expected){actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-6,`${actual} != ${expected}`));}

test('UV-split coincident vertices share area-weighted smooth normals without welding geometry',()=>{
  const input=fixture(),result=smoothGLB(input.buffer),n=normals(result.buffer);
  // The XY triangle has twice the area of the XZ triangle. The crease should
  // therefore lean twice as far toward +Z rather than average unit normals.
  nearVector(n[0],[0,1/Math.sqrt(5),2/Math.sqrt(5)]);
  assert.deepEqual(n[0],n[3]);assert.deepEqual(n[1],n[5]);
  nearVector(n[2],[0,0,1]);nearVector(n[4],[0,1,0]);
  assert.equal(result.report.weldedVertices,2);assert.equal(result.report.addedVertices,6);
});

test('original binary prefix, UV/index accessors, embedded image and PBR metadata are preserved',()=>{
  const input=fixture(),original=unpack(input.buffer),result=smoothGLB(input.buffer),output=unpack(result.buffer);
  assert.deepEqual(output.bin.subarray(0,original.bin.length),original.bin);
  assert.deepEqual(output.json.accessors.slice(0,3),input.json.accessors);
  assert.deepEqual(output.json.bufferViews.slice(0,3),input.json.bufferViews);
  for(const name of ['images','textures','samplers','materials','nodes','scenes','asset'])assert.deepEqual(output.json[name],input.json[name]);
  const primitive=output.json.meshes[0].primitives[0];
  assert.equal(primitive.attributes.POSITION,0);assert.equal(primitive.attributes.TEXCOORD_0,1);assert.equal(primitive.indices,2);
  assert.equal(output.json.buffers[0].byteLength,output.bin.length);
});

test('uint8, uint16, uint32 and non-indexed triangles yield the same normals',()=>{
  const expected=normals(smoothGLB(fixture().buffer).buffer);
  for(const type of [5121,5123,5125])assert.deepEqual(normals(smoothGLB(fixture(type).buffer).buffer),expected);
  assert.deepEqual(normals(smoothGLB(fixture(5123,{nonIndexed:true}).buffer).buffer),expected);
});

test('position tolerance crosses spatial bucket boundaries without smoothing nearby distinct vertices',()=>{
  const welded=normals(smoothGLB(fixture(5123,{firstOffset:.49e-6,seamOffset:.51e-6}).buffer).buffer);
  assert.deepEqual(welded[0],welded[3]);
  const distinct=normals(smoothGLB(fixture(5123,{seamOffset:4e-6}).buffer).buffer);
  nearVector(distinct[0],[0,0,1]);nearVector(distinct[3],[0,1,0]);
});

test('smooth accumulation also crosses a material boundary within the same mesh',()=>{
  const input=fixture(),first={...input.json.accessors[2],count:3},second={...first,byteOffset:8};
  input.json.accessors.push(first,second);
  const attrs={POSITION:0,TEXCOORD_0:1};input.json.meshes[0].primitives=[{attributes:{...attrs},indices:3,material:0},{attributes:{...attrs},indices:4,material:0}];
  const result=smoothGLB(pack(input.json,input.bin));
  nearVector(normals(result.buffer,0)[0],[0,1/Math.sqrt(5),2/Math.sqrt(5)]);
  assert.deepEqual(normals(result.buffer,0)[0],normals(result.buffer,1)[3]);
});

test('a model with existing normals is left byte-for-byte unchanged on a second pass',()=>{
  const first=smoothGLB(fixture().buffer),second=smoothGLB(first.buffer);
  assert.deepEqual(second.buffer,first.buffer);assert.equal(second.report.addedPrimitives,0);
});

test('unsupported compressed, sparse or malformed geometry is rejected explicitly',()=>{
  for(const modify of [
    json=>{json.meshes[0].primitives[0].extensions={KHR_draco_mesh_compression:{bufferView:0}};},
    json=>{json.bufferViews[0].extensions={EXT_meshopt_compression:{}};},
    json=>{json.accessors[0].sparse={count:1};},
    json=>{json.accessors[0].componentType=5123;},
    json=>{json.accessors[0].count=99999;},
  ]){const input=fixture();modify(input.json);assert.throws(()=>smoothGLB(pack(input.json,input.bin)),/compressed|decoded|Sparse|component type|exceeds/i);}
});
