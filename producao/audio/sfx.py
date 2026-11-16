"""Biblioteca de efeitos sonoros procedurais (síntese em numpy) para A Noite de São Paulo."""
import numpy as np
from scipy import signal

import dsp
from dsp import SR, RNG, noise, lp, hp, bp, resonator, exp_env, softclip, env_follow, t_axis, fade


def _n(dur):
    return int(dur * SR)


def _acc(out, i, arr):
    """Soma arr em out a partir de i, cortando o que passar do fim."""
    i = int(i)
    if i >= len(out):
        return
    j = min(len(out), i + len(arr))
    out[i:j] += arr[: j - i]


def _norm(x, peak=0.9):
    return dsp.norm(x, peak)


# =================================================================== VOZ SINTÉTICA
def vocal_synth(f0, formants, dur, breath=0.08, jitter=0.012, weights=(1.0, 0.7, 0.35)):
    """Fonte glotal (serra) + formantes. f0: função t-> Hz (array)."""
    t = t_axis(dur)
    f = f0(t) * (1 + jitter * dsp.lp(noise(dur), 30, 2) * 8)
    ph = 2 * np.pi * np.cumsum(f) / SR
    src = signal.sawtooth(ph, 0.35).astype(np.float32)
    src = src + breath * noise(dur)
    out = np.zeros_like(src)
    for fm, w in zip(formants, weights):
        out += w * resonator(src, fm, 9)
    return out


def groan(dur=1.8, f0=95, vowel="o", rasp=0.35, glide=-0.25):
    vow = {"o": (450, 900, 2500), "a": (700, 1200, 2600), "u": (320, 800, 2400), "e": (500, 1700, 2500)}[vowel]
    f = lambda t: f0 * (1 + glide * t / dur) * (1 + 0.04 * np.sin(2 * np.pi * 5.5 * t))
    x = vocal_synth(f, vow, dur, breath=0.3)
    t = t_axis(dur)
    x *= 0.65 + 0.35 * np.sign(np.sin(2 * np.pi * (28 + 6 * np.sin(2 * np.pi * 0.7 * t)) * t))  # rosnado
    x += rasp * hp(noise(dur), 1200) * env_follow(x, 30)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.7
    return _norm(softclip(x * env * 1.8, 1.5))


def breath_burst(dur=0.5, inhale=True, tone=0.3):
    t = t_axis(dur)
    sh = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** (1.5 if inhale else 0.8)
    x = bp(noise(dur), 500, 5200, 2) * sh
    x += tone * resonator(noise(dur), 900, 3) * sh
    return _norm(x, 0.5)


def scream_muffled(dur=0.7):
    """Grito curto e abafado (como atrás de vidro/mão): glissando agudo, filtro passa-baixa, corte seco."""
    f = lambda t: 380 + 520 * np.clip(t / 0.25, 0, 1) - 120 * np.clip((t - 0.3) / 0.4, 0, 1)
    x = vocal_synth(f, (760, 1250, 2700), dur, breath=0.1, jitter=0.02)
    x = lp(x, 1100, 3)
    t = t_axis(dur)
    env = np.minimum(1, t / 0.04) * (1 - 0.3 * t / dur)
    env[int(0.9 * len(env)):] *= np.linspace(1, 0, len(env) - int(0.9 * len(env)))  # corte abrupto
    return _norm(softclip(x * env * 2, 1.4))


def scream_full(dur=1.4, f_hi=900, muffle=None):
    f = lambda t: (f_hi * 0.55) + (f_hi * 0.45) * np.clip(t / 0.18, 0, 1) - 0.25 * f_hi * np.clip((t - 0.5) / 0.9, 0, 1)
    x = vocal_synth(f, (900, 1500, 3000), dur, breath=0.2, jitter=0.03)
    x += 0.5 * hp(noise(dur), 2500) * env_follow(x, 10)
    t = t_axis(dur)
    env = np.minimum(1, t / 0.03) * np.exp(-0.7 * t / dur)
    x = softclip(x * env * 2.2, 2.0)
    if muffle:
        x = lp(x, muffle, 3)
    return fade(_norm(x), 0.002, 0.08)


