// Contrôleur de partie, événements : événements de la simulation portés par chaque image (effets, sons, messages,
// alertes), attaque subie, pings de l'équipe.
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import * as THREE from "three/webgpu";
import { EV, BClass, Layer } from "@supreme/shared";
import type { Frame } from "@supreme/shared";
import { groundHeight } from "../render/terrain.ts";
import { ownerColor, ownerHex } from "./colors.ts";
import { ui, pushMessage } from "./state.svelte.ts";
import { say } from "../audio/voice.ts";
import { sfx } from "../audio/sound.ts";
import { keyOf } from "./keys.svelte.ts";
import { ADAPT_FAMILIES } from "./traits.ts";
import type { GameClient } from "./client.ts";
import { TILE } from "./clientConsts.ts";

// ---------- pings ----------
/** Signale un point (cases) à son équipe ; dans une démo, seulement à soi. */
export function sendPing(c: GameClient, x: number, z: number): void {
  if (c.demoOrders) return showPing(c, ui.me, x, z);
  if (ui.me < 0 || ui.replay || ui.spectator) return;
  c.send({ t: "mark", x, z });
}
export function showPing(c: GameClient, slot: number, x: number, z: number): void {
  const f = c.frame;
  if (!f || !c.scene?.pings) return;
  c.scene.pings.add(x, z, new THREE.Color(ownerHex(slot, f.players)).getHex());
  sfx.ping();
  c.alertPos = { x, z };
  if (slot !== ui.me) {
    const k = keyOf("alert");
    pushMessage(`${ui.names[slot] ?? "Un allié"} signale un point${k ? ` (${k} pour y aller)` : ""}`, "info");
  }
}

