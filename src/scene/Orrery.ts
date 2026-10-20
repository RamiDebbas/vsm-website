import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  MathUtils,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SITE, THEME, type Division, type DivisionId } from '../config/site.ts';
import { focusedDivision, isStill, store, type AppState } from '../core/state.ts';
import { isCoarsePointer, pixelRatioBudget } from '../core/env.ts';
import RINGS from '../config/rings.json';
import { createLogoMesh } from './logoMesh.ts';
import { damp, poseFor } from './poses.ts';
import { radialTexture } from './textures.ts';

/**
 * THE RINGED VSM — the logo, live in 3D (src/config/rings.json is shared with the logo generator).
 *
 *   camera ── looks at ── core (extruded VSM word, gold metal, env reflections)
 *                          ├─ glow sprite (tinted by the focused division)
 *                          └─ system (rolled like the logo)
 *                               ├─ 7 × pivot (ring plane, tilt fans out ring by ring)
 *                               │     ├─ ring   (thin torus, gold / white)
 *                               │     └─ planet (division colour + halo + invisible hit sphere) — rides the ring
 *                               └─ dust haze in the middle ring's plane
 *   stars (Points, far shell)
 *
 * Reads: store (active/preview/section/reducedMotion/motionPaused). Writes: store.preview / store.active on
 * planet hover/click. Never touches page DOM other than its own canvas and one decorative label.
 */

/** A free rectangle of the viewport (CSS px) where the hero logo should sit; null = use the hand-tuned pose. */
export interface HeroFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OrreryOptions {
  canvas: HTMLCanvasElement;
  /** Phones/tablets: where the hero leaves room for the logo (measured by the UI layer, re-read on resize). */
  heroFrame?: () => HeroFrame | null;
  /** The VSM two-tone "duo" logo SVG (src/brand/logo-duo.svg) — extruded into the core; back halves take the accent. */
  logoSvg: string;
  reducedMotion: boolean;
}

export interface OrreryHandle {
  dispose(): void;
}

interface PlanetRig {
  division: Division;
  pivot: Group;
  ring: Mesh<TorusGeometry, MeshBasicMaterial>;
  planet: Mesh<SphereGeometry, MeshStandardMaterial>;
  halo: Sprite;
  hit: Mesh;
  radius: number;
  angle: number;
  focus: number; // 0..1 eased emphasis
}

const tmpV = new Vector3();
const DEG = Math.PI / 180;
const INTERACTIVE = 'a, button, input, label, select, textarea, summary, [role="radio"], [data-division]';

