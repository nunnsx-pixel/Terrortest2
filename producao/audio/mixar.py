"""Mixagem das duas partes + exportação da folha de marcações (cues) para a cena 3D.

Uso: python3 mixar.py <1|2> <pasta_vozes> <pasta_saida>
Gera: mix_parteN.wav (estéreo 48 kHz, ~-14 LUFS) e cues_parteN.json
"""
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

import dsp
import sfx
from dsp import SR

# --------------------------------------------------------------------------- IRs
IR_STREET_L = dsp.make_ir(1.7, 0.016, 0.45, early=[(0.085, 0.45), (0.17, 0.3), (0.26, 0.18)], seed=11)
IR_STREET_R = dsp.make_ir(1.7, 0.016, 0.45, early=[(0.11, 0.4), (0.2, 0.28), (0.29, 0.16)], seed=12)
IR_GAL_L = dsp.make_ir(2.6, 0.01, 0.72, early=[(0.03, 0.5), (0.06, 0.4), (0.12, 0.3)], seed=21)
IR_GAL_R = dsp.make_ir(2.6, 0.01, 0.72, early=[(0.04, 0.5), (0.08, 0.4), (0.14, 0.3)], seed=22)


class Mix:
    def __init__(self, dur):
        self.n = int(dur * SR)
        z = lambda: np.zeros((self.n, 2), dtype=np.float32)
        self.voice, self.sfx, self.amb, self.mus = z(), z(), z(), z()
        self.send_st = np.zeros(self.n, dtype=np.float32)
        self.send_ga = np.zeros(self.n, dtype=np.float32)
        self.dur = dur
        self.voices_meta = {}
        self.marks = {}

    def add(self, bus, x, t, g=1.0, pan=0.0, dist=0.0, env="st", wet=None):
        x = np.asarray(x, dtype=np.float32)
        if dist > 0:
            x = dsp.lp(x, 12000 * (1 - 0.82 * dist) + 500, 2)
            g = g * (1 - 0.55 * dist)
        getattr(self, bus)  # valida
        dsp.place(getattr(self, bus), x, t, g, pan)
        w = wet if wet is not None else (0.18 + 0.5 * dist)
        send = self.send_st if env == "st" else self.send_ga
        i = int(t * SR)
        if 0 <= i < self.n:
            j = min(self.n, i + len(x))
            send[i:j] += x[: j - i] * g * w

    def voice_line(self, vdir, vid, t0, g=1.0, pan=0.0, env="st", wet=0.16, dist=0.0):
        x, _ = sf.read(os.path.join(vdir, f"{vid}.wav"), dtype="float32")
        self.add("voice", x, t0, g, pan, dist=dist, env=env, wet=wet)
        meta = json.load(open(os.path.join(vdir, "vozes.json")))[vid]
        self.voices_meta[vid] = dict(t0=t0, dur=meta["dur"], who=meta["who"], env=meta["env"], text=meta["text"])

    def cut_after(self, t_cut, fade=0.004):
        """Corte seco: zera tudo depois de t_cut."""
        i = int(t_cut * SR)
        k = int(fade * SR)
        for b in (self.voice, self.sfx, self.amb, self.mus):
            b[i - k:i] *= np.linspace(1, 0, k)[:, None]
            b[i:] = 0
        self.send_st[i:] = 0
        self.send_ga[i:] = 0

    def render(self, out_wav, muffle_from=None):
        v_env = dsp.env_follow(self.voice.mean(axis=1), 40)
        amb = dsp.duck_fast(self.amb, v_env, 0.5, 0.04, 0.5)
        mus = dsp.duck_fast(self.mus, v_env, 0.6, 0.04, 0.6)
        sf_ = dsp.duck_fast(self.sfx, v_env, 0.36, 0.03, 0.3)
        r_st = dsp.stereo_reverb(self.send_st, IR_STREET_L, IR_STREET_R, 1.0)[: self.n] * 0.9
        r_ga = dsp.stereo_reverb(self.send_ga, IR_GAL_L, IR_GAL_R, 1.0)[: self.n] * 0.9
        r_st = np.pad(r_st, ((0, max(0, self.n - len(r_st))), (0, 0)))
        r_ga = np.pad(r_ga, ((0, max(0, self.n - len(r_ga))), (0, 0)))
        m = self.voice * 1.0 + sf_ + amb + mus + r_st + r_ga
        if muffle_from is not None:  # microfone do celular caído no chão: abafado
            i = int(muffle_from * SR)
            tail = np.stack([dsp.lp(m[i:, c], 1100, 2) for c in range(2)], axis=1) * 0.7
            m[i:] = tail
        m = dsp.softclip(m * 0.9, 1.2)
        sf.write(out_wav + ".raw.wav", m, SR)
        # "microfone de celular": corte de graves, AGC (compressor), limitador, loudnorm
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", out_wav + ".raw.wav", "-af",
            "highpass=f=60,lowpass=f=15000,acompressor=threshold=-26dB:ratio=3.2:attack=4:release=220:makeup=3,alimiter=limit=0.97",
            out_wav + ".agc.wav"], check=True)
        j = dsp.loudnorm_file(out_wav + ".agc.wav", out_wav, -14.0, -1.5)
        for s in (".raw.wav", ".agc.wav"):
            os.remove(out_wav + s)
        return j


