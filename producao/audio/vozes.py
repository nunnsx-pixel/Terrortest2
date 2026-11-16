"""Gera as falas do roteiro com TTS neural (Kokoro-82M, vozes PT-BR) + atuação por DSP.

Elenco:
  Lucas  -> pm_alex   (voz média, protetor, impulsivo)
  Marcos -> pm_santa  (voz grave, analítico em pânico)
  Clara  -> pf_dora   (voz feminina, pânico latente)
  Lucas infectado -> pm_alex + pós-processamento (grave, rouco, granulado)

Uso:  KOKORO_DIR=/caminho/modelos python3 vozes.py <pasta_saida>
Saída: <pasta_saida>/<id>.wav (mono 48 kHz, seco) e vozes.json (duração e envelope 60 Hz).
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

import dsp
from dsp import SR

KOKORO_DIR = os.environ.get("KOKORO_DIR", "/tmp/kokoro")

# efeito: lista de transformações aplicadas em ordem
LINES = {
    # ------------------------------------------------------------ PARTE 1
    "p1_lucas_sussurro": dict(
        who="lucas", voice="pm_alex", speed=1.22,
        text="Caralho... o alarme atraiu eles. Clara, Marcos, abaixa a luz do celular agora, apaga a lanterna!",
        fx=["whisper", "tremor"], gain=0.95),
    "p1_clara_radio": dict(
        who="clara", voice="pf_dora", speed=1.12,
        text="Lucas, o rádio de pilha chiou até morrer... Não tem sinal de nenhuma antena na Avenida Paulista. A cidade inteira tá bloqueada.",
        fx=["whisper_leve", "tremor"], gain=0.9),
    "p1_marcos_infestada": dict(
        who="marcos", voice="pm_santa", speed=1.1,
        text="Não tá bloqueada, Clara... Tá infestada. Eles só param de fazer barulho quando acham rastro fresco.",
        fx=["whisper_leve"], gain=0.95),
    "p1_lucas_viaduto": dict(
        who="lucas", voice="pm_alex", speed=1.08,
        text="Espera... Olha ali debaixo do viaduto. Tem alguém cambaleando na contramão...",
        fx=["whisper_leve"], gain=0.9),
    "p1_clara_entregador": dict(
        who="clara", voice="pf_dora", speed=1.0,
        text="Meu Deus... é o entregador de aplicativo que tava na praça de alimentação...",
        fx=["whisper_leve", "tremor", "choro"], gain=0.95),
    "p1_marcos_visor": dict(
        who="marcos", voice="pm_santa", speed=1.2,
        text="Ele não é mais trabalhador de porra nenhuma, Clara. Desliga esse visor agora!",
        fx=["whisper_leve", "aspereza"], gain=1.0),
    "p1_lucas_cuidado1": dict(
        who="lucas", voice="pm_alex", speed=1.2,
        text="Cuidado!",
        fx=["grito"], gain=1.15),
    "p1_lucas_cuidado2": dict(
        who="lucas", voice="pm_alex", speed=1.3,
        text="Veio de cima da marquise, eles já cercaram a",
        fx=["grito", "fadiga"], gain=1.15),
    # ------------------------------------------------------------ PARTE 2
    "p2_lucas_rua": dict(
        who="lucas", voice="pm_alex", speed=1.3,
        text="rua toda! Trava a porta! Empurra o balcão da lotérica aqui na frente para bloquear!",
        fx=["grito", "fadiga"], gain=1.15),
    "p2_clara_escada": dict(
        who="clara", voice="pf_dora", speed=1.12,
        text="Lucas... não adianta barricar a entrada da rua. Olha ali em cima, na escada rolante desligada!",
        fx=["tremor", "grito_leve", "choro"], gain=1.0),
    "p2_marcos_socorro": dict(
        who="marcos", voice="pm_santa", speed=1.28,
        text="Socorro! Eles já tavam escondidos aqui dentro! Me puxa!",
        fx=["grito", "agudo", "tremor"], gain=1.2),
    "p2_lucas_chuta": dict(
        who="lucas", voice="pm_alex", speed=1.3,
        text="Marcos, chuta a mão dele! Clara, corre para o corredor dos fundos, sentido estacionamento!",
        fx=["grito", "fadiga"], gain=1.15),
    "p2_clara_vaiembora": dict(
        who="clara", voice="pf_dora", speed=1.12,
        text="Vai embora, Lucas! A transmissão ainda tá gravando, faz eles lembrarem quem a gente era!",
        fx=["grito", "tremor", "choro"], gain=1.15),
    "p2_lucas_portao": dict(
        who="lucas", voice="pm_alex", speed=1.28,
        text="Não vou te deixar aqui, Clara! Abre essa merda de portão!",
        fx=["grito", "tremor", "fadiga"], gain=1.2),
    "p2_lucas_zumbi": dict(
        who="lucas_zumbi", voice="pm_alex", speed=1.22,
        text="Obrigado por assistirem até o final... A infecção foi transmitida para todos os espectadores conectados aqui em São Paulo.",
        fx=["zumbi"], gain=1.0),
}


def apply_fx(x, fx):
    for f in fx:
        if f == "whisper":
            x = dsp.whisper(x, 0.93)
        elif f == "whisper_leve":  # voz baixa e contida, meio sussurrada
            x = 0.55 * dsp.whisper(x, 0.9) + 0.55 * x * 0.5
        elif f == "tremor":
            x = dsp.vibrato(x, rate=5.5, depth_ms=0.22)
        elif f == "choro":  # soluço: modulação lenta de amplitude + respiração entrecortada
            t = np.arange(len(x)) / SR
            x = x * (0.78 + 0.22 * np.sin(2 * np.pi * 3.2 * t) ** 2)
            x = x + 0.05 * dsp.bp(dsp.noise(len(x) / SR), 800, 4200) * dsp.env_follow(x, 40)
        elif f == "aspereza":
            x = dsp.softclip(x * 2.2, 1.8) * 0.8
        elif f == "grito":  # esforço vocal: brilho, saturação
            x = dsp.hp(x, 130)
            x = x + 0.55 * dsp.bp(x, 1800, 4200)
            x = dsp.softclip(x * 2.8, 2.4) * 0.85
        elif f == "grito_leve":
            x = x + 0.3 * dsp.bp(x, 1800, 4200)
            x = dsp.softclip(x * 1.8, 1.6) * 0.9
        elif f == "agudo":
            y = dsp.pitch_shift(x, +1.6, formant=True)
            x = y[: len(x)] if len(y) >= len(x) else np.pad(y, (0, len(x) - len(y)))
        elif f == "fadiga":  # ofegante: respiração por baixo
            x = x + 0.1 * dsp.bp(dsp.noise(len(x) / SR), 600, 3800) * (0.3 + dsp.env_follow(x, 80) / (np.max(dsp.env_follow(x, 80)) + 1e-9))
        elif f == "zumbi":
            x = dsp.distort_zombie(x)
        else:
            raise ValueError(f)
    return x


def trim_silence(x, thr=0.004, pad=0.03):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pad * SR))
    b = min(len(x), idx[-1] + int(pad * SR))
    return x[a:b]


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    k = Kokoro(os.path.join(KOKORO_DIR, "kokoro-v1.0.onnx"), os.path.join(KOKORO_DIR, "voices-v1.0.bin"))
    meta = {}
    for lid, spec in LINES.items():
        a, sr = k.create(spec["text"], voice=spec["voice"], speed=spec["speed"], lang="pt-br")
        x = dsp.resample(np.asarray(a, dtype=np.float32), sr)
        x = trim_silence(x)
        x = apply_fx(x, spec["fx"])
        x = dsp.fade(x / (np.max(np.abs(x)) + 1e-9) * 0.8 * spec["gain"] / 1.2, 0.004, 0.03)
        sf.write(os.path.join(out_dir, f"{lid}.wav"), x, SR)
        env = dsp.env_follow(x, 25)
        hop = SR // 60
        e60 = env[::hop]
        e60 = (e60 / (e60.max() + 1e-9)).round(3).tolist()
        meta[lid] = dict(who=spec["who"], dur=round(len(x) / SR, 3), env=e60, text=spec["text"])
        print(f"{lid:22s} {spec['who']:12s} {len(x)/SR:5.2f}s  speed={spec['speed']}")
    with open(os.path.join(out_dir, "vozes.json"), "w") as f:
        json.dump(meta, f)


if __name__ == "__main__":
    main(sys.argv[1])