export function createOrrery(opts: OrreryOptions): OrreryHandle {
  const { canvas, logoSvg } = opts;
  /** Nothing moves on its own: OS reduced-motion OR the on-page pause toggle. Render on demand only. */
  let still = opts.reducedMotion || isStill(store.get());
  const coarse = isCoarsePointer();
  const html = document.documentElement;

  // ---------- Renderer ----------
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatioBudget());
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  /** Reflection map for the gold metal. Rebuilt after a WebGL context restore (GPU-only content is lost). */
  function buildEnvironment(): void {
    const room = new RoomEnvironment();
    const pmrem = new PMREMGenerator(renderer);
    const next = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    scene.environment?.dispose();
    scene.environment = next;
  }
  buildEnvironment();

  const camera = new PerspectiveCamera(34, 1, 0.1, 400);

  // ---------- Lights ----------
  scene.add(new HemisphereLight(0xfff2d6, 0x1a120a, 0.35));
  const key = new DirectionalLight(0xfff1dc, 2.2);
  key.position.set(-5, 6, 8);
  scene.add(key);
  const rim = new PointLight(new Color(THEME.gold), 40, 30, 1.6);
  rim.position.set(2.5, 1.5, -3.5);
  scene.add(rim);

  const halo = radialTexture();
  const disposables: { dispose(): void }[] = [halo];

  // ---------- Core: the VSM word ----------
  const core = new Group();
  scene.add(core);
  const WORD_WIDTH = 3.8;
  const HW = WORD_WIDTH / 2; // rings.json distances are multiples of the word's half-width
  const logo = createLogoMesh(logoSvg, { targetWidth: WORD_WIDTH, lite: coarse });
  core.add(logo);
  disposables.push(logo.geometry, logo.material);

  const coreGlow = new Sprite(
    new SpriteMaterial({ map: halo, color: new Color(THEME.gold), transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false }),
  );
  coreGlow.scale.setScalar(7);
  coreGlow.position.z = -1.2;
  scene.add(coreGlow);
  disposables.push(coreGlow.material);

  // ---------- The rings: the SAME rings as the logo (src/config/rings.json) ----------
  // Ring i = division i: a thin torus of radius HW·(inner + i·spacing) whose plane tilts toward the viewer by
  // baseTilt + i·tiltStep, so the rings fan apart at the front and back exactly like the logo. The whole system
  // is rolled like the logo (SVG's y axis points down, three.js's up — hence the sign flip). Seen from the front,
  // the far half of every ring passes behind the word and the near half in front of it: the logo, in 3D.
  const system = new Group();
  system.rotation.z = -RINGS.rollDeg * DEG;
  scene.add(system);

  const planetGeo = new SphereGeometry(HW * RINGS.planetRadius, 40, 20);
  const hitGeo = new SphereGeometry(0.3, 12, 8);
  const hitMat = new MeshBasicMaterial({ visible: false });
  disposables.push(planetGeo, hitGeo, hitMat);

  const rigs: PlanetRig[] = SITE.divisions.map((division, i) => {
    const accent = new Color(division.accent);
    const pivot = new Group();
    pivot.rotation.x = (RINGS.baseTiltDeg + i * RINGS.tiltStepDeg) * DEG;
    system.add(pivot);

    const radius = HW * (RINGS.innerRadius + i * RINGS.spacing);
    // 1.6× the logo stroke: a 3D tube a few pixels wide antialiases toward grey, so it needs a little more body.
    const ringGeo = new TorusGeometry(radius, (HW * RINGS.stroke * 1.6) / 2, 8, 320);
    ringGeo.rotateX(Math.PI / 2); // TorusGeometry lies in XY; lay it flat in the ring plane (XZ)
    // toneMapped:false keeps the brand gold/white exact; section dimming is applied to opacity by hand.
    const ringMat = new MeshBasicMaterial({ color: new Color(RINGS.tones[i % RINGS.tones.length]), transparent: true, opacity: 1, toneMapped: false });
    const ring = new Mesh(ringGeo, ringMat);
    pivot.add(ring);

    // Matte, self-lit planets: low env reflection keeps the division hue instead of a white specular blob.
    const planetMat = new MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.85,
      roughness: 0.7,
      metalness: 0,
      envMapIntensity: 0.25,
    });
    const planet = new Mesh(planetGeo, planetMat);
    pivot.add(planet);

    // toneMapped:false — ACES would desaturate the additive halo toward white.
    const haloSprite = new Sprite(
      new SpriteMaterial({ map: halo, color: accent, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    haloSprite.scale.setScalar(HW * RINGS.planetRadius * 9);
    planet.add(haloSprite);

    const hit = new Mesh(hitGeo, hitMat);
    hit.userData.division = division.id;
    planet.add(hit);

    disposables.push(ringGeo, ringMat, planetMat, haloSprite.material);
    return { division, pivot, ring, planet, halo: haloSprite, hit, radius, angle: (RINGS.planetAnglesDeg[i] ?? 0) * DEG, focus: 0 };
  });

  /** O(1) lookups used every frame (avoid Array.find in the render loop). */
  const RIG_BY_ID = new Map(rigs.map((r) => [r.division.id, r] as const));
  const ACCENT_BY_ID = Object.fromEntries(SITE.divisions.map((d) => [d.id, d.accent])) as Record<DivisionId, string>;

  // ---------- Dust: a faint gold haze in the plane of the middle ring ----------
  const dustPivot = new Group();
  dustPivot.rotation.x = (RINGS.baseTiltDeg + ((RINGS.count - 1) / 2) * RINGS.tiltStepDeg) * DEG;
  system.add(dustPivot);
  const dustCount = coarse ? 700 : 1600;
  const dustPos = new Float32Array(dustCount * 3);
  const dustCol = new Float32Array(dustCount * 3);
  const c = new Color();
  for (let i = 0; i < dustCount; i++) {
    const r = HW * (1.12 + Math.pow(Math.random(), 0.9) * 0.42);
    const a = Math.random() * Math.PI * 2;
    dustPos[i * 3] = Math.cos(a) * r;
    dustPos[i * 3 + 1] = (Math.random() + Math.random() - 1) * 0.03;
    dustPos[i * 3 + 2] = Math.sin(a) * r;
    c.set(THEME.gold).offsetHSL((Math.random() - 0.5) * 0.04, -Math.random() * 0.2, (Math.random() - 0.3) * 0.25);
    dustCol.set([c.r, c.g, c.b], i * 3);
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new BufferAttribute(dustCol, 3));
  const dustMat = new PointsMaterial({ size: 0.022, map: halo, vertexColors: true, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false });
  const dust = new Points(dustGeo, dustMat);
  dustPivot.add(dust);
  disposables.push(dustGeo, dustMat);

  // ---------- Stars ----------
  const starCount = coarse ? 900 : 2200;
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 60 + Math.random() * 90;
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    starPos.set([Math.cos(t) * s * r, u * r, Math.sin(t) * s * r], i * 3);
    const roll = Math.random();
    c.set(roll < 0.08 ? '#9ec3ff' : roll < 0.2 ? THEME.gold : '#fff6e6');
    c.multiplyScalar(0.45 + Math.random() * 0.55);
    starCol.set([c.r, c.g, c.b], i * 3);
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new BufferAttribute(starCol, 3));
  const starMat = new PointsMaterial({ size: 0.55, map: halo, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const stars = new Points(starGeo, starMat);
  scene.add(stars);
  disposables.push(starGeo, starMat);

  // ---------- Decorative label that follows the focused planet ----------
  const label = document.createElement('div');
  label.className = 'planet-label';
  label.setAttribute('aria-hidden', 'true');
  document.body.append(label);

  // ---------- Camera state (eased) ----------
  const cam = { x: 0, y: 1.7, z: 14.5, tx: 0, ty: 0, tz: 0, shiftX: 0.04, shiftY: 0.07, exposure: 0 };
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const accentNow = new Color(THEME.gold);
  const accentTarget = new Color(THEME.gold);
  let width = 1;
  let height = 1;

  function resize(): void {
    // clientWidth excludes a classic (Windows) scrollbar; innerWidth would squash the aspect and offset picking.
    width = canvas.clientWidth || document.documentElement.clientWidth;
    height = canvas.clientHeight || window.innerHeight;
    if (!degraded) renderer.setPixelRatio(pixelRatioBudget()); // zoom / monitor changes alter devicePixelRatio
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    computeHeroFit();
    requestRender();
  }

  // Moving the window to another display changes DPR without always firing 'resize'.
  let dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const onDprChange = (): void => {
    dprQuery.removeEventListener('change', onDprChange);
    dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener('change', onDprChange);
    resize();
  };
  dprQuery.addEventListener('change', onDprChange);

  /**
   * Adaptive hero camera (phones/tablets): pick the camera distance that fits the WHOLE ring system inside the free
   * box the layout leaves (by width and by height), then shift the projection so the system is centred in it.
   * World size of the system: rings span 2·HW·(inner + 6·spacing) ≈ 5.4 wide incl. planets; ~2.4 tall incl. tilt.
   */
  const SYSTEM_W = 5.6;
  const SYSTEM_H = 2.4;
  let heroFit: { z: number; shiftX: number; shiftY: number } | null = null;
  function computeHeroFit(): void {
    const box = opts.heroFrame?.() ?? null;
    if (!box || box.w < 40 || box.h < 40) {
      heroFit = null;
      return;
    }
    const k = 2 * Math.tan(MathUtils.degToRad(camera.fov / 2)); // visible height per unit distance
    const z = Math.max((SYSTEM_W * height) / (k * box.w), (SYSTEM_H * height) / (k * box.h));
    heroFit = { z, shiftX: (box.x - width / 2) / width, shiftY: (height / 2 - box.y) / height };
  }

  function applyViewOffset(): void {
    // Negative window offset moves the rendered content right/up without changing perspective.
    camera.setViewOffset(width, height, -cam.shiftX * width, cam.shiftY * height, width, height);
  }

  // ---------- Interaction: planets are clickable, but never steal events from real UI ----------
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hitTargets: Object3D[] = rigs.map((r) => r.hit);
  /** Planet currently under the mouse (scene-owned hover). */
  let hovered: DivisionId | null = null;
  /** True while store.preview holds OUR hover — never clear a preview another control has taken over. */
  let scenePreviewOwned = false;

  function pick(clientX: number, clientY: number): DivisionId | null {
    ndc.set((clientX / width) * 2 - 1, -(clientY / height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(hitTargets, false)[0];
    return (hit?.object.userData.division as DivisionId | undefined) ?? null;
  }

  function setHovered(next: DivisionId | null): void {
    if (next === hovered) return;
    const prev = hovered;
    hovered = next;
    document.body.classList.toggle('is-pointing-planet', Boolean(next));
    if (next) {
      scenePreviewOwned = true;
      store.set({ preview: next, lastInteraction: performance.now() });
    } else if (scenePreviewOwned) {
      scenePreviewOwned = false;
      if (store.get().preview === prev) store.set({ preview: null });
    }
  }

  function onPointerMove(e: PointerEvent): void {
    pointer.x = (e.clientX / width) * 2 - 1;
    pointer.y = (e.clientY / height) * 2 - 1;
    if (e.pointerType !== 'mouse') return;
    const overUi = e.target instanceof Element && e.target.closest(INTERACTIVE);
    setHovered(overUi || store.get().section !== 'top' ? null : pick(e.clientX, e.clientY));
  }

  /** Pointer left the window: a resting hover must not keep tinting the page. */
  function onPointerOut(e: PointerEvent): void {
    if (!e.relatedTarget) setHovered(null);
  }

  function onClick(e: MouseEvent): void {
    if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
    if (store.get().section !== 'top') return;
    const id = pick(e.clientX, e.clientY);
    if (id) store.set({ active: id, lastInteraction: performance.now() });
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerout', onPointerOut);
  window.addEventListener('click', onClick);
  window.addEventListener('resize', resize);

  // ---------- Render loop ----------
  let raf = 0;
  let last = -1; // -1 = "first frame after start()": use dt = 0 (rAF timestamps can precede performance.now())
  let elapsed = 0;
  let running = false;
  let needsFrame = true;
  let perfFrames = 0;
  let perfTime = 0;
  let degraded = false;
  let lost = false;
  let lastDraw = 0;

  function requestRender(): void {
    needsFrame = true;
    if (!running) start();
  }

  function frame(now: number): void {
    // Never negative: a negative dt makes exponential damping EXTRAPOLATE (planets flash huge / inverted).
    const dt = last < 0 ? 0 : Math.max(0, Math.min((now - last) / 1000, 0.1));
    last = now;
    const motion = still ? 0 : 1;
    elapsed += dt * motion;
    // Still mode snaps straight to targets — no damping path, so no overshoot is possible.
    const ease = (current: number, target: number, lambda: number): number => (still ? target : damp(current, target, lambda, dt));

    const state = store.get();
    const focused = focusedDivision(state);
    const basePose = poseFor(state.section, width);
    const pose =
      state.section === 'top' && heroFit
        ? { ...basePose, position: [0, 0.2, heroFit.z] as const, shiftX: heroFit.shiftX, shiftY: heroFit.shiftY }
        : basePose;

    // Camera choreography + subtle pointer parallax.
    pointer.sx = ease(pointer.sx, pointer.x * motion, 3);
    pointer.sy = ease(pointer.sy, pointer.y * motion, 3);
    cam.x = ease(cam.x, pose.position[0] + pointer.sx * 0.6, 2.4);
    cam.y = ease(cam.y, pose.position[1] - pointer.sy * 0.35, 2.4);
    cam.z = ease(cam.z, pose.position[2], 2.4);
    cam.tx = ease(cam.tx, pose.target[0], 2.4);
    cam.ty = ease(cam.ty, pose.target[1], 2.4);
    cam.tz = ease(cam.tz, pose.target[2], 2.4);
    cam.shiftX = ease(cam.shiftX, pose.shiftX, 2.4);
    cam.shiftY = ease(cam.shiftY, pose.shiftY, 2.4);
    cam.exposure = ease(cam.exposure, pose.exposure, 1.6);
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    applyViewOffset();
    renderer.toneMappingExposure = cam.exposure;

    // Accent colour follows the focused division (lookup table, no per-frame array search).
    accentTarget.set(focused ? ACCENT_BY_ID[focused] : THEME.gold);
    if (still) accentNow.copy(accentTarget);
    else accentNow.lerp(accentTarget, 1 - Math.exp(-3 * dt));
    rim.color.copy(accentNow);
    (coreGlow.material as SpriteMaterial).color.copy(accentNow);

    // Core: slow sway (not a full spin, so the mark stays readable) + float.
    logo.rotation.y = Math.sin(elapsed * 0.3) * 0.28 + pointer.sx * 0.18 * motion;
    logo.rotation.x = Math.sin(elapsed * 0.21) * 0.05 - pointer.sy * 0.08 * motion;
    core.position.y = Math.sin(elapsed * 0.7) * 0.06;

    // Halos/glow skip tone-mapping (to keep their hue), so section dimming must be applied to them by hand.
    const dim = Math.min(1, cam.exposure / 1.05);
    (coreGlow.material as SpriteMaterial).opacity = 0.32 * dim;
    dustMat.opacity = 0.5 * dim;

    // Planets ride their rings; the focused division's ring brightens, the others recede.
    for (const rig of rigs) {
      const isFocused = rig.division.id === focused;
      rig.focus = ease(rig.focus, isFocused ? 1 : 0, 5);
      const dimmed = focused && !isFocused ? 1 : 0;
      rig.angle += rig.division.orbit.speed * dt * motion * (isFocused ? 0.25 : 1);
      rig.planet.position.set(Math.cos(rig.angle) * rig.radius, 0, Math.sin(rig.angle) * rig.radius);
      rig.planet.scale.setScalar(1 + rig.focus * 0.9 - dimmed * 0.15);
      rig.ring.material.opacity = (1 - dimmed * 0.55) * dim;
      (rig.halo.material as SpriteMaterial).opacity = (0.3 + rig.focus * 0.45 - dimmed * 0.15) * dim * dim;
    }
    dust.rotation.y += dt * 0.02 * motion;
    stars.rotation.y += dt * 0.004 * motion;

    // Touch devices outside the hero: the scene is a faint backdrop (scene.css) — ~20 fps is plenty and saves battery.
    const throttled = coarse && state.section !== 'top' && !still && now - lastDraw < 50;
    if (!throttled) {
      renderer.render(scene, camera);
      lastDraw = now;
    }
    updateLabel(focused, state);
    if (!still) adaptQuality(dt);

    if (still) {
      // Render on demand only: keep going while something was requested since the last frame.
      running = needsFrame;
      needsFrame = false;
      if (running) raf = requestAnimationFrame(frame);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function updateLabel(focused: DivisionId | null, state: AppState): void {
    const rig = focused ? RIG_BY_ID.get(focused) : undefined;
    if (!rig || state.section !== 'top') {
      label.classList.remove('is-visible');
      return;
    }
    rig.planet.getWorldPosition(tmpV).project(camera);
    const x = (tmpV.x * 0.5 + 0.5) * width;
    const y = (-tmpV.y * 0.5 + 0.5) * height;
    const index = SITE.divisions.indexOf(rig.division) + 1;
    const text = `${String(index).padStart(2, '0')} — ${rig.division.name}`;
    if (label.textContent !== text) label.textContent = text;
    label.style.setProperty('--c', rig.division.accent);
    label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    label.classList.add('is-visible');
  }

  /** If the first ~2s of frames are slow, drop resolution and dust so scrolling stays smooth. */
  function adaptQuality(dt: number): void {
    if (degraded || perfFrames > 150) return;
    perfFrames++;
    if (perfFrames < 30) return; // ignore warm-up (shader compile, font load)
    perfTime += dt;
    if (perfFrames === 150 && perfTime / 120 > 1 / 40) {
      degraded = true;
      renderer.setPixelRatio(1);
      dust.visible = false;
      resize();
    }
  }

  function start(): void {
    if (running || lost) return;
    running = true;
    last = -1;
    raf = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(raf);
  }

  const onVisibility = (): void => (document.hidden ? stop() : requestRender());
  document.addEventListener('visibilitychange', onVisibility);

  const unsubscribe = store.subscribe((next, prev) => {
    const nextStill = isStill(next);
    // Another control (dial, index row) replaced our hover preview → we no longer own it.
    if (next.preview !== hovered) scenePreviewOwned = false;
    // Scrolled away from the hero with the mouse resting on a planet → drop the hover.
    if (next.section !== 'top' && hovered) setHovered(null);
    const relevant =
      next.active !== prev.active ||
      next.preview !== prev.preview ||
      next.section !== prev.section ||
      nextStill !== still;
    still = nextStill;
    if (relevant) requestRender(); // lastInteraction-only updates (every keydown/wheel) never redraw
  });

  // WebGL context loss (GPU reset, iOS memory pressure): show the static wordmark, stop drawing,
  // and come back automatically if the browser restores the context.
  const onContextLost = (e: Event): void => {
    e.preventDefault();
    lost = true;
    stop();
    label.classList.remove('is-visible');
    html.classList.remove('scene-ready');
    html.classList.add('no-webgl');
  };
  const onContextRestored = (): void => {
    lost = false;
    buildEnvironment(); // three.js re-uploads geometry/textures itself; the PMREM target must be regenerated
    html.classList.remove('no-webgl');
    requestRender();
    requestAnimationFrame(() => html.classList.add('scene-ready'));
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  resize();
  // Snap camera to the current pose before the first frame so the entrance is a gentle drift, not a jump.
  const initial = poseFor(store.get().section, width);
  Object.assign(cam, {
    x: initial.position[0],
    y: initial.position[1] + 1.2,
    z: initial.position[2] + 5,
    shiftX: initial.shiftX,
    shiftY: initial.shiftY,
  });
  start();
  requestAnimationFrame(() => html.classList.add('scene-ready'));

  return {
    dispose() {
      stop();
      unsubscribe();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('click', onClick);
      window.removeEventListener('resize', resize);
      dprQuery.removeEventListener('change', onDprChange);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      label.remove();
      for (const d of disposables) d.dispose();
      scene.environment?.dispose();
      (halo as Texture).dispose();
      scene.traverse((o) => {
        const m = (o as Mesh).material as Material | Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
      });
      renderer.dispose();
    },
  };
}
