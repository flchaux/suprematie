// Catalogue des icônes générées (objets, bâtiments, unités, illustrations) : une description par
// clé de données du jeu. Le style commun est ajouté par generate.mjs.

/** Style commun de toutes les icônes (charte « holo-tactique »). */
export const STYLE =
  "Single game icon for a futuristic sci-fi real-time strategy game interface. " +
  "Clean stylized 3D hard-surface render, three-quarter top-down view, matte gunmetal grey and off-white armor panels " +
  "with thin glowing cyan (#3EF0FF) light strips and small amber (#FFB547) details, soft studio rim light, " +
  "high contrast readable silhouette, centered, subject fills about 80% of the frame, " +
  "isolated on a fully transparent background, no text, no letters, no numbers, no border, no frame, no ground, no cast shadow.";

/** Style des objets (ressources et produits intermédiaires). */
export const ITEM_STYLE =
  "Single resource item icon for a futuristic sci-fi strategy game interface. " +
  "Clean stylized 3D render of a small industrial object, three-quarter view, soft studio light with a thin cyan rim light, " +
  "high contrast readable silhouette, centered, fills about 75% of the frame, isolated on a fully transparent background, " +
  "no text, no letters, no border, no frame, no ground, no cast shadow.";

export const ITEMS = {
  iron_ore: "a rough chunk of dark slate-grey iron ore (#6b7a8f) with metallic glinting veins",
  copper_ore: "a rough chunk of copper ore, rusty orange-brown rock (#c0703a) with bright copper veins",
  silicon: "a cluster of pale beige silicon crystals (#d8d0b8), slightly translucent",
  hydrocarbon: "a sealed sci-fi barrel of dark purple-black crude hydrocarbon (#2a2230) with a glossy oily drip",
  crystal: "a glowing raw energy crystal cluster, luminous cyan (#66e0ff)",
  iron_plate: "a neat stack of three brushed blue-grey iron plates (#a8b4c4) with bevelled edges",
  copper_plate: "a neat stack of three shiny copper plates, warm orange (#e08a50), bevelled edges",
  steel: "a polished bright steel ingot beam (#dfe6ee), very clean, white highlights",
  wafer: "a thin round silicon wafer disc with an iridescent violet-blue grid pattern (#7d7fa8)",
  gear: "a single chunky mechanical gear cog, grey metal (#8c96a3)",
  cable: "a coiled bundle of orange copper cable (#d9822b) with a connector",
  circuit: "a green printed circuit board (#3fa34d) with gold traces and chips",
  engine: "a compact futuristic engine block, dark grey (#5a6470) with a cyan glowing core",
  ammo: "a crate of brass ammunition shells (#c9a227), military sci-fi style",
  processor: "a square computer processor chip, blue (#2f6fd6) with glowing cyan traces",
  fuel: "a futuristic yellow fuel canister (#e0c040) with a hazard stripe",
  composite: "a stack of dark carbon composite panels (#4a4a58) with a woven fibre texture",
  refined_crystal: "a perfectly cut glowing refined crystal gem, pale cyan (#9ff2ff), faceted",
  energy_cell: "a cylindrical energy cell battery glowing mint green (#7cf0a0)",
  arm_part: "a robotic arm joint mechanical part, yellow (#e6c84a) industrial",
  pack1: "a data cartridge with a glowing red (#d04040) holographic core, sci-fi research module",
  pack2: "a data cartridge with a glowing green (#40b040) holographic core, sci-fi research module",
  pack3: "a data cartridge with a dark grey (#5a5a5a) armored shell and military markings shape, sci-fi research module",
  pack4: "a data cartridge with a glowing blue (#4060e0) holographic core, sci-fi research module",
  pack5: "a data cartridge with a glowing cyan (#50e0e0) crystal core, sci-fi research module",
  pack6: "a data cartridge with a glowing white (#f0f0f0) orbital ring core, sci-fi research module",
};

