/* The 3D isometric battlefield.
 *
 * The campaign's six runtimes are all 2D: they hold entity positions in a flat
 * 720x1120 world and paint the whole scene into one canvas. Rewriting six
 * renderers in 3D would be a rewrite of the game. This does something cheaper
 * and, for a tower defence, better:
 *
 *   - The 2D canvas the game already paints becomes a live texture on a ground
 *     plane. Terrain, the route, build pads, range previews, floating damage
 *     numbers and particle effects therefore keep working exactly as they do,
 *     and land on the ground in correct perspective for free.
 *   - Only the actors are lifted into real 3D: towers, their turrets, enemies
 *     and the command core become glTF meshes exported from the same Blender
 *     script that renders the sprites, so the 2D and 3D looks are the same art.
 *
 * The game's own draw() keeps running and is never patched, apart from the four
 * methods that would otherwise paint a flattened tower or enemy onto the ground
 * underneath its 3D counterpart.
 *
 * Everything degrades. Without WebGL, without the models, or if anything here
 * throws, the 3D canvas is removed and the untouched 2D game is still there.
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';
import { RoomEnvironment } from '../../vendor/three/RoomEnvironment.js';
import { mergeGeometries } from '../../vendor/three/BufferGeometryUtils.js';

const WORLD_W = 720, WORLD_H = 1120;

/* One Blender unit is 46 world pixels. That is not a guess: the sprite pack
   draws a part at `units * TOWER_SCALE` pixels wide, where `units` is the
   camera's ortho span, so the two renderers agree on scale by construction. */
const UNIT = 46;

const MODEL_DIR = 'assets/models/';

/* How tall the terrain's dunes are, in world pixels, per unit of the model's
   own displacement. The mesh is 2 units wide with roughly +/-0.1 of noise on
   it, so this reads as about +/-19px of relief on a 720px map: enough to catch
   the light and cast a shadow, not enough to hide anything. The first value
   here was 34, which worked out to +/-3px - measurably there and visibly not. */
const HEIGHT_SCALE = 190;

/* Camera. Fixed, orthographic, at an isometric elevation.
 *
 * An earlier version let the player drag to orbit it. That is removed: turning
 * the map put the battlefield at angles where it framed badly on a phone, and
 * every drag had to be told apart from a tap, which made ordinary taps feel
 * unreliable. The angle is still settable from here so the framing can be tuned
 * and tested, but nothing in the game changes it at runtime. */
const ELEVATION_MIN = 0.32;      // radians above the horizon
const ELEVATION_MAX = 1.45;      // very nearly a top-down view
const ELEVATION_DEFAULT = 0.72;

/* Facing straight down the map's long axis by default.
 *
 * A 45-degree azimuth is the textbook isometric look, and on a phone it is the
 * wrong default: it turns a 720x1120 portrait map into a wide diamond, and
 * fitting that diamond into a 9:19.5 screen leaves the battlefield occupying
 * about a third of it. Facing along the long axis keeps the map portrait, so
 * it fills the screen -- and the camera still shows every tower in three
 * quarters, because the elevation is what makes it read as 3D. The player can
 * orbit to a true 45 from here whenever they want. */
const AZIMUTH_DEFAULT = 0;

