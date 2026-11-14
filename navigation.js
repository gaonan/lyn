export function heightAt(s, z, x) {
  if(s.y!==undefined)return s.y;
  const t=s.xStart!==undefined?(x-s.xStart)/(s.xEnd-s.xStart):(z-s.zStart)/(s.zEnd-s.zStart);
  return s.yStart+(s.yEnd-s.yStart)*Math.max(0,Math.min(1,t));
}
export function nextPosition(p, dx, dz, surfaces, colliders) {
  const radius = .19;
  function attempt(x, z, from) {
    const candidates = surfaces.filter(s=>x>=s.minX && x<=s.maxX && z>=s.minZ && z<=s.maxZ)
      .map(s=>({y:heightAt(s,z,x),stair:s.y===undefined})).filter(c=>Math.abs(c.y-from.y)<.27).sort((a,b)=>Number(b.stair)-Number(a.stair)||Math.abs(a.y-from.y)-Math.abs(b.y-from.y));
    if (!candidates.length) return from;
    const y=candidates[0].y;
    if(colliders.some(c=>x+radius>c.minX&&x-radius<c.maxX&&z+radius>c.minZ&&z-radius<c.maxZ&&y+1.45>c.minY&&y+.2<c.maxY))return from;
    return {x,y,z};
  }
  let next=attempt(p.x+dx,p.z,p);return attempt(next.x,next.z+dz,next);
}