# =================================================================== PARTE 1
def car_alarm(dur=1.6):
    """Alarme de carro: sirene em dois tons alternados + buzinadas curtas."""
    t = t_axis(dur)
    sweep = (t * 3.4) % 1.0
    f = 1250 + 950 * np.abs(2 * sweep - 1)  # triangular 1.25–2.2 kHz
    ph = 2 * np.pi * np.cumsum(f) / SR
    siren = signal.square(ph, 0.5).astype(np.float32) * 0.5 + np.sin(ph) * 0.5
    horn_on = (np.floor(t * 4.0) % 2 == 0).astype(np.float32)
    horn_on = lp(horn_on, 400, 2)
    horn = (signal.square(2 * np.pi * 410 * t) + signal.square(2 * np.pi * 512 * t + 0.6)) * 0.3 * horn_on
    x = hp(0.55 * siren + horn, 280)
    return _norm(softclip(x * 1.5, 1.4))


def metal_impact(dur=1.2, body=95):
    """Baque metálico seco (carroceria amassando)."""
    n = _n(dur)
    t = t_axis(dur)
    thump = np.sin(2 * np.pi * (body + 70 * np.exp(-t * 60)) * t) * np.exp(-t * 22)
    ring = np.zeros(n, dtype=np.float32)
    for fr, g, dc in [(310, 0.7, 0.35), (487, 0.6, 0.28), (806, 0.5, 0.22), (1370, 0.35, 0.16), (2210, 0.25, 0.1), (3500, 0.15, 0.07)]:
        ring += g * np.sin(2 * np.pi * fr * (1 + RNG.uniform(-0.03, 0.03)) * t) * exp_env(n, dc)
    crack = hp(noise(dur), 1500) * exp_env(n, 0.03)
    x = 1.1 * thump + 0.55 * ring + 0.7 * crack
    return _norm(softclip(x, 1.3))


def radio_static(dur=6.0, die_at=None):
    """Rádio de pilha: chiado AM com estalidos; morre no final."""
    die_at = die_at or dur * 0.65
    t = t_axis(dur)
    x = bp(noise(dur, "pink"), 350, 3600, 2)
    x *= 0.6 + 0.4 * (RNG.random(_n(dur)) > 0.97) * 3
    sweep = np.sin(2 * np.pi * np.cumsum(900 + 600 * np.sin(2 * np.pi * 0.7 * t)) / SR) * 0.07
    x = x + sweep
    env = np.where(t < die_at, 1.0, np.exp(-(t - die_at) * 6))
    pitchdrop = np.where(t > die_at, 1, 0)
    x = x * env
    # som "caindo" no fim (bateria/pilha morrendo)
    k = np.clip((t - die_at) / (dur - die_at + 1e-9), 0, 1)
    tone = np.sin(2 * np.pi * np.cumsum(520 * (1 - 0.85 * k)) / SR) * 0.25 * pitchdrop * np.exp(-(t - die_at) * 3)
    return _norm(x + tone, 0.6)


def drip(n_drops=6, dur=8.0, seed=3):
    rng = np.random.default_rng(seed)
    out = np.zeros(_n(dur), dtype=np.float32)
    for _ in range(n_drops):
        t0 = rng.uniform(0.2, dur - 0.5)
        f = rng.uniform(700, 1500)
        d = 0.18
        t = t_axis(d)
        s = np.sin(2 * np.pi * (f + 600 * np.exp(-t * 55)) * t) * np.exp(-t * 28)
        i = int(t0 * SR)
        _acc(out, i, s * rng.uniform(0.08, 0.2))
    return out


