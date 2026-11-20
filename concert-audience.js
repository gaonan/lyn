// Draw in a 256 × 256 mask, with white engraving and black cutouts.
export function drawSupporterEtching(pen) {
  pen.fillStyle = pen.strokeStyle = '#fff';
  pen.lineJoin = pen.lineCap = 'round';
  // Open upper loop and the sweep of the lower loop.
  pen.lineWidth = 22;
  pen.beginPath();
  pen.moveTo(135, 83);
  pen.bezierCurveTo(153, 51, 126, 27, 103, 40);
  pen.bezierCurveTo(74, 55, 87, 80, 105, 102);
  pen.lineTo(141, 145);
  pen.stroke();
  pen.beginPath();
  pen.moveTo(102, 112);
  pen.bezierCurveTo(59, 153, 71, 191, 104, 196);
  pen.bezierCurveTo(123, 200, 140, 193, 155, 177);
  pen.stroke();
  // Two wrists, a thumb across the palm, and four fingers on the clasp.
  pen.fill(new Path2D('M131 149 Q144 131 158 126 L178 105 L199 115 L191 140 L173 149 L158 169 L141 170 Z'));
  pen.fill(new Path2D('M119 168 Q125 145 145 143 L157 145 Q157 151 146 158 L139 174 Q133 181 128 176 L126 170 Z'));
  pen.fill(new Path2D('M136 181 L161 158 Q168 151 177 156 L195 169 L176 187 L159 190 L148 200 L131 194 Z'));
  pen.lineWidth = 8;
  for (let i = 0; i < 4; i++) {
    const x = 150 + i * 8, y = 187 - i * 5;
    pen.beginPath();
    pen.moveTo(x, y); pen.lineTo(x + 6, y + 8); pen.stroke();
  }
  pen.strokeStyle = '#000'; pen.lineWidth = 3.7;
  pen.beginPath();
  pen.moveTo(125, 168); pen.quadraticCurveTo(124, 181, 133, 177);
  pen.lineTo(141, 160); pen.quadraticCurveTo(153, 156, 158, 147);
  pen.stroke();
  for (let i = 0; i < 3; i++) {
    pen.beginPath(); pen.moveTo(152+i*8,183-i*5); pen.lineTo(159+i*8,192-i*5); pen.stroke();
  }
}

// The etching is shared by every acrylic disk, including its physically mirrored reverse.
function makeEtching(T) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#000';
  pen.fillRect(0, 0, 256, 256);
  drawSupporterEtching(pen);
  const texture = new T.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

const HEAD = .23;
const RADIUS = .083;
const LIFETIME = 60;

// Saved front photo only. Screen X/Y, room depth, stick scale, and light strength.
const PHOTO_LIGHTSTICKS = [
  [.046,.706,1.34,.81,.93], [.113,.689,1.43,.76,.82],
  [.173,.713,1.49,.70,.77], [.222,.678,1.93,.68,.70],
  [.761,.719,1.72,.76,.81], [.824,.682,1.67,.69,.74],
  [.892,.723,1.57,.82,.88], [.955,.705,1.42,.76,.85],
  [.072,.782,2.38,.92,.95], [.158,.801,2.39,.79,.76],
  [.204,.760,2.39,.69,.73], [.268,.801,2.67,.74,.91],
  [.730,.803,2.65,.85,.79], [.796,.750,2.45,.77,.89],
  [.851,.804,2.63,.70,.75], [.922,.790,2.59,.79,.88],
  [.031,.896,3.03,.88,.89], [.117,.906,3.15,.92,.98],
  [.184,.865,3.25,.73,.85], [.235,.952,3.45,.80,.97],
  [.328,.910,3.31,.75,.96], [.404,.967,3.34,.69,.86],
  [.581,.978,3.42,.73,.89], [.646,.912,3.34,.74,.92],
  [.700,.982,3.51,.83,.94], [.757,.922,3.26,.76,.92],
  [.834,.881,3.08,.86,.91], [.902,.955,3.47,.94,.98],
  [.969,.882,3.18,.84,.86],
];
const PHOTO_LEANS = [-.15, .21, -.36, .17, .30, -.31, .07, -.25, .37, -.16, .29, -.10];
const PHOTO_YAWS = [-.30, .78, -.53, .27, -.91, .16, .62, -.40, .49, -.72, .31, -.12];