// ---------- événements de la simulation ----------
export function handleEvents(gc: GameClient, f: Frame): void {
  const sc = gc.scene;
  if (!sc) return;
  const b = f.buf;
  const cam = sc.target;
  // proximité d'un son (0 à 1) : distance au point regardé, et hauteur de la caméra (de haut, la
  // bataille s'entend comme de loin : assourdie, avec l'écho du terrain)
  const high = 1 - 0.5 * Math.min(1, Math.max(0, (sc.distance - 30) / 220));
  const near = (x: number, z: number) => {
    const d = Math.hypot(x - cam.x, z - cam.z);
    return Math.max(0, 1 - d / (sc.distance * 1.2 + 20)) * high;
  };
  // placement gauche-droite d'un son : position à l'écran (hors écran : au bord)
  const el = gc.canvasEl;
  const pp = { x: 0, y: 0 };
  const pan = (x: number, z: number) => {
    if (!el || !gc.map || !sc.project(x, groundHeight(gc.map, x, z), z, pp)) return 0;
    return Math.max(-1, Math.min(1, (pp.x / Math.max(1, el.clientWidth)) * 2 - 1));
  };
  const myTeam = f.players[ui.me]?.team ?? -1;
  // les effets ne trahissent pas ce qui se passe sous le brouillard de guerre
  const vis = f.vis;
  const vw = f.visW;
  const seen = (x: number, z: number) => {
    if (ui.spectator || !ui.fog || !vis) return true;
    const cx = Math.min(vw - 1, Math.max(0, (x / 4) | 0));
    const cz = Math.min(vw - 1, Math.max(0, (z / 4) | 0));
    return (vis[cz * vw + cx] & 1) !== 0;
  };
  const fx = sc.entities?.effects; // absent en mode sans rendu
  for (let i = 0, o = f.eventOff; i < f.nEvents; i++, o += 5) {
    const [type, a, c, d, e] = [b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4]];
    switch (type) {
      case EV.EXPLOSION: {
        const x = a / TILE;
        const z = c / TILE;
        if (seen(x, z) || e === 3) {
          sc.entities?.addExplosion(x, z, d / TILE, e);
          sfx.explosion(d / TILE, e, near(x, z), pan(x, z));
        }
        break;
      }
      case EV.BEAM: {
        const x0 = a / TILE, z0 = c / TILE, x1 = d / TILE, z1 = e / TILE;
        const y0 = groundHeight(gc.map!, x0, z0) + 1.2;
        const y1 = groundHeight(gc.map!, x1, z1) + 0.5;
        if (!seen(x0, z0) && !seen(x1, z1)) break;
        sc.entities?.addBeam(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), 0xff4040, 0.12);
        fx?.sparks(x1, y1, z1, [4, 0.8, 0.6], 4);
        sfx.strike(Math.max(near(x0, z0), near(x1, z1)), pan(x1, z1));
        break;
      }
      case EV.FIRE: {
        const w = gc.data!.weapons[a];
        if (w) sfx.fire(w, near(c / TILE, d / TILE), pan(c / TILE, d / TILE));
        // morsure (proj 12) : pas de projectile, un éclat au point mordu
        if (w?.proj === 12 && seen(c / TILE, d / TILE)) {
          const x = c / TILE;
          const z = d / TILE;
          fx?.bite(x, groundHeight(gc.map!, x, z) + 0.4, z, w.dmg > 60 ? 1.6 : w.dmg > 20 ? 1.2 : 0.8);
        }
        break;
      }
      case EV.BUILT:
        if (a === ui.me) sfx.built();
        break;
      case EV.ATTACKED:
        if (a === ui.me) onAttacked(gc, c / TILE, d / TILE, e === 1);
        break;
      case EV.FUEL_LOW:
      case EV.FUEL_DRY:
        // générateur : moins d'une minute de combustible, puis à sec (au plus une annonce toutes les 15 s)
        if (a === ui.me && performance.now() - gc.lastFuelAlert > 15000) {
          gc.lastFuelAlert = performance.now();
          const name = gc.data!.buildings[e]?.name ?? "Générateur";
          if (type === EV.FUEL_DRY) {
            say("energie");
            pushMessage(`${name} à sec : sa zone électrique est éteinte (collez-lui un extracteur d'hydrocarbure ou un dépôt, ou amenez du combustible)`, "alert");
          } else pushMessage(`${name} : moins d'une minute de combustible`, "alert");
          gc.alertPos = { x: c / TILE, z: d / TILE };
        }
        break;
      case EV.EPPZ:
        // EPPZ capturé dans une ruine des Anciens
        if (a === ui.me) {
          pushMessage("EPPZ capturé ! Posez un socle à EPPZ (Énergie) : 25 000 kW sans combustible", "good");
          sfx.research();
        } else if (seen(c / TILE, d / TILE)) pushMessage(`${ui.names[a] ?? "Un joueur"} a capturé un EPPZ`, "alert");
        break;
      case EV.TAMED:
        if (seen(c / TILE, d / TILE)) fx?.tamed(c / TILE, d / TILE, new THREE.Color(ownerColor(a, gc.frame!.players)));
        // nid de mordeurs apprivoisé par une Reine de la Souche
        if (a === ui.me) {
          pushMessage("Nid apprivoisé : il est greffé à votre essaim et fait naître des mordeurs pour vous", "good");
          sfx.research();
        } else if (seen(c / TILE, d / TILE)) pushMessage(`${ui.names[a] ?? "Un joueur"} a apprivoisé un nid de mordeurs`, "alert");
        break;
      case EV.NO_DEPOT:
        // livraison de la soute : aucun de nos dépôts n'a de place pour cet objet
        if (a === ui.me) {
          pushMessage(`Livraison impossible : aucun de vos dépôts n'a de place pour ${gc.data!.items[e]?.name.toLowerCase() ?? "cet objet"} (il reste dans la soute)`, "alert");
          sfx.error();
        }
        break;
      case EV.DEPLOY_FAILED:
        // Reine de la Souche hors de son terreau, ou chenillard des Transhumants qui n'a pas trouvé la
        // place de se déployer
        if (a === ui.me && gc.data!.units[e]?.key === "queen") {
          pushMessage("La Reine ne s'enracine que sur votre terreau", "alert");
          sfx.error();
        } else if (a === ui.me) {
          const u = gc.data!.units[e];
          const drill = (u?.deploys ?? -1) >= 0 && gc.data!.buildings[u.deploys].deposit !== 0;
          pushMessage(`${u?.name ?? "Chenillard"} : pas la place de se déployer ici${drill ? " (une foreuse se déploie sur un gisement, à 3 cases au plus)" : " (terrain plat et libre)"}`, "alert");
          sfx.error();
        }
        break;
      case EV.MOD_DONE:
        // Transhumants : amélioration installée
        if (a === ui.me) {
          const m = gc.data!.mods[c];
          pushMessage(`${m?.name ?? "Amélioration"} : installation terminée (${gc.data!.units[m?.host]?.name ?? "unité"})`, "good");
          sfx.research();
          sc.addMarker(d / TILE, e / TILE, 0xffb547);
        }
        break;
      case EV.TURRET_LOST:
        if (a === ui.me) {
          pushMessage(`${gc.data!.units[e]?.name ?? "Tourelle"} détruite : l'Arche la reconstruit (30 s)`, "alert");
          gc.alertPos = { x: c / TILE, z: d / TILE };
        }
        break;
      case EV.CAR_LOST:
        if (a === ui.me) {
          const m = gc.data!.mods[e];
          pushMessage(`Remorque détruite : ${m?.name ?? "amélioration"} hors service, l'Arche la reconstruit (45 s)`, "alert");
          gc.alertPos = { x: c / TILE, z: d / TILE };
        }
        break;
      case EV.ARK_BOOST:
        if (seen(a / TILE, c / TILE)) fx?.sparks(a / TILE, groundHeight(gc.map!, a / TILE, c / TILE) + 1.2, c / TILE, [3, 1.6, 0.4], 14);
        if (d === ui.me) sfx.confirm();
        break;
      case EV.SHARDS:
        // nid détruit : fragments d'énergie gagnés
        if (a === ui.me) {
          pushMessage(`Nid détruit : ${e} fragment${e > 1 ? "s" : ""} d'énergie récupéré${e > 1 ? "s" : ""} (surcadençage des machines, dans leur fiche)`, "info");
          sfx.confirm();
        }
        break;
      case EV.FACTORY_STARVED:
        // usine à l'arrêt faute de composants (au plus une annonce toutes les 30 s)
        if (a === ui.me && performance.now() - gc.lastStarveAlert > 30000) {
          gc.lastStarveAlert = performance.now();
          pushMessage(`Usine à l'arrêt, composant manquant : ${gc.data!.items[e]?.name ?? "?"} (collez un dépôt à l'usine ou amenez un tapis)`, "alert");
          gc.alertPos = { x: c / TILE, z: d / TILE };
        }
        break;
      case EV.RESEARCH:
        if (a === ui.me) {
          sfx.research();
          say("recherche");
          pushMessage(`Recherche terminée : ${gc.data!.techs[c].name}`, "good");
        }
        break;
      case EV.NUKE:
        sfx.nuke();
        pushMessage(a === ui.me ? "Missile stratégique lancé" : "ALERTE : missile stratégique ennemi lancé !", "alert");
        gc.alertPos = { x: c / TILE, z: d / TILE };
        break;
      case EV.ORBITAL:
        pushMessage(a === ui.me ? "Frappe orbitale en cours" : "ALERTE : frappe orbitale !", "alert");
        break;
      case EV.ELIMINATED:
        pushMessage(`${ui.names[a] ?? "Joueur"} est éliminé`, a === ui.me ? "alert" : "info");
        break;
      case EV.HATCH: {
        // éclosion d'un œuf de la Souche : sa coque vide se fane sur place, l'organisme en sort
        const x = a / TILE, z = c / TILE;
        const egg = d & 0xff;
        if (seen(x, z)) {
          sc.entities?.addHatch(x, z, egg, e & 0xff, (((e >> 8) & 0xffff) * Math.PI * 2) / 65536, f.tick);
          fx?.hatch(x, groundHeight(gc.map!, x, z), z, Math.max(0.7, (gc.data!.units[egg]?.radius ?? 60) / 60));
          sfx.hatch(near(x, z), pan(x, z));
        }
        break;
      }
      case EV.ACID: {
        // flaque d'acide de la Souche : nappe au sol pour toute sa durée
        const x = a / TILE, z = c / TILE;
        if (seen(x, z)) fx?.acid(x, z, d / TILE, (e >>> 8) / 20);
        break;
      }
      case EV.ADAPTED:
        if (a === ui.me) {
          pushMessage(`Caractère acquis : toute l'espèce subit 20 % de dégâts en moins (${ADAPT_FAMILIES[c] ?? "?"})`, "good");
          sfx.confirm();
        }
        break;
      case EV.COCOON: {
        // cocon mûr : il crève en gerbe, le Béhémoth en sort en grandissant
        const x = a / TILE, z = c / TILE;
        if (seen(x, z)) {
          sc.entities?.addBirth(x, z, f.tick);
          fx?.hatch(x, groundHeight(gc.map!, x, z) + 1, z, 7, true);
          fx?.warp(x, z);
          sfx.hatch(near(x, z), pan(x, z));
        }
        pushMessage((e & 0xff) === ui.me ? "Le cocon s'est ouvert : un Béhémoth est né" : "Un Béhémoth vient de naître", (e & 0xff) === ui.me ? "good" : "alert");
        gc.alertPos = { x, z };
        break;
      }
      case EV.SACRIFICE: {
        const x = a / TILE, z = c / TILE;
        if (seen(x, z)) {
          fx?.hatch(x, groundHeight(gc.map!, x, z), z, Math.max(1, (gc.data!.units[d]?.radius ?? 90) / 70), true);
          sfx.hatch(near(x, z), pan(x, z));
        }
        break;
      }
      case EV.GRAZE:
        if (seen(a / TILE, c / TILE)) fx?.graze(a / TILE, c / TILE);
        break;
      case EV.SPENT:
        // organes épuisés : une annonce groupée, au plus toutes les 8 s
        if (e === ui.me) {
          gc.spent.set(d, (gc.spent.get(d) ?? 0) + 1);
          gc.alertPos = { x: a / TILE, z: c / TILE };
          if (!gc.spentTimer) {
            gc.spentTimer = window.setTimeout(() => {
              const list = [...gc.spent].map(([k, n]) => (gc.data?.buildings[k]?.key === "taproot" ? `${n} racine${n > 1 ? "s" : ""}-puits épuisée${n > 1 ? "s" : ""}` : `${n} frondaison${n > 1 ? "s" : ""} lente${n > 1 ? "s" : ""}`)).join(", ");
              pushMessage(`${list} : l'herbe est loin, étendez votre réseau (Espace pour y aller)`, "alert");
              gc.spent.clear();
              gc.spentTimer = 0;
            }, 1500);
          }
        }
        break;
      case EV.DIGEST: {
        const x = a / TILE, z = c / TILE;
        if (seen(x, z)) fx?.digest(x, z, (d & 0xffff) + 1, ((d >>> 16) & 0xffff) + 1);
        break;
      }
      case EV.BURROW:
        // passage d'un terrier : la terre se soulève aux deux bouts
        if (seen(a / TILE, c / TILE)) fx?.dirt(a / TILE, c / TILE);
        if (seen(d / TILE, e / TILE)) fx?.dirt(d / TILE, e / TILE);
        break;
      case EV.UNIT_DIED: {
        const owner = e;
        if (seen(a / TILE, c / TILE)) {
          const def = gc.data!.units[d];
          // une vessie ou un œuf de la Souche crève : la sève gicle, pas de débris
          if (def?.key === "burster") fx?.hatch(a / TILE, groundHeight(gc.map!, a / TILE, c / TILE), c / TILE, 2.6, true);
          else if (def?.egg) fx?.hatch(a / TILE, groundHeight(gc.map!, a / TILE, c / TILE), c / TILE, Math.max(0.7, def.radius / 60), true);
          else if (def && def.layer !== Layer.Sub) fx?.wreckage(a / TILE, c / TILE, Math.max(0.5, (def.radius * 2) / TILE), new THREE.Color(ownerColor(owner, gc.frame?.players)), false);
        }
        void owner;
        break;
      }
      case EV.BUILDING_DIED:
        if (seen(a / TILE, c / TILE)) {
          const def = gc.data!.buildings[d];
          if (def && def.cls !== BClass.Belt && def.cls !== BClass.Inserter) fx?.wreckage(a / TILE, c / TILE, Math.max(def.w, def.h), new THREE.Color(ownerColor(e, gc.frame?.players)), true);
        }
        break;
      case EV.PROMOTED: {
        // montée en grade : éclat doré ; message pour nos unités (au plus un toutes les 5 s)
        const x = a / TILE, z = c / TILE;
        if (seen(x, z)) fx?.sparks(x, groundHeight(gc.map!, x, z) + 1.5, z, [3, 2.4, 0.6], 8);
        if (e === ui.me && performance.now() - gc.lastPromo > 5000) {
          gc.lastPromo = performance.now();
          pushMessage(`Unité promue : vétérance ${"★".repeat(d)}`, "good");
        }
        break;
      }
      case EV.LOOT: {
        // Transhumants : butin pris sur une victime détruite ; un message toutes les 3 s au plus
        if (d === ui.me) {
          sc.addMarker(a / TILE, c / TILE, 0xffc83c);
          gc.loot += e;
          if (!gc.lootTimer) {
            gc.lootTimer = window.setTimeout(() => {
              pushMessage(`Butin : ${gc.loot} objet${gc.loot > 1 ? "s" : ""} pris à l'ennemi, rapporté${gc.loot > 1 ? "s" : ""} à votre réserve la plus proche`, "good");
              gc.loot = 0;
              gc.lootTimer = 0;
            }, 3000);
          }
        }
        break;
      }
      case EV.GIFT: {
        // dons par portail : regroupés en un message par seconde
        if (d === ui.me || e === ui.me) {
          const k = `${d}:${e}`;
          gc.gifts.set(k, (gc.gifts.get(k) ?? 0) + 1);
          if (!gc.giftTimer) {
            gc.giftTimer = window.setTimeout(() => {
              for (const [key, n] of gc.gifts) {
                const [from, to] = key.split(":").map(Number);
                if (to === ui.me) pushMessage(`Renforts : ${n} unité${n > 1 ? "s" : ""} reçue${n > 1 ? "s" : ""} de ${ui.names[from] ?? "un allié"}`, "good");
                else pushMessage(`${n} unité${n > 1 ? "s" : ""} donnée${n > 1 ? "s" : ""} à ${ui.names[to] ?? "un allié"}`, "info");
              }
              gc.gifts.clear();
              gc.giftTimer = 0;
            }, 1000);
          }
        }
        break;
      }
      case EV.TELEPORT:
        sfx.teleport(Math.max(near(a / TILE, c / TILE), near(d / TILE, e / TILE)));
        if (seen(a / TILE, c / TILE)) fx?.warp(a / TILE, c / TILE);
        if (seen(d / TILE, e / TILE)) fx?.warp(d / TILE, e / TILE);
        break;
      case EV.INTERCEPT:
        sc.entities?.addBeam(new THREE.Vector3(a / TILE, groundHeight(gc.map!, a / TILE, c / TILE) + 2, c / TILE), new THREE.Vector3(d / TILE, 40, e / TILE), 0x80ffff, 0.6);
        pushMessage("Missile intercepté", "good");
        break;
      case EV.SHIELD_HIT:
        if (Math.random() < 0.4 && seen(a / TILE, c / TILE)) fx?.sparks(a / TILE, groundHeight(gc.map!, a / TILE, c / TILE) + 1, c / TILE, [1.2, 2.6, 4], 3);
        break;
    }
  }
  void myTeam;
  // énergie insuffisante : annonce au passage sous la demande (au plus une fois par minute)
  const me = f.players[ui.me];
  if (me) {
    const low = me.powerUse > me.powerProd && me.powerUse > 0;
    if (low && !gc.powerWasLow && performance.now() - gc.lastPowerAlert > 60000) {
      gc.lastPowerAlert = performance.now();
      say("energie");
      pushMessage("Énergie insuffisante : construisez des générateurs", "alert");
    }
    gc.powerWasLow = low;
  }
}

/**
 * Attaque subie (événement de la simulation, au plus toutes les 2 s) : annonce vocale et message,
 * sauf si une attaque du même type a déjà été signalée sans interruption (délai remis à zéro à
 * chaque dégât : 20 s pour la base, 12 s pour le commandant).
 */
function onAttacked(c: GameClient, x: number, z: number, commander: boolean): void {
  const now = performance.now();
  if (commander) {
    if (now - c.lastCmdHit > 12000) {
      say("commandant");
      sfx.alert();
      pushMessage("Le robot de commandement est attaqué !", "alert");
      c.alertPos = { x, z };
    }
    c.lastCmdHit = now;
    return;
  }
  if (now - c.lastBaseHit > 20000) {
    const k = keyOf("alert");
    say("attaque");
    sfx.alert();
    pushMessage(k ? `Nous sommes attaqués (${k} pour y aller)` : "Nous sommes attaqués", "alert");
    c.alertPos = { x, z };
  }
  c.lastBaseHit = now;
}
