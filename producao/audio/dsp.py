"""Utilitários de DSP (numpy/scipy) usados na produção de áudio.

Tudo trabalha em float32, 48 kHz. Sinais mono são arrays 1-D, estéreo é (N, 2).
"""
import os
import subprocess
import tempfile

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
RNG = np.random.default_rng(1604)  # semente fixa: render reprodutível


# ------------------------------------------------------------------ básicos
def t_axis(dur, sr=SR):
    return np.arange(int(dur * sr)) / sr


def resample(x, sr_in, sr_out=SR):
    if sr_in == sr_out:
        return x.astype(np.float32)
    g = np.gcd(sr_in, sr_out)
    return signal.resample_poly(x, sr_out // g, sr_in // g).astype(np.float32)


def norm(x, peak=0.9):
    m = np.max(np.abs(x)) + 1e-9
    return (x / m * peak).astype(np.float32)


def fade(x, fin=0.005, fout=0.02, sr=SR):
    x = x.copy()
    n_in, n_out = int(fin * sr), int(fout * sr)
    if n_in:
        x[:n_in] *= np.linspace(0, 1, n_in)
    if n_out:
        x[-n_out:] *= np.linspace(1, 0, n_out)
    return x


def exp_env(n, decay, sr=SR):
    """Envelope exponencial: cai para -60 dB em `decay` segundos."""
    t = np.arange(n) / sr
    return np.exp(-6.9 * t / max(decay, 1e-4))


def noise(dur, color="white", sr=SR):
    n = int(dur * sr)
    w = RNG.standard_normal(n).astype(np.float32)
    if color == "white":
        return w
    if color == "pink":
        b, a = [0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400]
        return signal.lfilter(b, a, w).astype(np.float32) * 6
    if color == "brown":
        x = np.cumsum(w)
        x -= np.linspace(x[0], x[-1], n)
        return (x / (np.max(np.abs(x)) + 1e-9)).astype(np.float32)
    raise ValueError(color)


def lp(x, fc, order=4, sr=SR):
    sos = signal.butter(order, fc, "low", fs=sr, output="sos")
    return signal.sosfilt(sos, x).astype(np.float32)


def hp(x, fc, order=4, sr=SR):
    sos = signal.butter(order, fc, "high", fs=sr, output="sos")
    return signal.sosfilt(sos, x).astype(np.float32)


def bp(x, f1, f2, order=3, sr=SR):
    sos = signal.butter(order, [f1, f2], "band", fs=sr, output="sos")
    return signal.sosfilt(sos, x).astype(np.float32)


def resonator(x, f, q, sr=SR):
    """Filtro passa-banda ressonante (formantes, corpo metálico)."""
    b, a = signal.iirpeak(f / (sr / 2), q)
    return signal.lfilter(b, a, x).astype(np.float32)


def softclip(x, drive=2.0):
    return (np.tanh(x * drive) / np.tanh(drive)).astype(np.float32)


def env_follow(x, ms=20, sr=SR):
    k = max(1, int(ms * sr / 1000))
    y = np.sqrt(np.convolve(x * x, np.ones(k) / k, mode="same"))
    return y.astype(np.float32)


def place(buf, x, t, gain=1.0, pan=0.0, sr=SR):
    """Soma `x` (mono ou estéreo) em `buf` (N,2) no instante `t` com pan [-1,1]."""
    i = int(t * sr)
    if i >= len(buf):
        return
    if x.ndim == 1:
        a = (pan + 1) * np.pi / 4
        x = np.stack([x * np.cos(a), x * np.sin(a)], axis=1) * np.sqrt(2)
    x = x * gain
    j = min(len(buf), i + len(x))
    if i < 0:
        x = x[-i:]
        i = 0
    buf[i:j] += x[: j - i]


def vibrato(x, rate=6.0, depth_ms=0.35, sr=SR):
    """Vibrato por linha de atraso variável (voz trêmula de medo)."""
    n = len(x)
    t = np.arange(n) / sr
    d = (depth_ms / 1000 * sr) * (0.5 + 0.5 * np.sin(2 * np.pi * rate * t))
    idx = np.arange(n) - d
    idx = np.clip(idx, 0, n - 1)
    return np.interp(idx, np.arange(n), x).astype(np.float32)


def pitch_shift(x, semitones, tempo=1.0, formant=True, sr=SR):
    """Pitch shift/time-stretch via rubberband do ffmpeg (preserva formantes)."""
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "i.wav"), os.path.join(d, "o.wav")
        sf.write(a, x, sr)
        ratio = 2 ** (semitones / 12)
        f = f"rubberband=pitch={ratio:.5f}:tempo={tempo:.5f}:formant={'preserved' if formant else 'shifted'}"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", a, "-af", f, b], check=True)
        y, _ = sf.read(b, dtype="float32")
    return y if y.ndim == 1 else y.mean(axis=1)


def whisper(x, mix=0.92, sr=SR):
    """Sussurro: excita o envelope espectral da voz com ruído (vocoder de fase aleatória)."""
    f, t, Z = signal.stft(x, sr, nperseg=1024, noverlap=768)
    mag = np.abs(Z)
    ph = RNG.uniform(-np.pi, np.pi, Z.shape)
    _, y = signal.istft(mag * np.exp(1j * ph), sr, nperseg=1024, noverlap=768)
    y = y[: len(x)].astype(np.float32)
    y = hp(y, 180)
    y *= np.max(np.abs(x)) / (np.max(np.abs(y)) + 1e-9)
    voiced = lp(x, 900) * 0.25  # um fio de voz mantém a inteligibilidade
    return (mix * y + (1 - mix) * voiced + 0.0).astype(np.float32)


