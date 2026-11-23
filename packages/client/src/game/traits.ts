// Capacités particulières des unités, en clair (infobulles de l'usine et fiche de l'unité).
/** Familles d'armes des caractères acquis de la Souche (essaim::family). */
export const ADAPT_FAMILIES = ["armes cinétiques", "explosifs", "armes à énergie", "feu", "morsures et acide"];

export const UNIT_TRAITS: Record<string, string> = {
  guardian: "Blindage frontal : -45 % de dégâts reçus de face. Présentez-lui l'ennemi de face.",
  rocket_battery: "Salve de 16 roquettes dispersées sur une large zone, puis 12 s de rechargement. Contre les groupes.",
  commando: "Invisible tant qu'il ne tire pas (repéré à quelques cases ou par une sonde déployée). Charge explosive contre les bâtiments.",
  jammer: "Bulle de brouillage (12 cases) : les unités alliées dedans disparaissent du radar ennemi.",
  deploy_turret: "Se déploie seule à l'arrêt face à une cible (3 s) et ne tire que déployée. Déployée : -30 % de dégâts reçus.",
  stealth_bomber: "Furtif : invisible au radar, repéré seulement à vue. Une bombe lourde.",
  ew_plane: "Impulsion électromagnétique : étourdit unités et bâtiments ennemis sur 5 cases pendant 6 s.",
  heavy_transport: "16 places, emporte aussi le marcheur de siège (trop grand pour le transport simple).",
  carrier: "Lance jusqu'à 6 intercepteurs (payés par les dépôts proches) et répare l'aviation alliée proche.",
  railgun_ship: "Canons de rail à très longue portée (75 cases), contre la mer et la terre.",
  burster: "Éclate au contact : dégâts de zone et flaque d'acide. Tuée, elle éclate aussi.",
  burrower: "S'enterre à l'arrêt (3 s) : invisible. Surgit en frappant trois fois plus fort.",
  nurse: "Les organismes à moins de 5 cases guérissent comme sur le terreau.",
  leviathan: "Amphibie. Guérit de chaque proie tuée.",
  behemoth: "Griffes qui balaient la zone. Guérit de chaque proie tuée.",
};
