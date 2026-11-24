// Rendu des entités : modèle d'une sorte d'entité (unité, bâtiment, objet, véhicule) et ses maillages
// instanciés, le corps et un maillage par pièce mobile.
import * as THREE from "three/webgpu";
import { parseCond, parseDep, type buildModel, type DepStep, type PivotCond } from "../../models/generator.ts";
import { teamInstancedMesh, type TeamMesh } from "../materials.ts";

export type Built = ReturnType<typeof buildModel>;

/**
 * Modèle d'une sorte d'entité et ses maillages instanciés. Le modèle peut être construit à la demande
 * (première apparition de la sorte à l'écran) : `built` et `scale` sont alors des fonctions, évaluées
 * une fois au premier accès (le chargement d'une partie ne construit pas les modèles qu'on ne voit pas).
 */
export class KindMesh {
  body: TeamMesh | null = null;
  pivots: { tm: TeamMesh; origin: THREE.Vector3; spin: boolean; leg: number; wave: number; mode: number; slide: number; dep: DepStep[] | null; cond: PivotCond | null; fixed: boolean }[] = [];
  cap = 0;
  n = 0;
  private builtV: Built | null;
  private scaleV: number | null;
  constructor(
    public scene: THREE.Object3D,
    private builtSrc: Built | (() => Built),
    private scaleSrc: number | ((b: Built) => number),
    /** répétitions de texture par case du monde */
    public texPerTile = 0,
    /** ombres portées (désactivées pour les objets des tapis, très nombreux) */
    public shadows = true,
  ) {
    this.builtV = typeof builtSrc === "function" ? null : builtSrc;
    this.scaleV = typeof scaleSrc === "function" ? null : scaleSrc;
  }
  get built(): Built {
    if (!this.builtV) this.builtV = (this.builtSrc as () => Built)();
    return this.builtV;
  }
  get scale(): number {
    if (this.scaleV === null) this.scaleV = (this.scaleSrc as (b: Built) => number)(this.built);
    return this.scaleV;
  }
  /** hauteur du modèle à l'échelle (pour placer la fumée au sommet) */
  get height(): number {
    return (this.built.box.max.y - this.built.box.min.y) * this.scale;
  }
  /** le modèle a des jambes articulées (pivots « jambe… ») */
  get legs(): boolean {
    return this.built.pivots.some((p) => /^jambe/.test(p.name));
  }
  /** niveau de détail réduit (caméra lointaine) : géométries sans les pièces fines */
  lo = false;
  private bodyGeo(): THREE.BufferGeometry {
    return (this.lo && this.built.bodyLo) || this.built.body;
  }
  private pivotGeo(i: number): THREE.BufferGeometry {
    const p = this.built.pivots[i];
    return (this.lo && p.geometryLo) || p.geometry;
  }
  /** Change le niveau de détail : on échange seulement les géométries (mêmes attributs, mêmes instances). */
  setLod(lo: boolean): void {
    if (lo === this.lo) return;
    this.lo = lo;
    // modèle pas encore construit (ou sans version allégée) : rien à échanger, ensure() prendra la bonne
    if (!this.builtV?.bodyLo) return;
    if (this.body) this.body.mesh.geometry = this.bodyGeo();
    this.pivots.forEach((p, i) => (p.tm.mesh.geometry = this.pivotGeo(i)));
  }
  ensure(need: number): void {
    if (need <= this.cap) return;
    const cap = Math.max(16, this.cap * 2, need);
    if (this.body) this.scene.remove(this.body.mesh);
    for (const p of this.pivots) this.scene.remove(p.tm.mesh);
    this.body = teamInstancedMesh(this.bodyGeo(), cap, this.texPerTile * this.scale);
    this.body.mesh.castShadow = this.shadows;
    this.scene.add(this.body.mesh);
    this.pivots = this.built.pivots.map((p, i) => {
      const tm = teamInstancedMesh(this.pivotGeo(i), cap, this.texPerTile * this.scale);
      this.scene.add(tm.mesh);
      // pièce d'une amélioration des Transhumants (« si:… », « sauf:… ») : dessinée selon ce qui est installé
      const cond = parseCond(p.name);
      const name = cond?.base ?? p.name;
      // jambe : 1 ou 2 selon la phase (gauche ou arrière décalée d'un demi-pas), 0 sinon
      const leg = /^jambe/.test(p.name) ? 1 + (Number(/_g\b|_g_|_g$/.test(p.name)) ^ Number(/_ar/.test(p.name))) : 0;
      // anneau d'un corps qui ondule (« ondule1 », « ondule2 »… de la tête vers la queue), 0 sinon
      const wave = Number(/^ondule(\d+)/.exec(p.name)?.[1] ?? 0);
      // droïde roulant : 1 « boule » (roulé), 2 « deplie… » (déployé), 3 « deplie_tourelle » (déployé, vise) ;
      // 4 « eppz… » : l'EPPZ d'une ruine, visible tant qu'elle le garde (bâtiment en service)
      const mode = /^boule/.test(p.name) ? 1 : /^deplie_tourelle/.test(p.name) ? 3 : /^deplie/.test(p.name) ? 2 : /^eppz/.test(p.name) ? 4 : 0;
      // « chenille_p0.25 » : crampons du brin supérieur d'une chenille, qui glissent vers l'avant quand l'unité
      // roule, d'un pas (0,25 unité du modèle) par période ; 0 sinon
      const slide = Number(/^chenille_p([\d.]+)/.exec(name)?.[1] ?? 0);
      return { tm, origin: p.origin.clone().multiplyScalar(this.scale), spin: /rotor|helice|foret|radar|cristal|feu/.test(name) || (!cond && /emetteur/.test(name)), leg, wave, mode, slide, dep: parseDep(name), cond, fixed: !!cond && /^fixe/.test(name) };
    });
    this.cap = cap;
  }
  begin(): void {
    this.n = 0;
  }
  end(): void {
    if (!this.body) return;
    this.body.mesh.count = this.n;
    this.body.mesh.instanceMatrix.needsUpdate = true;
    this.body.team.needsUpdate = true;
    for (const p of this.pivots) {
      p.tm.mesh.count = this.n;
      p.tm.mesh.instanceMatrix.needsUpdate = true;
      p.tm.team.needsUpdate = true;
    }
  }
}