def lamp_hum(dur=10.0, f=60, flicker=True):
    t = t_axis(dur)
    x = np.zeros_like(t)
    for h, g in [(1, 0.5), (2, 1.0), (3, 0.5), (4, 0.4), (6, 0.2), (8, 0.1)]:
        x += g * np.sin(2 * np.pi * f * h * t + RNG.uniform(0, 6))
    x += 0.35 * hp(noise(dur), 2000) * (0.5 + 0.5 * np.sin(2 * np.pi * 120 * t))
    if flicker:
        gate = (RNG.random(_n(dur) // 2400 + 2) > 0.1).astype(np.float32)
        gate = np.repeat(gate, 2400)[: len(t)]
        x *= 0.7 + 0.3 * lp(gate, 40, 2)
    return _norm(x, 0.3)


def siren_far(dur=12.0):
    t = t_axis(dur)
    f = 600 + 380 * np.sin(2 * np.pi * 0.16 * t) ** 3 + 120 * np.sin(2 * np.pi * 0.16 * t)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    s = lp(s + 0.4 * np.sin(4 * np.pi * np.cumsum(f) / SR), 1800, 3)
    return _norm(s * np.sin(np.pi * t / dur) ** 2, 0.4)


def city_air(dur=60.0):
    """Cama de cidade grande de madrugada: rumor grave distante + vento fino."""
    low = lp(noise(dur, "brown"), 160, 2) * 1.2
    mid = lp(noise(dur, "pink"), 900, 2) * 0.18
    wind = bp(noise(dur), 300, 1100, 2) * 0.1 * (0.5 + 0.5 * lp(noise(dur), 0.35, 2) * 6)
    return _norm(low + mid + wind, 0.5)


def bone_clicks(n=6, dur=3.0, seed=11):
    """Estalos secos de articulação/mandíbula deslocada."""
    rng = np.random.default_rng(seed)
    out = np.zeros(_n(dur), dtype=np.float32)
    ts = np.sort(rng.uniform(0.0, dur - 0.2, n))
    for t0 in ts:
        d = 0.09
        c = bp(RNG.standard_normal(_n(d)).astype(np.float32), rng.uniform(1500, 3800), rng.uniform(4000, 6500), 2)
        c *= exp_env(len(c), rng.uniform(0.012, 0.03))
        wet = lp(RNG.standard_normal(_n(d)).astype(np.float32), 500, 2) * exp_env(_n(d), 0.05) * 0.5
        i = int(t0 * SR)
        _acc(out, i, (c + wet) * rng.uniform(0.4, 1.0))
    return _norm(out, 0.7)


def drag_step(dur=0.9):
    """Passo arrastado (perna que não obedece): raspão + baque surdo."""
    n = _n(dur)
    t = t_axis(dur)
    scrape = bp(noise(dur), 300, 2800, 2) * np.minimum(1, t / 0.05) * np.exp(-t * 3.2) * (0.6 + 0.4 * RNG.random(n))
    thud_t = 0.5
    thud = np.sin(2 * np.pi * 70 * np.clip(t - thud_t, 0, None)) * np.exp(-np.clip(t - thud_t, 0, None) * 28) * (t >= thud_t)
    return _norm(0.55 * scrape + 1.0 * thud, 0.8)


def footstep(kind="wet", weight=1.0):
    d = 0.22
    t = t_axis(d)
    thud = np.sin(2 * np.pi * (85 + 40 * np.exp(-t * 40)) * t) * np.exp(-t * 32)
    scuff = bp(noise(d), 600 if kind == "wet" else 1500, 5200, 2) * exp_env(_n(d), 0.07 if kind == "wet" else 0.045)
    x = 0.9 * thud * weight + 0.5 * scuff
    if kind == "wet":
        x += 0.25 * hp(noise(d), 3000) * exp_env(_n(d), 0.12)
    return _norm(x, 0.7)


def run_steps(t0, dur, rate_hz, kind="wet", rng_seed=5, jitter=0.08):
    """Retorna lista de (tempo, array, ganho) de passos de corrida."""
    rng = np.random.default_rng(rng_seed)
    out, t = [], t0
    side = -1
    while t < t0 + dur:
        out.append((t, footstep(kind, rng.uniform(0.7, 1.2)), rng.uniform(0.6, 1.0), side * 0.25))
        side *= -1
        t += (1 / rate_hz) * (1 + rng.uniform(-jitter, jitter))
    return out


def cloth(dur=0.5, vol=1.0):
    t = t_axis(dur)
    x = bp(noise(dur), 400, 4200, 2) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return _norm(x, 0.35 * vol)


def zinc_creak(dur=1.6, rising=True):
    """Gemido de chapa de zinco sob carga: ressonâncias varridas + estalos."""
    n = _n(dur)
    t = t_axis(dur)
    base = noise(dur)
    f = 900 + (700 if rising else -400) * (t / dur)
    # varredura de ressonância
    x = np.zeros(n, dtype=np.float32)
    blk = 480
    for i in range(0, n - blk, blk):
        fc = float(np.clip(f[i], 200, 6000))
        b, a = signal.iirpeak(fc / (SR / 2), 25)
        x[i:i + blk] = signal.lfilter(b, a, base[i:i + blk])
    x *= (0.4 + 0.6 * (np.abs(np.sin(2 * np.pi * 7 * t)) ** 2)) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.5
    pops = (RNG.random(n) > 0.9993) * RNG.uniform(0.5, 1.5, n)
    x += 0.6 * hp(pops.astype(np.float32), 1500) * 5
    return _norm(x, 0.8)


def glass_shatter(dur=3.0, density=1.0, first=0.0):
    """Vidro quebrando: estalo inicial + chuva de cacos."""
    n = _n(dur)
    out = np.zeros(n, dtype=np.float32)
    crack = hp(noise(0.12), 2200) * exp_env(_n(0.12), 0.04)
    out[: len(crack)] += crack * 1.4
    cnt = int(260 * density * dur)
    ts = np.abs(RNG.normal(0.0, dur * 0.28, cnt)) + 0.01
    for t0 in ts[ts < dur - 0.2]:
        d = RNG.uniform(0.02, 0.12)
        f = RNG.uniform(2500, 9500)
        tt = t_axis(d)
        s = np.sin(2 * np.pi * f * tt) * np.exp(-tt * RNG.uniform(40, 130)) * RNG.uniform(0.05, 0.4)
        i = int(t0 * SR)
        _acc(out, i, s)
    out += 0.3 * hp(noise(dur), 4000) * exp_env(n, dur * 0.35) * 0.4
    return _norm(out, 0.9)


def tile_fall(n=18, dur=3.0, seed=2):
    """Telhas/chapas caindo: baques de cerâmica e zinco."""
    rng = np.random.default_rng(seed)
    out = np.zeros(_n(dur), dtype=np.float32)
    for k in range(n):
        t0 = abs(rng.normal(0.0, dur * 0.35))
        if t0 > dur - 0.5:
            continue
        d = 0.45
        t = t_axis(d)
        f = rng.uniform(260, 1100)
        s = np.sin(2 * np.pi * f * t) * np.exp(-t * rng.uniform(8, 30)) * 0.6
        s += 0.7 * hp(noise(d), 1800) * exp_env(_n(d), 0.03)
        s += 0.5 * np.sin(2 * np.pi * 80 * t) * np.exp(-t * 40)
        i = int(t0 * SR)
        _acc(out, i, s * rng.uniform(0.4, 1.0))
    return _norm(out, 0.9)


def zinc_buckle(dur=2.4):
    """Marquise de zinco cedendo: gemido longo + estouro."""
    a = zinc_creak(dur * 0.85, rising=True)
    b = metal_impact(dur * 0.35, body=60) * 0.8
    out = np.zeros(_n(dur), dtype=np.float32)
    _acc(out, 0, a * 0.8)
    k = int(dur * 0.62 * SR)
    out[k:k + len(b)] += b
    return _norm(out, 0.9)


def heartbeat(dur=8.0, bpm=70, accel=0.0):
    out = np.zeros(_n(dur), dtype=np.float32)
    t, b = 0.0, bpm
    while t < dur - 0.4:
        for off, g in ((0.0, 1.0), (0.17, 0.7)):
            d = 0.3
            tt = t_axis(d)
            s = np.sin(2 * np.pi * (62 - 22 * np.clip(tt / 0.1, 0, 1)) * tt) * np.exp(-tt * 18) * g
            i = int((t + off) * SR)
            _acc(out, i, s)
        b += accel
        t += 60.0 / b
    return _norm(out, 0.9)


def riser(dur=6.0, f0=200, f1=4000, tone=True):
    t = t_axis(dur)
    k = (t / dur) ** 2
    n = noise(dur)
    x = np.zeros(_n(dur), dtype=np.float32)
    blk = 960
    for i in range(0, len(x) - blk, blk):
        fc = f0 * (f1 / f0) ** k[i]
        b, a = signal.iirpeak(min(fc, 20000) / (SR / 2), 3)
        x[i:i + blk] = signal.lfilter(b, a, n[i:i + blk])
    x = _norm(x, 0.5)
    if tone:
        f = 110 * 2 ** (k * 2.5)
        tn = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.4 * np.sin(2 * np.pi * np.cumsum(f * 1.06) / SR)
        trem = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(2 + 14 * k) / SR)
        x += 0.25 * tn * trem
    return _norm(x * k ** 0.8, 0.7)


def drone(dur=10.0, root=55.0):
    """Cama sombria: fundamental grave + quinta diminuta + cluster agudo."""
    t = t_axis(dur)
    x = np.zeros_like(t)
    for ratio, g in [(1, 1.0), (1.5, 0.35), (1.4142, 0.4), (2.0, 0.5), (3.0, 0.15)]:
        det = 1 + 0.003 * np.sin(2 * np.pi * (0.07 + ratio * 0.01) * t)
        x += g * np.sin(2 * np.pi * np.cumsum(root * ratio * det) / SR)
    shimmer = np.zeros_like(t)
    for f in (880, 932, 1250, 1318):
        slow = np.clip(np.sin(2 * np.pi * RNG.uniform(0.04, 0.12) * t + RNG.uniform(0, 6)), 0, None) ** 2  # entra e sai
        shimmer += np.sin(2 * np.pi * f * t + RNG.uniform(0, 6)) * slow
    x += 0.011 * shimmer
    return _norm(x * np.minimum(1, t / 2.0) * np.minimum(1, (dur - t) / 1.5), 0.5)


def boom(dur=2.5, f0=95):
    t = t_axis(dur)
    x = np.sin(2 * np.pi * np.cumsum(f0 * np.exp(-t * 1.6) + 22) / SR) * np.exp(-t * 1.5)
    x += 0.6 * lp(noise(dur), 300, 3) * exp_env(_n(dur), 0.9)
    return _norm(softclip(x * 1.6, 1.5), 0.95)


def tinnitus(dur=2.5, f=6800):
    t = t_axis(dur)
    x = np.sin(2 * np.pi * f * t) * 0.25 + np.sin(2 * np.pi * f * 1.5 * t) * 0.05
    return fade(x.astype(np.float32) * np.exp(-t * 0.5), 0.05, 0.4)


def static_burst(dur=0.4):
    x = noise(dur) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 90 * t_axis(dur))))
    return fade(_norm(softclip(x * 3, 2), 0.8), 0.001, 0.05)


