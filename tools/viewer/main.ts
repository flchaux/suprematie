// Visualiseur : toutes les unités (ou tous les bâtiments) côte à côte, avec l'angle de caméra du jeu.
// ?set=units|buildings|items  &only=clé1,clé2
import * as THREE from "three/webgpu";
import { buildModel, fallbackModel, PLAYER_COLORS } from "../../packages/client/src/models/generator.ts";
import { teamInstancedMesh, setTeamColor, TEX_PER_TILE_UNIT, TEX_PER_TILE_BUILDING } from "../../packages/client/src/render/materials.ts";
import { loadModelTextures, setTexturesEnabled } from "../../packages/client/src/render/textures.ts";
import { UNIT_MODELS } from "../../assets/models/units.ts";
import { BUILDING_MODELS } from "../../assets/models/buildings.ts";
import { ITEM_MODELS } from "../../assets/models/items.ts";
import data from "./data.json";

const params = new URLSearchParams(location.search);
const set = params.get("set") ?? "units";
const only = params.get("only")?.split(",");
const defs: { key: string; name: string; size: number; w: number; h: number }[] =
  set === "units"
    ? data.units.map((u: { key: string; name: string; radius: number }) => ({ key: u.key, name: u.name, size: Math.max(0.6, (u.radius * 2.4) / 256), w: 0, h: 0 }))
    : set === "items"
      ? data.items.slice(1).map((it: { key: string; name: string }) => ({ key: it.key, name: it.name, size: 1, w: 0, h: 0 }))
      : data.buildings.map((b: { key: string; name: string; w: number; h: number }) => ({ key: b.key, name: b.name, size: Math.max(b.w, b.h), w: b.w, h: b.h }));
const models = set === "units" ? UNIT_MODELS : set === "items" ? ITEM_MODELS : BUILDING_MODELS;
// variantes de modèles sans définition propre (virages des tapis…) : affichées si demandées par leur clé
const variants = (only ?? []).filter((k) => models[k] && !defs.some((d) => d.key === k)).map((k) => ({ key: k, name: k, size: 1, w: 1, h: 1 }));
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

const cols = Math.ceil(Math.sqrt(list.length * 1.6));
const cell = set === "units" ? 3.2 : set === "items" ? 1.6 : 8;
const labels = document.getElementById("labels")!;
let tris = 0;
const placed: { pos: THREE.Vector3; name: string; tri: number }[] = [];
list.forEach((d, i) => {
  const desc = models[d.key];
  const built = buildModel(desc ?? fallbackModel());
  const size = new THREE.Vector3();
  built.box.getSize(size);
  const target = set === "units" ? Math.min(d.size, cell * 0.75) : Math.min(d.size, cell * 0.9);
  const s = target / Math.max(size.x, size.z, 0.01);
  const x = (i % cols) * cell;
  const z = Math.floor(i / cols) * cell;
  const root = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.6, 0)), new THREE.Vector3(s, s, s));
  const color = new THREE.Color(set === "items" ? itemColor(d.key) : PLAYER_COLORS[i % 8]);
  const texScale = s * (set === "units" ? TEX_PER_TILE_UNIT : TEX_PER_TILE_BUILDING);
  const body = teamInstancedMesh(built.body, 1, texScale);
  body.mesh.count = 1;
  body.mesh.setMatrixAt(0, root);
  setTeamColor(body, 0, color);
  scene.add(body.mesh);
  for (const p of built.pivots) {
    const pm = teamInstancedMesh(p.geometry, 1, texScale);
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
  tris += built.triangles;
  placed.push({ pos: new THREE.Vector3(x, 0, z + cell * 0.38), name: d.name + (desc ? "" : " (manquant)"), tri: built.triangles });
});
const rows = Math.ceil(list.length / cols);
const cx = ((cols - 1) * cell) / 2;
const cz = ((rows - 1) * cell) / 2;
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 1000);
const dist = Math.max(cols, rows) * cell * 1.25;
camera.position.set(cx, dist * 0.82, cz + dist * 0.62);
camera.lookAt(cx, 0, cz);
renderer.render(scene, camera);
for (const p of placed) {
  const v = p.pos.clone().project(camera);
  const el = document.createElement("div");
  el.textContent = `${p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name} ${p.tri}`;
  el.style.left = ((v.x + 1) / 2) * innerWidth + "px";
  el.style.top = ((1 - v.y) / 2) * innerHeight + "px";
  labels.appendChild(el);
}
document.getElementById("info")!.textContent = `${list.length} modèles, ${tris} triangles · moteur ${(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : "WebGL2"}`;
(window as unknown as { __ready: boolean }).__ready = true;