export const BUILDINGS = {
  extractor: "a compact mining extractor drill rig on a square base, drilling into the ground",
  belt1: "a short straight segment of an industrial conveyor belt with rollers",
  belt2: "a short straight segment of a fast conveyor belt with blue side rails",
  belt3: "a short straight segment of an express conveyor belt with glowing cyan side rails",
  inserter: "a small industrial robotic pick-and-place arm on a round base",
  long_inserter: "a tall industrial robotic pick-and-place arm on a round base with a very long horizontal boom and a gripper at its tip, amber light strips",
  furnace: "a compact square smelting furnace with a glowing orange mouth and a chimney",
  assembler1: "a square automated assembling machine with a hatch and a small robotic arm inside",
  assembler2: "a square fast assembling machine with blue panels and twin robotic arms",
  assembler3: "a square advanced assembling machine with glowing cyan panels and a holographic display",
  refinery: "an oil refinery module with distillation towers and pipes",
  chemical: "a chemical plant with round tanks, pipes and green glowing vats",
  lab: "a research laboratory dome with a glass cupola and holographic projector",
  depot: "a sturdy storage depot warehouse with a large loading door",
  generator: "a power generator with a turbine and glowing cyan coils",
  pylon: "a slim electrical power pylon tower with glowing insulators",
  hydro_plant: "a hydrocarbon power plant with cooling stacks and pipes",
  geothermal: "a geothermal power plant built over a steaming geyser, with a flared steam stack, turbine hall and heat exchangers",
  land_factory: "a large land vehicle factory with a big sliding door and a gantry crane",
  air_factory: "an aircraft factory with a launch pad and a control tower",
  naval_factory: "a floating naval shipyard dock with cranes",
  gantry: "a huge experimental construction gantry frame with heavy cranes",
  radar: "a radar station with a large rotating dish",
  wall: "a section of a thick armored defensive wall",
  light_turret: "a small automated gun turret with a twin barrel on a round base",
  aa_turret: "an anti-aircraft turret with upward-angled flak cannons",
  heavy_turret: "a heavy armored cannon turret with one large barrel",
  fixed_artillery: "a long-range fixed artillery emplacement with a very long barrel",
  shield_gen: "a shield generator emitting a translucent cyan energy dome",
  transfer: "a teleport transfer platform with a glowing ring on the floor",
  warehouse: "a shared team warehouse: a long storage hall with a sloped roof, two cylindrical silos and a loading bay",
  rail: "a short straight segment of railway track with sleepers and two steel rails",
  station: "a small freight train station: a raised loading platform with a canopy roof, a gantry and stacked cargo containers",
  cargo_pad: "a cargo drone landing pad: an octagonal pad with H markings, corner beacon lights and a small control tower",
  splitter: "a compact conveyor belt splitter block with one input and three glowing output arrows (left, forward, right)",
  sorter: "a compact conveyor sorting block with a small scanner window, one glowing arrow forward and one to the left",
  overflow: "a compact conveyor overflow valve block with a bright forward arrow and two dim side arrows",
  main_generator: "a large industrial power station block with a turbine hall, an hydrocarbon fuel tank with an amber gauge, two smokestacks and a tall transmitter mast with glowing rings",
  collector: "a short conveyor belt segment straddled by a small boxy gantry hood on four legs, a glowing amber suction mouth over the belt, a small hopper on top",
  nest: "an alien creature nest: an organic mound of earth and brown chitin with dark burrow holes, curved bone ribs and clusters of glowing amber eggs",
  replicator_hive: "a crashed alien ship hull made of grey metal blocks with glowing blue seams, loose metal cubes scattered around",
  ancient_ruin: "ancient alien stone ruins with broken pale columns, a carved arch with glowing glyphs and a pedestal holding a floating amber energy crystal",
  eppz_socket: "a power socket cradle with three claws holding a glowing amber hexagonal energy crystal, glowing rings",
  gift_portal: "a glowing gateway arch on a platform where allied troops walk through to join another commander",
  roboport: "a logistics robot hub: a square tower with a landing pad on top, beacon lights and small flying robots",
  gate: "a large circular transit portal gate with a swirling energy field",
  area_shield: "a large area shield projector tower with energy coils",
  crystal_reactor: "a crystal fusion reactor with a glowing cyan crystal core in a containment ring",
  missile_silo: "a strategic missile silo with open blast doors and a missile tip visible",
  antimissile: "an anti-missile defense launcher with vertical interceptor tubes",
  beacon: "a hyperspace navigation beacon antenna emitting a light pulse",
  orbital: "an orbital cannon uplink station with a huge vertical cannon pointing to the sky",
};

