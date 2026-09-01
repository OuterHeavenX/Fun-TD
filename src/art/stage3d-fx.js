/* Firing effects for the 3D battlefield.
 *
 * The 2D effects layer paints muzzle flashes and impacts into the world canvas,
 * which on the 3D stage means they land flat on the sand under the tower that
 * fired. A muzzle flash lying on the ground reads as a scorch mark, not a shot,
 * so the combat moments are re-staged here in three dimensions: flashes at the
 * barrel, shells and tracers travelling through the air, bursts where they land.
 *
 * Everything is pooled and pre-allocated. A tower defence fires hundreds of
 * shots a wave, and allocating a mesh per shot is how a smooth scene turns into
 * a stuttering one halfway through wave twelve.
 *
 * The camera is fixed, so billboards are cheap: every sprite shares one
 * orientation, copied from the camera once at startup rather than per frame.
 */

const SPARKS = 260;      // pooled billboards for flashes, smoke and debris
const SHOTS = 140;       // pooled meshes for shells and tracers in flight
const BEAMS = 14;        // pooled lines for rail lances and arc chains

/* Per-family character. The colour is the family's own, and the shape of the
   shot is what tells them apart at a glance from above. */
const FAMILY = {
  gun:    { colour: 0xffe9a8, muzzle: 1.0, tracer: true,  smoke: 0.3 },
  frost:  { colour: 0xbff4ff, muzzle: 0.7, shard: true,   smoke: 0.15 },
  freeze: { colour: 0xbff4ff, muzzle: 0.7, shard: true,   smoke: 0.15 },
  cannon: { colour: 0xffb35c, muzzle: 2.0, shell: true,   smoke: 1.0 },
  arc:    { colour: 0xdcb0ff, muzzle: 0.8, bolt: true,    smoke: 0 },
  flak:   { colour: 0xffe08a, muzzle: 1.7, tracer: true,  smoke: 0.7 },
  rail:   { colour: 0xcfefff, muzzle: 1.4, lance: true,   smoke: 0.2 },
  void:   { colour: 0xff9ada, muzzle: 0.0, field: true,   smoke: 0 }
};

const familyOf = t => FAMILY[t] || FAMILY.gun;

/* A soft round blob, drawn once into a canvas and reused as every sprite's
   texture. Additive blending turns it into light rather than a grey disc. */
function glowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createEffects(stage) {
  const THREE = stage.THREE;
  const scene = stage.scene;
  const group = new THREE.Group();
  scene.add(group);

  // Barrel height. Turret muzzles sit around here on every family, and being
  // a little high reads better than a little low: a shot from below the deck
  // looks like it came out of the ground.
  const MUZZLE_Y = 30;

  /* ------------------------------------------------------------- billboards */

  const tex = glowTexture(THREE);

  /* Every pooled sprite owns exactly one material, made once here.
   *
   * The first version cloned a material per particle at spawn time, which for a
   * tower defence means a few hundred new materials a second, each one a shader
   * program lookup and none of them ever freed. Colour, opacity and blend mode
   * are all mutable, so one material per sprite covers every effect. */
  const sparks = [];
  for (let i = 0; i < SPARKS; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    group.add(s);
    sparks.push({ mesh: s, mat, life: 0, max: 1, vx: 0, vy: 0, vz: 0,
                  size: 1, grow: 0, gravity: 0, fade: 1 });
  }
  let sparkCursor = 0;

  // Smoke is lit dust, not light: additive blending turns a puff into a glowing
  // cloud, which is why the first pass looked like cotton wool on the barrel.
  const SMOKE_TINT = 0x6b5748;

  function spark(x, y, z, opts) {
    // Oldest-first reuse. Under fire the pool always runs dry; recycling the
    // longest-lived effect is far less noticeable than dropping the newest.
    const s = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % SPARKS;
    s.life = s.max = opts.life || 0.25;
    s.vx = opts.vx || 0; s.vy = opts.vy || 0; s.vz = opts.vz || 0;
    s.size = opts.size || 12;
    s.grow = opts.grow || 0;
    s.gravity = opts.gravity || 0;
    s.fade = opts.opacity === undefined ? 1 : opts.opacity;
    s.mat.blending = opts.smoke ? THREE.NormalBlending : THREE.AdditiveBlending;
    s.mat.color.setHex(opts.smoke ? SMOKE_TINT
      : (opts.colour === undefined ? 0xffffff : opts.colour));
    s.mat.opacity = s.fade;
    s.mesh.position.set(x, y, z);
    s.mesh.scale.setScalar(s.size);
    s.mesh.visible = true;
    return s;
  }

  /* ------------------------------------------------------------ projectiles */

  /* Shots in flight. Tracers are stretched along their own direction of travel,
     which is what makes a bullet look fast rather than like a floating bead. */
  const shotGeo = new THREE.SphereGeometry(1, 8, 6);
  const shots = [];
  for (let i = 0; i < SHOTS; i++) {
    const m = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.visible = false;
    group.add(m);
    shots.push({ mesh: m, live: false, key: null });
  }

  /* ----------------------------------------------------------- muzzle light */

  /* A handful of pooled point lights. Nothing sells a gunshot in three
     dimensions like the ground and the tower's own plating lighting up for a
     frame, and it is the one effect a billboard cannot fake. Kept to four,
     re-used oldest-first: every extra live light is another pass over every
     lit object in range, and a wall of towers firing would otherwise put
     dozens of them on screen at once. */
  const LIGHTS = 4;
  const lights = [];
  for (let i = 0; i < LIGHTS; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 260, 2);
    l.visible = false;
    group.add(l);
    lights.push({ light: l, life: 0, max: 1, peak: 0 });
  }
  let lightCursor = 0;

  function flashLight(x, y, z, colour, strength, life) {
    const l = lights[lightCursor];
    lightCursor = (lightCursor + 1) % LIGHTS;
    l.light.position.set(x, y, z);
    l.light.color.setHex(colour);
    l.peak = strength;
    l.light.intensity = strength;
    l.light.visible = true;
    l.life = l.max = life;
  }

  /* ------------------------------------------------------------------ beams */

  const beams = [];
  for (let i = 0; i < BEAMS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    line.visible = false;
    group.add(line);
    beams.push({ line, life: 0, max: 1 });
  }
  let beamCursor = 0;

  function beam(x1, y1, z1, x2, y2, z2, colour, life) {
    const b = beams[beamCursor];
    beamCursor = (beamCursor + 1) % BEAMS;
    const p = b.line.geometry.attributes.position;
    p.setXYZ(0, x1, y1, z1);
    p.setXYZ(1, x2, y2, z2);
    p.needsUpdate = true;
    b.line.material.color.setHex(colour);
    b.line.visible = true;
    b.life = b.max = life;
  }

  /* --------------------------------------------------------------- moments */

  /* A tower fired. The flash sits at the muzzle, offset along the barrel, and
     throws sparks forward in a cone rather than a sphere - a radial burst reads
     as an explosion at the tower, which is the opposite of what happened. */
  function onFire(tower) {
    const f = familyOf(tower.type);
    const a = tower.angle || 0;
    const reach = f.shell ? 40 : 30;
    const x = stage.wx(tower.x + Math.cos(a) * reach);
    const z = stage.wz(tower.y + Math.sin(a) * reach);

    if (f.field) {
      // No barrel to flash: the void spire pulses instead.
      spark(stage.wx(tower.x), MUZZLE_Y, stage.wz(tower.y),
        { colour: f.colour, life: 0.22, size: 40, grow: 90, opacity: 0.55 });
      return;
    }
    if (f.muzzle <= 0) return;

    spark(x, MUZZLE_Y, z, {
      colour: f.colour, life: 0.11 * f.muzzle, size: 26 * f.muzzle, grow: -40 * f.muzzle
    });
    spark(x, MUZZLE_Y, z, { colour: 0xffffff, life: 0.07, size: 13 * f.muzzle, grow: -26 });
    // Only the heavy families get a light. A gun tower firing five times a
    // second would strobe the whole battlefield.
    if (f.muzzle >= 1.3) {
      flashLight(x, MUZZLE_Y + 6, z, f.colour, 260 * f.muzzle, 0.09);
    }

    const n = Math.round(3 * f.muzzle);
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * 0.5;
      const speed = 120 + Math.random() * 220 * f.muzzle;
      spark(x, MUZZLE_Y, z, {
        colour: f.colour, life: 0.1 + Math.random() * 0.16, size: 3 + Math.random() * 3,
        vx: Math.cos(a + spread) * speed, vz: Math.sin(a + spread) * speed,
        vy: 20 + Math.random() * 40, gravity: -260, grow: -6
      });
    }

    if (f.smoke > 0) {
      for (let i = 0; i < Math.ceil(f.smoke * 1.5); i++) {
        spark(x, MUZZLE_Y + 4, z, {
          smoke: true, opacity: 0.20 * f.smoke,
          life: 0.4 + Math.random() * 0.3, size: 7 * f.smoke, grow: 26 * f.smoke,
          vx: Math.cos(a) * 34, vz: Math.sin(a) * 34, vy: 22 + Math.random() * 16
        });
      }
    }
  }

  /* Something was hit. Splash gets a bigger, slower bloom plus debris; a direct
     hit gets a tight spark so a wall of gun fire does not white out the screen. */
  function onHit(x, y, kind, splash, airborne) {
    const f = familyOf(kind);
    const px = stage.wx(x), pz = stage.wz(y);
    const py = (airborne || 0) + 14;

    if (splash) {
      flashLight(px, py + 10, pz, f.colour, 520, 0.14);
      spark(px, py, pz, { colour: f.colour, life: 0.26, size: splash * 0.9, grow: splash * 1.6 });
      spark(px, py, pz, { colour: 0xffffff, life: 0.12, size: splash * 0.4, grow: splash * 0.8 });
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 260;
        spark(px, py, pz, {
          colour: i % 3 ? f.colour : 0xffffff, life: 0.2 + Math.random() * 0.3,
          size: 3 + Math.random() * 4, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp,
          vy: 90 + Math.random() * 130, gravity: -420, grow: -5
        });
      }
      for (let i = 0; i < 3; i++) {
        spark(px, py + 6, pz, {
          smoke: true, opacity: 0.26, life: 0.6,
          size: splash * 0.3, grow: splash * 0.7, vy: 40 + Math.random() * 30
        });
      }
      return;
    }
    spark(px, py, pz, { colour: f.colour, life: 0.1, size: 13, grow: 26 });
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, sp = 70 + Math.random() * 150;
      spark(px, py, pz, {
        colour: f.colour, life: 0.12 + Math.random() * 0.14, size: 2.5 + Math.random() * 2.5,
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 60 + Math.random() * 90,
        gravity: -420, grow: -4
      });
    }
  }

  /* A unit died. Loud for a boss, cheap for a grunt. */
  function onKill(e) {
    const px = stage.wx(e.x), pz = stage.wz(e.y);
    const py = (e.flying ? (e.altitude || 34) : 0) + 12;
    const boss = e.type === 'boss';
    const big = boss || ['heavy', 'brute', 'gunship', 'armored', 'warden'].includes(e.type);
    const colour = new THREE.Color(e.color || '#8bf05a').getHex();
    const size = (e.size || 11);

    if (boss || big) flashLight(px, py + 8, pz, colour, boss ? 900 : 300, boss ? 0.3 : 0.1);
    spark(px, py, pz, { colour, life: boss ? 0.5 : 0.18, size: size * (boss ? 3 : 1.6),
                        grow: size * (boss ? 10 : 4) });
    const n = boss ? 26 : big ? 10 : 5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * (boss ? 420 : 220);
      spark(px, py, pz, {
        colour: i % 4 ? colour : 0xffffff, life: 0.25 + Math.random() * (boss ? 0.6 : 0.3),
        size: 3 + Math.random() * (boss ? 6 : 3.5),
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp,
        vy: 100 + Math.random() * (boss ? 320 : 170), gravity: -430, grow: -4
      });
    }
    if (boss) {
      for (let i = 0; i < 6; i++) {
        spark(px, py + 10, pz, {
          smoke: true, opacity: 0.32, life: 0.9,
          size: size * 1.2, grow: size * 3, vy: 50 + Math.random() * 60,
          vx: (Math.random() - 0.5) * 120, vz: (Math.random() - 0.5) * 120
        });
      }
    }
  }

  /* ------------------------------------------------------------ shots aloft */

  /* Mirror the game's own projectile list into 3D. The game keeps its
     projectiles on the ground plane; here they fly at barrel height, and a
     mortar shell arcs, because a shell that travels flat is a bullet. */
  function syncShots(game) {
    const live = game.projectiles || [];
    const seen = new Set();

    for (let i = 0; i < live.length && i < SHOTS; i++) {
      const p = live[i];
      if (!p || p.active === false) continue;
      const slot = shots[i];
      seen.add(i);
      const kind = p.type || (p.s && p.s.type);
      const f = familyOf(kind);

      let y = MUZZLE_Y;
      if (f.shell && p.aimX !== undefined) {
        // Height from how far through its flight the shell is, so it rises out
        // of the barrel and comes down on the target rather than hovering.
        const total = Math.hypot(p.aimX - (p.startX ?? p.px), p.aimY - (p.startY ?? p.py)) || 1;
        const left = Math.hypot(p.aimX - p.x, p.aimY - p.y);
        const t = Math.min(1, Math.max(0, 1 - left / total));
        y = MUZZLE_Y + Math.sin(t * Math.PI) * 120;
      }

      slot.mesh.position.set(stage.wx(p.x), y, stage.wz(p.y));
      slot.mesh.material.color.setHex(f.colour);
      if (f.tracer) {
        const a = Math.atan2(p.y - p.py, p.x - p.px);
        slot.mesh.scale.set(11, 2.4, 2.4);
        slot.mesh.rotation.set(0, -a, 0);
      } else if (f.shell) {
        slot.mesh.scale.setScalar(5.5);
        slot.mesh.rotation.set(0, 0, 0);
      } else {
        slot.mesh.scale.setScalar(4);
        slot.mesh.rotation.set(0, 0, 0);
      }
      slot.mesh.visible = true;
      slot.live = true;
    }

    for (let i = 0; i < SHOTS; i++) {
      if (seen.has(i) || !shots[i].live) continue;
      shots[i].live = false;
      shots[i].mesh.visible = false;
    }
  }

  /* Rail lances and arc chains are instantaneous, and the game exposes each as
     a transient polyline on the tower. Lift them off the ground. */
  function syncBeams(game) {
    for (const t of game.towers || []) {
      if (t.beam && !t._fx3dBeam) {
        t._fx3dBeam = true;
        beam(stage.wx(t.beam.x1), MUZZLE_Y, stage.wz(t.beam.y1),
             stage.wx(t.beam.x2), MUZZLE_Y, stage.wz(t.beam.y2),
             FAMILY.rail.colour, 0.16);
      } else if (!t.beam) t._fx3dBeam = false;

      if (t.arc && !t._fx3dArc) {
        t._fx3dArc = true;
        for (let i = 1; i < t.arc.length; i++) {
          beam(stage.wx(t.arc[i - 1][0]), MUZZLE_Y - 4, stage.wz(t.arc[i - 1][1]),
               stage.wx(t.arc[i][0]), MUZZLE_Y - 4, stage.wz(t.arc[i][1]),
               FAMILY.arc.colour, 0.14);
        }
      } else if (!t.arc) t._fx3dArc = false;
    }
  }

  /* ---------------------------------------------------------------- update */

  function update(dt, game) {
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.vy += s.gravity * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      if (s.mesh.position.y < 2) { s.mesh.position.y = 2; s.vy = 0; s.vx *= 0.7; s.vz *= 0.7; }
      s.size = Math.max(0.5, s.size + s.grow * dt);
      s.mesh.scale.setScalar(s.size);
      // Fade out over the tail of the life rather than the whole of it, so a
      // flash reads as bright-then-gone instead of steadily dimming.
      const t = s.life / s.max;
      s.mat.opacity = s.fade * (t > 0.6 ? 1 : t / 0.6);
    }

    for (const l of lights) {
      if (l.life <= 0) continue;
      l.life -= dt;
      if (l.life <= 0) { l.light.visible = false; l.light.intensity = 0; continue; }
      l.light.intensity = l.peak * (l.life / l.max);
    }

    for (const b of beams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.line.visible = false; continue; }
      b.line.material.opacity = b.life / b.max;
    }

    if (game) { syncShots(game); syncBeams(game); }
  }

  return { onFire, onHit, onKill, update, group, FAMILY };
}
