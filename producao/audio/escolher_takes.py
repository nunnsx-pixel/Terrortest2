"""Escolhe o melhor take de falas específicas: sintetiza N vezes e fica com a mais inteligível.

A síntese neural varia de take para take; falas curtas, rápidas e gritadas às vezes saem com palavras
"engolidas". Aqui cada take passa pelo mesmo pipeline de vozes2.py e é transcrito com Whisper; vence o menor
erro de palavras (WER) em relação ao texto do roteiro. Gírias comuns são equivalidas (tá = está, pra = para).

Uso (venv com sherpa-onnx >= 2): python escolher_takes.py <modelo_supertonic> <modelo_whisper_small> <pasta_vozes> <N> id1,id2,...
"""
import json
import os
import re
import sys
import unicodedata

import numpy as np
import sherpa_onnx
import soundfile as sf

import dsp
import vozes2 as V
from dsp import SR

EQUIV = {"ta": "esta", "tava": "estava", "tavam": "estavam", "pra": "para", "to": "estou", "ce": "voce"}


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return [EQUIV.get(w, w) for w in re.sub(r"[^a-z0-9 ]", " ", s).split()]


def wer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    d = np.zeros((len(r) + 1, len(h) + 1), int)
    d[:, 0] = range(len(r) + 1)
    d[0, :] = range(len(h) + 1)
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (r[i - 1] != h[j - 1]))
    return d[-1, -1] / max(1, len(r))


def main(modelo, whisper, vozes_dir, n, ids):
    A = whisper
    rec = sherpa_onnx.OfflineRecognizer.from_whisper(
        encoder=f"{A}/small-encoder.int8.onnx", decoder=f"{A}/small-decoder.int8.onnx", tokens=f"{A}/small-tokens.txt",
        language="pt", task="transcribe", num_threads=4)
    tts = V.carregar_tts(modelo)
    mp = os.path.join(vozes_dir, "vozes.json")
    meta = json.load(open(mp))
    for lid in ids:
        spec = V.LINES[lid]
        melhor = None
        for k in range(n):
            x = V.atuar(V.unir(V.sintetizar(tts, spec["who"], spec["text"], V.BASE_SPEED * spec["speed"])), spec)
            x = dsp.fade(x / (np.max(np.abs(x)) + 1e-9) * 0.68 * min(1.35, 10 ** (spec.get("gain_db", 0) / 40)), 0.004, 0.03)
            st = rec.create_stream(); st.accept_waveform(SR, x.astype(np.float32)); rec.decode_stream(st)
            w = wer(spec["text"], st.result.text)
            print(f"{lid} take {k}: WER {w:.2f}  dur {len(x)/SR:.2f}s | {st.result.text}")
            if melhor is None or w < melhor[0] - 1e-9:
                melhor = (w, x)
        w, x = melhor
        sf.write(os.path.join(vozes_dir, f"{lid}.wav"), x, SR)
        env = dsp.env_follow(x, 25)
        e60 = env[:: SR // 60]
        meta[lid] = dict(who=spec["who"], dur=round(len(x) / SR, 3), env=(e60 / (e60.max() + 1e-9)).round(3).tolist(), text=spec["text"])
        print(f"==> {lid}: escolhido WER {w:.2f}, dur {len(x)/SR:.2f}s")
    json.dump(meta, open(mp, "w"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5].split(","))