export const UNITS = {
  commander: "a large bipedal commander mech robot, heavy armor, a big arm cannon, a glowing cockpit visor",
  eng1: "a small hovering construction drone with a manipulator arm and a nano-lathe emitter",
  eng3: "a medium hovering construction drone with two manipulator arms, advanced",
  eng5: "a large hovering heavy construction drone with four manipulator arms and glowing emitters",
  line_robot: "a small bipedal infantry combat robot with a rifle arm",
  moto: "a fast hover bike scout vehicle",
  light_tank: "a light tracked battle tank with a single turret",
  artillery: "a mobile artillery vehicle with a long angled barrel on wheels",
  mobile_aa: "a mobile anti-aircraft vehicle with flak cannons pointing up",
  sonde: "a small detection probe vehicle with an antenna mast and sensor dish",
  assault_walker: "a four-legged assault walker mech with twin guns",
  hover_tank: "a heavy hover tank floating on an air cushion, amphibious",
  missile_launcher: "a mobile missile launcher truck with a raised missile rack",
  mobile_shield: "a mobile shield generator vehicle projecting a small energy bubble",
  ion_cannon: "a mobile ion cannon vehicle with a glowing cyan coil gun",
  drone_launcher: "a mobile drone carrier vehicle launching small drones",
  siege_walker: "a huge heavy siege walker mech with massive cannons",
  shock_robot: "a heavy shock-trooper robot with electric arc weapons",
  heavy_artillery: "a heavy self-propelled artillery vehicle with a massive barrel and deployment legs",
  scout_plane: "a small sleek scout aircraft with a sensor pod",
  interceptor: "a fast delta-wing interceptor fighter jet",
  glider: "a sleek attack glider aircraft with underwing guns",
  transport: "a heavy transport aircraft with four vertical thrusters and a cargo bay",
  gunship: "an armored gunship aircraft with rotors and side cannons",
  bomber: "a stealthy flying wing bomber aircraft",
  asf: "an advanced air superiority fighter with forward swept wings",
  strat_bomber: "a huge strategic bomber aircraft with long wings",
  frigate: "a small naval frigate warship with a gun turret",
  submarine: "a sleek attack submarine partially surfaced",
  destroyer: "a naval destroyer warship with several gun turrets",
  missile_cruiser: "a large missile cruiser warship with vertical launch cells",
  spider: "a gigantic experimental spider walker with eight legs and a glowing laser emitter dome at the centre of its body",
  colossus: "a gigantic experimental humanoid colossus robot",
  fortress: "a gigantic experimental walking fortress with many turrets",
  mothership: "a gigantic experimental flying saucer mothership",
  hyper_cruiser: "a gigantic experimental hyperspace cruiser starship",
  roach: "a gigantic experimental armoured tank shaped like a cockroach, segmented glossy carapace with wing covers, six jointed legs, long antennae, twin mandible cannons at the front",
  dragon: "a gigantic experimental flying robot Chinese dragon, long serpentine segmented body, horned head with long whiskers, amber dorsal crest, glowing energy pearl in front of its open mouth",
  star_cruiser: "a gigantic experimental wedge-shaped capital starship, long triangular hull seen from above, stepped superstructure and a command tower at the rear, rows of small gun turrets, glowing engines",
  guardian: "a medium battle tank on tracks with a very thick wedge-shaped frontal armor glacis covered with reactive armor blocks, squat turret with a medium cannon",
  rocket_battery: "a six-wheeled military truck carrying a tilted rectangular rocket launcher box with a 4 by 4 grid of rocket tubes",
  commando: "a slim angular dark stealth commando robot soldier with a glowing visor, a thin rifle and a backpack of explosive charges, partially shimmering cloak",
  jammer: "a four-wheeled electronic warfare vehicle with a tall antenna mast and a large rotating jamming panel, glowing emitters",
  deploy_turret: "a heavy tracked self-propelled turret with four folded hydraulic stabilizer legs on its sides and a big twin-barrel plasma cannon turret",
  stealth_bomber: "a black faceted stealth flying wing bomber with sharp angular edges and recessed glowing engine exhausts",
  ew_plane: "a straight-winged electronic warfare aircraft with a large rotating radar dome on its back and antennas under the fuselage",
  heavy_transport: "a massive armored heavy-lift transport aircraft with a square cargo hold and four large ducted rotors",
  carrier: "a long naval aircraft carrier warship with a flat flight deck, an island superstructure on one side and small jets parked on deck",
  railgun_ship: "a heavy battleship warship with two front turrets carrying very long twin railgun barrels with glowing coils, massive central superstructure",
  beast_s: "a small six-legged alien beetle creature with a segmented brown chitin carapace, bone spines on its back, hooked mandibles and glowing amber eyes",
  beast_m: "a six-legged alien beetle beast with a segmented brown chitin carapace, rows of bone spines, big hooked mandibles, a red maw and glowing amber eyes",
  beast_l: "a huge six-legged armored alien beetle beast with thick brown chitin shoulder plates, curved bone horns, crushing mandibles and glowing amber eyes",
  roll_droid: "a bronze combat droid deployed on three arched legs with twin blasters, next to its rolled-up wheel form",
  replicator: "a small spider-like robot made of grey metal blocks with a glowing blue core and six blocky legs",
  disruptor: "a stocky robot soldier carrying a long rifle with glowing blue coils",
};

