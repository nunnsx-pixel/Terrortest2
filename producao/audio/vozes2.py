"""Vozes v2 — Supertonic 3 (TTS neural on-device, PT-BR), ritmo natural e atuação sutil.

Mudanças em relação à v1 (Kokoro + efeitos pesados):
  * sem vocoder de sussurro, sem vibrato/saturação/AM, sem aceleração artificial (1,2–1,3×);
  * fala dividida em frases, com pausas humanas (reticências, pontos, exclamações) e respiração;
  * emoção por escolhas leves: ritmo, nível, um pequeno ajuste de tom, ar na voz e compressão suave;
  * vozes distintas e nativas: Lucas = M1, Marcos = M2, Clara = F2 (Lucas infectado = M1 mais grave e lento).

Uso (no venv com sherpa-onnx >= 2): python vozes2.py <pasta_modelo_supertonic> <pasta_saida>
Saída: <pasta_saida>/<id>.wav (mono 48 kHz, seco) e vozes.json (duração e envelope 60 Hz) — mesmo formato da v1.
"""
import json
import os
import re
import sys

import numpy as np
import sherpa_onnx
import soundfile as sf

import dsp
from dsp import SR

VOZES = {"lucas": 0, "marcos": 1, "clara": 6, "lucas_zumbi": 0}   # M1, M2, F2
BASE_SPEED = 1.12                                                  # ≈ 15 caracteres/s (já com pausas): conversa rápida, mas humana
NUM_STEPS = 10

# estilo por fala: speed (relativo), gain_db, pitch (semitons), ar (0..1), baixa (voz contida), grito (0..1)
LINES = {
    # ------------------------------------------------------------ PARTE 1
    "p1_lucas_sussurro": dict(who="lucas", speed=0.98, gain_db=-8, ar=0.16, baixa=True, pitch=0.0,
        text="Caralho... o alarme atraiu eles. Clara, Marcos, abaixa a luz do celular agora, apaga a lanterna!"),
    "p1_clara_radio": dict(who="clara", speed=0.96, gain_db=-4, ar=0.10, baixa=True, pitch=0.3,
        text="Lucas, o rádio de pilha chiou até morrer... Não tem sinal de nenhuma antena na Avenida Paulista. A cidade inteira tá bloqueada."),
    "p1_marcos_infestada": dict(who="marcos", speed=0.97, gain_db=-3, ar=0.06, baixa=True, pitch=0.0,
        text="Não tá bloqueada, Clara... Tá infestada. Eles só param de fazer barulho quando acham rastro fresco."),
    "p1_lucas_viaduto": dict(who="lucas", speed=0.97, gain_db=-5, ar=0.10, baixa=True, pitch=0.0,
        text="Espera... Olha ali debaixo do viaduto. Tem alguém cambaleando na contramão..."),
    "p1_clara_entregador": dict(who="clara", speed=0.9, gain_db=-4, ar=0.14, baixa=True, pitch=-0.2,
        text="Meu Deus... é o entregador de aplicativo que tava na praça de alimentação..."),
    "p1_marcos_visor": dict(who="marcos", speed=1.05, gain_db=0, ar=0.06, grito=0.45, pitch=0.4,
        text="Ele não é mais trabalhador de porra nenhuma, Clara. Desliga esse visor agora!"),
    "p1_lucas_cuidado1": dict(who="lucas", speed=1.0, gain_db=3, grito=0.9, pitch=1.0, text="Cuidado!"),
    "p1_lucas_cuidado2": dict(who="lucas", speed=1.08, gain_db=3, grito=0.8, pitch=0.8,
        text="Veio de cima da marquise, eles já cercaram a"),
    # ------------------------------------------------------------ PARTE 2
    "p2_lucas_rua": dict(who="lucas", speed=1.08, gain_db=3, grito=0.8, ar=0.14, pitch=0.8,
        text="rua toda! Trava a porta! Empurra o balcão da lotérica aqui na frente para bloquear!"),
    "p2_clara_escada": dict(who="clara", speed=1.0, gain_db=0, ar=0.12, grito=0.3, pitch=0.5,
        text="Lucas... não adianta barricar a entrada da rua. Olha ali em cima, na escada rolante desligada!"),
    "p2_marcos_socorro": dict(who="marcos", speed=1.1, gain_db=3, grito=1.0, ar=0.12, pitch=1.4,
        text="Socorro! Eles já tavam escondidos aqui dentro! Me puxa!"),
    "p2_lucas_chuta": dict(who="lucas", speed=1.08, gain_db=3, grito=0.8, ar=0.14, pitch=0.8,
        text="Marcos, chuta a mão dele! Clara, corre para o corredor dos fundos, sentido estacionamento!"),
    "p2_clara_vaiembora": dict(who="clara", speed=1.0, gain_db=2, grito=0.9, ar=0.18, pitch=1.0,
        text="Vai embora, Lucas! A transmissão ainda tá gravando, faz eles lembrarem quem a gente era!"),
    "p2_lucas_portao": dict(who="lucas", speed=1.05, gain_db=4, grito=1.0, ar=0.2, pitch=0.6,
        text="Não vou te deixar aqui, Clara! Abre essa merda de portão!"),
    "p2_lucas_zumbi": dict(who="lucas_zumbi", speed=1.0, gain_db=0, zumbi=True, pitch=-2.8, ar=0.3,
        text="Obrigado por assistirem até o final... A infecção foi transmitida para todos os espectadores conectados aqui em São Paulo."),
}