# =================================================================== PARTE 2
def glass_door_smash(dur=2.2):
    g = glass_shatter(dur, density=1.8)
    t = t_axis(dur)
    thud = np.sin(2 * np.pi * 70 * t) * np.exp(-t * 20)
    frame = metal_impact(0.8, 140)[: _n(dur)]
    out = g.copy()
    out[: len(thud)] += thud * 0.8
    out[: len(frame)] += frame * 0.4
    return _norm(out, 0.95)


def counter_drag(dur=2.2):
    """Balcão de lotérica arrastado no piso de granito: atrito por trancos + vibração do tampo."""
    n = _n(dur)
    t = t_axis(dur)
    stick = (np.sin(2 * np.pi * 9 * t + 2 * np.sin(2 * np.pi * 1.3 * t)) > 0.2).astype(np.float32)
    stick = lp(stick, 40, 2)
    rumble = lp(noise(dur, "pink"), 280, 2) * 1.2
    squeal = bp(noise(dur), 900, 1700, 3) * 0.45 * (0.3 + 0.7 * stick)
    x = (rumble * (0.4 + 0.8 * stick) + squeal) * np.minimum(1, t / 0.15) * np.minimum(1, (dur - t) / 0.25)
    # tranco final: o balcão bate na porta
    hit = np.sin(2 * np.pi * 60 * t) * np.exp(-np.clip(t - (dur - 0.12), 0, None) * 25) * (t > dur - 0.12)
    return _norm(x + 1.2 * hit, 0.9)