/**
 * Style des icônes de la Souche (race vivante) : même cadrage que STYLE, mais ni métal ni panneaux.
 * Matières des modèles (assets/models/souche*.ts) : chitine noire luisante, os, écorce de racine, chair
 * verte ou rouille, sève vert acide lumineuse. Les plaques à la couleur du joueur sont rendues en chitine
 * gris ardoise (l'icône est la même pour tous les joueurs) ; un contre-jour clair détache les formes
 * sombres du fond sombre de l'interface.
 */
export const SOUCHE_STYLE =
  "Single game icon for a sci-fi real-time strategy game interface, showing one living organism of an alien insectoid swarm faction that grows its buildings and its soldiers. " +
  "Clean stylized 3D creature render with simple chunky shapes, three-quarter top-down view, glossy black chitin carapace with lighter slate-grey dorsal plates and crests, " +
  "tan ivory bone spikes, claws and ribs, dark brown gnarled root bark, dark green and rust-red flesh, bioluminescent acid green (#9DFF3A) sap sacs, veins and eggs, " +
  "no metal, no machinery, no armor panels, no technology, bright cool rim light outlining the dark shapes so they stand out on a dark interface, " +
  "high contrast readable silhouette, centered, subject fills about 80% of the frame, " +
  "isolated on a fully transparent background, no text, no letters, no numbers, no border, no frame, no ground, no cast shadow.";

/** Style des objets de la Souche (sève, sels, ADN) : petits objets organiques, lisibles à 18 pixels. */
export const SOUCHE_ITEM_STYLE =
  "Single resource item icon for a sci-fi strategy game interface, one small organic object from a living alien swarm faction. " +
  "Clean stylized 3D render with a very simple bold shape, three-quarter view, soft studio light with a thin pale rim light, " +
  "high contrast readable silhouette, centered, fills about 75% of the frame, isolated on a fully transparent background, " +
  "no text, no letters, no border, no frame, no ground, no cast shadow.";