PAUSA = {"...": 0.46, ".": 0.30, "!": 0.2, "?": 0.32, ",": 0.0}


def carregar_tts(modelo):
    M = modelo
    sup = sherpa_onnx.OfflineTtsSupertonicModelConfig(
        duration_predictor=f"{M}/duration_predictor.int8.onnx", text_encoder=f"{M}/text_encoder.int8.onnx",
        vector_estimator=f"{M}/vector_estimator.int8.onnx", vocoder=f"{M}/vocoder.int8.onnx",
        tts_json=f"{M}/tts.json", unicode_indexer=f"{M}/unicode_indexer.bin", voice_style=f"{M}/voice.bin")
    return sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(supertonic=sup, num_threads=4)))


def dividir(texto):
    """Quebra em frases mantendo a pontuação final; devolve [(frase, pausa_depois)]."""
    partes = re.findall(r"[^.!?]+(?:\.\.\.|[.!?])?\s*", texto.strip())
    out = []
    for p in partes:
        p = p.strip()
        if not p:
            continue
        fim = "..." if p.endswith("...") else (p[-1] if p[-1] in ".!?" else "")
        out.append((p, PAUSA.get(fim, 0.0)))
    if out:
        out[-1] = (out[-1][0], 0.0)
    return out


def sintetizar(tts, who, texto, speed):
    frases = dividir(texto)
    partes = []
    for k, (f, pausa) in enumerate(frases):
        g = sherpa_onnx.GenerationConfig()
        g.sid = VOZES[who]; g.speed = float(speed); g.num_steps = NUM_STEPS; g.extra = {"lang": "pt"}
        a = tts.generate(f, g)
        x = dsp.resample(np.array(a.samples, dtype=np.float32), a.sample_rate)
        x = aparar(x)
        partes.append(x)
        if pausa > 0:   # respiração curta na pausa maior (reticências)
            n = int(pausa * SR)
            partes.append(np.zeros(n, dtype=np.float32))
    return partes


def aparar(x, thr=0.004, pad=0.025):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pad * SR)); b = min(len(x), idx[-1] + int(pad * SR))
    return dsp.fade(x[a:b], 0.006, 0.02)