def escalator_cascade(dur=3.2, n=24):
    """Silhuetas despencando pela escada rolante: metal, corpos, ossos."""
    out = np.zeros(_n(dur), dtype=np.float32)
    ts = np.sort(np.abs(RNG.normal(0.5, dur * 0.3, n)))
    for t0 in ts:
        if t0 > dur - 0.4:
            continue
        d = 0.35
        tt = t_axis(d)
        body = np.sin(2 * np.pi * RNG.uniform(60, 130) * tt) * np.exp(-tt * 18)
        step = bp(noise(d), 800, 3600, 2) * exp_env(_n(d), 0.05)
        s = body + 0.5 * step
        i = int(t0 * SR)
        _acc(out, i, s * RNG.uniform(0.3, 1.0))
    out += 0.35 * lp(noise(dur), 500, 2) * np.sin(np.pi * np.clip(t_axis(dur) / dur, 0, 1))
    return _norm(out, 0.9)


def horde(dur=6.0, n=14, f_lo=70, f_hi=170):
    """Multidão de gemidos sobrepostos."""
    out = np.zeros(_n(dur), dtype=np.float32)
    for k in range(n):
        d = RNG.uniform(1.2, 2.6)
        g = groan(d, f0=RNG.uniform(f_lo, f_hi), vowel=RNG.choice(["o", "a", "u", "e"]))
        t0 = RNG.uniform(0, max(0.01, dur - d))
        i = int(t0 * SR)
        _acc(out, i, g * RNG.uniform(0.25, 0.8))
    return _norm(out, 0.85)