/** Objets de la Souche (couleurs de sim/src/data.rs). */
export const SOUCHE_ITEMS = {
  seve: "a single fat glossy drop of thick glowing green plant sap (#7fc24a), teardrop shape, hanging from the tip of a short dark brown root",
  sels: "a small cluster of pale beige cubic mineral salt crystals (#d9d2c0), matte and angular, gripped by two thin dark brown rootlets",
  adn: "a short chunky double helix of DNA made of two twisted purple strands (#c35bd6) joined by glowing pink rungs, organic and fleshy",
};

/**
 * Organes de la Souche. Chaque description suit le modèle 3D (souche.ts, souche-organes.ts) ; deux
 * voisins du menu se distinguent par la silhouette (menu : racine, rhizome, graine-mère, frondaison,
 * racine-puits, bulbe, terrier ; couveuse, matrice, panse, frayère, cocon ; épine, ronce, sporange, floraison).
 */
export const SOUCHE_BUILDINGS = {
  seed_heart:
    "a monstrous heart half buried in a low mound: a tall bulbous rust-red flesh heart with fleshy lobes on top, sheathed in six bulging chitin plates, " +
    "gripped by tall curved bone claws that rise around it and bend over its top, glowing acid green veins between the plates, three open artery tubes with glowing green mouths at the summit, " +
    "six black clawed roots plunging outward into the ground",
  root:
    "one small low root knot: a flat knotted lump of twisted brown bark with one round smooth bead of glowing acid green sap bulging on top (a plain bead, no pupil, no arrow, no symbol), " +
    "three small black chitin scales around the bead, and two thick gnarled root cables leaving the knot in opposite directions, left and right, " +
    "each with a thin glowing green vein along its top and a few small bone thorns, very simple wide and flat shape",
  rhizome:
    "a big knot of roots: a fat gnarled brown tuber half buried in the ground, ringed by a crown of upright slate-grey chitin plates, with four very thick sinuous roots like tree trunks " +
    "crawling out to the four corners in an X shape and diving into the ground, black scales and bone spines on their backs, small glowing acid green vents on top of the tuber",
  leaves:
    "a short bark stump carrying a flat rosette of eight large broad pointed green leaves spread out like a star seen from above, alternately light and dark green with a pale midrib, " +
    "three small upright fronds in the centre and three tiny glowing spores on thin stalks",
  taproot:
    "a swollen bottle-shaped trunk of brown bark planted upright in the ground like a drilling well: wide belly narrowing to a thin neck, two bands of slate-grey chitin around the belly, " +
    "four glowing acid green veins climbing up its sides, a glowing green sucking mouth at the very top under four small leaves, six roots diving into a mound of dry earth around its foot",
  bulb:
    "a big round sap storage sac, a translucent yellow-green balloon glowing from inside, held in a net of eight dark green ribs, a collar of slate-grey chitin at its narrow neck with three tiny leaves, " +
    "cupped by six dark green sepals at the base, with two small glowing acid green satellite bulbs beside it",
  burrow:
    "a gaping round tunnel mouth lying flat at ground level seen from above: a thick ring of rust-red flesh armoured with chitin plates, two concentric crowns of bone fangs curved inward, " +
    "a black ringed throat going straight down with a faint acid green glow at the bottom, four anchor claws at the corners, nothing rising above it",
  brood:
    "an egg nest inside a cage of six large curved bone ribs that rise from a round rim of slate-grey chitin and bend inward like a rib cage, open at the front between two tall bone jaw blades, " +
    "at the back a rust-red flesh egg-laying sac with an ovipositor tube leaning over the nest, and inside five dark leathery eggs with glowing acid green tips plus a few fully glowing green eggs",
  matrix:
    "a tall organic double helix: two thick twisted strands, one green and one brown, spiralling up around a thin central stem like a DNA spiral, joined by glowing cyan rungs with small glowing beads, " +
    "standing on a small bark mound with three roots, topped by a glowing seed held by three small leaves",
  maw:
    "an upright stomach sac leaning forward: a fat veined rust-red flesh bag squeezed by bone ribs, its wide round mouth open to the sky and filled with a pool of bright glowing acid green liquid, " +
    "thick fleshy lips ringed with small teeth, four black chitin mandibles with bone tips standing around the mouth, a second pouch and a gut trailing on the ground behind, swollen glowing sacs at its foot",
  spawnery:
    "a ring of living coral reef floating on a small disc of dark water, open at the front: a dark birthing pool arched over by large bone ribs like a rib cage, " +
    "a large slate-grey fan-shaped hood standing at the back, clusters of translucent eggs with dark embryos on the reef, two tentacles guarding the opening, a few seaweed fronds",
  cocoon:
    "a giant upright chrysalis: a tall ringed egg of rust-red flesh gripped by six enormous curved bone claws with dark membranes stretched between them, its skin split open at the front on a bright acid green glow " +
    "where a folded monster pushes through, lowered horned skull and two crossed bone scythes, armoured slate-grey shoulders, a glowing green ember at the very top",
  thorn:
    "a living gun turret: a fleshy dark green pod sitting on a small bark mound with a collar of leaves, one big sharp bone thorn sticking forward out of its round mouth like a cannon barrel, " +
    "a few smaller bone spikes around the mouth, a slate-grey crest on its back, two glowing acid green sacs on its flanks, two tiny amber eyes",
  bramble:
    "a short section of living thorn wall: thick twisted bramble stems, black chitin and rust-red, woven together horizontally like a hedge of giant barbed wire, " +
    "bristling with long bone thorns pointing outward on both sides, a glowing acid green sap vein visible between the stems, one slate-grey bud on top",
  sporangium:
    "a living spore mortar: a squat stump armoured with chitin plates and ringed with glowing green spore sacs at its foot, carrying one large ringed chitin tube angled steeply up and forward like a mortar barrel, " +
    "its muzzle opening into a corolla of six pointed rust-red petals with glowing green spores inside",
  bloom:
    "a tall alien flower on a single curved dark green stem with three leaves at its foot: one large tilted dish-shaped corolla facing the sky like a radar dish, six big yellow petals and six small rust-red petals, " +
    "a glowing acid green heart with five thin stamens",
};

