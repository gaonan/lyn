// Shared by the wardrobe preview and the three-stage comparison.
export function createSecretGarden(THREE, { gallery, flowers, renderer }) {
  const world = new THREE.Group();
  const aim = new THREE.Vector3(.02, 0, -.18);
  const lantern = new THREE.Vector3(-.73, 3.35, -.78);
  const rim = new THREE.Vector3(1.34, 3.52, -3.35);
  const keyAxis = aim.clone().sub(lantern).normalize();
  const rimAxis = new THREE.Vector3(.28, 0, -1.75).sub(rim).normalize();
  const stageCenter = -1.19;
  const stageRadius = 1.78;
  const lens = { value: new THREE.Vector3() };
  const lamps = {
    keySource: { value: lantern }, keyAxis: { value: keyAxis }, keyFocus: { value: aim },
    rimSource: { value: rim }, rimAxis: { value: rimAxis },
  };

  function texture(image) {
    const map = new THREE.Texture(image);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    map.needsUpdate = true;
    return map;
  }

  const backdrop = texture(gallery);
  backdrop.repeat.y = .705;
  backdrop.offset.y = .295;
  const galleryMaterial = new THREE.MeshBasicMaterial({ map: backdrop, color: 0xf4e6ff, toneMapped: false });
  galleryMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>",
      "#include <common>\nvarying float galleryHeight;").replace("#include <begin_vertex>",
      "#include <begin_vertex>\ngalleryHeight = position.y + 2.11;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
      "#include <common>\nvarying float galleryHeight;").replace("#include <map_fragment>",
      "#include <map_fragment>\ndiffuseColor.rgb = mix(vec3(.022,.011,.026),diffuseColor.rgb,smoothstep(0.,.22,galleryHeight));");
  };
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 4.22), galleryMaterial);
  wall.position.set(0, 2.11, -5.55);
  world.add(wall);

  const flowerMap = texture(flowers);
  const flowerRatio = flowers.naturalWidth / flowers.naturalHeight;
  for (const [x, z, height, side, tint] of [
    [-1.68, -2.52, .72, -1, 0xb097c1], [1.71, -2.48, .77, 1, 0xbd9cc5],
    [-1.98, -1.35, .77, -1, 0x8d76a0], [2.03, -1.21, .81, 1, 0x9375a3],
    [-2.21, -.16, .71, -1, 0x6f567f], [2.23, -.34, .76, 1, 0x8d6998],
  ]) {
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(height * flowerRatio, height),
      new THREE.MeshBasicMaterial({ map: flowerMap, color: tint, alphaTest: .17, side: THREE.DoubleSide, toneMapped: false }));
    bank.position.set(x, height / 2 - .07, z);
    bank.rotation.y = side * .24;
    bank.scale.x = -side;
    world.add(bank);
  }

  const noise = /* glsl */`
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 cell = floor(p), f = fract(p);
      f = f*f*(3.-2.*f);
      return mix(mix(hash(cell),hash(cell+vec2(1.,0.)),f.x),
        mix(hash(cell+vec2(0.,1.)),hash(cell+1.),f.x),f.y);
    }
  `;
  const lighting = /* glsl */`
    uniform vec3 keySource, keyAxis, keyFocus, rimSource, rimAxis;
    float beam(vec3 p, vec3 origin, vec3 axis, float spread, out float travel) {
      vec3 toPoint = p - origin;
      travel = dot(toPoint, axis);
      vec3 radial = toPoint - axis * travel;
      float radius = length(radial) / (.067 + spread*max(0.,travel));
      return (1.-smoothstep(.41,1.13,radius))*(.33+.67*exp(-radius*radius*1.9))
        *smoothstep(.018,.27,travel);
    }
  `;
  const deck = new THREE.ShaderMaterial({
    uniforms: { lens, ...lamps, center: { value: stageCenter }, radius: { value: stageRadius } },
    vertexShader: /* glsl */`
      varying vec3 p;
      void main() {
        p = (modelMatrix*vec4(position,1.)).xyz;
        gl_Position = projectionMatrix*viewMatrix*vec4(p,1.);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 p;
      uniform vec3 lens;
      uniform float center, radius;
    ` + noise + lighting + /* glsl */`
      float pool(vec2 uv, vec2 scale) {
        vec2 points = uv/scale;
        return exp(-2.*dot(points,points));
      }
      void main() {
        vec2 uv = p.xz;
        float disk = length(uv-vec2(0.,center));
        float raised = smoothstep(-.07,-.01,p.y);
        float hotDistance, rimDistance;
        float key = beam(p,keySource,keyAxis,.27,hotDistance);
        float fill = beam(p,rimSource,rimAxis,.28,rimDistance);
        float grain = .53*noise(uv*vec2(4.4,72.))+.31*noise(uv*vec2(21.,113.))
          +.16*noise(uv*vec2(145.,220.));
        float board = fract(p.z*12.2+.09*noise(uv*3.));
        float seam = 1.-smoothstep(.013,.054,min(board,1.-board));
        float timber = (.73+.51*grain)*(1.-seam*.24);
        float diff = abs(disk-radius);
        vec2 reflection = uv-keyFocus.xz;
        float bloom = pool(reflection,vec2(1.48,1.62));
        vec3 color = mix(vec3(.031,.014,.037),vec3(.075,.029,.091),raised)*timber;
        color += vec3(.10,.047,.16)*bloom;
        color += vec3(.31,.23,.48)*key*timber
          *clamp(11.8/dot(p-keySource,p-keySource),.55,1.3);
        color += vec3(.14,.049,.25)*fill*timber;
        vec3 sight = normalize(lens-p);
        float glossy = raised*pool(reflection+vec2(.05,-.34),vec2(.53,1.34));
        float polish = .22+.78*pow(grain,2.1);
        color += vec3(.39,.29,.59)*glossy*polish*(1.-seam*.52)*(1.-.43*sight.y);
        float rimLight = exp(-diff*65.)*.36+exp(-diff*121.)*.45;
        color += vec3(.31,.17,.32)*rimLight*(.49+.51*raised)*(.63+.37*noise(uv*8.));
        float contact = pool(uv-vec2(.045,.07),vec2(.47,.29));
        float nearFoot = pool(uv-vec2(-.14,-.01),vec2(.16,.16))
          +pool(uv-vec2(.15,-.01),vec2(.16,.16));
        color *= 1.-min(.71,.38*contact+.46*nearFoot);
        float depth = smoothstep(4.9,10.1,distance(lens,p));
        gl_FragColor = vec4(mix(color,vec3(.017,.009,.020),depth),1.);
        #include <colorspace_fragment>
      }
    `,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(33, 24), deck);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -.106, -4.9);
  world.add(ground);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(stageRadius, stageRadius + .04, .11, 144), deck);
  platform.position.set(0, -.055, stageCenter);
  world.add(platform);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(stageRadius - .017, .009, 8, 144),
    new THREE.MeshBasicMaterial({ color: 0xb698ba, toneMapped: false }));
  edge.rotation.x = Math.PI / 2;
  edge.position.set(0, .012, stageCenter);
  world.add(edge);

  const rotation = { value: new THREE.Matrix3() };
  const aperture = { value: new THREE.Vector2() };
  const viewOffset = { value: 0 };
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { lens, rotation, aperture, viewOffset, ...lamps },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 screen;
      void main() { screen = uv; gl_Position = vec4(position.xy,0.,1.); }
    `,
    fragmentShader: /* glsl */`
      varying vec2 screen;
      uniform vec3 lens;
      uniform vec2 aperture;
      uniform mat3 rotation;
      uniform float viewOffset;
    ` + noise + lighting + /* glsl */`
      void main() {
        vec2 ndc = screen*2.-1.;
        ndc.y += viewOffset;
        vec3 ray = normalize(rotation*vec3(ndc*aperture,-1.));
        float entry = (1.04-lens.z)/ray.z;
        float end = (-4.82-lens.z)/ray.z;
        if(ray.y<0.) end=min(end,-lens.y/ray.y);
        float stride = max(0.,(end-entry)/42.);
        float mainLight = 0., violet = 0.;
        for(int i=0;i<42;i++){
          vec3 p = lens + ray*(entry+(float(i)+.5)*stride);
          float a,b;
          float key = beam(p,keySource,keyAxis,.245,a);
          float rim = beam(p,rimSource,rimAxis,.205,b);
          float smoke = .64+.34*noise(p.xy*vec2(2.1,1.33))+.24*noise(p.xz*3.6);
          float strands = .65+.43*noise((p.xz-keySource.xz)*13./max(.35,a));
          mainLight += key*smoke*strands*stride/(.40+.20*a*a);
          violet += rim*smoke*stride/(.50+.24*b*b);
        }
        float white = (1.-exp(-mainLight*1.41))*.43;
        float purple = (1.-exp(-violet*1.22))*.29;
        vec3 tint = mix(vec3(.70,.56,.98),vec3(.53,.24,1.),purple/max(.0001,white+purple));
        gl_FragColor = vec4(tint,min(.63,white+purple));
        #include <colorspace_fragment>
      }
    `,
  }));
  mist.frustumCulled = false;
  mist.renderOrder = 5;
  world.add(mist);

  const time = { value: 0 };
  const pixels = { value: 520 };
  let seed = 1102427;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = [], seeds = [];
  for (let i = 0; i < 880; i++) {
    const inLight = random() < .58;
    const width = inLight ? 3.6 : 7.6;
    const depth = inLight ? -3.15 + random()*3.76 : -5.25 + random()*6.18;
    positions.push((random()-.5)*width, random()*3.66, depth);
    seeds.push(random(), random(), random());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 3));
  const particles = new THREE.Points(geometry, new THREE.ShaderMaterial({
    uniforms: { time, pixels, ...lamps },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float time,pixels;
      attribute vec3 seed;
      varying vec2 gleam;
    ` + lighting + /* glsl */`
      void main() {
        vec3 p = position;
        p.y = mod(p.y-time*(.17+seed.x*.37),3.66);
        p.x += sin(seed.y*27.+p.y*1.8+time*.63)*(.025+seed.z*.088);
        p.z += cos(seed.x*19.+time*.58)*.053;
        vec4 eye = viewMatrix*vec4(p,1.);
        gl_Position = projectionMatrix*eye;
        gl_PointSize = clamp((1.2+pow(seed.z,2.5)*3.4)*pixels/530.*3.15/max(1.8,-eye.z),1.,5.8);
        float a,b;
        float key = beam(p,keySource,keyAxis,.29,a);
        float fill = beam(p,rimSource,rimAxis,.26,b);
        float edge = smoothstep(.08,.33,p.y)*(1.-smoothstep(3.3,3.66,p.y));
        float sparkle = .4+.60*pow(abs(sin(seed.y*31.+time*(.9+seed.z))),2.2);
        gleam = vec2(edge*sparkle*(.24+1.23*key+.52*fill)*(.45+.55*seed.z), seed.y);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 gleam;
      void main() {
        vec2 uv = (gl_PointCoord-.5)*2.;
        float core = exp(-dot(uv,uv)*6.);
        float glint = exp(-abs(uv.x)*16.-abs(uv.y)*4.)*.52;
        vec3 tint = mix(vec3(.58,.34,.90),vec3(.94,.79,.97),gleam.y);
        gl_FragColor = vec4(tint,(core+glint)*min(.86,gleam.x));
        #include <colorspace_fragment>
      }
    `,
  }));
  particles.frustumCulled = false;
  particles.renderOrder = 6;
  world.add(particles);

  return {
    world,
    update(camera, seconds) {
      lens.value.copy(camera.position);
      rotation.value.setFromMatrix4(camera.matrixWorld);
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      aperture.value.set(tangent * camera.aspect, tangent);
      viewOffset.value = camera.view?.enabled ? -2 * camera.view.offsetY / camera.view.fullHeight : 0;
      time.value = seconds;
      pixels.value = renderer.domElement.height;
    },
  };
}
