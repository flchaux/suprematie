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
  metal_debris: "scattered wreckage debris: a bent gunmetal armor plate and twisted metal beams half buried, with one tiny dim cyan light",
  crystal: "a small cluster of pale cyan translucent crystals growing from a grey rock, faint inner glow",
  snow_pine: "a small stylized conifer pine tree covered with snow, dark green under white snow",
  ice_rock: "a small grey rock partly covered with snow and ice",
};