/**
 * Organismes de la Souche. Chaque description suit le modèle 3D (souche.ts, souche-essaim.ts,
 * souche-oeufs.ts) ; chaque espèce a sa silhouette, et les trois œufs se distinguent par la coque.
 */
export const SOUCHE_UNITS = {
  queen:
    "a great swarm queen standing on six long arched black chitin legs with bone spurs, a huge bulging egg-laying abdomen behind her ringed with chitin and carrying glowing acid green eggs on its flanks, " +
    "two raised bone scythe arms in front, an elongated head crowned with a tall fan-shaped slate-grey crest bristling with bone spikes, crescent mandibles, amber eyes, glowing green maw",
  sower:
    "a small low hunched worker bug on six thin arched legs, carrying on its back one big leathery brown seed pod veined with glowing acid green sap and held by bone hooks, " +
    "dark green abdomen, small elongated head with short mandibles and amber eyes, harmless looking",
  gnawer:
    "a small lean fast hunter bug stretched low and forward, rust-red flesh body under slate-grey dorsal plates, a row of long bone spines laid back along its spine, a thin tail ending in a stinger, " +
    "a long black chitin head with two very large crescent mandibles wide open, four amber eyes, six long arched legs",
  spitter:
    "a four-legged acid artillery creature: a large glowing acid green sac swelling on its back under a small chitin cap, held by black ribs, a long neck raised forward and up " +
    "carrying a fan-shaped collar frill bristling with bone spikes and a small head with a round glowing spitting mouth",
  shell:
    "a living tank: a heavy dark green dome shell like a giant pill bug, striped across with four broad black chitin bands, a ridge of big bone spikes along the top, " +
    "an armoured head at the front with two curled ram horns of bone, six short massive legs, small glowing green vents under the rim of the shell",
  vine:
    "a carnivorous plant creature: a dark green bulb crowned with a ring of curved black chitin fangs around a glowing green throat, a bundle of four long rust-red flesh tentacles reaching forward, " +
    "barbed with bone and ending in hooks, walking on six thin black tendrils",
  membrane:
    "a flying creature seen from above with wings spread wide: slim black chitin body, two large bat-like wings of rust-red membrane veined with glowing acid green sap, bone hooks at the wing tips, " +
    "glowing green spore sacs at the shoulders, elongated head with mandibles, long thin tail ending in a stinger",
  egg_s:
    "one small closed alien egg: a smooth dark green leathery egg shaped like a closed tulip bud, a round cup below and four pointed lips closed into a tip above, " +
    "thin glowing acid green slits between the lips, a thin raised collar of slate-grey chitin around its middle (organic, part of the shell, not a metal band), three tiny rootlets at its base",
  egg_m:
    "one closed alien egg: a dark green leathery egg shaped like a closed tulip bud, four pointed lips closed into a tip, thin glowing acid green slits between the lips, " +
    "a thin raised collar of slate-grey chitin around its middle (organic, part of the shell, not a metal band), and six round tan bone studs like warts around its lower half",
  egg_l:
    "one big armoured closed alien egg: a thick brown bark-like egg shaped like a closed tulip bud, four pointed lips closed into a tip, glowing acid green slits between the lips, " +
    "a thin raised collar of slate-grey chitin around its middle (organic, part of the shell, not a metal band) with a crown of eight bone spikes pointing outward all around it",
  burster:
    "a small six-legged insect carrying on its back a huge swollen bladder far bigger than itself, taut and about to burst, glowing acid green under a net of black veins with bulging blisters, " +
    "a few slate-grey scales pushed apart along the top, tiny low head with mandibles",
  dart:
    "a stocky four-legged creature with armoured slate-grey shoulders carrying on its back a muscle pouch from which a tight bundle of long straight bone needles points up at the sky like a missile rack, " +
    "glowing green venom sacs at the base of the needles, low ram-like head",
  burrower:
    "a long armoured centipede lying low on the ground: six overlapping carapace segments along its body alternately slate-grey and black, a row of very tall bone spines standing along its spine, " +
    "a wedge-shaped head between two big digging arms ending in bone shovels with four claws, short legs, a pincer at the tail",
  nurse:
    "a gentle unarmed healer creature: a long swollen rust-red abdomen full of sap with two rows of glowing acid green teats along its flanks, a mossy green back, thin hanging tendrils each ending in a glowing drop, " +
    "a wide round slate-grey collar frill around a smooth pale bone mask with no mouth and several small eyes, six short fleshy legs",
  hornet:
    "a winged hunter wasp seen from above: black chitin thorax, pinched waist, a striped wasp abdomen curled under onto a long bone stinger, two pairs of narrow swept-back wings veined with glowing acid green sap, " +
    "a head with two huge glowing green compound eyes and antennae",
  moray:
    "a sea serpent swimming: a long ringed body undulating in three arched loops, dark flesh with dorsal scales and a serrated slate-grey dorsal sail fin with bone rays, a raised neck, " +
    "a head with long gaping jaws full of fangs and a glowing green throat, a scythe-shaped tail fin",
  leviathan:
    "a giant amphibious sea monster: a broad low dark hull of flesh, its back armoured with large black chitin vaults under a spine of slate-grey shields with bone spikes, corals and barnacles encrusted on its flanks, " +
    "four long flipper legs, a wide tail fluke, a head as wide as the body with a shovel-shaped lower jaw bristling with tusks, glowing green mouth, four eyes and two glowing lures, no outline stroke around the creature",
  behemoth:
    "the largest beast of the swarm: four pillar legs with bone knees carrying a mountain of large upright slate-grey and black scales pierced by glowing green spore chimneys, " +
    "at the front an upright torso with a rib cage over a glowing sap heart, two gigantic bone scythe arms closing in front of it, a low head with a collar frill and a glowing maw with many mandibles",
};

