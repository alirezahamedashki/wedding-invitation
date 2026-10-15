"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const Envelope3D = dynamic(() => import("@/components/Envelope3D"), {
  ssr: false,
  loading: () => <div className="canvas-loading"><span /></div>,
});

type Phase = "sealed" | "opening" | "open";
type AudioEngine = {
  context: AudioContext;
  master: GainNode;
  music: GainNode;
  source?: AudioBufferSourceNode;
  fallbackTimer?: ReturnType<typeof setInterval>;
};

// Real-song segment: seconds 6 → 60, looped seamlessly.
const SONG_URL = "/music/khanoomam.mp3";
const SONG_START = 6;
const SONG_END = 60;

const MUSIC_CHORDS = [
  [261.63, 329.63, 392, 523.25],
  [220, 261.63, 329.63, 440],
  [174.61, 220, 261.63, 349.23],
  [196, 246.94, 293.66, 392],
];

function makeReverb(context: AudioContext) {
  const convolver = context.createConvolver();
  const length = Math.floor(context.sampleRate * 2.4);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.8);
    }
  }
  convolver.buffer = buffer;
  return convolver;
}

function playTone(
  context: AudioContext,
  dry: AudioNode,
  reverb: AudioNode,
  frequency: number,
  at: number,
  duration = 2.5,
  volume = 0.04,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.035);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain);
  gain.connect(dry);
  gain.connect(reverb);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.1);
}

function playPhrase(context: AudioContext, dry: AudioNode, reverb: AudioNode, start: number) {
  MUSIC_CHORDS.forEach((chord, chordIndex) => {
    const chordAt = start + chordIndex * 2.65;
    chord.forEach((frequency, noteIndex) => {
      playTone(context, dry, reverb, frequency, chordAt + noteIndex * 0.19);
    });
    playTone(context, dry, reverb, chord[0] / 2, chordAt, 3.3, 0.026);
  });
}

function playEnvelopeSound(context: AudioContext, destination: AudioNode) {
  const now = context.currentTime;
  const duration = 1.45;
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  let smooth = 0;
  for (let i = 0; i < data.length; i += 1) {
    smooth = smooth * 0.84 + (Math.random() * 2 - 1) * 0.16;
    data[i] = smooth;
  }

  const sealClick = context.createOscillator();
  const clickGain = context.createGain();
  sealClick.type = "triangle";
  sealClick.frequency.setValueAtTime(245, now + 0.06);
  sealClick.frequency.exponentialRampToValueAtTime(120, now + 0.25);
  clickGain.gain.setValueAtTime(0.0001, now + 0.05);
  clickGain.gain.exponentialRampToValueAtTime(0.075, now + 0.075);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.27);
  sealClick.connect(clickGain);
  clickGain.connect(destination);
  sealClick.start(now + 0.05);
  sealClick.stop(now + 0.3);

  const crackle = context.createBufferSource();
  const crackFilter = context.createBiquadFilter();
  const crackGain = context.createGain();
  crackle.buffer = buffer;
  crackFilter.type = "bandpass";
  crackFilter.frequency.value = 1850;
  crackFilter.Q.value = 0.7;
  crackGain.gain.setValueAtTime(0.0001, now + 0.12);
  crackGain.gain.exponentialRampToValueAtTime(0.12, now + 0.17);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.47);
  crackle.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(destination);
  crackle.start(now + 0.12);

  const paper = context.createBufferSource();
  const paperFilter = context.createBiquadFilter();
  const paperGain = context.createGain();
  paper.buffer = buffer;
  paperFilter.type = "lowpass";
  paperFilter.frequency.setValueAtTime(650, now + 0.58);
  paperFilter.frequency.exponentialRampToValueAtTime(1600, now + 1.18);
  paperGain.gain.setValueAtTime(0.0001, now + 0.55);
  paperGain.gain.exponentialRampToValueAtTime(0.1, now + 0.72);
  paperGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
  paper.connect(paperFilter);
  paperFilter.connect(paperGain);
  paperGain.connect(destination);
  paper.start(now + 0.55);
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 7 8.5H3v7h4l4 3.5V5Z"/><path d="m16 9 5 5m0-5-5 5"/></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 7 8.5H3v7h4l4 3.5V5Z"/><path d="M15.5 8.2a5 5 0 0 1 0 7.6M18 5.7a8.5 8.5 0 0 1 0 12.6"/></svg>
  );
}

function ReplayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9A8 8 0 1 1 4 14"/><path d="M4.5 4.5V9H9"/></svg>;
}

/* ---------- Persian ceremony toolkit ---------- */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}
function padFa(value: number): string {
  return toFa(value < 10 ? `0${value}` : value);
}

// Tuesday 1405/07/28, 20:00 in Asia/Tehran.
// Iran stays on fixed UTC+3:30 year-round (no DST), so the wall time is
// pinned explicitly with its zone offset — same instant as 16:30 UTC.
const CEREMONY_START = Date.parse("2026-10-20T20:00:00+03:30");

// Map links — real venue links for Omaraat-e Aghd, Shabhaye Royaei.
const MAP_LINKS = {
  neshan: "https://nshn.ir/d67bvBycGxWz1i",
  balad: "https://balad.ir/p/3MxzcmG3wQijnv",
};

function NeshanIcon() {
  return <img src="/wedding-invitation/icons/neshan-logo.png" alt="" aria-hidden="true" width={62} height={62} loading="lazy" decoding="async" />;
}

function BaladIcon() {
  return <img src="/wedding-invitation/icons/balad-logo.png" alt="" aria-hidden="true" width={62} height={62} loading="lazy" decoding="async" />;
}

function useCountdown(target: number) {
  const calc = () => {
    const diff = Math.max(0, target - Date.now());
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor(diff / 3600000) % 24,
      m: Math.floor(diff / 60000) % 60,
      s: Math.floor(diff / 1000) % 60,
      done: diff <= 0,
    };
  };
  // Zero-first render avoids hydration mismatch (prerender clock ≠ client clock).
  const [t, setT] = useState({ d: 0, h: 0, m: 0, s: 0, done: false });
  useEffect(() => {
    setT(calc());
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return t;
}

function ScratchCountdown({ resetSignal }: { resetSignal: string }) {
  const t = useCountdown(CEREMONY_START);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const reduced = useRef(false);

  const paintCover = () => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = box.clientWidth;
    const h = box.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    const gold = ctx.createLinearGradient(0, 0, w, h);
    gold.addColorStop(0, "#e7cd97");
    gold.addColorStop(0.45, "#d3ab6b");
    gold.addColorStop(0.55, "#c49a58");
    gold.addColorStop(1, "#e2c78f");
    ctx.fillStyle = gold;
    ctx.fillRect(0, 0, w, h);
    // Fine diagonal sheen.
    ctx.strokeStyle = "rgba(255,250,235,.35)";
    ctx.lineWidth = 1;
    for (let x = -h; x < w + h; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(122,90,40,.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(10.5, 10.5, w - 21, h - 21);
    ctx.fillStyle = "#5d4a22";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `400 ${Math.max(12, Math.min(16, w / 24))}px Vazirmatn, Tahoma, sans-serif`;
    ctx.fillText("زمان باقی‌مانده تا جشن اینجاست", w / 2, h / 2);
  };

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) {
      setRevealed(true);
      return;
    }
    setRevealed(false);
    paintCover();
    if (document.fonts) {
      void document.fonts.ready.then(() => {
        if (!revealed) paintCover();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const eraseAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box || revealed) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(22, rect.width / 14), 0, Math.PI * 2);
    ctx.fill();
  };

  const measureCleared = () => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    const step = 7;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * step) {
      total += 1;
      if (data[i] < 90) clear += 1;
    }
    return total ? clear / total : 0;
  };

  const cells: Array<[string, string]> = t.done
    ? [["♡", "فرا رسید"]]
    : [
        [padFa(t.s), "ثانیه"],
        [padFa(t.m), "دقیقه"],
        [padFa(t.h), "ساعت"],
        [toFa(t.d), "روز"],
      ];

  return (
    <div className="scratch-block">
      <p className="scratch-title">زمان باقی‌مانده تا جشن</p>
      <div
        ref={boxRef}
        className={`scratch-box${revealed ? " is-revealed" : ""}`}
        onPointerDown={(e) => {
          if (revealed) return;
          drawing.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          eraseAt(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || revealed) return;
          eraseAt(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (!revealed && measureCleared() > 0.28) setRevealed(true);
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      >
        <div className="count-grid" aria-live="polite">
          {cells.map(([v, label]) => (
            <div key={label}>
              <strong>{v}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        {!revealed && !reduced.current && (
          <canvas ref={canvasRef} className="scratch-cover" aria-label="روی پوشش بکشید تا زمان باقی‌مانده دیده شود" />
        )}
      </div>
      {!revealed && !reduced.current && (
        <p className="scratch-hint">با انگشت بتراشید</p>
      )}
    </div>
  );
}

export default function WeddingInvitation() {
  const [phase, setPhase] = useState<Phase>("sealed");
  const [muted, setMuted] = useState(false);
  const [guestName, setGuestName] = useState("مهمان عزیز");
  const [rsvp, setRsvp] = useState<"yes" | "no" | null>(null);
  const [envelopeReady, setEnvelopeReady] = useState(false);
  const audioRef = useRef<AudioEngine | null>(null);
  const invitationRef = useRef<HTMLElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const guest = new URLSearchParams(window.location.search).get("guest");
    if (guest?.trim()) setGuestName(guest.trim().slice(0, 64));
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (audioRef.current) {
        try {
          audioRef.current.source?.stop();
        } catch {
          /* already stopped */
        }
        if (audioRef.current.fallbackTimer) clearInterval(audioRef.current.fallbackTimer);
        void audioRef.current.context.close();
      }
    };
  }, []);

  // Generative fallback: only used if the song file cannot load/decode.
  const startGenerativeFallback = (context: AudioContext, dry: GainNode, reverb: AudioNode) => {
    const engine = audioRef.current;
    if (!engine || engine.context !== context) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      playTone(context, dry, reverb, frequency, context.currentTime + 0.5 + index * 0.2, 2.7, 0.055);
    });
    playPhrase(context, dry, reverb, context.currentTime + 1.75);
    engine.fallbackTimer = setInterval(() => {
      playPhrase(context, dry, reverb, context.currentTime + 0.15);
    }, 10600);
  };

  const startAudio = async () => {
    if (audioRef.current) return;
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    void context.resume();
    const master = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    const reverb = makeReverb(context);
    master.gain.value = 0.72;
    dry.gain.value = 0.62;
    wet.gain.value = 0.28;
    dry.connect(master);
    reverb.connect(wet);
    wet.connect(master);
    master.connect(context.destination);

    // Dedicated music bus with a soft fade-in so the song never starts harsh.
    const music = context.createGain();
    music.gain.value = 0.0001;
    music.connect(dry);
    music.connect(reverb);
    music.gain.exponentialRampToValueAtTime(0.85, context.currentTime + 2.5);
    audioRef.current = { context, master, music };

    // Signature paper-opening sound stays untouched.
    playEnvelopeSound(context, master);

    try {
      const response = await fetch(SONG_URL);
      if (!response.ok) throw new Error(`song fetch ${response.status}`);
      const data = await response.arrayBuffer();
      const song = await context.decodeAudioData(data);
      const engine = audioRef.current;
      if (!engine || engine.context !== context) return; // replayed meanwhile
      const source = context.createBufferSource();
      source.buffer = song;
      const startAt = Math.min(SONG_START, Math.max(0, song.duration - 3));
      const endAt = Math.min(SONG_END, song.duration - 0.2);
      if (endAt > startAt + 2) {
        source.loop = true;
        source.loopStart = startAt;
        source.loopEnd = endAt;
        source.connect(music);
        source.start(context.currentTime + 0.1, startAt);
      } else {
        source.connect(music);
        source.start();
      }
      engine.source = source;
    } catch {
      startGenerativeFallback(context, dry, reverb);
    }
  };

  const openEnvelope = () => {
    if (phase !== "sealed") return;
    setPhase("opening");
    void startAudio();
    openTimerRef.current = setTimeout(() => setPhase("open"), 4000);
  };

  const toggleSound = () => {
    const engine = audioRef.current;
    if (!engine) return;
    const nextMuted = !muted;
    setMuted(nextMuted);
    const now = engine.context.currentTime;
    engine.master.gain.cancelScheduledValues(now);
    engine.master.gain.setValueAtTime(Math.max(engine.master.gain.value, 0.0001), now);
    engine.master.gain.exponentialRampToValueAtTime(nextMuted ? 0.0001 : 0.72, now + 0.35);
  };

  const replay = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    if (audioRef.current) {
      try {
        audioRef.current.source?.stop();
      } catch {
        /* already stopped */
      }
      if (audioRef.current.fallbackTimer) clearInterval(audioRef.current.fallbackTimer);
      void audioRef.current.context.close();
      audioRef.current = null;
    }
    if (invitationRef.current) invitationRef.current.scrollTop = 0;
    setMuted(false);
    setRsvp(null);
    setPhase("sealed");
  };

  return (
    <main className={`wedding-experience phase-${phase}`}>
      <section className="envelope-cover" aria-hidden={phase === "open"}>
        <Envelope3D phase={phase} onOpen={openEnvelope} onReady={() => setEnvelopeReady(true)} />
        {!envelopeReady && (
          <div className="canvas-loading" aria-hidden="true"><span /></div>
        )}
        {phase === "opening" && (
          <div className="opening-reveal-effect" aria-hidden="true">
            <span className="reveal-wash" />
            <span className="reveal-rays" />
            <span className="reveal-curtain" />
            <span className="reveal-flare" />
            <span className="reveal-mote m1" />
            <span className="reveal-mote m2" />
            <span className="reveal-mote m3" />
            <span className="reveal-mote m4" />
            <span className="reveal-mote m5" />
            <span className="reveal-mote m6" />
          </div>
        )}
        {phase === "sealed" && envelopeReady && (
          <button
            type="button"
            className="seal-hit-button"
            onClick={openEnvelope}
            aria-label="Open the wedding invitation"
          />
        )}
      </section>

      <section ref={invitationRef} className="invitation" aria-hidden={phase !== "open"}>
        <nav className="invitation-controls" aria-label="Invitation controls">
          <button type="button" onClick={toggleSound} aria-label={muted ? "Turn sound on" : "Mute sound"}>
            <SpeakerIcon muted={muted} />
          </button>
          <button type="button" onClick={replay} aria-label="Replay envelope animation"><ReplayIcon /></button>
        </nav>

        <section className="couple" dir="rtl" lang="fa" id="top">
          <div className="couple-photo">
            <img
              src="/wedding-invitation/images/bouquet-1200.webp"
              alt="آغاز برای همیشه ما — علیرضا و آتوسا"
              width={1200}
              height={800}
              decoding="async"
              fetchPriority="high"
            />
            <div className="photo-light" aria-hidden="true">
              <span className="pl-wash" />
              <span className="pl-rays" />
              <span className="pl-sheen" />
              <span className="pl-flare" />
            </div>
          </div>
          <div className="couple-body">
            <div className="monogram" dir="ltr">A <i>&amp;</i> A</div>
            <p className="couple-eyebrow">✦ جشن عقد ✦</p>
            <h2 className="couple-names"><span>علیرضا</span><i>&amp;</i><span>آتوسا</span></h2>
            <p className="couple-en" dir="ltr">Alireza &amp; Atousa</p>
            <p className="couple-line">در روزی که عشق رنگ حقیقت به رویاهایمان می‌زند<br />ما تصمیم گرفتیم زندگیمان را به هم گره بزنیم.<br />با افتخار و شادی شما را دعوت می‌کنیم</p>
            <div className="date-grid">
              <div><span>روز</span><strong>سه‌شنبه</strong></div>
              <div><span>تاریخ</span><strong>{toFa("28")} مهر {toFa("1405")}</strong></div>
              <div><span>ساعت</span><strong>{toFa("20")} تا {toFa("23")}</strong></div>
            </div>
            <div className="venue">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 6.2 12 6.5 12.3a.7.7 0 0 0 1 0C12.8 21 19 14.2 19 9a7 7 0 0 0-7-7Z" /><circle cx="12" cy="9" r="2.6" /></svg>
              <p><strong>عمارت عقد شب‌های رویایی</strong><span>کرج، گوهردشت، بلوار استقلال بین خیابان ۸ و ۹</span></p>
            </div>
            <div className="gap-thread" aria-hidden="true"><span /></div>
          </div>
        </section>

        <section className="ceremony" dir="rtl" lang="fa" id="countdown">
          <ScratchCountdown key={phase} resetSignal={phase} />

          <div className="gap-thread gap-b" aria-hidden="true"><span /></div>

          <div className="maps-block">
            <p className="maps-title">مسیریابی به محل مراسم</p>
            <div className="maps-row">
              <a className="map-btn" href={MAP_LINKS.neshan} target="_blank" rel="noreferrer" aria-label="مسیریابی با نشان">
                <NeshanIcon />
                <span>نشان</span>
              </a>
              <a className="map-btn" href={MAP_LINKS.balad} target="_blank" rel="noreferrer" aria-label="مسیریابی با بلد">
                <BaladIcon />
                <span>بلد</span>
              </a>
            </div>
          </div>

          <div className="gap-thread gap-c" aria-hidden="true"><span /></div>
        </section>

      </section>
    </main>
  );
}
