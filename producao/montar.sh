#!/usr/bin/env bash
# Monta o MP4 vertical 9:16 de uma parte: frames JPEG (30 fps) + áudio mixado (WAV 48 kHz).
# Uso: ./montar.sh <parte 1|2> <pasta_frames> <mix.wav> <saida.mp4> [crf]
set -euo pipefail
PARTE="$1"; FRAMES="$2"; WAV="$3"; OUT="$4"; CRF="${5:-19}"
ffmpeg -y -loglevel error -framerate 30 -i "$FRAMES/f%05d.jpg" -i "$WAV" \
  -map 0:v -map 1:a -t 60 \
  -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart \
  -vf "format=yuv420p" -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -metadata title="A Noite de São Paulo — Parte ${PARTE}" -metadata comment="Found footage 3D procedural | 9:16 | 30 fps" \
  "$OUT"
echo "ok: $OUT"; ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,duration -of compact "$OUT"