/** Illustrations (pas d'arrière-plan transparent). */
export const ART = {
  keyart: {
    size: "1536x1024",
    background: "opaque",
    prompt:
      "Wide cinematic key art for a futuristic sci-fi real-time strategy game, title screen background. " +
      "Night battlefield on an alien plain seen from high above: sprawling automated factories connected by glowing conveyor lines, " +
      "columns of robots and tanks advancing, distant explosions, aircraft contrails, a huge commander mech silhouette in the foreground left. " +
      "Deep navy and charcoal tones with luminous cyan (#3EF0FF) lights and a few amber (#FFB547) highlights, volumetric haze, " +
      "painterly but crisp, dark enough to put interface panels on top, large calm dark area in the center, no text, no logo, no letters.",
  },
  emblem: {
    size: "1024x1024",
    background: "transparent",
    prompt:
      "Minimal futuristic faction emblem for a sci-fi strategy game: a sharp angular chevron crown shape made of thin glowing cyan (#3EF0FF) lines " +
      "and gunmetal plates, with a small amber (#FFB547) diamond in the center, symmetric, flat vector-like 3D, " +
      "isolated on a fully transparent background, no text, no letters.",
  },
};

/** Style des petites décorations du sol (panneaux face à la caméra, vues de trois quarts de haut). */
export const DECOR_STYLE =
  "Single small terrain decoration sprite for a futuristic sci-fi real-time strategy game seen from a high camera. " +
  "Clean stylized 3D render, three-quarter top-down view from about 50 degrees above the horizon, soft even daylight from the upper left, " +
  "muted natural colors, slightly desaturated, matte, readable simple silhouette, the base of the object touches the bottom of the frame, " +
  "centered horizontally, isolated on a fully transparent background, no ground plane, no cast shadow, no text, no border.";

