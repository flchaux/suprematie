// Visualiseur : toutes les unités (ou tous les bâtiments) côte à côte, avec l'angle de caméra du jeu.
// ?set=units|buildings|items|decor|vehicles  &only=clé1,clé2  &zoom=2 (plus près)  &lo (niveau de détail réduit)
import * as THREE from "three/webgpu";
import { buildModel, fallbackModel, PLAYER_COLORS, withHatches } from "../../packages/client/src/models/generator.ts";
import { RECEIVER_CLASSES } from "../../packages/shared/src/data.ts";
import { teamInstancedMesh, setTeamColor, TEX_PER_TILE_UNIT, TEX_PER_TILE_BUILDING } from "../../packages/client/src/render/materials.ts";
import { loadModelTextures, setTexturesEnabled } from "../../packages/client/src/render/textures.ts";
import { UNIT_MODELS } from "../../assets/models/units.ts";
import { BUILDING_MODELS } from "../../assets/models/buildings.ts";
import { ITEM_MODELS } from "../../assets/models/items.ts";
import { DECOR_MODELS } from "../../assets/models/decor.ts";
import { VEHICLE_MODELS } from "../../assets/models/vehicles.ts";
import { DECOR_KINDS, decorBatch, decorGeometry, decorMaterial, type DecorKind } from "../../packages/client/src/render/decor.ts";
import data from "./data.json";
import { NATURE_COLOR } from "../../packages/shared/src/data.ts";

const params = new URLSearchParams(location.search);
const set = params.get("set") ?? "units";
const only = params.get("only")?.split(",");
const defs: { key: string; name: string; size: number; w: number; h: number; cls?: number }[] =
  set === "decor"
    ? Object.keys(DECOR_MODELS).map((k) => ({ key: k, name: k, size: DECOR_KINDS[k as DecorKind]?.size[1] ?? 1, w: 0, h: 0 }))
    : set === "vehicles"
    ? Object.keys(VEHICLE_MODELS).map((k) => ({ key: k, name: k, size: k === "train" ? 2.6 : k === "cargo_drone" ? 1.1 : 0.8, w: 0, h: 0 }))
    : set === "units"
    ? data.units.map((u: { key: string; name: string; radius: number }) => ({ key: u.key, name: u.name, size: Math.max(0.6, (u.radius * 2.4) / 256), w: 0, h: 0 }))
    : set === "items"
      ? data.items.slice(1).map((it: { key: string; name: string }) => ({ key: it.key, name: it.name, size: 1, w: 0, h: 0 }))
      : data.buildings.map((b: { key: string; name: string; w: number; h: number; reach?: number; cls: number }) => ({ key: b.key, name: b.name, size: Math.max(b.w, b.h) * Math.max(1, b.reach ?? 1), w: b.w, h: b.h, cls: b.cls }));
const models = set === "decor" ? DECOR_MODELS : set === "vehicles" ? VEHICLE_MODELS : set === "units" ? UNIT_MODELS : set === "items" ? ITEM_MODELS : BUILDING_MODELS;
// variantes de modèles sans définition propre (virages des tapis…) : affichées si demandées par leur clé
// (un modèle de niveau amélioré, clé_n2…, prend la taille de son bâtiment)
const variants = (only ?? [])
  .filter((k) => models[k] && !defs.some((d) => d.key === k))
  .map((k) => {
    const base = defs.find((d) => d.key === k.replace(/_n\d+$/, ""));
    return base ? { ...base, key: k, name: `${base.name} ${k.slice(-1)}` } : { key: k, name: k, size: 1, w: 1, h: 1 };
  });
const list = only ? [...defs.filter((d) => only.includes(d.key)), ...variants] : defs;
// les objets sont teintés de leur propre couleur (et non de celle d'un joueur)
const itemColor = (key: string) => (data.items as { key: string; color: number }[]).find((it) => it.key === key)?.color ?? 0xffffff;

const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: params.has("webgl") });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
await renderer.init();
// textures des modèles (?unies pour comparer avec les couleurs unies)
await loadModelTextures();
setTexturesEnabled(!new URLSearchParams(location.search).has("unies"));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x26303a);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a3428, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-3, 6, 4);
scene.add(sun);

