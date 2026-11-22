# Musique de fond

Deux morceaux alternent, `theme.mp3` puis `theme2.mp3`, chacun enchaîné au suivant en fondu enchaîné.

## `theme.mp3`

`theme.mp3` : boucle de 2 min 25, générée avec ElevenLabs Music (modèle `eleven_music_v2_5`, instrumental,
150 s demandées, deux variantes ; la plus régulière en intensité a été retenue).

Description donnée au modèle :

> Dark cinematic electronic ambient score for a futuristic sci-fi real-time strategy game. Deep pulsing synth bass,
> slowly evolving analog pads, a subtle arpeggiated sequencer, distant metallic industrial percussion and soft low
> brass swells. Steady mid tempo around 90 BPM, tense and focused but unobtrusive, consistent energy from start to end
> so it can loop seamlessly, ending on the same texture as the opening. Instrumental, no vocals.

Traitement : fondu de sortie final coupé (145 s gardées), volume normalisé à −18 LUFS, MP3 128 kb/s :

    ffmpeg -i original.mp3 -t 145 -af "afade=t=out:st=144.9:d=0.1,loudnorm=I=-18:TP=-1.5:LRA=7" -ar 48000 -b:a 128k theme.mp3

## `theme2.mp3`

Boucle de 2 min 25, même méthode (ElevenLabs Music, modèle `eleven_music_v2_5`, instrumental, 150 s demandées, deux
variantes). Caractère voulu différent du premier : plus mécanique et moins sombre, mailloches, cloches et piano
électrique au lieu de la basse et des cuivres. Variante retenue : la plus plate (−16,5 à −14,9 LUFS à court terme sur
toute la durée, sans fondu final) ; l'autre montait peu à peu et s'éteignait dès 147 s.

Description donnée au modèle :

> Minimalist industrial electronica for a futuristic sci-fi factory-building strategy game. A hypnotic interlocking
> ostinato of plucked mallet synths and glassy bell tones, warm electric piano chords in D dorian, a low bowed cello-like
> synth drone, and soft mechanical percussion made of clicks, ticks and muted hydraulic hiss. Steady driving tempo
> around 104 BPM, determined and quietly hopeful rather than dark, focused and unobtrusive, consistent energy from start
> to end so it can loop seamlessly, ending on the same texture as the opening. Instrumental, no vocals.

Traitement : le même que `theme.mp3` (145 s gardées, −18 LUFS visés, −18,5 mesurés, MP3 128 kb/s) :

    ffmpeg -i original.mp3 -t 145 -af "afade=t=out:st=144.9:d=0.1,loudnorm=I=-18:TP=-1.5:LRA=7" -ar 48000 -b:a 128k theme2.mp3

## Lecture

`packages/client/src/audio/music.ts` : les morceaux alternent, avec un fondu enchaîné de 6 s de l'un à l'autre. Seul le
premier est attendu au démarrage ; les autres se téléchargent ensuite, et chacun n'est décodé que 20 s avant son entrée
puis libéré à sa fin (un morceau décodé pèse une cinquantaine de Mo). Volume réglable dans le panneau Réglages,
mémorisé dans le navigateur. Pour ajouter un morceau : même traitement, puis une entrée dans `TRACKS`.

# Annonces vocales

`voix/*.mp3` : annonces générées avec ElevenLabs (synthèse vocale, modèle `eleven_v4`, voix « Oscar Doré - News
Narrator », française, nette et posée), première prise de deux :

| Fichier | Texte |
|---|---|
| `commandant.mp3` | « Alerte. Robot de commandement attaqué. » |
| `attaque.mp3` | « Alerte. Nous sommes attaqués. » |
| `recherche.mp3` | « Recherche terminée. » |
| `energie.mp3` | « Énergie insuffisante. » |

Traitement : silences de début et de fin coupés, volume normalisé à −16 LUFS, MP3 mono 64 kb/s :

    ffmpeg -i prise.mp3 -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=7" -ac 1 -b:a 64k sortie.mp3

Le timbre légèrement robotique est ajouté à la lecture (`packages/client/src/audio/voice.ts` : modulation en anneau
discrète à 45 Hz, filtre en peigne de 6 ms, bande 220 Hz – 5,2 kHz), ce qui permet de le doser sans régénérer les voix.