def steps(mx, t0, dur, rate, kind, seed, g=0.7, pan_spread=0.25, dist=0.0, env="st"):
    for (t, x, gg, pn) in sfx.run_steps(t0, dur, rate, kind, seed):
        mx.add("sfx", x, t, g * gg, pn * pan_spread / 0.25 * 0.25, dist=dist, env=env, wet=0.1)


def breaths(mx, t0, t1, every, g=0.3):
    t, k = t0, 0
    while t < t1:
        mx.add("sfx", sfx.breath_burst(0.38, inhale=(k % 2 == 0)), t, g, 0.0, env="st", wet=0.05)
        t += every
        k += 1


# =============================================================================
#                               PARTE 1  (60 s)
# =============================================================================
def parte1(vdir):
    mx = Mix(60.0)
    M = mx.marks
    M.update(alarm_start=0.45, baque=1.90, whisper=2.60, crouch=4.4, radio=9.0, viaduto_look=25.0,
             walker_visible=27.0, recognize=36.0, head_snap=46.4, creak=50.0, whip_up=50.3, glass=51.2,
             tiles=51.6, buckle=53.2, cut=57.95, end_card=58.3)
    # ------------------------------------------------------------------ vozes
    mx.voice_line(vdir, "p1_lucas_sussurro", 2.60, 0.95, 0.0, wet=0.12)
    mx.voice_line(vdir, "p1_clara_radio", 9.50, 0.85, -0.3, wet=0.14)
    mx.voice_line(vdir, "p1_marcos_infestada", 18.20, 0.9, 0.3, wet=0.14)
    mx.voice_line(vdir, "p1_lucas_viaduto", 24.70, 1.0, 0.0, wet=0.12)
    mx.voice_line(vdir, "p1_clara_entregador", 36.00, 0.85, -0.3, wet=0.14)
    mx.voice_line(vdir, "p1_marcos_visor", 42.40, 1.1, 0.3, wet=0.14)
    mx.voice_line(vdir, "p1_lucas_cuidado1", 50.75, 1.4, 0.0, wet=0.2)
    mx.voice_line(vdir, "p1_lucas_cuidado2", 55.50, 1.6, 0.0, wet=0.2)
    # --------------------------------------------------------------- ambiência
    mx.add("amb", sfx.city_air(60.0), 0, 0.55, 0.0, env="st", wet=0.0)
    mx.add("amb", sfx.lamp_hum(60.0, flicker=True), 0, 0.30, -0.35, env="st", wet=0.05)
    mx.add("amb", sfx.drip(14, 60.0, seed=4), 0, 0.5, 0.0, env="st", wet=0.4)
    mx.add("amb", sfx.siren_far(14.0), 3.0, 0.07, 0.7, dist=0.8, env="st")
    mx.add("amb", sfx.siren_far(12.0), 33.0, 0.06, -0.6, dist=0.85, env="st")
    mx.add("mus", sfx.drone(60.0), 0, 0.33, 0.0, env="st", wet=0.3)
    # ------------------------------------------------------------------ gancho
    alarm = sfx.car_alarm(1.45)
    mx.add("sfx", dsp.fade(alarm, 0.01, 0.004), 0.45, 0.8, 0.55, dist=0.25, env="st", wet=0.5)
    mx.add("sfx", sfx.metal_impact(1.2), 1.90, 1.0, 0.55, dist=0.15, env="st", wet=0.4)
    mx.add("sfx", sfx.scream_muffled(0.7), 1.97, 0.8, 0.55, dist=0.3, env="st", wet=0.3)
    # --------------------------------------------------- agacha atrás da mureta
    steps(mx, 3.7, 1.9, 2.4, "wet", 5, g=0.45)
    mx.add("sfx", sfx.cloth(0.7), 4.6, 0.6)
    mx.add("sfx", sfx.cloth(0.5), 5.7, 0.4, 0.2)
    # rádio de pilha de Clara chiando até morrer
    mx.add("sfx", sfx.radio_static(1.9, die_at=0.85), 9.0, 0.45, -0.4, env="st", wet=0.1)
    # gemidos longínquos
    mx.add("sfx", sfx.horde(7.0, 8, 60, 120), 17.0, 0.18, 0.5, dist=0.9)
    mx.add("sfx", sfx.groan(2.0, 82, "o"), 21.8, 0.35, 0.65, dist=0.7)
    # --------------------------------------------- o homem sob o viaduto (cresce)
    drag_times = [29.0, 30.8, 32.5, 34.4, 36.1, 37.9, 39.6, 41.5, 43.1, 44.9, 46.4, 48.1]
    for k, tt in enumerate(drag_times):
        g = 0.20 + 0.55 * k / (len(drag_times) - 1)
        mx.add("sfx", sfx.drag_step(0.9), tt, g, 0.12, dist=max(0.1, 0.75 - 0.06 * k), env="st", wet=0.35)
    for k, tt in enumerate([29.6, 33.4, 37.2, 41.0, 44.6, 47.6]):
        mx.add("sfx", sfx.bone_clicks(5, 2.4, seed=20 + k), tt, 0.12 + 0.08 * k, 0.12, dist=max(0.05, 0.7 - 0.1 * k), env="st", wet=0.3)
    mx.add("sfx", sfx.groan(2.4, 78, "a"), 38.9, 0.5, 0.12, dist=0.35, env="st", wet=0.4)
    mx.add("sfx", sfx.groan(1.6, 70, "o", rasp=0.6), 47.0, 0.7, 0.1, dist=0.2, env="st", wet=0.35)
    hb = sfx.heartbeat(17.0, 68, 1.2)
    ramp = np.linspace(0.1, 1.0, len(hb)).astype(np.float32) ** 1.4
    mx.add("mus", hb * ramp, 33.0, 0.8, 0.0, env="st", wet=0.0)
    # ------------------------------------------------- tensão final e a marquise
    mx.add("mus", sfx.riser(4.4, 220, 5200), 45.9, 0.55, 0.0, env="st", wet=0.2)
    mx.add("sfx", sfx.zinc_creak(1.3), 50.0, 0.8, -0.15, env="st", wet=0.4)
    mx.add("sfx", sfx.cloth(0.4), 50.3, 0.6)
    mx.add("sfx", sfx.glass_shatter(3.4, 1.0), 51.2, 1.0, 0.25, env="st", wet=0.45)
    mx.add("sfx", sfx.tile_fall(22, 5.0, seed=8), 51.6, 0.9, 0.0, env="st", wet=0.4)
    mx.add("sfx", sfx.zinc_buckle(2.6), 53.2, 1.0, -0.1, env="st", wet=0.4)
    mx.add("mus", sfx.horde(6.0, 12, 70, 150), 52.5, 0.4, 0.0, dist=0.4)
    mx.add("sfx", sfx.groan(1.6, 90, "a"), 54.0, 0.5, -0.4, dist=0.2)
    mx.add("sfx", sfx.groan(1.4, 120, "o"), 55.0, 0.5, 0.5, dist=0.2)
    steps(mx, 53.0, 4.9, 3.2, "wet", 9, g=0.35)  # eles se aproximam rápido
    # CORTE SECO
    mx.cut_after(57.95)
    # cartela final: um único golpe grave
    mx.add("mus", sfx.boom(2.0, 80), 58.3, 0.9, 0.0, env="st", wet=0.25)
    return mx