/**
 * Décorations : clé → description. L'ordre est celui des cases de l'atlas (process.py) et du
 * tableau DECOR_KINDS de packages/client/src/render/decor.ts.
 */
export const DECOR = {
  grass_tuft: "a small tuft of wild green grass blades with two thin seed stems",
  bush: "a round leafy green shrub bush, dense small leaves",
  flowers: "a small clump of green leaves with tiny yellow and white wildflowers",
  conifer: "a small stylized conifer pine tree, dark green layered foliage, short brown trunk",
  stump: "an old cut tree stump with exposed rings and a few roots, brown wood",
  dead_tree: "a small dead leafless tree with twisted grey-brown bare branches",
  dry_shrub: "a dry tumbleweed-like shrub with thin yellow-brown twigs",
  rocks: "a small cluster of three grey rounded stones of different sizes",
  boulder: "a single weathered grey granite boulder with a few cracks and a bit of moss",
  reeds: "a clump of tall green and tan reeds and cattails",
  fallen_log: "a fallen mossy tree log lying on its side with pale cut ends, a broken branch and two small brown mushrooms",
  ruined_pillar: "a weathered broken stone column on a square base, slanted break at the top, ivy and moss, a fallen drum beside it",
  fern: "a lush green fern clump with arching fronds spreading outward",
  crystal: "a small cluster of pale cyan translucent crystals growing from a grey rock, faint inner glow",
  snow_pine: "a small stylized conifer pine tree covered with snow, dark green under white snow",
  ice_rock: "a small grey rock partly covered with snow and ice",
};
