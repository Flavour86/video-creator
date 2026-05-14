// Mock data for the prototype.

const TRANSCRIPT = [
  "Most editing tools fight you when you have a clear script in your head.",
  "You record voice, you write transcript, you collect images, then everything has to be lined up by hand.",
  "This tool flips that order.",
  "It treats the transcript as the source of truth and the voice as the timing layer.",
  "Forced alignment turns sentences into time ranges.",
  "Drop an image onto a sentence and the editor knows when it should appear.",
  "Re-record the voice and your assignments survive — only the resolved timestamps shift.",
  "Phase one is local-only. No cloud, no AI generation, no surprise bills.",
  "A folder on your disk is the project. Voice, transcript, media, renders, cache.",
  "Open the folder elsewhere — same project. Zip it and share — works.",
  "The editor itself is a single browser tab over a Python sidecar.",
  "WhisperX runs alignment with the transcript as reference text, never re-transcribing.",
  "On a Blackwell GPU it finishes a fifteen-minute audio in under a minute.",
  "On a CPU it takes a few minutes, still inside the work loop.",
  "ffmpeg does the composition with one filtergraph per render.",
  "Cached clips per foreground item make iteration cheap.",
  "Move an item in time and the cache stays warm — only recomposition runs.",
  "Two render presets ship out of the gate: draft at 720p and final at 1080p.",
  "Final lands inside YouTube's transcoder cleanly with no warnings.",
  "Phase two adds AI generation routed entirely to serverless GPUs.",
  "Phase three productizes once the workflow earns its keep.",
];

const SENTENCES_ORPHAN_IDX = 20;
const SENTENCES = TRANSCRIPT.map((text, i) => {
  const start = i * 6.4 + 0.3 + (i % 3) * 0.2;
  const end = start + 4.8 + (i % 4) * 0.4;
  const conf = 0.78 + (Math.sin(i * 1.7) * 0.5 + 0.5) * 0.21;
  return {
    idx: i + 1,
    start, end,
    text,
    conf: Math.round(conf * 100) / 100,
    orphan: i === SENTENCES_ORPHAN_IDX,
  };
});

const fmtTC = (s, withMs = true) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  if (!withMs) return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
};

const PROJECTS = [
  { name: "Tokyo Essay", path: "E:\\video-projects\\tokyo-essay", voice: "15:42", sentences: 164, media: 38, thumb: "night", lastOpened: "2 hours ago", rendered: true, renderFile: "final-2026-05-06-1530.mp4", renderStatus: "rendered" },
  { name: "Camera Test Script", path: "E:\\video-projects\\camera-test", voice: "03:28", sentences: 29, media: 7, thumb: "warm", lastOpened: "Yesterday", renderStatus: "rendering" },
  { name: "Lighting Notes", path: "D:\\renders\\lighting-notes", voice: "08:05", sentences: 72, media: 18, thumb: "cool", lastOpened: "3 days ago", renderStatus: "queued" },
  { name: "Shibuya at Night", path: "E:\\video-projects\\shibuya-night", voice: "12:11", sentences: 121, media: 24, thumb: "olive", lastOpened: "Last week", renderStatus: "failed" },
];

const MEDIA = [
  { id: "m1", name: "tokyo-skyline.jpg", kind: "image", thumb: "night", w: 4032, h: 2268, size: "3.4 MB" },
  { id: "m2", name: "station-intro.mp4", kind: "video", thumb: "station", dur: "00:12", size: "18.6 MB" },
  { id: "m3", name: "callout-map.png", kind: "image", thumb: "map", w: 1920, h: 1080, size: "0.9 MB" },
  { id: "m4", name: "quote-card.png", kind: "image", thumb: "card", w: 1920, h: 1080, size: "0.6 MB" },
  { id: "m5", name: "crowd-cross.jpg", kind: "image", thumb: "crowd", w: 5472, h: 3648, size: "5.1 MB" },
  { id: "m6", name: "neon-lights.jpg", kind: "image", thumb: "lights", w: 4032, h: 2688, size: "4.2 MB" },
  { id: "m7", name: "yamanote-line.mp4", kind: "video", thumb: "train", dur: "00:08", size: "12.8 MB" },
  { id: "m8", name: "ramen-shop.jpg", kind: "image", thumb: "food", w: 4032, h: 2268, size: "3.9 MB" },
];

const MEDIA_BY_ID = Object.fromEntries(MEDIA.map(m => [m.id, m]));