export function createStage(game, options = {}) {
  const source = options.canvas || document.getElementById('game');
  if (!source) throw new Error('no battlefield canvas');

  const canvas = document.createElement('canvas');
  canvas.id = 'stage3d';
  source.insertAdjacentElement('afterend', canvas);

  // The 2D canvas is locked to the map's own 720x1120 aspect. An isometric
  // view of that map is a different shape, and a different shape again at
  // every azimuth, so the 3D canvas takes the whole viewport and the camera
  // frames the map inside it.
  const viewport = () => ({
    width: Math.max(1, Math.round(window.innerWidth)),
    height: Math.max(1, Math.round(window.innerHeight))
  });

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  // Capped below the device ratio on purpose: a 3x phone screen renders nine
  // times the pixels of a 1x one for a difference nobody can see at this size.
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Filmic tone mapping keeps the bright trim and muzzle glows from clipping to
  // flat white, which the default linear mapping does immediately.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();

  /* An environment for the metal to reflect.
   *
   * The tower models come out of Blender with Principled BSDF materials at
   * metalness 0.7 and up. A metal with nothing to reflect renders as flat dark
   * plastic, which is exactly how the first pass looked: correct geometry,
   * dead surfaces. A generated room gives every plate, barrel and gold collar
   * something to catch, and costs one texture built once at load. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  /* How much of that environment each material takes.
   *
   * three r160 has no scene-wide environment intensity - that arrived later -
   * so this is applied per material as models load. It is kept low on purpose:
   * the environment is there to give metal something to reflect, not to light
   * the scene. Turned up it floods the dark hulls the art direction depends on
   * and every tower drifts toward the same grey. */
  const ENV_INTENSITY = 0.32;

  /* ------------------------------------------------------------- camera */

  // Framed so the whole battlefield fits at any azimuth: rotating a 720x1120
  // rectangle sweeps a circle, so the camera frames that circle's radius and
  // the map never clips as it turns.
  const RADIUS = Math.hypot(WORLD_W, WORLD_H) / 2;
  const camera = new THREE.OrthographicCamera(-RADIUS, RADIUS, RADIUS, -RADIUS, 1, 8000);
  const target = new THREE.Vector3(0, 0, 0);
  let azimuth = AZIMUTH_DEFAULT;
  let elevation = ELEVATION_DEFAULT;
  let zoom = 1;

  function placeCamera() {
    const d = 3000;
    camera.position.set(
      target.x + Math.cos(elevation) * Math.sin(azimuth) * d,
      target.y + Math.sin(elevation) * d,
      target.z + Math.cos(elevation) * Math.cos(azimuth) * d
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
  }

  /* -------------------------------------------------------------- lights */

  // Matches the sprite renders: a key from the upper left, a cool fill, and a
  // sky/ground hemisphere so nothing goes to pure black when the camera swings
  // round behind a tower.
  const key = new THREE.DirectionalLight(0xfff3e0, 2.1);
  key.position.set(-600, 1200, 500);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const shadowSpan = RADIUS * 1.1;
  Object.assign(key.shadow.camera, {
    left: -shadowSpan, right: shadowSpan, top: shadowSpan, bottom: -shadowSpan,
    near: 100, far: 4000
  });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0015;
  scene.add(key);
  scene.add(new THREE.DirectionalLight(0x9fc4ff, 0.40).translateX(700).translateY(400).translateZ(-600));
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x4a3320, 0.42));

  /* -------------------------------------------------------------- ground */

  /* The live 2D canvas, as a texture. This is what keeps six untouched
     runtimes working: whatever they paint appears on the ground. */
  const groundTex = new THREE.CanvasTexture(source);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  groundTex.minFilter = THREE.LinearFilter;
  groundTex.generateMipmaps = false;

  /* The ground starts as a flat plane and is replaced by the displaced terrain
     mesh once it loads, so the battlefield is playable before the environment
     arrives and simply gets better when it does. */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_H),
    // Lambert rather than Basic: the painted texture is already lit, but the
    // ground now has real relief, and relief with no shading is just a
    // wallpapered plane. A low-cost diffuse response is enough to show it.
    new THREE.MeshLambertMaterial({ map: groundTex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* Swap in real terrain.
   *
   * `flattenNear` is supplied by the caller because the stage does not know
   * where the route runs and the game does. Everything within the road's width
   * is pulled back to zero and blended out over a margin, so units walk on flat
   * ground and the dunes start where the road ends. Without that the road would
   * ripple and every unit would sink into it. */
  function useTerrain(mesh, flattenNear) {
    if (!mesh) return;
    const geo = mesh.geometry ? mesh.geometry.clone() : null;
    if (!geo) return;
    // The model is 2x2 units in Blender's XY with height in Z, exported Y-up:
    // so it arrives as a 2x2 plane in XZ, and scales straight onto the map.
    geo.scale(WORLD_W / 2, HEIGHT_SCALE, WORLD_H / 2);

    const pos = geo.attributes.position;
    if (flattenNear) {
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + WORLD_W / 2;
        const z = pos.getZ(i) + WORLD_H / 2;
        pos.setY(i, pos.getY(i) * flattenNear(x, z));
      }
      pos.needsUpdate = true;
    }
    geo.computeVertexNormals();

    // Planar UVs so the painted map lands on the terrain exactly as it did on
    // the plane: same road, same pads, now with relief under them.
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / WORLD_W + 0.5;
      uv[i * 2 + 1] = 0.5 - pos.getZ(i) / WORLD_H;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

    ground.geometry.dispose();
    ground.geometry = geo;
    ground.rotation.x = 0;          // the exported mesh is already in XZ
    ground.position.y = 0;
  }

  /* The land the battlefield sits in.
   *
   * Before this the map was a slab hanging in a dark void, which read as a
   * tabletop diorama - fine, but not what "a real place" looks like. The
   * surrounding desert runs out to the horizon under the same light, so the
   * playable area is a part of a landscape rather than an object on a stand.
   * It carries no painted texture: it is not the map, and anything drawn on it
   * would look like the map had leaked. */
  /* Sized to reach a little past the frame rather than out to infinity. An
     orthographic camera has no vanishing point, so a ground plane the size of a
     county does not produce a horizon - it just fills every pixel with sand,
     which is exactly what the first attempt did. Ending it just outside the
     framing, and fogging the last of it into the sky, puts a horizon where the
     camera can actually see one. */
  /* The surrounding desert's height at a point, in map coordinates. Exported so
     scenery placed out there can stand on the ground rather than hovering over
     it or sinking into it - which it did, visibly, when this was inlined. */
  function surroundHeight(mapX, mapY) {
    const x = mapX - WORLD_W / 2, y = mapY - WORLD_H / 2;
    const d = Math.max(Math.abs(x) / WORLD_W, Math.abs(y) / WORLD_H);
    const swell = Math.sin(x * 0.0021) * 26 + Math.cos(y * 0.0016) * 22
                + Math.sin((x + y) * 0.0009) * 34;
    // Held at zero under the battlefield and for a little way past its edge, so
    // the map is never undercut by the land it sits on.
    return (swell - 26) * Math.min(1, Math.max(0, (d - 0.62) * 1.7));
  }

  const surroundGeo = new THREE.PlaneGeometry(WORLD_W * 5.0, WORLD_H * 3.6, 80, 80);
  {
    // The same kind of gentle swell the terrain has, so the horizon is not a
    // ruler-straight line, and pushed down slightly at the map's edge so the
    // playable ground sits a step above its surroundings.
    const pos = surroundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, surroundHeight(x + WORLD_W / 2, y + WORLD_H / 2));
    }
    surroundGeo.computeVertexNormals();
  }
  const surround = new THREE.Mesh(
    surroundGeo,
    new THREE.MeshLambertMaterial({ color: 0xb07a45 })
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -2;
  surround.receiveShadow = true;
  scene.add(surround);

  /* A skydome. A flat background colour gives the horizon nothing to meet, so
     the far desert just stops; a gradient dome gives it a sky to end against. */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(WORLD_H * 6, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x2a4a72) },
        horizon: { value: new THREE.Color(0xc98f5a) },
        ground: { value: new THREE.Color(0x2a1d14) }
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground;
        varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55))
                           : mix(horizon, ground, pow(-h, 0.5));
          gl_FragColor = vec4(c, 1.0);
        }`
    })
  );
  scene.add(sky);

  /* Distance haze. The near plane sits well beyond the battlefield's far corner
     so the playable ground is never touched by it - fog that dims the map is a
     readability bug, not atmosphere. Past that the surrounding desert falls
     away into dusk, which is what stops the frame reading as one flat sheet of
     orange, and gives the eye an edge to the world without a hard cut. */
  scene.fog = new THREE.Fog(0x4a331f, 3500, 5400);

  /* -------------------------------------------------------------- models */

  const loader = new GLTFLoader();
  const cache = new Map();     // name -> Promise<Object3D>

  /* Each part was framed by its own orthographic camera when the sprites were
     rendered, and the 2D layer then drew it at a width in pixels. Dividing one
     by the other gives pixels-per-Blender-unit for that part, which is how a
     grunt ends up the same size on the 3D stage as it is on the 2D one. The
     manifest carries the framing; without it every part falls back to the
     tower scale, which is right for towers and too large for small units. */
  let framing = null;
  const framingReady = fetch(MODEL_DIR + 'models.json')
    .then(r => (r.ok ? r.json() : null))
    .then(j => { framing = (j && j.models) || {}; })
    .catch(() => { framing = {}; });

  const orthoOf = name => (framing && framing[name] && framing[name].ortho) || 3.1;

  /* Collapse a model's parts into one mesh per material.
   *
   * Every tower is modelled from dozens of primitives - bolts, pips, collars -
   * and each arrives from glTF as its own mesh. Twelve towers on a board is
   * then several hundred draw calls for a scene that only ever uses a handful
   * of materials. Merging by material at load time cuts that to a few per
   * model, once, and every clone after it is cheap.
   *
   * Groups whose geometries disagree on attributes are left alone rather than
   * forced: a merge that drops a UV set would silently change how a part is
   * shaded, which is a worse trade than a few extra draw calls. */
  function collapse(root) {
    const groups = new Map();
    const keep = [];
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.material) return;
      const key = o.material.uuid;
      if (!groups.has(key)) groups.set(key, { material: o.material, meshes: [] });
      groups.get(key).meshes.push(o);
    });

    for (const { material, meshes } of groups.values()) {
      if (meshes.length < 2) { keep.push(...meshes); continue; }
      const attrs = Object.keys(meshes[0].geometry.attributes).sort().join(',');
      const uniform = meshes.every(m =>
        Object.keys(m.geometry.attributes).sort().join(',') === attrs);
      if (!uniform) { keep.push(...meshes); continue; }
      const geoms = meshes.map(m => {
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        return g;
      });
      let merged = null;
      try { merged = mergeGeometries(geoms, false); } catch (e) { merged = null; }
      if (!merged) { keep.push(...meshes); continue; }
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      keep.push(mesh);
      for (const m of meshes) m.removeFromParent();
    }

    const out = new THREE.Group();
    for (const m of keep) { m.removeFromParent(); out.add(m); }
    return out;
  }

  function loadModel(name) {
    if (cache.has(name)) return cache.get(name);
    const p = framingReady.then(() => new Promise(resolve => {
      loader.load(
        MODEL_DIR + name + '.glb',
        gltf => {
          const root = gltf.scene;
          root.traverse(o => {
            if (!o.isMesh) return;
            o.castShadow = true;
            o.receiveShadow = true;
            // Blender's exporter writes one material per part; make them all
            // respond to the stage's lights rather than carrying baked ones.
            const m = o.material;
            if (!m) return;
            if (m.envMapIntensity !== undefined) m.envMapIntensity = ENV_INTENSITY;
            if (m.emissive && m.emissiveIntensity !== undefined) {
              // Emission survives the glTF trip. Lifting it is what makes the
              // trim, coils and eyes read as lit hardware rather than paint.
              m.emissiveIntensity = Math.max(m.emissiveIntensity, 1.35);
            }
          });
          const model = collapse(root);
          // Towers keep the shared scale by construction: they were framed at
          // ORTHO and the 2D pack draws them at ORTHO * UNIT pixels wide.
          model.scale.setScalar(UNIT);
          model.userData.ortho = orthoOf(name);
          resolve(model);
        },
        undefined,
        () => resolve(null)
      );
    }));
    cache.set(name, p);
    return p;
  }

  /* The pixels-per-Blender-unit a unit of this on-screen width needs. */
  const scaleFor = (name, widthPx) => widthPx / orthoOf(name);

  /* Position mapping. The game's world is (x right, y down); the exporter wrote
     Blender Z-up as three.js Y-up, so the game's y becomes three.js z, and the
     map is centred on the origin so the camera can orbit around its middle. */
  const wx = x => x - WORLD_W / 2;
  const wz = y => y - WORLD_H / 2;

  /* A turret's muzzle points Blender +X, which is three.js +X. The game's
     angle is measured the same way in its own plane, so the mesh rotation is
     the negated angle about the up axis. */
  const facing = angle => -(angle || 0);

  /* The corners of the volume the battlefield occupies, including headroom for
     the tallest tower and for fliers, so nothing clips as the camera turns. */
  const HEADROOM = 190;
  const CORNERS = [];
  for (const x of [-WORLD_W / 2, WORLD_W / 2])
    for (const y of [0, HEADROOM])
      for (const z of [-WORLD_H / 2, WORLD_H / 2])
        CORNERS.push(new THREE.Vector3(x, y, z));

  const _v = new THREE.Vector3();

  /* Frame the map exactly, at whatever angle the camera is currently at.
   *
   * A fixed frustum sized to the map's bounding circle is what a first pass
   * does, and it wastes most of the screen: the circle that a 720x1120
   * rectangle sweeps is far larger than the rectangle seen edge-on. Projecting
   * the eight corners into camera space and fitting to their real extent keeps
   * the battlefield as large as it can be without clipping, and re-fits every
   * time the camera moves. */
  function fitCamera() {
    const { width: w, height: h } = viewport();
    placeCamera();
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of CORNERS) {
      _v.copy(c).applyMatrix4(camera.matrixWorldInverse);
      if (_v.x < minX) minX = _v.x;
      if (_v.x > maxX) maxX = _v.x;
      if (_v.y < minY) minY = _v.y;
      if (_v.y > maxY) maxY = _v.y;
    }

    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    // Leave room for the HUD across the top and the controls along the bottom.
    const margin = 1.02;
    let halfW = (maxX - minX) / 2 * margin / zoom;
    let halfH = (maxY - minY) / 2 * margin / zoom;
    const aspect = w / h;
    if (halfW / halfH < aspect) halfW = halfH * aspect; else halfH = halfW / aspect;

    camera.left = cx - halfW;
    camera.right = cx + halfW;
    camera.bottom = cy - halfH;
    camera.top = cy + halfH;
    camera.updateProjectionMatrix();
  }

  function resize() {
    const { width: w, height: h } = viewport();
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    fitCamera();
  }

  return {
    THREE, scene, camera, renderer, canvas, ground, groundTex, loadModel,
    wx, wz, facing, scaleFor, useTerrain, surroundHeight,
    UNIT, WORLD_W, WORLD_H, RADIUS,
    get azimuth() { return azimuth; },
    set azimuth(v) { azimuth = v; fitCamera(); },
    get elevation() { return elevation; },
    set elevation(v) {
      elevation = Math.max(ELEVATION_MIN, Math.min(ELEVATION_MAX, v));
      fitCamera();
    },
    get zoom() { return zoom; },
    set zoom(v) { zoom = Math.max(0.75, Math.min(2.4, v)); fitCamera(); },
    placeCamera, fitCamera,
    resize,
    render() { renderer.render(scene, camera); }
  };
}
