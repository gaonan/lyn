import * as THREE from "../vendor/three.module.min.js";
import { createSecretGarden } from "./secret-garden-scene.js?v=20261127-palette-r11";
import { createCarnationAndWarm } from "./carnation-warm-scenes.js?v=20261127-palette-r14";

const backgrounds = {
  carnation: { clear: 0x0b0d14, assets: ["scene-library-panorama.webp", "secret-flowers.webp"] },
  secret: { clear: 0x241529, assets: ["secret-gallery.webp", "secret-flowers.webp"], animated: true },
  warm: { clear: 0x0c0805, assets: [], animated: true },
};

export function mountStagePreview(container, asset) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = "palette-stage-3d";
  canvas.hidden = true;
  container.append(canvas);

  const scene = new THREE.Scene();
  const { library, warm } = createCarnationAndWarm(THREE, renderer);
  const creators = { carnation: library, secret: (gallery, flowers) => createSecretGarden(THREE, { gallery, flowers, renderer }), warm };
  const loaded = new Map();
  const images = new Map();
  const fieldOfView = Math.atan(1.116 / 4.25) * 360 / Math.PI;
  const camera = new THREE.PerspectiveCamera(fieldOfView, 1, .05, 35);
  camera.position.set(0, .915, 4.25);
  camera.lookAt(0, .915, 0);
  camera.updateMatrixWorld();
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const feet = new THREE.Vector3();
  const previewFeet = .914;
  let requested;
  let current;
  let lost = false;
  let frame = 0;
  let time = 1.8;
  let last = 0;

  function getImage(name) {
    if (!images.has(name)) {
      const image = new Image();
      image.src = asset(name);
      const pending = image.decode().then(() => image).catch(error => {
        images.delete(name);
        throw error;
      });
      images.set(name, pending);
    }
    return images.get(name);
  }

  function draw(width, height, feetY) {
    camera.clearViewOffset();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const baseline = .5 - feet.set(0, 0, 0).project(camera).y / 2;
    camera.setViewOffset(width, height, 0, (baseline - feetY) * height, width, height);
    current.update(camera, time);
    renderer.render(scene, camera);
  }

  function paintPreview() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio, 1.35, 1024 / width, 860 / height);
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      renderer.setSize(width, height, false);
    }
    draw(width, height, previewFeet);
  }

  function tick(now) {
    time += Math.min(.065, (now - last) / 1000);
    last = now;
    paintPreview();
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    const ready = current && !lost;
    canvas.hidden = !ready;
    if (ready) {
      container.setAttribute("data-stage-3d", requested);
      paintPreview();
    } else {
      container.removeAttribute("data-stage-3d");
    }
    if (ready && backgrounds[requested].animated && !motion.matches && !document.hidden) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  new ResizeObserver(() => {
    if (current && !lost) paintPreview();
  }).observe(container);
  document.addEventListener("visibilitychange", sync);
  motion.addEventListener("change", sync);
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    lost = true;
    sync();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    lost = false;
    sync();
  });

  return {
    async show(mode) {
      requested = mode;
      current = null;
      sync();
      const settings = backgrounds[mode];
      if (!loaded.has(mode)) {
        const pending = Promise.all(settings.assets.map(getImage))
          .then(assets => creators[mode](...assets))
          .catch(() => { loaded.delete(mode); });
        loaded.set(mode, pending);
      }
      const next = await loaded.get(mode);
      if (requested !== mode || !next) return;
      current = next;
      scene.clear();
      scene.add(next.world);
      renderer.setClearColor(settings.clear);
      sync();
    },
    capture(painter, width, height, feetY, mode) {
      if (lost || !current || requested !== mode) return false;
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      draw(width, height, feetY / height);
      painter.drawImage(canvas, 0, 0, width, height);
      paintPreview();
      return true;
    },
  };
}
