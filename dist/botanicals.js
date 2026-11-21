/** Procedural flower installation: every asset is created locally, no image downloads. */
export function buildBotanicals(THREE, scene, railPaths = [], { centralFlowers = true, concertStage } = {}) {
  let seed = 739211;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const between = (a, b) => a + random() * (b - a);
  const carnationHeadScale = .72;
  const carnationStemScale = .8;
  const palette = ['#b50927', '#d41c48', '#ed769b', '#f39bb6', '#cee183', '#adc86d', '#bea0c6', '#f4a279'];
  const colliders = [];
  const centralGroup = new THREE.Group();
  centralGroup.name = 'Original flower banks';
  const concertGroup = new THREE.Group();
  concertGroup.name = 'Concert carnations';
  scene.add(centralGroup, concertGroup);
  let batches = {};
  const color = new THREE.Color();
  const transform = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const front = new THREE.Vector3(0, 0, 1);
  const v = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const rosetteTex = flowerTexture(false);
  const roseTex = flowerTexture(true);
  const plane = new THREE.PlaneGeometry(1, 1);
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .92, side: THREE.DoubleSide });
  const floretMaterial = new THREE.MeshStandardMaterial({ map: rosetteTex, alphaTest: .24, color: '#efede9', vertexColors: true, roughness: .82, side: THREE.DoubleSide });
  const roseMaterial = new THREE.MeshStandardMaterial({ map: roseTex, alphaTest: .35, color: 0xffffff, roughness: .85, side: THREE.DoubleSide });
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  batch('florets', corollaGeometry(), floretMaterial);
  batch('roses', plane, roseMaterial);
  batch('leaves', leafGeometry(), new THREE.MeshStandardMaterial({
    map: leafTexture(), roughness: .64, side: THREE.DoubleSide,
  }));
  batch('ferns', fernGeometry(), foliageMaterial);
  batch('stems', new THREE.CylinderGeometry(1, 1, 1, 3, 1, true), stemMaterial);
  batch('pots', new THREE.CylinderGeometry(.80, 1, 1, 12), new THREE.MeshStandardMaterial({ color: '#555b4b', roughness: .95 }));
  batch('wall-panels', new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({ color: '#233b2c', roughness: 1 }));

  function batch(name, geo, mat) { batches[name] = { geo, mat, items: [] }; }
  function add(name, x, y, z, sx, sy, sz, tint, normal, roll = 0) {
    transform.position.set(x, y, z);
    transform.scale.set(sx, sy, sz);
    transform.rotation.set(0, 0, 0);
    if (normal) {
      quaternion.setFromUnitVectors(front, v.set(...normal).normalize());
      transform.quaternion.copy(quaternion);
      transform.rotateZ(roll);
    } else { transform.rotation.set(0, roll, 0); }
    transform.updateMatrix();
    batches[name].items.push({ matrix: transform.matrix.clone(), tint });
  }
  function branch(a, b, radius, tint = '#324725', stemBatch = 'stems') {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.sub(start);
    transform.position.copy(start).addScaledVector(delta, .5);
    transform.scale.set(radius, delta.length(), radius);
    transform.quaternion.setFromUnitVectors(up, delta.normalize());
    transform.updateMatrix();
    batches[stemBatch].items.push({ matrix: transform.matrix.clone(), tint });
  }
  function corollaGeometry() {
    // Three overlapping frilled cups make a carnation, including its side profile.
    // Baked creases preserve petal depth when its texture becomes small on a phone.
    const positions=[],uvs=[],shades=[],indices=[];
    const layers=[{n:8,r:.50,z:0,h:.13},{n:7,r:.355,z:.15,h:.14},{n:5,r:.205,z:.295,h:.12}];
    for(let layer=0;layer<layers.length;layer++) {
      const {n,r,z,h}=layers[layer],first=positions.length/3;
      positions.push(0,0,z+h);uvs.push(.5,.5);shades.push(.55,.55,.55);
      for(let i=0;i<=n;i++) {
        const a=i/n*Math.PI*2+layer*.71;
        const rr=r*(1+.065*Math.sin(i*2.11));
        positions.push(Math.cos(a)*rr,Math.sin(a)*rr,z+(i%2?.045:-.02));
        uvs.push(.5+Math.cos(a)*.5,.5+Math.sin(a)*.5);
        const shade=i%2?.96:.76;shades.push(shade,shade,shade);
        if(i)indices.push(first,first+i,first+i+1);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(shades,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }
  function flowerTexture(rose) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const c=canvas.getContext('2d');c.translate(128,128);
    if(rose) {
      for(let ring=0;ring<5;ring++) {
        const count=7+ring*2,rad=76-ring*17;
        for(let i=0;i<count;i++) {
          c.save();c.rotate(i/count*Math.PI*2+ring*.76);
          const grad=c.createRadialGradient(0,-rad,0,0,-rad,42-ring*5);
          grad.addColorStop(0,'#fff9dc');grad.addColorStop(.48,'#eae7d7');grad.addColorStop(1,'#aaa58e');
          c.fillStyle=grad;c.beginPath();c.ellipse(0,-rad,30-ring*4,36-ring*4,.1,0,Math.PI*2);c.fill();c.restore();
        }
      }
    } else {
      // Carnations have torn, folded fans of petals, with no concentric outlines.
      for(let ring=0;ring<6;ring++) {
        const count=18-ring*2,rad=78-ring*12;
        for(let i=0;i<count;i++) {
          const angle=i/count*Math.PI*2+ring*.91+between(-.13,.13);
          const depth=between(24,35)-ring*2.6,width=between(17,24)-ring*1.9;
          const offset=rad+between(-8,7);
          c.save();c.rotate(angle);c.translate(between(-3,3),-offset);
          const grad=c.createLinearGradient(-width*.25,depth*.9,width*.15,-depth);
          grad.addColorStop(0,'#77786f');grad.addColorStop(.32,'#b1b3a9');grad.addColorStop(.68,'#e6e9dd');grad.addColorStop(1,'#fffef3');
          c.fillStyle=grad;c.beginPath();c.moveTo(-width*.22,depth*.9);
          for(let j=0;j<=20;j++) {
            const t=-Math.PI/2+j/20*Math.PI;
            const frill=1+.13*Math.sin(j*2.15+i)+between(-.06,.06);
            c.lineTo(Math.sin(t)*width*frill,-Math.cos(t)*depth*frill);
          }
          c.lineTo(width*.2,depth*.9);c.closePath();c.fill();
          c.strokeStyle='rgba(255,255,248,.24)';c.lineWidth=.75;
          for(let fold=0;fold<3;fold++) {
            const tx=(fold-1)*width*.40;
            c.beginPath();c.moveTo(tx*.25,depth*.7);
            c.quadraticCurveTo(tx*.7,-depth*.15,tx,-depth*.72);c.stroke();
          }
          c.restore();
        }
      }
    }
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;
  }
  function leafTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext('2d');
    const surface = ctx.createLinearGradient(0, 0, 96, 0);
    surface.addColorStop(0, '#a5aba0');
    surface.addColorStop(.42, '#f4f4e8');
    surface.addColorStop(.53, '#ecede0');
    surface.addColorStop(1, '#bdc5b9');
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, 96, 96);
    ctx.lineWidth = .8;
    ctx.strokeStyle = '#75897059';
    for (let y = 20; y < 95; y += 11) {
      ctx.beginPath();
      ctx.moveTo(1, y - 20);
      ctx.quadraticCurveTo(28, y - 9, 48, y);
      ctx.quadraticCurveTo(71, y - 7, 95, y - 20);
      ctx.stroke();
    }
    ctx.strokeStyle = '#fff9d9c0';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(48, 0);
    ctx.lineTo(48, 96);
    ctx.stroke();
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }
  function leafGeometry() {
    const positions = [0, 0, 0], uvs = [.5, 0];
    const indices = [0, 1, 2, 0, 2, 3];
    const sections = [[.22,.14,.02],[.47,.22,.06],[.73,.16,.10]];
    for (const [y, width, bend] of sections) {
      positions.push(-width, y, bend, 0, y, bend + .055, width, y, bend);
      uvs.push(0, y, .5, y, 1, y);
    }
    positions.push(0, 1, .16);
    uvs.push(.5, 1);
    for (let i = 1; i < 7; i += 3) {
      indices.push(i,i+3,i+1, i+1,i+3,i+4, i+1,i+4,i+2, i+2,i+4,i+5);
    }
    indices.push(7,10,8, 8,10,9);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  }
  function fernGeometry() {
    const positions = [], indices = [];
    const tri = (a, b, c) => { const i = positions.length / 3; positions.push(...a, ...b, ...c); indices.push(i, i + 1, i + 2); };
    for (let k = 0; k < 10; k++) {
      const y = .10 + k * .082, width = .15 * Math.sin((k + 2) / 13 * Math.PI);
      const z = y * y * .28;
      tri([-.008,y,z], [.008,y,z], [0,y+.065,z+.025]);
      for (const sign of [-1, 1]) {
        const root = [0,y,z], tip = [sign * width, y + .095, z + .032];
        tri(root, [sign * width * .67, y + .014, z -.009], tip);
        tri(root, tip, [sign * width * .61, y + .079, z + .038]);
      }
    }
    tri([0,.86,.21],[-.025,.91,.24],[0,1,.29]);
    tri([0,.86,.21],[0,1,.29],[.025,.91,.24]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
  }
  function fanFrond(x, y, z, size, angle, tilt, tint) {
    const axisX = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const axisY = new THREE.Vector3(Math.sin(angle), tilt, Math.cos(angle)).normalize();
    const axisZ = new THREE.Vector3().crossVectors(axisX, axisY).normalize();
    const basis = new THREE.Matrix4().makeBasis(axisX, axisY, axisZ);
    transform.position.set(x, y, z);
    transform.scale.set(size, size, size);
    transform.quaternion.setFromRotationMatrix(basis);
    transform.updateMatrix();
    batches.ferns.items.push({ matrix: transform.matrix.clone(), tint });
  }
  function fern(x, y, z, scale = 1, fronds = 4) {
    for (let i = 0; i < fronds; i++) {
      const a = i * Math.PI * 2 / fronds + between(-.2, .2), s = scale * between(.58, 1.05);
      fanFrond(x, y, z, s, a, between(.5,.85), random() > .5 ? '#537239' : '#365b35');
    }
  }
  function mound(x, z, radius, height, hue, y = 0, collide = true) {
    const flowerColor=new THREE.Color(hue);
    const stemBase = .07;
    const stemY = aboveBed => y + stemBase + (aboveBed - stemBase) * carnationStemScale;
    // Overlapping broad bouquets form continuous color banks, with a soft uneven
    // canopy. All colors stay grouped by the photographic flower-bed plan.
    const clusters=Math.round(11+radius*8);
    for(let cluster=0;cluster<clusters;cluster++) {
      const angle=cluster*2.399963+between(-.24,.24);
      const relative=Math.sqrt((cluster+.35)/clusters);
      const offset=radius*relative*.91;
      const cx=x+Math.cos(angle)*offset,cz=z+Math.sin(angle)*offset;
      const envelope=.72+.22*(1-relative*relative);
      const cy=height*envelope+Math.sin(angle*1.7)*.055+between(-.075,.07);
      const rx=between(.155,.225)*(radius/.6)**.3,rz=rx*between(.8,1.22);
      const ry=between(.075,.14);
      branch([x+(cx-x)*.30,y+stemBase,z+(cz-z)*.30],[cx,stemY(cy-.035),cz],.005,'#304a2d');
      const number=Math.round(between(24,31));
      for(let i=0;i<number;i++) {
        const theta=i*2.399963+between(-.3,.3),dist=Math.sqrt(random());
        const nx=Math.cos(theta),nz=Math.sin(theta);
        const fx=cx+nx*rx*dist,fz=cz+nz*rz*dist;
        const fy=cy+ry*(1-dist*.65)+between(-.025,.035);
        const size=between(.085,.125)*(radius/.6)**.13*carnationHeadScale;
        color.copy(flowerColor).offsetHSL(between(-.005,.005),between(-.018,.025),between(-.025,.018));
        const ny=between(.30,1.15),tilt=between(.35,1.0);
        add('florets',fx,stemY(fy),fz,size,size*between(.94,1.07),size,color.getHex(),[nx*tilt,ny,nz*tilt],between(0,6.28));
        // Outer flowers dip down the sides; these hide the tall bare-stem edge.
        if(i%5===0&&relative>.56) {
          const edgeX=fx+Math.cos(angle)*.035,edgeZ=fz+Math.sin(angle)*.035;
          color.copy(flowerColor).multiplyScalar(between(.76,.92));
          add('florets',edgeX,stemY(fy-between(.10,.22)),edgeZ,size*.90,size*.90,size*.90,color.getHex(),[Math.cos(angle),.15,Math.sin(angle)],between(0,6.28));
        }
      }
    }
    // Dense leaves occupy the lower bank instead of separate circular bases.
    for(let i=0;i<94;i++) {
      const a=random()*Math.PI*2,rr=radius*Math.sqrt(random())*.98;
      add('leaves',x+Math.cos(a)*rr,stemY(between(.03,height*.63)),z+Math.sin(a)*rr,
        between(.14,.27),between(.23,.41)*carnationStemScale,.28,random()>.5?'#25442e':'#395431',
        [Math.cos(a),between(.08,.7),Math.sin(a)],between(-1.5,1.5));
    }
    // A low, full fern skirt ties adjoining bouquets together at floor level.
    for(let i=0;i<4;i++) {
      const a=i*Math.PI/2+between(-.3,.3);
      fern(x+Math.cos(a)*radius*.72,y+.025,z+Math.sin(a)*radius*.72,radius*.92,6);
    }
    if(collide) colliders.push({minX:x-radius*.75,maxX:x+radius*.75,minZ:z-radius*.70,maxZ:z+radius*.70,minY:y,maxY:stemY(height+radius*.5)});
  }

  // The two branches converge behind the performer and open toward the audience.
  // Offset the bouquet centers so the edges read as a continuous V from above.
  const beds = [
    [-.55,-3.08,.56,1.02,3],[.54,-3.10,.56,1.05,4],
    [-1.53,-2.72,.66,1.22,4],[1.63,-2.69,.62,1.18,6],
    [-2.22,-2.38,.66,1.12,0],[2.34,-2.32,.65,1.10,3],
    [-3.05,-1.99,.69,1.13,3],[3.10,-1.91,.68,1.04,4],
    [-2.15,-1.49,.62,.95,2],[2.30,-1.34,.61,.88,0],
    [-3.63,-1.18,.73,1.01,0],[3.79,-1.11,.66,1.04,2],
    [-2.93,-.75,.66,.93,6],[3.03,-.65,.61,.94,6],
    [-4.13,-.51,.65,.86,7],[4.27,-.38,.67,.88,0],
    [-3.40,.07,.70,.87,3],[3.55,.15,.71,.84,4],
    [-4.61,.24,.61,.79,0],[4.67,.41,.62,.78,7],
    [-3.92,.94,.72,.79,4],[4.04,1.02,.70,.78,3],
    [-4.84,1.22,.56,.69,3],[4.90,1.30,.57,.68,0],
    [-4.45,1.75,.62,.72,2],[4.50,1.79,.64,.74,4],
    [-4.87,2.24,.54,.62,0],[4.89,2.25,.53,.64,6]
  ];
  if (centralFlowers) beds.forEach(([x,z,r,h,c]) => mound(x,z,r,h,palette[c]));
  const centralColliders = colliders.slice();
  const centralStats = flushBatches(centralGroup);
  // Flower banks sit behind the sofa and curl around its atrium-side arm.
  // Leave the aisle to the right of the sofa clear all the way to the stairs.
  const loungeBeds = [
    [5.18,2.44,.31,.58,0],[5.14,2.04,.32,.73,3],
    [5.57,2.00,.44,.88,7],[6.11,1.96,.44,.84,4],
    [6.60,2.10,.39,.80,7],[6.82,2.43,.31,.71,0],
    [4.96,2.82,.24,.51,2],[4.98,3.49,.23,.50,0]
  ];
  loungeBeds.forEach(([x,z,r,h,c]) => mound(x,z,r,h,palette[c],3.2));

  // Living-wall rectangles sit behind the raised lounge, below its concrete canopy.
  for (const centerZ of [0,4]) {
    add('wall-panels',8.87,5.18,centerZ,.055,1.28,2.75,'#233b2c');
    for (let row=0;row<7;row++) for (let col=0;col<16;col++) {
      const yy=4.60+row*.18+between(-.05,.05), zz=centerZ-1.30+col*.17+between(-.05,.05);
      const tint=['#45663b','#617b45','#33563b','#6d8448'][Math.floor(random()*4)];
      add('leaves',8.78-between(0,.08),yy,zz,.35,.40,.36,tint,[-1,between(-.2,.2),between(-.2,.2)],between(-3,3));
      if ((row+col)%3===0) add('ferns',8.73,yy+.1,zz,.51,.51,.51,tint,[-1,0,0],between(-2.7,2.7));
    }
    for (let j=0;j<7;j++) {
      const zz=centerZ-1.12+j*.37;
      let last=[8.73,4.65,zz];
      for(let k=1;k<=3;k++) {
        const point=[8.73-k*.015,4.65-k*.13,zz+Math.sin(k)*.06];
        branch(last,point,.007); last=point;
        add('leaves',...point,.15,.21,.2,'#456b42',[-1,.1,.1],between(-3,3));
      }
    }
  }


  function palm(x, y, z, height) {
    add('pots', x, y + .24, z, .38, .48, .38, '#626453');
    for (let stalk = 0; stalk < 3; stalk++) {
      const ox = between(-.13,.13), oz = between(-.13,.13), h = height * between(.75, 1);
      branch([x+ox,y+.22,z+oz], [x+ox,y+h,z+oz], .024, '#64744c');
      for (let j=0;j<8;j++) {
        const a=j * Math.PI/4 + stalk * .7;
        fanFrond(x+ox, y+h, z+oz, h*.64, a, .30, j%2 ? '#486641':'#6a8044');
      }
    }
    colliders.push({ minX:x-.32,maxX:x+.32,minZ:z-.32,maxZ:z+.32,minY:y,maxY:y+height });
  }
  palm(-5.85,0,-4.65,2.15); palm(5.10,0,-4.92,2.35);
  palm(8.36,3.2,-.28,1.46); palm(8.10,3.2,7.70,1.72);
  // The high book galleries are narrow: their greenery belongs to the railings.

  // Repeated draped vines form swags rather than a solid hedge across the railings.
  // Use the original traversal order so changing stages preserves every flower's position.
  const sharedBatches = batches;
  const stairVineBatches = Object.fromEntries(Object.entries(batches).map(([name, { geo, mat }]) =>
    [name, { geo, mat, items: [] }]));
  let vineSegments = 0, stairVineSegments = 0;
  for (const { a, b, concertHidden } of railPaths) {
    batches = concertHidden ? stairVineBatches : sharedBatches;
    if (!a || !b) continue;
    const length = Math.hypot(b[0]-a[0], b[2]-a[2], b[1]-a[1]);
    if (length < .10) continue;
    const dense = Math.min(a[1], b[1]) >= 3.4;
    const horizontal = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const outward = [(b[2] - a[2]) / horizontal, 0, (a[0] - b[0]) / horizontal];
    const steps = Math.ceil(length / (dense ? .13 : .17));
    if (concertHidden) stairVineSegments += steps + 1;
    let previous = null;
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const x = a[0]+(b[0]-a[0])*t, z = a[2]+(b[2]-a[2])*t;
      const y = a[1]+(b[1]-a[1])*t - .10 - .28 * Math.abs(Math.sin(t * length * 2.4));
      if (previous) branch(previous,[x,y,z],.013);
      previous = [x,y,z]; vineSegments++;
      for (let l=0;l<2;l++) {
        const dx=between(-.17,.17), dz=between(-.17,.17);
        add('leaves',x+dx,y+between(-.16,.05),z+dz,.23,.30,.32,random()>.5?'#446943':'#668450',[between(-1,1),between(-.3,.7),between(-1,1)],between(-3,3));
      }
      if (dense) {
        const foliage = ['#365635', '#476b3e', '#597648', '#708758'];
        // Add a second layer through the balusters and foliage above the rail.
        for (let l = 0; l < 3; l++) {
          const side = l % 2 ? -1 : 1;
          const offset = between(.06,.19) * side;
          const yy = a[1] + (b[1] - a[1]) * t - l * .30 + between(-.10,.09);
          add('leaves',x+outward[0]*offset,yy,z+outward[2]*offset,
            between(.31,.48),between(.34,.54),.32,foliage[(j+l)%foliage.length],
            [outward[0]*side,between(.05,.55),outward[2]*side],between(-2.5,2.5));
        }
      }
      if (j % (dense ? 3 : 4) === 0) {
        const size = dense ? .23 : .19;
        const offset = dense ? .15 : .04;
        for (const side of [-1, 1]) {
          add('roses',x+outward[0]*offset*side,y+.045,z+outward[2]*offset*side,
            size,size,1,random()>.45?'#efd071':'#f7e1a1',
            [outward[0]*side,.42,outward[2]*side],between(0,6));
        }
      }
      if (j > 0 && j % (dense ? 7 : 9) === 0) {
        const drop=between(.65,1.55), count=Math.ceil(drop/.17);
        let p=[x,y,z];
        for (let k=1;k<=count;k++) {
          const yy=y-drop*k/count, xx=x+Math.sin(k*.7)*.08, zz=z+Math.cos(k*.6)*.08;
          branch(p,[xx,yy,zz],.010); p=[xx,yy,zz];
          add('leaves',xx+between(-.1,.1),yy,zz+between(-.1,.1),.20,.27,.3, k%2?'#557447':'#3b603d',[between(-1,1),.4,between(-1,1)],between(-3,3));
          if(k%3===1) add('roses',xx,yy,zz,.14,.14,1,'#ead075',[between(-1,1),.4,between(-1,1)],between(0,6));
        }
      }
      if (j % (dense ? 4 : 6) === 0) {
        // Low ferns spill over the bottom of the balcony planters.
        const floor = Math.max(0,y-1.0);
        fern(x,floor,z,dense ? .66 : .50);
      }
    }
  }

  const stairVines = new THREE.Group();
  stairVines.name = 'Original stair garlands';
  centralGroup.add(stairVines);
  const stairVineStats = flushBatches(stairVines, stairVineBatches);
  batches = sharedBatches;
  for (const metric of Object.keys(stairVineStats)) centralStats[metric] += stairVineStats[metric];

  // A few longer rose strands reach below the gallery slab, as in the photo.
  for (let i=0;i<6;i++) {
    const zz=-1.65+i*1.55, xx=4.78;
    let last=[xx,3.28,zz];
    const segments=6+i%4;
    for(let k=1;k<=segments;k++) {
      const point=[xx-.04*Math.sin(k*.7),3.28-k*.16,zz+.07*Math.sin(k*.8)];
      branch(last,point,.009);last=point;
      add('leaves',...point,.20,.25,.24,k%2?'#5d7b46':'#3d623b',[-1,.2,.1],between(-3,3));
      if(k%3===1) add('roses',...point,.145,.145,1,'#efd682',[-1,.25,.15],between(0,6));
    }
  }

  // Keep the message-wall corner open above ankle-height flower banks.
  const wallBeds = [[-8.19, 8.14, .50, .33, 3], [-7.49, 8.34, .44, .28, 4],
    [-8.33, 7.46, .41, .27, 0], [-8.41, 6.86, .30, .22, 6]];
  wallBeds.forEach(([x, z, radius, height, tone]) => mound(x, z, radius, height, palette[tone]));
  const commonStats = flushBatches(scene);
  const commonColliders = colliders.slice(centralColliders.length);

  // A rounded head with a ruffled skirt has a silhouette even when viewed side-on.
  function concertCorolla() {
    const pos = [0, 0, .28], uv = [.5, .5], shades = [.69, .69, .69], indices = [];
    const segments = 16;
    const rings = [[.21, .31, .97], [.40, .22, .91], [.50, .08, .84], [.30, -.11, .56]];
    for (const [ring, [radius, depth, value]] of rings.entries()) {
      for (let i = 0; i < segments; i++) {
        const a = i * Math.PI * 2 / segments;
        const fold = Math.cos(i * 2.67 + ring * 1.4);
        const r = radius * (1 + .09 * fold);
        const x = r * Math.cos(a), y = r * Math.sin(a);
        pos.push(x, y, depth + .057 * fold);
        uv.push(.5 + x * .86, .5 + y * .86);
        const shade = value * (.93 + .07 * fold);
        shades.push(shade, shade, shade);
        const index = 1 + ring * segments + i;
        const next = 1 + ring * segments + (i + 1) % segments;
        if (!ring) indices.push(0, index, next);
        else indices.push(index - segments, index, next, index - segments, next, next - segments);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  function concertLeafSpray() {
    const positions = [], uv = [], indices = [];
    for (let n = 0; n < 14; n++) {
      const a = n * 2.39996, dx = Math.cos(a), dz = Math.sin(a);
      const length = between(.12,.23), height = between(.15,.31), width = between(.013,.027);
      const start = between(.018,.080), first = positions.length / 3;
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const r = start + length * t * t;
        const rise = height * t * (1.48 - .48 * t);
        const half = width * [.15, 1, .67, .015][i];
        for (const side of [-1,1]) {
          positions.push(dx * r - dz * half * side, rise, dz * r + dx * half * side);
          uv.push((side + 1) / 2, t);
        }
        if (i > 0) {
          const j = first + i * 2;
          indices.push(j-2,j,j-1, j-1,j,j+1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  function dressConcertStage(stage) {
    // Preserve the petal folds and cultivar color in the soft stage fill, including
    // under the rear sprays, outside the overhead spot. This adds no scene light.
    const flowerMaterial = floretMaterial.clone();
    flowerMaterial.emissive.set('#fff6ff');
    flowerMaterial.color.multiplyScalar(.88);
    flowerMaterial.emissiveIntensity = .32;
    flowerMaterial.emissiveMap = rosetteTex;
    flowerMaterial.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor.rgb;');
    };
    batch('stage-carnations', concertCorolla(), flowerMaterial);
    const blush = ['#fbd7de', '#efbec8', '#e6acba', '#f3c4c8'];
    const rose = ['#da8199', '#d78b9a', '#c67189', '#e49ea9'];
    const berry = ['#b45272', '#a94d68', '#bd607a', '#a14a62'];
    const leafColors = ['#44624a', '#526f4d', '#395440', '#577551'];
    const leafMaterial = batches.leaves.mat.clone();
    leafMaterial.emissive.set('#fff5db');
    leafMaterial.emissiveIntensity = .13;
    leafMaterial.emissiveMap = leafMaterial.map;
    leafMaterial.onBeforeCompile = flowerMaterial.onBeforeCompile;
    batch('stage-leaves', batches.leaves.geo, leafMaterial);
    batch('stage-foliage', concertLeafSpray(), leafMaterial);
    batch('stage-stems', batches.stems.geo, stemMaterial.clone());
    // Each spray has a common root, several tilted heads, and thin paired leaves.
    const pick = array => array[Math.floor(random() * array.length)];
    const { x, y, z, radius, mainHalfWidth, mainBack, mainFront, runwayBack, runwayHalfWidth } = stage;
    const pitch = .245;
    let row = 0;
    for (let rowZ = mainBack - .16; rowZ < z + radius + .39; rowZ += pitch, row++) {
      for (let column = -mainHalfWidth; column < mainHalfWidth; column += pitch) {
        const cx = x + column + (row % 2) * pitch / 2 + between(-.065,.065);
        const cz = rowZ + between(-.065,.065);
        const lateral = cx - x, dz = cz - z;
        const distance = Math.hypot(lateral, dz);
        const inHead = distance < radius - .12;
        let width = runwayHalfWidth;
        if (cz < runwayBack) width = THREE.MathUtils.lerp(mainHalfWidth, runwayHalfWidth,
          THREE.MathUtils.clamp((cz - mainFront) / (runwayBack - mainFront), 0, 1));
        const onDeck = inHead || (cz <= z && Math.abs(lateral) < width - .10 && cz >= mainBack + .08);
        // Low ground-level beds flank the runway and round tip. These sit inside
        // the audience's existing clear perimeter; the entrance stays open.
        const besideHead = distance > radius + .09 && distance < radius + .35
          && (dz < 0 || Math.abs(lateral) > .58);
        const besideRunway = cz > runwayBack && cz < z && distance > radius + .08
          && Math.abs(lateral) > runwayHalfWidth + .09 && Math.abs(lateral) < 1.06;
        const behindStage = cz < mainBack - .03 && cz > mainBack - .23
          && Math.abs(lateral) < mainHalfWidth - .22;
        if (!onDeck && !besideHead && !besideRunway && !behindStage) continue;
        // Leave room for the bass drum and the existing pair of keyboards.
        if (Math.hypot(cx - 4.4, cz + 4.7) < .53 ||
            (Math.abs(Math.abs(cx) - 3.18) < .95 && Math.abs(cz + 3.30) < .31)) continue;
        // A narrow, curved opening across the front joins the performer's mark and runway.
        const aisle = .27 * Math.sin((dz + .1) * 2.1);
        const clearance = inHead ? .29 + .11 * Math.max(0, 1 - Math.abs(dz)) : .35;
        const inAisle = Math.abs(lateral - aisle) < clearance;
        const acrossFront = dz > radius * .68;
        if ((inAisle && !acrossFront) || Math.hypot(lateral, dz) < .49) continue;
        const hill = .5 + .5 * Math.sin(lateral * 2.2 + .8 * Math.cos(cz * 1.9)) * Math.cos(cz * 1.63);
        const rear = THREE.MathUtils.smoothstep(-dz, -.7, 3.2);
        const height = (.26 + .22 * hill + .28 * rear) * between(.82,1.15) * (inAisle ? .64 : 1) * carnationStemScale;
        const tone = Math.sin(cx * 2.18 + Math.sin(cz * 1.57)) + .56 * Math.cos(cz * 2.4 - cx * .38);
        const colors = tone > -.15 ? blush : tone > -.86 ? rose : berry;
        const angle = between(0, Math.PI * 2);
        const rootY = onDeck ? y + .012 : .012;
        const splitY = rootY + height * .61;
        branch([cx,rootY,cz],[cx,splitY,cz],.0052,'#4c6445','stage-stems');
        add('stage-foliage',cx,rootY,cz,between(.83,1.20),height * 2.6,between(.85,1.2),
          pick(leafColors),null,angle);
        const heads = 3 + Number(random() < .31) + Number(behindStage || (!onDeck && besideHead));
        for (let i = 0; i < heads; i++) {
          const a = angle + i * 2.4 + between(-.2,.2), reach = between(.048,.128);
          const dx = Math.cos(a), dz = Math.sin(a);
          const fx = cx + dx * reach, fz = cz + dz * reach;
          const fy = rootY + height * between(.80,1.11);
          const size = between(.112,.163) * carnationHeadScale;
          branch([cx,splitY,cz],[fx,fy,fz],.0039,'#446143','stage-stems');
          add('stage-carnations',fx,fy,fz,size,size * between(.91,1.04),size,
            pick(colors),[dx,between(.40,2.1),dz],between(0,2*Math.PI));
          // Carnation foliage is narrow, blue-green and swept outward along the shoots.
          add('stage-leaves',cx,rootY + height * between(.17,.63),cz,
            between(.096,.16),between(.22,.39)*carnationStemScale,.20,pick(leafColors),
            [dx,between(.16,.68),dz],between(-.95,.95));
        }
      }
    }
    return batches['stage-carnations'].items.length;
  }
  function flushBatches(parent, source = batches) {
    const stats = { drawCalls: 0, instances: 0, triangles: 0 };
    for (const [name, data] of Object.entries(source)) {
      if (!data.items.length) continue;
      const mesh = new THREE.InstancedMesh(data.geo, data.mat, data.items.length);
      mesh.name = `botanical-${name}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      data.items.forEach((item,i)=> { mesh.setMatrixAt(i,item.matrix); color.set(item.tint ?? 0xffffff); mesh.setColorAt(i,color); });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      parent.add(mesh);
      stats.drawCalls++;
      stats.instances += mesh.count;
      stats.triangles += (data.geo.index ? data.geo.index.count : data.geo.attributes.position.count) / 3 * mesh.count;
      data.items = [];
    }
    return stats;
  }

  let stageCarnations = 0;
  let concertStats;
  const counts = { livingWalls: 2, vineSegments };
  function setConcert(enabled, onConcertReady) {
    enabled = Boolean(enabled && concertStage);
    if (enabled && !concertStats) {
      stageCarnations = dressConcertStage(concertStage);
      concertStats = flushBatches(concertGroup);
      onConcertReady?.(concertGroup);
    }
    centralGroup.visible = !enabled;
    concertGroup.visible = enabled;
    counts.vineSegments = vineSegments - (enabled ? stairVineSegments : 0);
    counts.stageCarnations = enabled ? stageCarnations : 0;
    counts.mounds = loungeBeds.length + wallBeds.length + (!enabled && centralFlowers ? beds.length : 0);
    const activeStats = enabled ? concertStats : centralStats;
    for (const metric of ['drawCalls', 'instances', 'triangles']) counts[metric] = commonStats[metric] + activeStats[metric];
  }
  setConcert(Boolean(concertStage && !centralFlowers));
  return { centralGroup, concertGroup, centralColliders, commonColliders, setConcert, counts,
    get colliders() { return concertGroup.visible ? commonColliders : colliders; } };
}
