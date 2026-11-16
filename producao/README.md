# Produção do vídeo — A Noite de São Paulo

Dois vídeos verticais (9:16, 720×1280, 30 fps, 60 s cada) feitos a partir dos roteiros
`PART_1_SCRIPT.md` e `PART_2_SCRIPT.md`. Tudo é gerado por código, sem nenhum asset externo:
a cena 3D é procedural, as vozes são sintetizadas e os efeitos sonoros são calculados por DSP.

| Saída | Arquivo |
|---|---|
| Parte 1 — O Silêncio da Madrugada | `saida/parte1.mp4` |
| Parte 2 — O Cerco na Galeria | `saida/parte2.mp4` |
| As duas em sequência (120 s) | `saida/a_noite_de_sao_paulo_completo.mp4` |

## Como o vídeo é feito

```
roteiro ─┬─ audio/vozes.py   TTS neural (Kokoro-82M, PT-BR) + atuação por DSP ─┐
         ├─ audio/sfx.py     ~45 efeitos sonoros sintetizados em numpy          ├─ audio/mixar.py ─ mix_parteN.wav
         │                                                                      │       │
         │                     folha de marcações (cues_parteN.json) ◄──────────┘       │ (mesmos tempos)
         └─ cena/js/*.js     cena 3D (Three.js) dirigida pelos mesmos cues ─► renderizar.cjs ─► frames ─► montar.sh ─► MP4
```

### Áudio (`audio/`)
- **Vozes** — três vozes neurais distintas: Lucas = `pm_alex`, Marcos = `pm_santa`, Clara = `pf_dora`.
  A entonação vem de efeitos aplicados por fala: sussurro (vocoder de ruído), voz trêmula (vibrato),
  choro, grito (saturação + brilho), esforço/fôlego e, para o Lucas infectado, voz grave, rouca e granulada.
- **Efeitos** — alarme de carro, batida metálica, grito abafado, chiado de rádio, passos arrastados,
  estalos de ossos, vidro estilhaçando, telhas, chapa de zinco cedendo, balcão arrastado, corrente,
  escada rolante, multidão, batimento cardíaco, risers, drone, celular caindo, etc.
- **Mixagem** — reverb por convolução (rua e galeria), sidechain das vozes sobre trilha e ambiência,
  "microfone de celular" (corte de graves, compressor/AGC), microfone abafado no chão após a queda do
  celular, corte seco no fim da Parte 1 e normalização a −14 LUFS.

### Cena 3D (`cena/`)
Three.js rodando em Chromium (WebGL por software), renderização determinística por tempo.
- Rua do centro de SP à noite: asfalto molhado com reflexo planar e poças, pedra portuguesa, prédios com
  janelas acesas, pichação, portas de aço, poste de sódio com cone de luz, chuva fina, névoa, semáforo âmbar
  piscando, neon de farmácia, EcoSport, viaduto, fios, padaria com vitrine-espelho (o plano de abertura).
- Galeria comercial: piso de granito espelhado, lotérica, escada rolante desligada + mezanino,
  luminárias que falham, saída de emergência verde, alarme vermelho, porta corta-fogo com corrente e cadeado.
- Personagens articulados (Lucas, Clara, Marcos, entregador zumbi, multidão) com rosto, mandíbula
  animada pela envelope da voz, roupas conforme `CHARACTERS.md`.
- Câmera POV de celular: tremor de mão, passada, zoom digital, caixa de foco, desfoque de movimento por
  sub-frames, profundidade de campo, bloom, aberração cromática, ruído de sensor, blocos de compressão,
  rolling shutter, sujeira de lente, bateria fraca e HUD (`REC`, relógio, bateria).

## Reproduzir

```bash
# 1) dependências
pip install kokoro-onnx soundfile scipy numpy
(cd cena && npm install)                 # three.js
# modelos do Kokoro (≈350 MB): kokoro-v1.0.onnx e voices-v1.0.bin
#   https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0

# 2) áudio
export KOKORO_DIR=/caminho/dos/modelos
python3 audio/vozes.py  /tmp/build/vozes
python3 audio/mixar.py 1 /tmp/build/vozes /tmp/build/audio
python3 audio/mixar.py 2 /tmp/build/vozes /tmp/build/audio
cp /tmp/build/audio/cues_parte*.json cena/

# 3) frames (usa o playwright já instalado; ~1,2 s/frame efetivo em 4 processos)
node renderizar.cjs --part 1 --from 0 --to 1800 --fps 30 --w 720 --h 1280 --out /tmp/frames/p1
node renderizar.cjs --part 2 --from 0 --to 1800 --fps 30 --w 720 --h 1280 --out /tmp/frames/p2
# (para pré-visualizar instantes: --times 2.4,17,45 --png --w 540 --h 960)

# 4) MP4
./montar.sh 1 /tmp/frames/p1 /tmp/build/audio/mix_parte1.wav saida/parte1.mp4
./montar.sh 2 /tmp/frames/p2 /tmp/build/audio/mix_parte2.wav saida/parte2.mp4
```

## Ajustes fáceis
- **Relógio do HUD**: `cena/js/story.js` (`clock: '04:15 AM'`) e `cena/js/part2.js` (`'04:22 AM'` / `'04:23 AM'`).
- **Tempos das falas e dos efeitos**: `audio/mixar.py` (funções `parte1` e `parte2`); a cena lê os mesmos
  tempos via `cues_parteN.json`.
- **Texto das falas e atuação**: `audio/vozes.py` (dicionário `LINES`).
- **Resolução**: `--w 1080 --h 1920` (≈ 4× mais lento).