def unir(partes, xfade=0.012):
    out = partes[0]
    n = int(xfade * SR)
    for p in partes[1:]:
        if len(out) > n and len(p) > n and np.max(np.abs(out[-n:])) > 0.01 and np.max(np.abs(p[:n])) > 0.01:
            w = np.linspace(0, 1, n, dtype=np.float32)
            out = np.concatenate([out[:-n], out[-n:] * (1 - w) + p[:n] * w, p[n:]])
        else:
            out = np.concatenate([out, p])
    return out


def atuar(x, spec):
    """Atuação leve: tom, ar na voz, voz contida, grito controlado. Sem distorção pesada."""
    if abs(spec.get("pitch", 0)) > 0.05:
        y = dsp.pitch_shift(x, spec["pitch"], formant=True)
        x = y if len(y) >= len(x) else np.pad(y, (0, len(x) - len(y)))
    env = dsp.env_follow(x, 40)
    env = env / (env.max() + 1e-9)
    ar = spec.get("ar", 0.0)
    if ar > 0:   # ar/respiração por baixo da fala (acompanha o envelope)
        n = dsp.bp(dsp.noise(len(x) / SR + 1), 700, 6500, 2)[: len(x)]
        x = x + ar * 0.18 * n * np.clip(env * 1.6, 0, 1)
    g = spec.get("grito", 0.0)
    if g > 0:    # esforço vocal: brilho e leve saturação proporcional
        x = dsp.hp(x, 140, 2)
        x = x + 0.22 * g * dsp.bp(x, 2000, 4600, 2)
        x = (np.tanh(x * (1 + 0.55 * g)) / np.tanh(1 + 0.55 * g)).astype(np.float32)
    if spec.get("baixa"):   # voz contida/próxima do microfone: menos brilho, grave presente
        x = 0.78 * x + 0.22 * dsp.lp(x, 2600, 2)
    if spec.get("zumbi"):
        x = dsp.lp(x, 5200, 2) * 1.0
        r = dsp.hp(dsp.noise(len(x) / SR + 1), 1800)[: len(x)] * np.clip(env * 1.4, 0, 1) * 0.045   # chiado de ar
        am = 0.9 + 0.1 * np.sin(2 * np.pi * 31 * np.arange(len(x)) / SR + 2 * np.sin(2 * np.pi * 2.3 * np.arange(len(x)) / SR))
        x = np.tanh((x * am + r) * 1.5) / np.tanh(1.5)
    # compressão suave e nível
    x = x / (np.max(np.abs(x)) + 1e-9)
    x = (np.tanh(x * 1.25) / np.tanh(1.25)).astype(np.float32)
    return x * (10 ** (spec.get("gain_db", 0) / 20))


def main(modelo, out_dir, so=None):
    os.makedirs(out_dir, exist_ok=True)
    tts = carregar_tts(modelo)
    mp = os.path.join(out_dir, "vozes.json")
    meta = json.load(open(mp)) if (so and os.path.exists(mp)) else {}
    for lid, spec in LINES.items():
        if so and lid not in so:
            continue
        partes = sintetizar(tts, spec["who"], spec["text"], BASE_SPEED * spec["speed"])
        x = unir(partes)
        x = atuar(x, spec)
        x = dsp.fade(x / (np.max(np.abs(x)) + 1e-9) * 0.68 * min(1.35, 10 ** (spec.get("gain_db", 0) / 40)), 0.004, 0.03)
        sf.write(os.path.join(out_dir, f"{lid}.wav"), x, SR)
        env = dsp.env_follow(x, 25)
        e60 = env[:: SR // 60]
        e60 = (e60 / (e60.max() + 1e-9)).round(3).tolist()
        meta[lid] = dict(who=spec["who"], dur=round(len(x) / SR, 3), env=e60, text=spec["text"])
        print(f"{lid:22s} {spec['who']:12s} {len(x)/SR:5.2f}s  {len(spec['text'])/(len(x)/SR):4.1f} car/s")
    with open(os.path.join(out_dir, "vozes.json"), "w") as f:
        json.dump(meta, f)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3].split(",") if len(sys.argv) > 3 else None)