# =============================================================================
#                               PARTE 2  (60 s)
# =============================================================================
def parte2(vdir):
    mx = Mix(60.0)
    M = mx.marks
    M.update(crash=0.22, door_smash=2.05, counter_start=4.1, counter_hit=6.3, look_up=10.0,
             lanterna=11.0, cascade=13.4, marcos_grab=15.3, marcos_gone=21.0, run_back=22.9,
             door_reached=35.0, clara_grab=36.55, chain_rattle=45.3, lucas_grab=47.0, phone_drop=49.3,
             black=49.75, reboot=52.1, face=52.4, cut=59.82)
    # ------------------------------------------------------------------ vozes
    mx.voice_line(vdir, "p2_lucas_rua", 0.05, 1.35, 0.0, wet=0.2)
    mx.voice_line(vdir, "p2_clara_escada", 6.70, 0.95, -0.3, env="ga", wet=0.26)
    mx.voice_line(vdir, "p2_marcos_socorro", 15.40, 1.55, 0.45, env="ga", wet=0.3)
    mx.voice_line(vdir, "p2_lucas_chuta", 18.90, 1.55, 0.0, env="ga", wet=0.26)
    mx.voice_line(vdir, "p2_clara_vaiembora", 37.20, 1.7, -0.4, env="ga", wet=0.3)
    mx.voice_line(vdir, "p2_lucas_portao", 42.70, 1.7, 0.0, env="ga", wet=0.26)
    mx.voice_line(vdir, "p2_lucas_zumbi", 52.15, 0.9, 0.0, env="ga", wet=0.4)
    # --------------------------------------------------------------- ambiência
    air = sfx.city_air(60.0)
    amb_env = np.interp(np.arange(len(air)) / SR, [0, 2.0, 3.6, 60], [1, 1, 0.0, 0.0]).astype(np.float32)
    mx.add("amb", air * amb_env, 0, 0.5, 0.0, env="st", wet=0.0)
    gt = sfx.room_tone_gallery(60.0)
    gt_env = np.interp(np.arange(len(gt)) / SR, [0, 2.0, 3.5, 60], [0.0, 0.2, 1.0, 1.0]).astype(np.float32)
    mx.add("amb", gt * gt_env, 0, 0.8, 0.0, env="ga", wet=0.0)
    mx.add("amb", sfx.lamp_hum(60.0, 60, flicker=True), 0, 0.22, 0.2, env="ga", wet=0.05)
    mx.add("mus", sfx.drone(60.0, 49.0), 0, 0.38, 0.0, env="ga", wet=0.2)
    # ----------------------------------------------- a queda e a corrida (rua)
    mx.add("sfx", sfx.zinc_buckle(2.0)[int(1.1 * SR):], 0.0, 0.9, 0.0, env="st", wet=0.4)
    mx.add("sfx", sfx.tile_fall(26, 3.4, seed=13), 0.22, 1.0, 0.0, env="st", wet=0.4)
    mx.add("sfx", sfx.glass_shatter(1.6, 0.8), 0.28, 0.8, -0.2, env="st", wet=0.4)
    steps(mx, 0.35, 1.8, 3.4, "wet", 31, g=0.8)
    breaths(mx, 0.5, 6.0, 0.55, 0.32)
    mx.add("sfx", sfx.glass_door_smash(2.2), 2.05, 1.0, -0.15, env="st", wet=0.35)
    steps(mx, 2.5, 1.4, 3.0, "dry", 32, g=0.75, env="ga")
    # horda lá fora, já na rua
    mx.add("sfx", sfx.horde(10.0, 14, 70, 150), 3.0, 0.3, 0.0, dist=0.55)
    # balcão da lotérica
    mx.add("sfx", sfx.counter_drag(2.2), 4.1, 0.95, 0.25, env="ga", wet=0.3)
    mx.add("sfx", sfx.cloth(0.5), 3.8, 0.4)
    # --------------------------------------------- olhos na escada rolante
    mx.add("sfx", sfx.zinc_creak(2.0, True), 10.2, 0.55, 0.0, env="ga", wet=0.4)
    mx.add("mus", sfx.eye_shine_pad(5.2), 10.5, 0.5, 0.0, env="ga", wet=0.4)
    hb = sfx.heartbeat(38.0, 78, 0.7)
    mx.add("mus", hb * np.linspace(0.3, 1.0, len(hb)).astype(np.float32), 12.0, 0.85, 0.0, env="ga", wet=0.0)
    mx.add("sfx", sfx.horde(9.0, 18, 65, 140), 11.5, 0.5, 0.0, env="ga", wet=0.35)
    mx.add("sfx", sfx.escalator_cascade(3.4, 28), 13.4, 1.0, 0.1, env="ga", wet=0.4)
    mx.add("sfx", sfx.bone_clicks(10, 3.0, seed=77), 13.8, 0.4, 0.2, env="ga", wet=0.3)
    # Marcos é puxado
    mx.add("sfx", sfx.cloth(0.6), 15.2, 0.7, 0.4)
    mx.add("sfx", sfx.wet_squelch(1.4, 8), 17.0, 0.25, 0.5, env="ga")
    mx.add("sfx", sfx.fabric_rip(0.9), 17.4, 0.3, 0.5, env="ga")
    mx.add("sfx", sfx.scream_full(1.3, 780, muffle=3500), 19.2, 0.9, 0.7, dist=0.4, env="ga")
    mx.add("sfx", sfx.groan(1.8, 85, "a"), 15.8, 0.45, 0.45, env="ga")
    mx.add("sfx", sfx.groan(1.6, 100, "o"), 16.6, 0.4, 0.2, env="ga")
    # ------------------------------------------------------------ fuga
    steps(mx, 22.9, 12.2, 3.2, "dry", 41, g=0.8, env="ga")
    breaths(mx, 22.9, 35.0, 0.5, 0.36)
    steps(mx, 24.0, 11.0, 3.5, "dry", 42, g=0.45, pan_spread=0.8, dist=0.3, env="ga")  # perseguidores
    steps(mx, 25.0, 10.0, 3.7, "dry", 43, g=0.4, pan_spread=0.8, dist=0.25, env="ga")
    mx.add("sfx", sfx.horde(12.0, 20, 70, 160), 22.0, 0.65, 0.0, env="ga", wet=0.3)
    mx.add("sfx", sfx.tile_fall(12, 3.0, seed=21), 24.0, 0.45, -0.5, dist=0.2, env="ga")
    mx.add("sfx", sfx.tile_fall(10, 2.5, seed=22), 28.0, 0.4, 0.5, dist=0.2, env="ga")
    mx.add("sfx", sfx.glass_shatter(1.6, 0.8), 30.5, 0.55, 0.3, dist=0.2, env="ga")
    mx.add("mus", sfx.riser(5.0, 200, 4500), 30.0, 0.5, 0.0, env="ga", wet=0.2)
    # --------------------------------------------------- porta corta-fogo
    mx.add("sfx", sfx.door_bang(0.9), 35.2, 1.0, 0.0, env="ga", wet=0.4)
    mx.add("sfx", sfx.chain_rattle(1.5, 1.2), 35.5, 0.9, 0.0, env="ga", wet=0.4)
    mx.add("sfx", sfx.door_bang(0.9), 36.3, 1.0, 0.0, env="ga", wet=0.4)
    mx.add("sfx", sfx.chain_rattle(1.2, 1.0), 36.5, 0.9, 0.0, env="ga", wet=0.4)
    mx.add("sfx", sfx.scream_full(0.8, 1150), 36.55, 0.9, -0.4, env="ga", wet=0.3)  # Clara agarrada
    mx.add("sfx", sfx.cloth(0.5), 36.5, 0.7, -0.5)
    mx.add("sfx", sfx.groan(1.6, 95, "a"), 37.4, 0.6, -0.55, env="ga")
    mx.add("sfx", sfx.groan(1.8, 105, "o"), 40.0, 0.7, -0.4, env="ga")
    mx.add("sfx", sfx.door_bang(0.9), 43.9, 1.0, 0.0, env="ga", wet=0.4)
    mx.add("sfx", sfx.chain_rattle(2.4, 1.6), 45.3, 1.0, 0.0, env="ga", wet=0.4)
    mx.add("sfx", sfx.scream_full(1.4, 1050, muffle=5000), 45.1, 0.95, -0.7, dist=0.35, env="ga")
    mx.add("sfx", sfx.horde(6.0, 14, 70, 150), 44.0, 0.7, 0.0, env="ga", wet=0.3)
    mx.add("mus", sfx.riser(4.8, 220, 6000), 44.4, 0.7, 0.0, env="ga", wet=0.2)
    mx.add("sfx", sfx.cloth(0.5), 46.8, 0.8, 0.3)
    mx.add("sfx", sfx.fabric_rip(0.9), 47.2, 0.8, 0.3, env="ga")
    mx.add("sfx", sfx.scream_full(1.1, 560), 47.8, 1.0, 0.2, env="ga", wet=0.3)  # Lucas
    # --------------------------------- celular cai: tela morre, o mundo abafa
    mx.add("sfx", sfx.phone_drop(1.6), 49.3, 1.0, 0.0, env="ga", wet=0.15)
    mx.add("sfx", sfx.lowbat_beep(), 49.15, 0.45, 0.0, wet=0.0)
    steps(mx, 49.8, 1.7, 2.2, "dry", 51, g=0.7, pan_spread=0.5, env="ga")
    mx.add("sfx", sfx.fabric_rip(1.0), 50.1, 0.9, 0.2, env="ga")
    mx.add("sfx", sfx.wet_squelch(1.8, 11), 50.5, 0.7, -0.1, env="ga")
    mx.add("sfx", sfx.scream_full(0.9, 420, muffle=900), 50.4, 0.8, 0.0, env="ga")
    mx.add("sfx", sfx.groan(1.6, 80, "o"), 50.9, 0.6, 0.35, env="ga")
    # -------------------------------------- religa (bateria 0%) e a revelação
    mx.add("sfx", sfx.lowbat_beep(), 52.0, 0.4, 0.0, wet=0.0)
    mx.add("sfx", sfx.reboot_chime(), 52.2, 0.28, 0.0, wet=0.05)
    mx.add("mus", sfx.eye_shine_pad(7.4), 52.4, 0.2, 0.0, env="ga", wet=0.5)
    mx.add("sfx", sfx.groan(3.0, 62, "o", rasp=0.5), 52.7, 0.14, -0.2, env="ga", wet=0.5)
    mx.add("sfx", sfx.bone_clicks(7, 4.5, seed=91), 54.5, 0.18, 0.3, env="ga", wet=0.4)
    mx.add("sfx", sfx.static_burst(0.12), 59.6, 0.5, 0.0, wet=0.0)
    mx.cut_after(59.82)
    return mx