// Both the hand-held markers and the full-size reward use the same optics and etching.
let etchedDiskTexture;
function diskTexture(T) {
  return etchedDiskTexture ??= makeEtching(T);
}

function addLightstickMeshes(T, group, uniforms, vertexShader, prepareGeometry) {
  function add(source, name, fragmentShader, transparent = false) {
    const mat = new T.ShaderMaterial({
      uniforms, vertexShader, fragmentShader,
      transparent, depthWrite: !transparent, toneMapped: false,
      side: transparent ? T.DoubleSide : T.FrontSide,
    });
    mat.forceSinglePass = true;
    const mesh = new T.Mesh(prepareGeometry(source), mat);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = transparent ? 4 : 0;
    group.add(mesh);
  }
  const grip = [[.014,0],[.018,.003],[.019,.111],[.0205,.116],[.0205,.145],[.017,.150],[.011,.152]];
  add(new T.LatheGeometry(grip.map(([r,h])=>new T.Vector2(r,h)), 10), 'Black molded handles', /* glsl */`
    varying vec3 local, normalView;
    varying float light, nearFade;
    void main(){
      if (nearFade < .1) discard;
      vec3 n=normalize(normalView);
      float gloss=pow(max(0.,dot(n,normalize(vec3(-.55,.42,.68)))),7.);
      vec3 body=vec3(.0022,.0019,.0038)+vec3(.024,.012,.031)*gloss;
      float spill=smoothstep(.119,.151,local.y);
      body+=vec3(.42,.211,.021)*light*spill*spill;
      gl_FragColor=vec4(body,1.);
      #include <colorspace_fragment>
    }`);

  const edge = new T.CylinderGeometry(RADIUS,RADIUS,.004,24,1,true);
  edge.rotateX(Math.PI/2);
  edge.translate(0,HEAD,0);
  add(edge,'Polished acrylic edges', /* glsl */`
    varying vec3 local, normalView;
    varying float light, nearFade;
    void main(){
      if (nearFade < .12) discard;
      float spec=pow(abs(normalize(normalView).x),3.);
      vec3 acrylic=vec3(.005,.003,.007)*(1.+spec);
      float source=1.-smoothstep(.145,.3,local.y);
      vec3 gold=mix(vec3(1.,.58,.075),vec3(1.,.87,.44),source*.76+spec*.18);
      gl_FragColor=vec4(mix(acrylic,gold,light),1.);
      #include <colorspace_fragment>
    }`);

  const plate = new T.PlaneGeometry(RADIUS*2.83,RADIUS*2.83);
  plate.translate(0,HEAD,0);
  plate.userData.diskRadiusUV = RADIUS / plate.parameters.width;
  add(plate,'Transparent disks with clasp engraving', /* glsl */`
    uniform sampler2D imprint;
    varying vec3 local, normalView;
    varying float light, nearFade;
    void main(){
      vec2 p=(local.xy-vec2(0.,.23))/.083;
      float radius=length(p);
      float aa=clamp(fwidth(radius),.008,.16);
      float disk=1.-smoothstep(1.-aa,1.+aa,radius);
      float rim=disk*smoothstep(.80-aa,.88+aa,radius);
      float bevel=1.-smoothstep(.010,.022+aa,abs(radius-.969));
      float glyph=texture2D(imprint,p*.5+.5).r * disk;
      float foot=length((p-vec2(0.,-.91))*vec2(1.45,1.));
      float die=exp(-12.*foot);
      float feed=exp(-2.1*foot);
      float bottomFan=exp(-2.4*abs(p.x))*(1.-smoothstep(-.89,.26,p.y));
      float glint=pow(max(0.,.72*p.y-.51*p.x),5.);
      float internal=light*(.040+.47*feed+.17*bottomFan)*disk;
      float emission=light*((.72+.23*feed)*rim+(.76+.20*feed)*glyph+.31*bevel);
      float halo=light*(.23*exp(-10.*abs(radius-1.))+.15*feed);
      float etched=clamp(emission+internal+light*.91*die+halo,0.,1.);
      float unlit=disk*(.047+.24*rim+.13*glyph);
      float alpha=max(unlit,etched)*nearFade;
      if(alpha < .004) discard;
      vec3 cold=vec3(.016,.010,.021)+vec3(.044,.018,.049)*glint;
      vec3 gold=mix(vec3(.93,.408,.021),vec3(1.,.762,.166),clamp(.21+.36*rim+.89*feed+.18*glint,0.,1.));
      gold=mix(gold,vec3(1.,.96,.68),clamp(1.4*die+.26*bevel+.19*bottomFan,0.,1.));
      gl_FragColor=vec4(mix(cold,gold,clamp(etched/max(.001,unlit),0.,1.)),alpha);
      #include <colorspace_fragment>
    }`,true);
}