def chain_rattle(dur=1.6, intensity=1.0):
    out = np.zeros(_n(dur), dtype=np.float32)
    t = 0.0
    while t < dur - 0.2:
        d = 0.25
        tt = t_axis(d)
        f0 = RNG.uniform(1800, 4200)
        s = sum(np.sin(2 * np.pi * f0 * m * tt) * np.exp(-tt * RNG.uniform(25, 70)) * g for m, g in ((1, 1), (2.3, .5), (3.7, .3)))
        i = int(t * SR)
        _acc(out, i, s * RNG.uniform(0.2, 0.9))
        t += RNG.exponential(0.04 / max(intensity, 0.2))
    return _norm(out, 0.8)


def door_bang(dur=0.9):
    """Pancada em porta corta-fogo de metal."""
    x = metal_impact(dur, body=75)
    return _norm(x * 1.0, 0.95)


def phone_drop(dur=1.6):
    """Celular caindo no granito: clack plástico, quiques, parada."""
    out = np.zeros(_n(dur), dtype=np.float32)
    for t0, g in ((0.0, 1.0), (0.14, 0.55), (0.24, 0.3), (0.31, 0.16)):
        d = 0.12
        tt = t_axis(d)
        s = (hp(noise(d), 1800) * exp_env(_n(d), 0.012) * 1.0 + np.sin(2 * np.pi * 420 * tt) * np.exp(-tt * 80)) * g
        i = int(t0 * SR)
        _acc(out, i, s)
    # deslizando
    sl = bp(noise(0.5), 900, 3500, 2) * exp_env(_n(0.5), 0.2) * 0.25
    _acc(out, 0.35 * SR, sl)
    return _norm(out, 0.95)