def distort_zombie(x, sr=SR):
    """Voz infectada: grave, rouca, com granulação e formantes deslocados."""
    y = pitch_shift(x, -5.0, formant=False)
    y = y[: len(x)] if len(y) >= len(x) else np.pad(y, (0, len(x) - len(y)))
    t = np.arange(len(y)) / sr
    gr = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 38 * t + 3 * np.sin(2 * np.pi * 3 * t)))  # rosnado AM
    y = y * (0.6 + 0.4 * gr)
    y = softclip(y * 2.4, 2.2)
    y += 0.12 * hp(noise(len(y) / sr, "white")[: len(y)], 2500) * env_follow(y, 15)  # chiado de ar
    y = bp(y, 90, 5200, 2) * 1.6
    return y.astype(np.float32)


# --------------------------------------------------------------- reverb / IR
def make_ir(rt60=1.2, predelay=0.012, brightness=0.6, early=None, sr=SR, seed=7):
    rng = np.random.default_rng(seed)
    n = int((rt60 + predelay) * sr)
    w = rng.standard_normal(n)
    t = np.arange(n) / sr
    env = np.exp(-6.9 * np.clip(t - predelay, 0, None) / rt60)
    env[t < predelay] = 0
    ir = w * env
    fc = 1500 + 9000 * brightness
    ir = signal.sosfilt(signal.butter(2, fc, "low", fs=sr, output="sos"), ir)
    ir = signal.sosfilt(signal.butter(2, 120, "high", fs=sr, output="sos"), ir)
    for (dt, g) in (early or []):  # ecos discretos (prédios, paredes)
        i = int((predelay + dt) * sr)
        if i < n:
            ir[i] += g * 6
    return (ir / (np.sqrt(np.sum(ir ** 2)) + 1e-9)).astype(np.float32)


def reverb(x, ir, wet=0.3, sr=SR):
    """Convolução rápida. x mono -> mono (cauda cortada no tamanho original + cauda)."""
    y = signal.fftconvolve(x, ir)[: len(x) + len(ir)]
    xo = np.pad(x, (0, len(y) - len(x)))
    return ((1 - wet) * xo + wet * y * 1.0).astype(np.float32)


def stereo_reverb(x, ir_l, ir_r, wet=0.3):
    l = signal.fftconvolve(x, ir_l)
    r = signal.fftconvolve(x, ir_r)
    n = max(len(l), len(r))
    l, r = np.pad(l, (0, n - len(l))), np.pad(r, (0, n - len(r)))
    xo = np.pad(x, (0, n - len(x)))
    return np.stack([(1 - wet) * xo + wet * l, (1 - wet) * xo + wet * r], axis=1).astype(np.float32)


# ----------------------------------------------------------------- master
def duck(bus, ctrl_env, amount=0.55, attack=0.03, release=0.35, sr=SR):
    """Sidechain: abaixa `bus` (N,2) quando `ctrl_env` (N,) é alto."""
    c = np.clip(ctrl_env / (np.percentile(ctrl_env, 99) + 1e-9), 0, 1)
    b_a = np.exp(-1 / (attack * sr))
    b_r = np.exp(-1 / (release * sr))
    out = np.zeros_like(c)
    s = 0.0
    for i, v in enumerate(c):  # laço em Python: ok para 2,9 M amostras? usamos decimação abaixo
        s = b_a * s + (1 - b_a) * v if v > s else b_r * s + (1 - b_r) * v
        out[i] = s
    g = 1 - amount * out
    return bus * g[:, None]


def duck_fast(bus, ctrl_env, amount=0.55, attack=0.03, release=0.35, sr=SR, hop=48):
    """Versão decimada do sidechain (hop amostras) com interpolação linear."""
    c = np.clip(ctrl_env / (np.percentile(ctrl_env, 99) + 1e-9), 0, 1)[::hop]
    srr = sr / hop
    b_a = np.exp(-1 / (attack * srr))
    b_r = np.exp(-1 / (release * srr))
    out = np.zeros_like(c)
    s = 0.0
    for i, v in enumerate(c):
        s = b_a * s + (1 - b_a) * v if v > s else b_r * s + (1 - b_r) * v
        out[i] = s
    g = 1 - amount * out
    gi = np.interp(np.arange(len(bus)) / hop, np.arange(len(g)), g)
    return bus * gi[:, None]


def loudnorm_file(path_in, path_out, lufs=-14.0, tp=-1.5):
    """Normaliza para ~-14 LUFS (padrão de plataformas) com 2 passos do ffmpeg."""
    import json
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path_in, "-af",
         f"loudnorm=I={lufs}:TP={tp}:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True)
    j = json.loads(r.stderr[r.stderr.rfind("{"):])
    flt = (f"loudnorm=I={lufs}:TP={tp}:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
           f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path_in, "-af", flt, "-ar", str(SR), path_out], check=True)
    return j