const thumbGrad = (k) => ({
  night:   "linear-gradient(135deg, oklch(0.35 0.08 280), oklch(0.45 0.10 50))",
  station: "linear-gradient(135deg, oklch(0.30 0.04 30), oklch(0.50 0.10 40))",
  map:     "linear-gradient(135deg, oklch(0.32 0.06 230), oklch(0.45 0.10 240))",
  card:    "linear-gradient(135deg, oklch(0.35 0.04 60), oklch(0.50 0.06 70))",
  crowd:   "linear-gradient(135deg, oklch(0.28 0.05 20), oklch(0.42 0.08 30))",
  lights:  "linear-gradient(135deg, oklch(0.32 0.10 320), oklch(0.50 0.14 30))",
  train:   "linear-gradient(135deg, oklch(0.30 0.06 150), oklch(0.42 0.08 200))",
  food:    "linear-gradient(135deg, oklch(0.34 0.08 50), oklch(0.46 0.10 30))",
  warm:    "linear-gradient(135deg, oklch(0.34 0.07 60), oklch(0.48 0.09 40))",
  cool:    "linear-gradient(135deg, oklch(0.30 0.05 220), oklch(0.42 0.08 240))",
  olive:   "linear-gradient(135deg, oklch(0.32 0.04 110), oklch(0.44 0.06 90))",
}[k] || "linear-gradient(135deg, oklch(0.30 0.03 60), oklch(0.42 0.04 60))");

// Layer model — top→bottom rendering order matches array order (SUB first, BG last)
// kind: "sub" | "fg" | "pip" | "bg"
// items: array of { id, mediaId, sentences:[lo,hi], start, end, motion:{kind,easing}, transitions:{in,out}, pip:{posX,posY,size,radius,opacity} }
const INITIAL_LAYERS = [
  {
    id: "L-sub", kind: "sub", name: "Subtitles",
    items: [{ id: "sub-all", auto: true, label: "auto from transcript · 164 cues", style: "default" }],
  },
  {
    id: "L-pip-2", kind: "pip", name: "PiP · z4",
    items: [
      { id: "pip-002", mediaId: "m4", sentences: [9,11], start: 51, end: 70.0,
        pip: { posX: 2, posY: 2, size: 22, radius: 16, opacity: 90 },
        motion: { kind: "static", easing: "linear" },
        transitions: { in: "fade", out: "fade" } },
      { id: "pip-003", mediaId: "m5", sentences: [14,15], start: 88.0, end: 96.5,
        pip: { posX: 2, posY: 2, size: 22, radius: 16, opacity: 90 },
        motion: { kind: "static", easing: "linear" },
        transitions: { in: "fade", out: "fade" } },
    ],
  },
  {
    id: "L-pip-1", kind: "pip", name: "PiP · z3",
    items: [
      { id: "pip-001", mediaId: "m3", sentences: [6, 10], start: 32.0, end: 63.0,
        pip: { posX: 2, posY: 2, size: 30, radius: 12, opacity: 100 },
        motion: { kind: "static", easing: "linear" },
        transitions: { in: "fade", out: "fade" } },
    ],
  },
  {
    id: "L-fg-1", kind: "fg", name: "Foreground · z1",
    items: [
      { id: "fg-001", mediaId: "m2", sentences: [3,4], start: 13.8, end: 25.1,
        motion: { kind: "ken_burns", easing: "ease_in_out" },
        transitions: { in: "fade", out: "cut" } },
      { id: "fg-002", mediaId: "m1", sentences: [6,7], start: 33.5, end: 47.2, active: true,
        motion: { kind: "ken_burns", easing: "ease_in_out" },
        transitions: { in: "fade", out: "cut" } },
      { id: "fg-004", mediaId: "m4", sentences: [10,11], start: 60.5, end: 73.1,
        motion: { kind: "zoom_in", easing: "ease_out" },
        transitions: { in: "fade", out: "fade" } },
    ],
  },
  {
    id: "L-bg", kind: "bg", name: "Background",
    items: [
      { id: "bg-001", mediaId: "m6", mediaIds: ["m6", "m8", "m5"], sentences: [1,21], start: 0, end: 942,
        motion: { kind: "ken_burns", easing: "linear" },
        transitions: { in: "cut", out: "cut" },
        crossfade: 0.6 },
    ],
  },
];

window.SENTENCES = SENTENCES;
window.PROJECTS = PROJECTS;
window.MEDIA = MEDIA;
window.MEDIA_BY_ID = MEDIA_BY_ID;
window.INITIAL_LAYERS = INITIAL_LAYERS;
window.thumbGrad = thumbGrad;
window.fmtTC = fmtTC;
