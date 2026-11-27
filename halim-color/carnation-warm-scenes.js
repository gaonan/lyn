// The approved bookcase and warm-gold lighting, shared with the dressing-room viewport.
export function createCarnationAndWarm(THREE, renderer) {
  const rear = -2.65;
  const rearCrop = .765;

  const libraryLamp = {
    source: new THREE.Vector3(-1.07,3.14,-.94),
    focus: new THREE.Vector3(.02,0,-.16),
    color: new THREE.Vector3(.86,.91,1),
    spread: .265,
  };
  const libraryLampUniforms = {
    keySource: {value:libraryLamp.source},
    keyFocus: {value:libraryLamp.focus},
    keyDirection: {value:libraryLamp.focus.clone().sub(libraryLamp.source).normalize()},
    keyColor: {value:libraryLamp.color},
    keySpread: {value:libraryLamp.spread},
  };

  function picture(image, renderer) {
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  }

  function randomizer(seed) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  const floorVertex = /* glsl */`
    varying vec3 pos;
    void main() {
      pos = (modelMatrix * vec4(position, 1.)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.);
    }
  `;
  const surfaceNoise = /* glsl */`
    float hash(vec2 p) { return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    float n(vec2 p) {
      vec2 a=floor(p), f=fract(p);
      f=f*f*(3.-2.*f);
      return mix(mix(hash(a),hash(a+vec2(1,0)),f.x),mix(hash(a+vec2(0,1)),hash(a+1.),f.x),f.y);
    }
  `;
  const libraryBeam = /* glsl */`
    uniform vec3 keySource,keyDirection,keyColor;
    uniform float keySpread;
    float beamRadius(float travel) {
      return .067+keySpread*max(travel,0.);
    }
    float beamProfile(float radius) {
      return (1.-smoothstep(.49,1.08,radius))*(.29+.71*exp(-radius*radius*1.6));
    }
  `;
  const floorFragment = /* glsl */`
    varying vec3 pos;
    uniform float warm;
    uniform vec3 lens;
    uniform vec3 keyFocus;
    uniform sampler2D deck;
  ` + surfaceNoise + libraryBeam + /* glsl */`
    float lightPool(vec2 p, vec2 center, vec2 extent) {
      vec2 q=(p-center)/extent;
      return exp(-dot(q,q)*2.);
    }
    void main() {
      vec2 p=pos.xz;
      float board=floor(p.y*5.2), edge=fract(p.y*5.2);
      float seam=1.-smoothstep(.007,.034,min(edge,1.-edge));
      float joint=fract(p.x*.65+hash(vec2(board,17.))*2.);
      seam=max(seam,(1.-smoothstep(.003,.010,min(joint,1.-joint)))*.62);
      float grain=n(p*vec2(9.,65.))*.38+n(p*vec2(1.5,26.))*.41+n(p*110.)*.21;
      float grit=mix(.63,1.28,grain)*(1.-seam*.40)*(0.83+hash(vec2(board,5.))*.24);
      float softKey=lightPool(p,vec2(.02,-.25),vec2(2.7,3.1));
      vec3 wooden=vec3(.020,.022,.029)*(0.68+softKey*.54)*grit;
      float referenceDistance=4.25-pos.z;
      vec2 projected=vec2(.5+pos.x/(referenceDistance*.996)*.54,.5-.915/(referenceDistance*.525));
      vec3 realWood=texture2D(deck,clamp(projected,vec2(.04,.012),vec2(.96,.234))).rgb;
      float timber=dot(realWood,vec3(.2126,.7152,.0722));
      wooden=mix(wooden,mix(vec3(timber),realWood,.32)*vec3(.74,.82,.99),.75);
      vec3 fromLamp=pos-keySource;
      float travel=dot(fromLamp,keyDirection);
      vec3 radial=fromLamp-travel*keyDirection;
      float beam=beamProfile(length(radial)/beamRadius(travel));
      float attenuation=(dot(keyFocus-keySource,keyFocus-keySource)/dot(fromLamp,fromLamp))
        *max(.0,-normalize(fromLamp).y);
      float floorBounce=lightPool(p,keyFocus.xz+vec2(.05,.18),vec2(1.77,1.83));
      float satin=pow(n(p*vec2(3.4,49.)),2.3)*.12;
      wooden=wooden*(.43+.53*softKey)+keyColor*.118*floorBounce*grit;
      wooden+=keyColor*beam*attenuation*(.225*grit+timber*.26+satin*(1.-seam*.62));
      float pools=lightPool(p,vec2(-1.07,-1.32),vec2(.59,1.06))
        +lightPool(p,vec2(1.08,-1.32),vec2(.59,1.06))
        +lightPool(p,vec2(0.,-2.14),vec2(.66,.96))*.78;
      float reflection=lightPool(p,vec2(-1.04,-.25),vec2(.46,1.95))
        +lightPool(p,vec2(1.07,-.28),vec2(.46,1.95))
        +lightPool(p,vec2(0.,-.35),vec2(.56,2.12))*.69;
      float glints=lightPool(p,vec2(-1.10,-1.30),vec2(.285,.34))
        +lightPool(p,vec2(1.07,-1.31),vec2(.285,.34));
      float polish=n(p*vec2(45.,165.))*.56+n(p*vec2(8.,72.))*.44;
      vec3 gold=vec3(.009,.0048,.0027)*grit+vec3(.50,.211,.048)*pools*grit;
      gold+=vec3(.64,.269,.053)*reflection*(.07+pow(polish,2.)*.78);
      gold+=vec3(1.02,.53,.13)*glints*(.39+.61*pow(polish,2.3))*(1.-seam*.78);
      vec3 color=mix(wooden,gold,warm);
      float distanceFade=1.-smoothstep(6.,14.,distance(lens,pos));
      vec3 backdropColor=mix(vec3(.004,.005,.008),vec3(.00335,.0020,.00115),warm);
      gl_FragColor=vec4(mix(backdropColor,color,distanceFade),1.);
      #include <colorspace_fragment>
    }
  `;

  const beams = [
    {origin:[-.61,2.98,-2.32], target:[-1.07,0,-1.32], width:.212, gain:2.8},
    {origin:[0,3.16,-3.15], target:[0,0,-2.14], width:.175, gain:2.63},
    {origin:[.65,2.98,-2.18], target:[1.08,0,-1.32], width:.223, gain:2.64},
  ];

  function makeAtmosphere() {
    const uniforms = {
      lens:{value: new THREE.Vector3()}, viewRotation:{value: new THREE.Matrix3()},
      tangent:{value: new THREE.Vector2()}, viewShift:{value:0}, time:{value:0},
      origin:{value:beams.map(beam => new THREE.Vector3(...beam.origin))},
      axis:{value:beams.map(beam => new THREE.Vector3(...beam.target).sub(new THREE.Vector3(...beam.origin)).normalize())},
      cone:{value:beams.map(beam => new THREE.Vector2(beam.width,beam.gain))},
    };
    const material = new THREE.ShaderMaterial({
      uniforms, transparent:true, depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending,
      vertexShader:`
        varying vec2 point;
        void main() { point=uv; gl_Position=vec4(position.xy,0.,1.); }
      `,
      fragmentShader:`
        varying vec2 point;
        uniform vec3 lens,origin[3],axis[3];
        uniform vec2 cone[3],tangent;
        uniform mat3 viewRotation;
        uniform float viewShift;
        uniform float time;
      ` + surfaceNoise + `
        float beamAt(vec3 p, vec3 source, vec3 direction, vec2 profile) {
          vec3 rel=p-source;
          float t=dot(rel,direction);
          float radius=max(.031,t*profile.x+.012);
          vec3 radial=rel-t*direction;
          float u=length(radial)/radius;
          float edge=1.-smoothstep(.23,1.,u);
          float core=0.24+0.76*exp(-u*u*3.5);
          float end=smoothstep(.006,.11,t)*(1.-smoothstep(2.25,3.16,t));
          vec2 angle=radial.xz/max(.12,t);
          float streak=.36+n(angle*vec2(26.,8.))*.59+pow(n(angle*vec2(64.,15.)),3.)*.82;
          float sourceCore=exp(-u*u*15.)*exp(-t*2.2);
          return (core*streak+sourceCore*1.48)*edge*end*profile.y/(.34+t*t*.23);
        }
        void main() {
          vec3 ray=normalize(viewRotation*vec3((point*2.-1.+vec2(0.,viewShift))*tangent,-1.));
          float lengthToFloor=ray.y<0.?-lens.y/ray.y:14.;
          float accum=0., mist=0.;
          float start=(-.28-lens.z)/ray.z;
          float end=min((-4.44-lens.z)/ray.z,lengthToFloor);
          float delta=max(0.,(end-start)/60.);
          for(int i=0;i<60;i++){
            float t=start+(float(i)+.5)*delta;
            vec3 p=lens+t*ray;
            float haze=.51+.39*n(p.xz*1.7+vec2(p.y*.70,time*.038))
              +.22*n(p.zy*3.4+vec2(-time*.022,p.x*2.));
            float strength=0.;
            for(int j=0;j<3;j++) strength+=beamAt(p,origin[j],axis[j],cone[j]);
            float shaft=mix(.39,1.49,smoothstep(.61,2.55,p.y));
            accum+=strength*haze*delta*shaft;
            float cloud=exp(-abs(p.y-.45)*1.8)*exp(-abs(p.z+2.2)*.55);
            mist+=haze*cloud*delta;
          }
          float opacity=1.-exp(-accum*2.15);
          float veil=min(.018,mist*.0055);
          vec3 gold=mix(vec3(1.,.29,.035),vec3(1.,.53,.16),opacity);
          gl_FragColor=vec4(gold,min(.86,opacity*.91+veil));
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);
    mesh.frustumCulled=false;
    mesh.renderOrder=5;
    return mesh;
  }

  function makeLibraryLight({lens,viewRotation,tangent,viewShift}) {
    const material=new THREE.ShaderMaterial({
      uniforms:{lens,viewRotation,tangent,viewShift,...libraryLampUniforms},
      transparent:true, depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending,
      vertexShader:`
        varying vec2 point;
        void main() { point=uv; gl_Position=vec4(position.xy,0.,1.); }
      `,
      fragmentShader:`
        varying vec2 point;
        uniform vec3 lens;
        uniform mat3 viewRotation;
        uniform float viewShift;
        uniform vec2 tangent;
      ` + surfaceNoise + libraryBeam + `
        void main() {
          vec3 ray=normalize(viewRotation*vec3((point*2.-1.+vec2(0.,viewShift))*tangent,-1.));
          float floor=ray.y<0.?-lens.y/ray.y:13.;
          float entry=(.94-lens.z)/ray.z;
          float exitDistance=min((-2.27-lens.z)/ray.z,floor);
          float stride=max(0.,(exitDistance-entry)/56.);
          float scatter=0.;
          for(int i=0;i<56;i++){
            vec3 p=lens+ray*(entry+(float(i)+.5)*stride);
            vec3 q=p-keySource;
            float along=dot(q,keyDirection);
            vec3 radial=q-keyDirection*along;
            float shape=beamProfile(length(radial)/beamRadius(along));
            vec2 bearing=radial.xz/max(.22,along);
            float filaments=.45+.50*n(bearing*vec2(21.,13.))
              +.39*pow(n(bearing*vec2(45.,25.)),1.5);
            float haze=.70+.43*n(p.xy*vec2(1.7,1.9))+.16*n(p.zy*2.85);
            float reach=smoothstep(.035,.24,along);
            scatter+=shape*reach*haze*filaments*stride/(.32+.18*along*along);
          }
          float brightness=(1.-exp(-scatter*1.55))*.53;
          gl_FragColor=vec4(keyColor,brightness);
          #include <colorspace_fragment>
        }
      `,
    });
    const shaft=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);
    shaft.frustumCulled=false;
    shaft.renderOrder=5;
    return shaft;
  }

  function makeGoldRain() {
    const random = randomizer(261127);
    const count=3900;
    const origin=[], marks=[], sizes=[];
    for(let i=0;i<count;i++){
      const side=i%2===0? -1:1;
      const near=random()<.11;
      const x=side*(.24+Math.pow(random(),.67)*2.2);
      origin.push(x,random()*3.75,near ? .2+random()*1.65 : -5.9+random()*5.85);
      marks.push(random(),random(),near ? 1 : 0);
      sizes.push(.49+Math.pow(random(),3.2)*2.17);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(origin,3));
    geometry.setAttribute('marks',new THREE.Float32BufferAttribute(marks,3));
    geometry.setAttribute('size',new THREE.Float32BufferAttribute(sizes,1));
    const material=new THREE.ShaderMaterial({
      uniforms:{time:{value:0}, screen:{value:600}}, transparent:true, depthWrite:false,
      blending:THREE.AdditiveBlending,
      vertexShader:`
        uniform float time,screen;
        attribute vec3 marks;
        attribute float size;
        varying vec3 shimmer;
        void main(){
          vec3 p=position;
          p.y=mod(p.y-time*(.32+marks.x*.69)+72.,3.75);
          p.x+=sin(time*1.3+marks.y*33.+p.y*.47)*(.012+marks.x*.049);
          vec4 eye=viewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*eye;
          gl_PointSize=clamp((size*3.85+marks.z*1.8)*screen/590./max(1.,-eye.z*.48),1.,9.);
          shimmer=vec3(marks.xy, max(0.,sin(p.y*.836))*smoothstep(.025,.35,p.y));
        }
      `,
      fragmentShader:`
        uniform float time;
        varying vec3 shimmer;
        void main(){
          vec2 p=(gl_PointCoord-.5)*2.;
          float core=exp(-dot(p*vec2(2.9,1.25),p*vec2(2.9,1.25))*2.1);
          float halo=exp(-dot(p,p)*5.)*.16;
          float tail=exp(-abs(p.x)*16.)*exp(-abs(p.y+.20)*2.0)*smoothstep(.55,.97,shimmer.x)*.64;
          float blink=.24+.76*pow(abs(sin(shimmer.y*39.+time*(2.+shimmer.x*3.))),2.8);
          gl_FragColor=vec4(mix(vec3(.98,.36,.055),vec3(1.,.71,.29),shimmer.y),
            (core+halo+tail)*blink*shimmer.z*(.64+shimmer.x*.70));
          #include <colorspace_fragment>
        }
      `
    });
    const rain=new THREE.Points(geometry,material);
    rain.frustumCulled=false;
    rain.renderOrder=9;
    return rain;
  }

  function makeGoldTrails() {
    const random=randomizer(622807);
    const positions=[], seeds=[], tips=[];
    for(let i=0;i<540;i++){
      const x=(i%2?-1:1)*(.64+random()*1.64);
      const y=random()*3.55,z=-5.2+random()*6.3;
      const seed=random(),speed=.27+random()*.83;
      for(const end of [0,1]){
        positions.push(x,y,z);
        seeds.push(seed,speed);
        tips.push(end);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,2));
    geometry.setAttribute('tip',new THREE.Float32BufferAttribute(tips,1));
    const material=new THREE.ShaderMaterial({
      uniforms:{time:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`
        uniform float time;
        attribute vec2 seed;
        attribute float tip;
        varying vec3 info;
        void main(){
          vec3 p=position;
          p.y=mod(p.y-time*seed.y+72.,3.65);
          p.x+=sin(seed.x*29.+time*.8)*.021;
          float brightness=smoothstep(.045,.6,p.y)*(.63+.37*sin(seed.x*45.+time*1.2));
          p.y+=tip*(.020+pow(seed.x,2.2)*.084);
          gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
          info=vec3(brightness,tip,seed.x);
        }
      `,
      fragmentShader:`
        varying vec3 info;
        void main(){
          vec3 gold=mix(vec3(.95,.35,.068),vec3(1.,.67,.29),info.z);
          gl_FragColor=vec4(gold,info.x*pow(1.-info.y,1.17)*.56);
          #include <colorspace_fragment>
        }
      `,
    });
    const layer=new THREE.LineSegments(geometry,material);
    layer.frustumCulled=false;
    layer.renderOrder=10;
    return layer;
  }

  function makeFloor(stage, deck) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24,28),new THREE.ShaderMaterial({
      vertexShader:floorVertex,fragmentShader:floorFragment,
      uniforms:{warm:{value:0},lens:{value:new THREE.Vector3()},deck:{value:deck},...libraryLampUniforms}
    }));
    floor.rotation.x=-Math.PI/2;
    floor.position.z=-3;
    stage.add(floor);
    return floor;
  }

  function makeContact(stage) {
    const mat=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,
      vertexShader:`
        varying vec2 p; void main(){p=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
      `,
      fragmentShader:`
        varying vec2 p;
        void main(){
          vec2 q=(p-.5)*2.;
          float broad=exp(-dot(q,q)*4.)*.46;
          vec2 a=(q-vec2(.18,0.))*vec2(2.1,1.2), b=(q+vec2(.18,0.))*vec2(2.1,1.2);
          float contact=max(exp(-dot(a,a)*7.),exp(-dot(b,b)*7.))*.40;
          gl_FragColor=vec4(.012,.008,.005,broad+contact);
        }
      `
    });
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.82,.73),mat);
    shadow.rotation.x=-Math.PI/2;
    shadow.position.set(0,.003,-.045);
    shadow.renderOrder=6;
    stage.add(shadow);
    return shadow;
  }

  function photoStrip(image, renderer, top, bottom) {
    const panel=document.createElement('canvas');
    const width=panel.width=image.naturalWidth;
    const start=Math.round(image.naturalHeight*top);
    const height=panel.height=Math.round(image.naturalHeight*bottom)-start;
    const paint=panel.getContext('2d');
    paint.drawImage(image,0,start,width,height,0,0,width,height);
    return picture(panel,renderer);
  }

  function box(material, width, height, depth, x, y, z) {
    const obj=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);
    obj.position.set(x,y,z);
    return obj;
  }

  function libraryMaterial(map) {
    const material=new THREE.MeshBasicMaterial({map,toneMapped:false});
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>',
        '#include <common>\nvarying vec3 stagePosition;').replace('#include <begin_vertex>',
        '#include <begin_vertex>\nstagePosition=(modelMatrix*vec4(position,1.)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
        '#include <common>\nvarying vec3 stagePosition;').replace('#include <map_fragment>',
        '#include <map_fragment>\nvec2 offset=(stagePosition.xy-vec2(0.,1.12))/vec2(1.79,1.42);\ndiffuseColor.rgb *= mix(vec3(.72,.76,.83),vec3(1.14,1.15,1.20),exp(-dot(offset,offset)*.71));');
    };
    return material;
  }

  function buildLibrary(group, photo, flowers, renderer) {
    const wallHeight = 3.12;
    const wallWidth = wallHeight * photo.naturalWidth / (photo.naturalHeight * rearCrop);
    const walls = new THREE.Group();
    group.add(walls);
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(wallWidth,wallHeight),
      libraryMaterial(photoStrip(photo,renderer,0,rearCrop)));
    wall.position.set(0,wallHeight/2,rear);
    walls.add(wall);
    const yAt=ratio=>wallHeight*(1-ratio/rearCrop);
    const metal=new THREE.MeshStandardMaterial({color:0x252a31,roughness:.78,metalness:.22});
    const measuredTrim=[.152,.420,.501,.562,.623,.684,.747];
    for(const level of measuredTrim){
      const trim=libraryMaterial(photoStrip(photo,renderer,level-.004,level+.004));
      const face=[metal,metal,metal,metal,trim,metal];
      walls.add(box(face,wallWidth,.018,.060,0,yAt(level),rear+.030));
    }
    group.add(new THREE.HemisphereLight(0xabbcdd,0x22232a,1.08));
    const flowerTexture=picture(flowers,renderer);
    const aspect=flowers.naturalWidth/flowers.naturalHeight;
    for(const side of [-1,1]){
      for(const [center,y,z,height,shade] of [[1.19,.32,-1.62,.64,0x4d5667],[1.34,.28,-.53,.56,0x626c7d],[1.51,.26,.23,.52,0x545e70]]){
        const material=new THREE.MeshBasicMaterial({map:flowerTexture,alphaTest:.12,side:THREE.DoubleSide,color:shade,toneMapped:false});
        const plant=new THREE.Mesh(new THREE.PlaneGeometry(height*aspect,height),material);
        plant.position.set(side*center,y,z);
        plant.rotation.y=side*.10;
        plant.scale.x=-side;
        group.add(plant);
      }
    }
    return { walls, wallWidth };
  }

  function cameraUniforms() {
    return {
      lens: { value: new THREE.Vector3() },
      viewRotation: { value: new THREE.Matrix3() },
      tangent: { value: new THREE.Vector2() },
      viewShift: { value: 0 },
    };
  }

  function alignLights(uniforms, camera) {
    uniforms.lens.value.copy(camera.position);
    uniforms.viewRotation.value.setFromMatrix4(camera.matrixWorld);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    uniforms.tangent.value.set(tangent*camera.aspect,tangent);
    uniforms.viewShift.value = camera.view?.enabled ? -2*camera.view.offsetY/camera.view.fullHeight : 0;
  }

  function library(photo, flowers) {
    const world = new THREE.Group();
    const library = buildLibrary(world, photo, flowers, renderer);
    const floor = makeFloor(world, picture(photo, renderer));
    makeContact(world);
    const uniforms = cameraUniforms();
    world.add(makeLibraryLight(uniforms));
    return {
      world,
      update(camera) {
        alignLights(uniforms, camera);
        floor.material.uniforms.lens.value.copy(camera.position);
        const distance = camera.position.z - rear;
        const requiredWidth = 2 * (Math.abs(camera.position.x) + distance * uniforms.tangent.value.x + .50);
        library.walls.scale.x = Math.max(1, requiredWidth / library.wallWidth);
      },
    };
  }

  function warm() {
    const world = new THREE.Group();
    const emptyDeck = new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
    emptyDeck.needsUpdate = true;
    const floor = makeFloor(world, emptyDeck);
    floor.material.uniforms.warm.value = 1;
    makeContact(world);
    const atmosphere = makeAtmosphere();
    const rain = makeGoldRain();
    const trails = makeGoldTrails();
    world.add(atmosphere,rain,trails);
    return {
      world,
      update(camera, seconds) {
        const uniforms = atmosphere.material.uniforms;
        alignLights(uniforms, camera);
        uniforms.time.value = seconds;
        floor.material.uniforms.lens.value.copy(camera.position);
        rain.material.uniforms.screen.value = renderer.domElement.height;
        rain.material.uniforms.time.value = seconds;
        trails.material.uniforms.time.value = seconds;
      },
    };
  }

  return { library, warm };
}
