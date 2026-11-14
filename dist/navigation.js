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

const RADIUS = .19;
const HEAD = 1.56;
const GRAVITY = 13;
const GROUND_SPEED = 2.1;
const AIR_SPEED = 3.7;

export function spawnPlayer(point) {
  return { ...point, velocityY: 0, jumps: 0, grounded: true };
}

function overlaps(box, x, z) {
  return x + RADIUS > box.minX && x - RADIUS < box.maxX
    && z + RADIUS > box.minZ && z - RADIUS < box.maxZ;
}

/** Integrate jumps against the same floor, stair and obstacle geometry as walking. */
export function stepPlayer(player, moveX, moveZ, elapsed, jump, surfaces, colliders) {
  const dt = Math.min(elapsed, .035);
  let { velocityY, jumps, grounded, x, y, z } = player;
  if (jump && jumps < 2) {
    velocityY = grounded ? 5.9 : 5.25;
    jumps++;
    grounded = false;
  }
  if (grounded) {
    if (!moveX && !moveZ) return player;
    const dx = moveX * GROUND_SPEED * dt, dz = moveZ * GROUND_SPEED * dt;
    if (!player.onProp) {
      const walked = nextPosition(player, dx, dz, surfaces, colliders);
      return walked.x === x && walked.z === z ? player : { ...player, ...walked };
    }
    // Recover normal walking after standing on top of a prop.
    grounded = false;
    velocityY = 0;
  }

  const supports = (px, pz) => surfaces
    .filter(s => px >= s.minX && px <= s.maxX && pz >= s.minZ && pz <= s.maxZ)
    .map(s => heightAt(s, pz, px));

  let nextY = y + velocityY * dt - GRAVITY * dt * dt / 2;
  velocityY -= GRAVITY * dt;
  if (nextY > y) {
    const ceilings = supports(x, z).map(top => top - .24);
    for (const c of colliders) if (overlaps(c, x, z)) ceilings.push(c.minY);
    const ceiling = Math.min(...ceilings.filter(bottom => bottom >= y + HEAD && bottom < nextY + HEAD));
    if (Number.isFinite(ceiling)) {
      nextY = ceiling - HEAD;
      velocityY = 0;
    }
  }

  const airFeet = Math.max(y, nextY);
  // The narrow book walks sit directly below the next slab. A moving jump
  // vaults the rail once airborne, even when that slab limits jump height.
  const takeoffSupport = Math.max(...supports(x, z).filter(top => top <= airFeet));
  const vaulting = jumps > 0 && (moveX || moveZ) && airFeet > takeoffSupport + .24;
  const inRail = colliders.some(c => c.type === 'guardrail' && overlaps(c, x, z));
  function passable(px, pz) {
    if (px - RADIUS < -8.91 || px + RADIUS > 8.91 || pz - RADIUS < -6.91 || pz + RADIUS > 8.91) return false;
    // Prevent entering the side of a gallery slab and falling through its top.
    if (supports(px, pz).some(top => top >= airFeet + .05 && top - .24 < airFeet + HEAD - .001
      && !supports(x, z).some(current => Math.abs(current - top) < .15))) return false;
    return !colliders.some(c => overlaps(c, px, pz) && airFeet + HEAD > c.minY && airFeet + .035 < c.maxY
      && !(c.type === 'guardrail' && (vaulting || inRail)));
  }
  const dx = moveX * AIR_SPEED * dt, dz = moveZ * AIR_SPEED * dt;
  if (passable(x + dx, z)) x += dx;
  if (passable(x, z + dz)) z += dz;
  if (nextY <= y) {
    const floors = supports(x, z);
    const propTops = colliders.filter(c => c.type !== 'guardrail' && c.maxY < 10.1 && overlaps(c, x, z)).map(c => c.maxY);
    const top = Math.max(...[...floors, ...propTops].filter(h => h <= y + .045 && h >= nextY - .001));
    if (Number.isFinite(top)) return { x, y: top, z, velocityY: 0, jumps: 0, grounded: true, onProp: !floors.includes(top) };
  }
  return { x, y: Math.max(0, nextY), z, velocityY, jumps: Math.max(1, jumps), grounded: false };
}