def main(part, vdir, out):
    os.makedirs(out, exist_ok=True)
    mx = parte1(vdir) if part == 1 else parte2(vdir)
    path = os.path.join(out, f"mix_parte{part}.wav")
    if part == 2:
        # entre a queda do celular e o religamento o microfone fica no chão (abafado)
        mx.render_muffle_window = (49.35, 52.1)
        j = mx.render_with_window(path)
    else:
        j = mx.render(path)
    cues = dict(duration=mx.dur, marks=mx.marks, voices=mx.voices_meta, loudness=j)
    with open(os.path.join(out, f"cues_parte{part}.json"), "w") as f:
        json.dump(cues, f)
    print("parte", part, "ok  LUFS in:", j["input_i"], "TP:", j["input_tp"])


def _render_with_window(self, out_wav):
    """Como render(), mas abafa só entre muffle_window[0] e [1]."""
    a, b = self.render_muffle_window
    v_env = dsp.env_follow(self.voice.mean(axis=1), 40)
    amb = dsp.duck_fast(self.amb, v_env, 0.5, 0.04, 0.5)
    mus = dsp.duck_fast(self.mus, v_env, 0.6, 0.04, 0.6)
    sf_ = dsp.duck_fast(self.sfx, v_env, 0.36, 0.03, 0.3)
    r_st = dsp.stereo_reverb(self.send_st, IR_STREET_L, IR_STREET_R, 1.0)[: self.n] * 0.9
    r_ga = dsp.stereo_reverb(self.send_ga, IR_GAL_L, IR_GAL_R, 1.0)[: self.n] * 0.9
    r_st = np.pad(r_st, ((0, max(0, self.n - len(r_st))), (0, 0)))
    r_ga = np.pad(r_ga, ((0, max(0, self.n - len(r_ga))), (0, 0)))
    m = self.voice + sf_ + amb + mus + r_st + r_ga
    i, k = int(a * SR), int(b * SR)
    seg = np.stack([dsp.lp(m[i:k, c], 900, 2) for c in range(2)], axis=1) * 0.75
    xf = int(0.03 * SR)
    seg[:xf] = seg[:xf] * np.linspace(0, 1, xf)[:, None] + m[i:i + xf] * np.linspace(1, 0, xf)[:, None]
    seg[-xf:] = seg[-xf:] * np.linspace(1, 0, xf)[:, None] + m[k - xf:k] * np.linspace(0, 1, xf)[:, None]
    m[i:k] = seg
    m = dsp.softclip(m * 0.9, 1.2)
    sf.write(out_wav + ".raw.wav", m, SR)
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", out_wav + ".raw.wav", "-af",
        "highpass=f=60,lowpass=f=15000,acompressor=threshold=-26dB:ratio=3.2:attack=4:release=220:makeup=3,alimiter=limit=0.97",
        out_wav + ".agc.wav"], check=True)
    j = dsp.loudnorm_file(out_wav + ".agc.wav", out_wav, -14.0, -1.5)
    for s in (".raw.wav", ".agc.wav"):
        os.remove(out_wav + s)
    return j


Mix.render_with_window = _render_with_window

if __name__ == "__main__":
    main(int(sys.argv[1]), sys.argv[2], sys.argv[3])