def fabric_rip(dur=1.0):
    n = _n(dur)
    t = t_axis(dur)
    x = bp(noise(dur), 1500, 7000, 2)
    teeth = (np.sin(2 * np.pi * (140 + 80 * t) * t) > 0).astype(np.float32)
    x = x * (0.35 + 0.65 * lp(teeth, 600, 2)) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.6
    return _norm(x, 0.8)


def wet_squelch(dur=1.4, n=9):
    out = np.zeros(_n(dur), dtype=np.float32)
    for _ in range(n):
        t0 = RNG.uniform(0, dur - 0.25)
        d = RNG.uniform(0.08, 0.2)
        tt = t_axis(d)
        s = lp(noise(d), RNG.uniform(250, 700), 2) * np.sin(np.pi * tt / d) ** 2 * 1.4
        s += 0.4 * np.sin(2 * np.pi * (180 - 120 * tt / d) * tt) * np.exp(-tt * 18)
        i = int(t0 * SR)
        _acc(out, i, s * RNG.uniform(0.4, 1.0))
    return _norm(out, 0.8)


def lowbat_beep():
    out = np.zeros(_n(0.7), dtype=np.float32)
    for off, f in ((0.0, 880), (0.2, 660)):
        d = 0.16
        tt = t_axis(d)
        s = np.sin(2 * np.pi * f * tt) * np.sin(np.pi * tt / d) ** 0.5 * 0.5
        _acc(out, off * SR, s)
    return out


def reboot_chime():
    d = 1.0
    t = t_axis(d)
    s = np.sin(2 * np.pi * np.cumsum(np.where(t < 0.1, 300 + 3000 * t, 660 * (1 - 0.3 * (t - 0.1)))) / SR) * np.exp(-t * 4)
    return _norm(softclip(s * 2, 2.0) + 0.3 * static_burst(d), 0.6)


def room_tone_gallery(dur=60.0):
    """Galeria vazia: zumbido de lâmpadas fluorescentes + ar condicionado + reverberação de piso."""
    t = t_axis(dur)
    hum = (np.sin(2 * np.pi * 120 * t) + 0.5 * np.sin(2 * np.pi * 240 * t) + 0.25 * np.sin(2 * np.pi * 360 * t)) * 0.15
    buzz = hp(noise(dur), 4000) * 0.03 * (0.5 + 0.5 * np.sin(2 * np.pi * 120 * t))
    air = lp(noise(dur, "pink"), 400, 2) * 0.25
    return _norm(hum + buzz + air, 0.35)


def eye_shine_pad(dur=5.0):
    """Tensão aguda e crescente (olhos que refletem a lanterna)."""
    t = t_axis(dur)
    x = np.zeros_like(t)
    for f in (1760, 1864, 2349, 2489):
        x += np.sin(2 * np.pi * f * t + RNG.uniform(0, 6)) * (0.3 + 0.7 * (t / dur))
    x *= (t / dur) ** 1.4 * (0.6 + 0.4 * np.sin(2 * np.pi * 6 * t))
    return _norm(x, 0.35)
