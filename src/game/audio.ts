let ctx: AudioContext | null = null;
let impactBuf: AudioBuffer | null = null;
const shotBuf: Record<string, AudioBuffer | null> = { pistol: null, ar: null, shotgun: null };
const SHOT_SRC: Record<string, string> = {
  pistol: "/audio/pistol.mp3",
  ar: "/audio/rifle.mp3",
  shotgun: "/audio/shotgun.mp3",
};

function decodeInto(key: string, url: string) {
  if (!ctx) return;
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((b) => ctx!.decodeAudioData(b))
    .then((buf) => {
      if (key === "impact") impactBuf = buf;
      else shotBuf[key] = buf;
    })
    .catch(() => {});
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  if (!impactBuf) decodeInto("impact", "/audio/impact.mp3");
  for (const [id, url] of Object.entries(SHOT_SRC)) {
    if (!shotBuf[id]) decodeInto(id, url);
  }
}

function getCtx() {
  if (!ctx) unlockAudio();
  return ctx;
}

function synthShot(kind: string) {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const dur = kind === "shotgun" ? 0.28 : kind === "pistol" ? 0.1 : 0.14;
  const noise = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.pow(1 - i / data.length, kind === "shotgun" ? 1.6 : 2.6);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ac.createBufferSource();
  src.buffer = noise;
  const filter = ac.createBiquadFilter();
  filter.type = kind === "shotgun" ? "lowpass" : "bandpass";
  filter.frequency.value = kind === "pistol" ? 2400 : kind === "shotgun" ? 900 : 1600;
  filter.Q.value = kind === "shotgun" ? 0.4 : 0.8;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(kind === "shotgun" ? 0.7 : 0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  src.start(t);
}

export function playGunshot(kind: string = "ar") {
  const ac = getCtx();
  if (!ac) return;
  const buf = shotBuf[kind] ?? shotBuf.ar;
  if (buf) {
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = kind === "shotgun" ? 0.85 : kind === "pistol" ? 0.6 : 0.72;
    src.connect(g);
    g.connect(ac.destination);
    src.start();
    return;
  }
  synthShot(kind);
}

export function playImpact() {
  const ac = getCtx();
  if (!ac) return;
  if (impactBuf) {
    const src = ac.createBufferSource();
    src.buffer = impactBuf;
    const g = ac.createGain();
    g.gain.value = 0.45;
    src.connect(g);
    g.connect(ac.destination);
    src.start();
    return;
  }
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.16);
}

export function playEmpty() {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "square";
  osc.frequency.value = 90;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}
