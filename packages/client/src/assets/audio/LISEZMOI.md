# Musique de fond

`theme.mp3` : boucle de 2 min 25, générée avec ElevenLabs Music (modèle `eleven_music_v2_5`, instrumental,
150 s demandées, deux variantes ; la plus régulière en intensité a été retenue).

Description donnée au modèle :

> Dark cinematic electronic ambient score for a futuristic sci-fi real-time strategy game. Deep pulsing synth bass,
> slowly evolving analog pads, a subtle arpeggiated sequencer, distant metallic industrial percussion and soft low
> brass swells. Steady mid tempo around 90 BPM, tense and focused but unobtrusive, consistent energy from start to end
> so it can loop seamlessly, ending on the same texture as the opening. Instrumental, no vocals.

Traitement : fondu de sortie final coupé (145 s gardées), volume normalisé à −18 LUFS, MP3 128 kb/s :

    ffmpeg -i original.mp3 -t 145 -af "afade=t=out:st=144.9:d=0.1,loudnorm=I=-18:TP=-1.5:LRA=7" -ar 48000 -b:a 128k theme.mp3

Lecture : `packages/client/src/audio/music.ts` (boucle avec fondu enchaîné de 6 s entre deux passages, volume réglable
dans le panneau Réglages, mémorisé dans le navigateur).
