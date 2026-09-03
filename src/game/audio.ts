let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();

async function ensure() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

export async function unlockAudio() {
  try {
    await ensure();
  } catch {
    /* ignore */
  }
}

export async function loadSfx(name: string, url: string) {
  const ac = await ensure();
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  buffers.set(name, await ac.decodeAudioData(buf));
}

export function playSfx(name: string, gain = 0.7) {
  if (!ctx || !buffers.has(name)) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers.get(name)!;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(ctx.destination);
  src.start();
}