export function createHeroLightstick(T) {
  const group = new T.Group();
  group.name = 'Floating reward lightstick';
  // The handle starts at the origin; the lit acrylic rim reaches one metre.
  group.scale.setScalar(1 / (HEAD + RADIUS));
  const vertexShader = `
    varying vec3 local, normalView;
    varying float light, nearFade;
    void main() {
      local = position;
      normalView = normalMatrix * normal;
      light = 1.0;
      vec4 eye = modelViewMatrix * vec4(position, 1.0);
      nearFade = smoothstep(.08, .22, -eye.z);
      gl_Position = projectionMatrix * eye;
    }`;
  addLightstickMeshes(T, group, { imprint: { value: diskTexture(T) } }, vertexShader, source => source);
  return group;
}

export function createConcertAudience(T, scene, { reducedMotion = false, colliders = [], surfaces = [] } = {}) {
  const group = new T.Group();
  group.name = 'Concert audience lights';
  scene.add(group);
  let seed = 808791;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function occupied(x, z) {
    if (Math.hypot(x, z - 1) < 2.52) return true;
    if (Math.abs(x) < 1.27 && z < .55) return true;
    if (Math.abs(x) < .66 && z > 3.45) return true;
    if (Math.hypot(x - 1, z + 1.59) < .8) return true;
    return z < -2.62 && Math.abs(Math.abs(x) - 3.18) < 1.15;
  }

  const bases = [], poses = [], tempos = [];
  function addStick(x, y, z) {
    bases.push(x, y, z);
    const phase = random() * Math.PI * 2;
    const scale = .87 + random() * .34;
    const yaw = (random() - .5) * Math.PI * 1.62;
    const lean = (random() - .5) * .91;
    const pitch = (random() - .5) * .95;
    const speed = .83 + random() * .84;
    poses.push(yaw, lean, pitch, scale);
    tempos.push(phase, speed);
  }
  for (let row = 0; row < 26; row++) {
    for (let col = 0; col < 29; col++) {
      const x = -5.53 + col * .385 + (row % 2) * .18 + (random() - .5) * .29;
      const z = -2.93 + row * .375 + (random() - .5) * .30;
      if (Math.abs(x) > 5.62 || occupied(x, z)) continue;
      if (random() > .80 + .12 * Math.sin(x * 1.62 + z * 2.26)) continue;
      let height = .67 + random() * .57;
      // Keep this near-right disk below the singer in the front audience view.
      if (row === 22 && col === 16) height -= .30;
      addStick(x, height, z);
    }
  }

  // Lowered hands fill the aisle in front of the round stage. Their tops stay
  // below the singer's feet in the opening view, even at the peak of a wave.
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 3; col++) {
      const x = (col - 1) * .43 + (row % 2 - .5) * .17 + (random() - .5) * .18;
      const z = 3.62 + row * .45 + (random() - .5) * .18;
      if (random() < .12) continue;
      const height = .29 + Math.min(row, 2) * .05 + random() * .22;
      addStick(x, height, z);
    }
  }

  // Small knots of spectators extend around the corner. Their gaps leave a
  // continuous path to the CD, the stage switch and both staircase landings.
  const wallPockets = [ // centre x/z, spread x/z, number of hands
    [-5.55, 7.55, 1.05, .55, 8], [-3.63, 7.20, .72, .37, 4],
    [-7.43, 5.68, .59, .98, 8], [-7.54, 3.51, .57, .86, 7],
    [-6.08, .44, .37, 1.04, 5], [-6.11, -2.06, .35, .98, 5],
    [6.32, -1.49, .52, .99, 6], [6.42, .67, .48, .75, 4],
    [6.30, 4.34, .55, 1.08, 7], [5.95, 6.49, .49, .54, 3],
    [-6.06, -3.84, .51, .32, 3], [6.15, -4.31, .43, .67, 5],
  ];
  const obstructions = colliders.filter(s => s.minY < 1.45 && s.maxY > .12)
    .concat(surfaces.filter(s => Math.min(s.yStart, s.yEnd) < 1.45));
  for (const [cx, cz, rx, rz, desired] of wallPockets) {
    let added = 0;
    for (let attempt = 0; added < desired && attempt < desired * 10; attempt++) {
      const angle = random() * Math.PI * 2, radius = Math.sqrt(random());
      const x = cx + rx * Math.cos(angle) * radius, z = cz + rz * Math.sin(angle) * radius;
      // Leave the wing palms, projecting stage edge and back-wall book aisle open.
      const inWing = cz < -3.5;
      if (inWing && (Math.abs(x) < 5.67 || Math.hypot(x + 5.85, z + 4.65) < .70
        || Math.hypot(x - 5.10, z + 4.92) < .70)) continue;
      if (obstructions.some(s => x > s.minX - .30 && x < s.maxX + .30 && z > s.minZ - .30 && z < s.maxZ + .30)) continue;
      if (Math.hypot(x + 7.64, z - 7.77) < 1.30 || Math.hypot(x + 2.85, z - 8.87) < 1.42) continue;
      let crowded = false;
      for (let i = 0; i < bases.length; i += 3) {
        if ((x - bases[i]) ** 2 + (z - bases[i + 2]) ** 2 < .38 ** 2) { crowded = true; break; }
      }
      if (crowded) continue;
      const height = inWing ? .31 + random() * .20 : .50 + random() * .40;
      addStick(x, height, z);
      added++;
    }
  }

  const count = bases.length / 3;
  const paint = new Float32Array(count * 2); // Expiry, feather strength.
  const power = new T.InstancedBufferAttribute(paint, 2).setUsage(T.DynamicDrawUsage);
  const base = new T.InstancedBufferAttribute(new Float32Array(bases), 3);
  const pose = new T.InstancedBufferAttribute(new Float32Array(poses), 4);
  const tempo = new T.InstancedBufferAttribute(new Float32Array(tempos), 2);
  const uniforms = {
    clock: { value: 0 }, motionClock: { value: 0 }, imprint: { value: diskTexture(T) },
  };
  // Two transparent disk faces would double the energy at this scale. A single
  // two-sided face provides the etch and through-view, with a real cylindrical edge.
  const vertexShader = /* glsl */`
    attribute vec3 aBase;
    attribute vec4 aPose;
    attribute vec2 aTempo, aPaint;
    uniform float clock, motionClock;
    varying vec3 local, normalView;
    varying float light, nearFade;
    void main() {
      float wave = motionClock * aTempo.y + aTempo.x;
      float lean = aPose.y + .21 * sin(wave);
      float pitch = aPose.z + .12 * cos(wave*.87+aTempo.x);
      float yaw = aPose.x + .19 * sin(wave*.69);
      mat3 rz = mat3(cos(lean),sin(lean),0., -sin(lean),cos(lean),0., 0.,0.,1.);
      mat3 rx = mat3(1.,0.,0., 0.,cos(pitch),sin(pitch), 0.,-sin(pitch),cos(pitch));
      mat3 ry = mat3(cos(yaw),0.,-sin(yaw), 0.,1.,0., sin(yaw),0.,cos(yaw));
      mat3 orientation = ry * rx * rz;
      vec3 wrist = aBase + vec3(.029*sin(wave), .031*cos(wave*.89), .019*cos(wave));
      vec4 eye = modelViewMatrix * vec4(wrist + orientation * (position*aPose.w),1.);
      local = position;
      normalView = normalMatrix * orientation * normal;
      light = aPaint.y * smoothstep(0., 1.1, aPaint.x-clock);
      nearFade = smoothstep(.22,.75,-eye.z);
      gl_Position = projectionMatrix * eye;
    }`;

  function prepareInstances(source) {
    const geometry = new T.InstancedBufferGeometry().copy(source);
    source.dispose();
    geometry.instanceCount = count;
    geometry.setAttribute('aBase', base);
    geometry.setAttribute('aPose', pose);
    geometry.setAttribute('aTempo', tempo);
    geometry.setAttribute('aPaint', power);
    return geometry;
  }
  addLightstickMeshes(T, group, uniforms, vertexShader, prepareInstances);

  const boxes = colliders.filter(s=>s.type!=='guardrail').map(s=>new T.Box3(
    new T.Vector3(s.minX,s.minY,s.minZ), new T.Vector3(s.maxX,s.maxY,s.maxZ)));
  // Walkable floor patches contain both flat galleries and sloped stair flights.
  const floors = surfaces.filter(s=>Math.max(s.y??0,s.yStart??0,s.yEnd??0)>.5);
  const ray = new T.Ray(), hit = new T.Vector3(), center = new T.Vector3(), ndc = new T.Vector3();
  function behindArchitecture(eye, target) {
    const dist = target.distanceTo(eye);
    ray.origin.copy(eye);
    ray.direction.subVectors(target,eye).divideScalar(dist || 1);
    if (boxes.some(box=>ray.intersectBox(box,hit) && hit.distanceTo(eye)<dist-.04)) return true;
    for (const s of floors) {
      let y = s.y, slope = 0, horizontal = 0;
      if (y === undefined) {
        const alongX = s.xStart !== undefined;
        const start = alongX ? s.xStart : s.zStart;
        slope = (s.yEnd-s.yStart)/((alongX?s.xEnd:s.zEnd)-start);
        y = s.yStart+slope*((alongX?eye.x:eye.z)-start);
        horizontal = slope * (alongX?ray.direction.x:ray.direction.z);
      }
      const depth = (y-eye.y)/(ray.direction.y-horizontal);
      if (!(depth > .02 && depth < dist-.04)) continue;
      const x = eye.x + ray.direction.x*depth, z = eye.z + ray.direction.z*depth;
      if(x>=s.minX && x<=s.maxX && z>=s.minZ && z<=s.maxZ) return true;
    }
    return false;
  }

  const eye = new T.Vector3();
  function paintStroke(camera, from, to, {width,height}, nowSeconds) {
    if (!(width>0 && height>0)) return 0;
    uniforms.clock.value = nowSeconds;
    const radius = T.MathUtils.clamp(Math.min(width,height)*.115,38,108);
    const dx = to.x-from.x, dy = to.y-from.y, lengthSq = dx*dx+dy*dy;
    let touched = 0;
    camera.updateWorldMatrix(true,false);
    eye.setFromMatrixPosition(camera.matrixWorld);
    for (let i=0;i<count;i++) {
      // Match the waving disk centre in the vertex shader, including camera perspective.
      const phase=tempos[2*i], wave=uniforms.motionClock.value*tempos[2*i+1]+phase;
      const lean=poses[4*i+1]+.21*Math.sin(wave), pitch=poses[4*i+2]+.12*Math.cos(wave*.87+phase);
      const yaw=poses[4*i]+.19*Math.sin(wave*.69), span=HEAD*poses[4*i+3];
      const x = -Math.sin(lean)*span, y=Math.cos(lean)*span, z=Math.sin(pitch)*y;
      center.set(bases[3*i]+.029*Math.sin(wave)+Math.cos(yaw)*x+Math.sin(yaw)*z,
        bases[3*i+1]+.031*Math.cos(wave*.89)+Math.cos(pitch)*y,
        bases[3*i+2]+.019*Math.cos(wave)-Math.sin(yaw)*x+Math.cos(yaw)*z);
      ndc.copy(center).project(camera);
      if (Math.abs(ndc.x)>1 || Math.abs(ndc.y)>1 || Math.abs(ndc.z)>1) continue;
      const px=(ndc.x+1)*.5*width-from.x, py=(1-ndc.y)*.5*height-from.y;
      const t=lengthSq?T.MathUtils.clamp((px*dx+py*dy)/lengthSq,0,1):0;
      const distance=Math.hypot(px-t*dx,py-t*dy);
      if (distance >= radius || behindArchitecture(eye,center)) continue;
      const weight=1-T.MathUtils.smoothstep(distance,radius*.40,radius);
      const expiry=paint[2*i];
      paint[2*i+1]=Math.max(paint[2*i+1]*T.MathUtils.smoothstep(expiry-nowSeconds,0,1.1),weight);
      paint[2*i]=nowSeconds+LIFETIME;
      touched++;
    }
    if (touched) power.needsUpdate=true;
    return touched;
  }

  function captureFrontPhoto(camera, render) {
    const photoCount = count + PHOTO_LIGHTSTICKS.length;
    function extend(attribute) {
      const data = new Float32Array(photoCount * attribute.itemSize);
      data.set(attribute.array);
      return new T.InstancedBufferAttribute(data, attribute.itemSize);
    }
    const photoBase = extend(base), photoPose = extend(pose);
    const photoTempo = extend(tempo), photoPaint = extend(power);

    // Light the scene for the saved photo and retain the player's brighter strokes.
    const expiry = uniforms.clock.value + LIFETIME;
    for (let index = 0; index < count; index++) {
      const gain = .54 + .43 * ((index * 53 % 101) / 100);
      const remaining = paint[2 * index] - uniforms.clock.value;
      const painted = paint[2 * index + 1] * T.MathUtils.smoothstep(remaining, 0, 1.1);
      photoPaint.setXY(index, expiry, Math.max(gain, painted));
    }

    const position = new T.Vector3(), diskOffset = new T.Vector3(), rotation = new T.Euler(0, 0, 0, 'YXZ');
    for (const [offset, [x, y, depth, scale, brightness]] of PHOTO_LIGHTSTICKS.entries()) {
      const index = count + offset;
      const phase = offset * 2.40, speed = .90 + .08 * (offset % 7);
      const wave = uniforms.motionClock.value * speed + phase;
      const lean = PHOTO_LEANS[offset % PHOTO_LEANS.length];
      const yaw = PHOTO_YAWS[offset % PHOTO_YAWS.length];
      const pitch = (offset % 5 - 2) * .10;
      rotation.set(pitch + .12 * Math.cos(wave * .87 + phase),
        yaw + .19 * Math.sin(wave * .69), lean + .21 * Math.sin(wave));
      diskOffset.set(0, HEAD * scale, 0).applyEuler(rotation);
      // Project one ray per disk into the set and offset it by its current sway.
      position.set(x * 2 - 1, 1 - y * 2, .5).unproject(camera).sub(camera.position);
      position.multiplyScalar((depth - camera.position.z) / position.z).add(camera.position).sub(diskOffset);
      photoBase.setXYZ(index, position.x - .029 * Math.sin(wave),
        position.y - .031 * Math.cos(wave * .89), position.z - .019 * Math.cos(wave));
      photoPose.setXYZW(index, yaw, lean, pitch, scale);
      photoTempo.setXY(index, phase, speed);
      photoPaint.setXY(index, expiry, brightness);
    }

    const originals = group.children.map(mesh => [mesh, mesh.geometry]);
    try {
      for (const [mesh, original] of originals) {
        const geometry = original.clone();
        mesh.geometry = geometry;
        geometry.setAttribute('aBase', photoBase);
        geometry.setAttribute('aPose', photoPose);
        geometry.setAttribute('aTempo', photoTempo);
        geometry.setAttribute('aPaint', photoPaint);
        geometry.instanceCount = photoCount;
      }
      return render();
    } finally {
      for (const [mesh, original] of originals) {
        const geometry = mesh.geometry;
        mesh.geometry = original;
        if (geometry !== original) geometry.dispose();
      }
    }
  }

  return {
    group, count, paintStroke, captureFrontPhoto,
    reset() { paint.fill(0); power.needsUpdate = true; },
    get litCount() {
      let n=0;
      for(let i=0;i<count;i++) if(paint[2*i]>uniforms.clock.value) n++;
      return n;
    },
    update(time,motion=true) {
      uniforms.clock.value=time;
      if(motion && !reducedMotion) uniforms.motionClock.value=time;
    },
  };
}