const cols = Math.min(list.length, Math.ceil(Math.sqrt(list.length * 1.6)));
const cell = set === "vehicles" ? 3.2 : set === "units" ? 3.2 : set === "items" ? 1.6 : set === "decor" ? 3 : 8;
const labels = document.getElementById("labels")!;
let tris = 0;
const placed: { pos: THREE.Vector3; name: string; tri: number }[] = [];
if (set === "decor") {
  // sol herbeux sous les décorations ; pour chaque sorte, une grande et deux petites, tournées et teintées
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(cols * cell + cell, Math.ceil(list.length / cols) * cell + cell), new THREE.MeshStandardNodeMaterial({ color: 0x55603c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(((cols - 1) * cell) / 2, 0, ((Math.ceil(list.length / cols) - 1) * cell) / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = sc.bottom = -40;
  sc.right = sc.top = 40;
  sun.position.set(-12, 30, 18).add(ground.position);
  sun.target.position.copy(ground.position);
  scene.add(sun.target);
  renderer.shadowMap.enabled = true;
  const mat = decorMaterial();
  list.forEach((d, i) => {
    const kind = d.key as DecorKind;
    const def = DECOR_KINDS[kind];
    const x = (i % cols) * cell;
    const z = Math.floor(i / cols) * cell;
    const b = decorBatch(kind, 3, mat);
    const items = [
      [x - 0.2, z - 0.3, def.size[1], 0.6, 1, 0.5],
      [x + 0.95, z + 0.75, def.size[0], 2.4, 0.86, 0],
      [x - 1.0, z + 0.8, (def.size[0] + def.size[1]) / 2, 4.1, 1.06, 1],
    ];
    items.forEach(([px, pz, size, angle, tint, warm], j) => {
      b.pos.setXYZW(j, px, -def.sink * size, pz, size);
      b.info.setXYZW(j, angle, tint, def.sway, warm);
    });
    b.geo.instanceCount = 3;
    b.mesh.visible = true;
    scene.add(b.mesh);
    const tri = decorGeometry(kind).triangles;
    tris += tri;
    placed.push({ pos: new THREE.Vector3(x, 0, z + cell * 0.38), name: d.name, tri });
  });
}
if (set !== "decor") list.forEach((d, i) => {
  const desc = models[d.key];
  // bâtiments qui reçoivent des objets : avec leurs trappes, comme en jeu
  const bare = buildModel(desc ?? fallbackModel());
  const built = set === "buildings" && d.cls !== undefined && RECEIVER_CLASSES.has(d.cls) && d.w === d.h && d.w > 1 ? withHatches(bare, d.w) : bare;
  const size = new THREE.Vector3();
  built.box.getSize(size);
  const target = set === "units" ? Math.min(d.size, cell * 0.75) : Math.min(d.size, cell * 0.9);
  const s = target / Math.max(size.x, size.z, 0.01);
  const x = (i % cols) * cell;
  const z = Math.floor(i / cols) * cell;
  const root = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.6 + (Number(params.get("rot") ?? 0) * Math.PI) / 180, 0)), new THREE.Vector3(s, s, s));
  // la faune (mordeurs, nid) a sa propre couleur, brune
  const fauna = d.key.startsWith("beast_") || d.key === "nest";
  const color = new THREE.Color(set === "items" ? itemColor(d.key) : fauna ? NATURE_COLOR : PLAYER_COLORS[i % 8]);
  const texScale = s * (set === "units" ? TEX_PER_TILE_UNIT : TEX_PER_TILE_BUILDING);
  // ?lo : niveau de détail réduit (sans les pièces fines)
  const lo = params.has("lo");
  const body = teamInstancedMesh((lo && built.bodyLo) || built.body, 1, texScale);
  body.mesh.count = 1;
  body.mesh.setMatrixAt(0, root);
  setTeamColor(body, 0, color);
  scene.add(body.mesh);
  for (const p of built.pivots) {
    const pm = teamInstancedMesh((lo && p.geometryLo) || p.geometry, 1, texScale);
    pm.mesh.count = 1;
    const m = root.clone().multiply(new THREE.Matrix4().makeTranslation(p.origin.x, p.origin.y, p.origin.z)).multiply(new THREE.Matrix4().makeRotationY(0.5));
    pm.mesh.setMatrixAt(0, m);
    setTeamColor(pm, 0, color);
    scene.add(pm.mesh);
  }
  if (set === "buildings") {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), new THREE.MeshBasicNodeMaterial({ color: 0x55606c, wireframe: true }));
    g.rotation.x = -Math.PI / 2;
    g.position.set(x, 0.01, z);
    scene.add(g);
  }
  const tri = lo ? built.trianglesLo : built.triangles;
  tris += tri;
  placed.push({ pos: new THREE.Vector3(x, 0, z + cell * 0.38), name: d.name + (desc ? "" : " (manquant)") + (built.bodyLo && !lo ? ` (loin ${built.trianglesLo})` : ""), tri });
});
const rows = Math.ceil(list.length / cols);
const cx = ((cols - 1) * cell) / 2;
const cz = ((rows - 1) * cell) / 2;
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 1000);
// ?zoom=2 : caméra deux fois plus proche (vérifier le détail des modèles)
const dist = (Math.max(cols, rows) * cell * 1.25) / Number(params.get("zoom") ?? 1);
camera.position.set(cx, dist * 0.82, cz + dist * 0.62);
camera.lookAt(cx, 0, cz);
camera.updateMatrixWorld();
for (const p of placed) {
  const v = p.pos.clone().project(camera);
  const el = document.createElement("div");
  el.textContent = `${p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name} ${p.tri}`;
  el.style.left = ((v.x + 1) / 2) * innerWidth + "px";
  el.style.top = ((1 - v.y) / 2) * innerHeight + "px";
  labels.appendChild(el);
}
document.getElementById("info")!.textContent = `${list.length} modèles, ${tris} triangles · moteur ${(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : "WebGL2"}`;
// rendu continu : le canevas WebGPU n'est pas toujours conservé après une seule image (captures)
let frames = 0;
void renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  if (++frames === 3) (window as unknown as { __ready: boolean }).__ready = true;
});
