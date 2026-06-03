// Editor screen — transcript-anchored video editor.
// Top→bottom layer order in UI: SUB · PiP layers · FG layers · BG.

const PROJECT_DURATION = 942;

const RESOLUTIONS = {
  "1080p": { w: 1920, h: 1080, label: "1080p · 16:9", aspect: 16 / 9 },
  "720p": { w: 1280, h: 720, label: "720p · 16:9", aspect: 16 / 9 },
  "vert": { w: 1080, h: 1920, label: "9:16 · vertical", aspect: 9 / 16 }
};

// ───────── Transcript ─────────

const Transcript = ({
  sentences,
  selection,
  currentSentence,
  onSelect,
  onContext,
  editingSentence,
  sentenceDraft,
  onStartEdit,
  onDraftChange,
  onCommitEdit,
  onCancelEdit
}) => {
  return (
    <div className="tcol">
      <div className="tx-search">
        <Icon name="search" />
        <input placeholder="Search transcript… (⌘F)" />
        <span className="kbd">⌘F</span>
      </div>
      <div className="tx-bar">
        <span className="label">Transcript · {sentences.length} aligned</span>
        {selection.length > 0 &&
        <span className="selrange">{selection.length === 1 ? `s${selection[0]}` : `s${selection[0]}–s${selection[selection.length - 1]}`}</span>
        }
      </div>
      <div className="tx-list">
        {sentences.map((s, i) => {
          const isSel = selection.includes(s.idx);
          const isFirst = isSel && (i === 0 || !selection.includes(sentences[i - 1]?.idx));
          const isLast = isSel && (i === sentences.length - 1 || !selection.includes(sentences[i + 1]?.idx));
          const isNow = currentSentence === s.idx;
          const isEditing = editingSentence === s.idx;
          const cls = ["sentence"];
          if (isSel) cls.push("sel");
          if (isFirst) cls.push("first");
          if (isLast) cls.push("last");
          if (isNow) cls.push("now");
          if (isEditing) cls.push("editing");
          if (s.orphan) cls.push("orphan");
          return (
            <div key={s.idx} className={cls.join(" ")}
            onClick={(e) => onSelect(s.idx, e)}
            onContextMenu={(e) => {e.preventDefault();onContext(s.idx, e);}}>
              <span className="idx">{s.idx}</span>
              <span className="tc">{fmtTC(s.start, false)}–{fmtTC(s.end, false)}</span>
              <span className={"text " + (isEditing ? "sentence-edit-shell" : "")}>
                {isEditing ?
                <>
                  <span className="sentence-edit-ghost">{s.text}</span>
                  <textarea
                    className="sentence-edit-input"
                    value={sentenceDraft}
                    autoFocus
                    rows={1}
                    aria-label={`Edit sentence ${s.idx}`}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onDraftChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onCommitEdit(s.idx);
                      }
                      if (e.key === "Escape") onCancelEdit();
                    }} />
                </> :
                s.text}
              </span>
              <span className="edit-actions" onClick={(e) => e.stopPropagation()}>
                {isEditing ?
                <>
                  <button className="sentence-edit-btn" title="Save sentence" onClick={() => onCommitEdit(s.idx)}><Icon name="check" size={12} /></button>
                  <button className="sentence-edit-btn" title="Cancel edit" onClick={onCancelEdit}><Icon name="x" size={12} /></button>
                </> :
                <button className="sentence-edit-btn" title="Edit sentence" onClick={() => onStartEdit(s.idx)}><Icon name="edit" size={12} /></button>}
              </span>
            </div>);

        })}
      </div>
    </div>);

};

const WatermarkModal = ({ open, onClose, assetId, onSelect, enabled, onEnabledChange, settings, onSettingsChange }) => {
  const [uploadedName, setUploadedName] = React.useState(null);
  const fileInputRef = React.useRef(null);
  React.useEffect(() => {
    if (open) setUploadedName(null);
  }, [open, assetId]);
  if (!open) return null;
  const selected = MEDIA_BY_ID[assetId];
  const wm = settings || { posX: 5, posY: 8, size: 8, opacity: 49 };
  const setWm = (patch) => onSettingsChange({ ...wm, ...patch });
  const defaultWatermarkName = selected?.id === "m3" ? "微信图片_20260518160409_43_138.jpg" : selected?.name;
  const currentName = uploadedName || defaultWatermarkName || "No watermark selected";
  const currentKind = uploadedName ? "image" : selected?.kind || "image";
  const replaceFromDisk = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedName(file.name);
    if (selected) onSelect(selected.id);
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal narrow watermark-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Watermark asset</h2>
            <p>Pick an image watermark for the render overlay.</p>
          </div>
          <button className="iconbtn" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          <div className="wm-toolbar">
            <label className="switch-row">
              <button
                type="button"
                role="switch"
                aria-checked={!!enabled}
                className={"switch " + (enabled ? "on" : "")}
                onClick={() => onEnabledChange(!enabled)}>
                <span className="knob" />
              </button>
              <span className="switch-label">{enabled ? "Watermark enabled" : "Watermark disabled"}</span>
            </label>
            <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" onChange={replaceFromDisk} />
            <button className="btn ghost" onClick={() => fileInputRef.current?.click()}>
              <Icon name="folder" size={13} /> Import from disk...
            </button>
          </div>
          <div className="wm-single-row">
            <div
              className={"single-asset-card " + (enabled ? "on" : "")}
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}>
              <div className="thumb wm-card-thumb">
                <span className="badge">{currentKind === "video" ? "MP4" : "IMG"}</span>
                <span className="wm-qr-preview" />
              </div>
              <div className="name">{currentName}</div>
              <button className="asset-delete" title="Clear watermark" onClick={(e) => {e.stopPropagation();onEnabledChange(false);}}>
                <Icon name="trash" size={12} />
              </button>
            </div>
          </div>
          <p className="hint wm-current">Current watermark: {currentName} / image overlay.</p>
          <div className="watermark-form">
            <div className="wm-axis-row">
              <label>POSX</label>
              <input type="number" min={0} max={100} value={wm.posX} onChange={(e) => setWm({ posX: +e.target.value })} />
              <label>POSY</label>
              <input type="number" min={0} max={100} value={wm.posY} onChange={(e) => setWm({ posY: +e.target.value })} />
            </div>
            <div className="wm-slider-row">
              <label>Size</label>
              <input type="range" min={4} max={30} value={wm.size} onChange={(e) => setWm({ size: +e.target.value })} />
              <span className="num-val">{wm.size}%</span>
            </div>
            <div className="wm-slider-row">
              <label>Opacity</label>
              <input type="range" min={10} max={100} value={wm.opacity} onChange={(e) => setWm({ opacity: +e.target.value })} />
              <span className="num-val">{wm.opacity}%</span>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

// ───────── Preview ─────────

const secondsFromDurationLabel = (dur) => {
  const parts = String(dur || "00:00").split(":").map((p) => Number(p) || 0);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] || 0;
};

const backgroundMediaForTime = (bgItem, time) => {
  const explicitSchedule = (bgItem?.schedule || []).map((seg) => ({ ...seg, media: MEDIA_BY_ID[seg.mediaId] })).filter((seg) => seg.media);
  if (explicitSchedule.length > 0) {
    return explicitSchedule.find((seg) => time >= seg.start && time < seg.end)?.media || null;
  }
  const ids = bgItem?.mediaIds || (bgItem?.mediaId ? [bgItem.mediaId] : []);
  const assets = ids.map((id) => MEDIA_BY_ID[id]).filter(Boolean);
  if (assets.length === 0) return null;
  const videoSeconds = assets.reduce((sum, media) => sum + (media.kind === "video" ? secondsFromDurationLabel(media.dur) : 0), 0);
  const imageCount = assets.filter((media) => media.kind !== "video").length;
  const imageSeconds = imageCount > 0 ? Math.max(8, (PROJECT_DURATION - videoSeconds) / imageCount) : 0;
  const schedule = assets.map((media) => ({
    media,
    duration: media.kind === "video" ? Math.max(1, secondsFromDurationLabel(media.dur)) : imageSeconds
  }));
  const cycle = schedule.reduce((sum, item) => sum + item.duration, 0) || PROJECT_DURATION;
  let cursor = ((time % cycle) + cycle) % cycle;
  return schedule.find((item) => {
    if (cursor <= item.duration) return true;
    cursor -= item.duration;
    return false;
  })?.media || assets[0];
};

const Preview = ({ playing, time, onTogglePlay, currentSentence, layers, resolution, subtitleText, showWatermark, watermarkAsset, watermarkSettings }) => {
  // Find the topmost active fullscreen item (PiP and BG are always on)
  const fgItem = (() => {
    for (const L of layers.filter((l) => l.kind === "fg")) {
      const it = L.items.find((it) => time >= it.start && time <= it.end);
      if (it) return { item: it, layer: L };
    }
    return null;
  })();
  const bgLayer = layers.find((l) => l.kind === "bg");
  const bgItem = bgLayer?.items[0];
  const pipItems = layers.filter((l) => l.kind === "pip").flatMap((L) => L.items.filter((it) => time >= it.start && time <= it.end).map((it) => ({ item: it, layer: L })));

  const showFG = !!fgItem;
  const fgMedia = fgItem ? MEDIA_BY_ID[fgItem.item.mediaId] : null;
  const bgMedia = bgItem ? backgroundMediaForTime(bgItem, time) : null;
  const watermarkPlacement = watermarkSettings || { posX: 5, posY: 8, size: 8, opacity: 49 };

  const isVertical = resolution.h > resolution.w;
  const canvasStyle = isVertical
    ? { height: "100%", maxWidth: "100%", aspectRatio: "9 / 16" }
    : { width: "100%", maxHeight: "100%", aspectRatio: "16 / 9" };

  return (
    <div className="preview-wrap">
      <div className="preview-stage">
        <div className="preview-canvas" style={canvasStyle}>
          {bgMedia && <div className="scene bg-scene" style={{ background: thumbGrad(bgMedia.thumb) }} />}
          {!bgMedia && <div className="scene empty"><span>No background</span></div>}
          {showFG && <div className="scene fg-scene" style={{ background: thumbGrad(fgMedia.thumb) }} />}
          {pipItems.map(({ item, layer }) => {
            const m = MEDIA_BY_ID[item.mediaId];
            const pip = item.pip;
            const style = {
              width: `${pip.size}%`, aspectRatio: "16/9", borderRadius: pip.radius, opacity: pip.opacity / 100,
              background: thumbGrad(m?.thumb),
              left: pip.posX === 0 ? "4%" : pip.posX === 1 ? "50%" : "auto",
              right: pip.posX === 2 ? "4%" : "auto",
              top: pip.posY === 0 ? "4%" : pip.posY === 1 ? "50%" : "auto",
              bottom: pip.posY === 2 ? "4%" : "auto",
              transform: `translate(${pip.posX === 1 ? "-50%" : "0"}, ${pip.posY === 1 ? "-50%" : "0"})`,
              boxShadow: "0 8px 30px rgba(0,0,0,0.45)"
            };
            return <div key={item.id} className="pip-overlay" style={style} />;
          })}
          <div className="subtitles">{subtitleText}</div>
          {showWatermark && watermarkAsset &&
          <div className="watermark-asset" style={{
            left: `${watermarkPlacement.posX}%`,
            top: `${watermarkPlacement.posY}%`,
            width: `${watermarkPlacement.size}%`,
            opacity: watermarkPlacement.opacity / 100,
            background: thumbGrad(watermarkAsset.thumb)
          }}>
            <span>{watermarkAsset.kind === "video" ? "MP4" : "IMG"}</span>
          </div>
          }
        </div>
      </div>
      <div className="preview-meta">
        <div className="transport">
          <button className="iconbtn" title="Previous sentence"><Icon name="skipBack" /></button>
          <button className="iconbtn play" onClick={onTogglePlay} title={playing ? "Pause" : "Play"}>
            <Icon name={playing ? "pause" : "play"} size={14} />
          </button>
          <button className="iconbtn" title="Next sentence"><Icon name="skipFwd" /></button>
        </div>
        <div className="tc-display">
          <span className="tc-now">{fmtTC(time)}</span>
          <span className="tc-sep">/</span>
          <span>{fmtTC(PROJECT_DURATION)}</span>
        </div>
      </div>
    </div>);

};

// ───────── Timeline ─────────

const WAVE_BARS = Array.from({ length: 200 }, (_, i) =>
30 + Math.abs(Math.sin(i * 0.5) * 30) + Math.abs(Math.sin(i * 0.13) * 25) + (i % 7 === 0 ? 15 : 0));

const Clip = ({ left, width, kind, label, selected, onClick, onResize, onDelete }) => {
  const startResize = (side) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const trackEl = e.currentTarget.closest(".track");
    const trackW = trackEl?.getBoundingClientRect().width || 1;
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dPct = dx / trackW * 100;
      onResize(side, dPct);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div className={"clip " + kind + (selected ? " selected" : "")} style={{ left: `${left}%`, width: `${width}%` }}
    onClick={(e) => {e.stopPropagation();onClick && onClick();}}>
      <span className="grip l" onMouseDown={startResize("l")} />
      <span className="lbl">{label}</span>
      <span className="grip r" onMouseDown={startResize("r")} />
      {selected && onDelete && <button className="x" onClick={(e) => {e.stopPropagation();onDelete();}} title="Delete"><Icon name="x" size={9} /></button>}
    </div>);

};

const TimelineRow = ({ layer, selection, onSelect, onResize, onDelete, onClickHeader, sentences }) => {
  return (
    <div className="track-row" data-layer={layer.kind}>
      <div className="track-label" onClick={onClickHeader}>
        <span className={"ldot " + layer.kind} />
        <span className="lname">{layer.name}</span>
        <span className="lct">{layer.items.length}</span>
      </div>
      <div className="track">
        {layer.kind === "sub" ?
        // synthesize sub clips per sentence, distributed across the project duration
        sentences.map((s, i) => {
          const segPct = 100 / sentences.length;
          const left = i * segPct;
          const width = segPct * 0.92; // small gap between cues
          return <div key={s.idx} className="clip sub" style={{ left: `${left}%`, width: `${width}%` }} title={`s${s.idx}`} />;
        }) :

        layer.items.map((it) => {
          const dur = layer.kind === "bg" ? PROJECT_DURATION : it.end - it.start;
          const left = it.start / PROJECT_DURATION * 100;
          const width = dur / PROJECT_DURATION * 100;
          const sel = selection?.layerId === layer.id && selection?.itemId === it.id;
          const m = MEDIA_BY_ID[it.mediaId];
          const bgCount = it.schedule?.length || it.mediaIds?.length || 1;
          const label = layer.kind === "bg" ? (bgCount > 1 ? `${bgCount} timed ranges` : `auto / ${m?.name || "background"}`) : m?.name || "item";
          return (
            <Clip key={it.id} left={left} width={width} kind={layer.kind} label={label}
            selected={sel}
            onClick={() => onSelect(layer.id, it.id)}
            onResize={(side, dPct) => onResize(layer.id, it.id, side, dPct)}
            onDelete={layer.kind === "bg" ? null : () => onDelete(layer.id, it.id)} />);


        })
        }
      </div>
    </div>);

};

const Timeline = ({ layers, time, onSeek, selection, onSelect, onResize, onDelete, sentences }) => {
  const playPct = time / PROJECT_DURATION * 100;
  const ticks = Array.from({ length: 16 }, (_, i) => ({ pct: i / 15 * 100, label: fmtTC(i / 15 * PROJECT_DURATION, false) }));

  return (
    <div className="timeline">
      <div className="tl-header">
        <h3>Timeline</h3>
        <div className="meta">
          <span>30 fps</span>
          <span>{layers.reduce((n, l) => n + (l.kind === "sub" ? 0 : l.items.length), 0)} clips</span>
          <span>cache 24/24</span>
        </div>
      </div>
      <div style={{ position: "relative" }} onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left - 100;
        if (x < 0) return;
        const w = rect.width - 100 - 10;
        onSeek(x / w * PROJECT_DURATION);
      }}>
        <div className="ruler">
          {ticks.map((t, i) =>
          <div key={i} className={"tick " + (i % 2 === 0 ? "" : "minor")} style={{ left: `${t.pct}%` }}>
              {i % 2 === 0 && <span>{t.label}</span>}
            </div>
          )}
        </div>
        <div className="waveform">
          {WAVE_BARS.map((h, i) => {
            const pct = i / WAVE_BARS.length * 100;
            const played = pct <= playPct;
            return <div key={i} className={"bar " + (played ? "played" : "")} style={{ height: `${h}%` }}></div>;
          })}
        </div>
        <div className="tracks">
          {layers.map((L) =>
            <TimelineRow key={L.id} layer={L} selection={selection} onSelect={onSelect} onResize={onResize} onDelete={onDelete} sentences={sentences} />
          )}
        </div>
        <div className="playhead-line" style={{ left: `calc(100px + (100% - 100px - 10px) * ${playPct} / 100)` }} />
      </div>
    </div>);

};

// ───────── Editor screen ─────────

const EditorScreen = ({ go }) => {
  const [time, setTime] = React.useState(38.4);
  const [playing, setPlaying] = React.useState(false);
  const [selection, setSelection] = React.useState([6, 7]);
  const [layers, setLayers] = React.useState(INITIAL_LAYERS);
  const [selItem, setSelItem] = React.useState({ layerId: "L-bg", itemId: "bg-001" });
  const [modal, setModal] = React.useState(null); // {kind:"assign", range, edit?} | {kind:"subtitles"} | {kind:"watermark"} | {kind:"bg"}
  const [resolutionKey, setResolutionKey] = React.useState("1080p");
  const [showLayersMenu, setShowLayersMenu] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState(null); // {x,y,sentenceIdx}
  const [subSettings, setSubSettings] = React.useState({ burnin: true, show: true, pos: "bottom", font: "Arial", size: 42, color: "#ffffff", bg: "block", bgColor: "#000000", bgOpacity: 62, bgRadius: 8 });
  const [watermarkOn, setWatermarkOn] = React.useState(true);
  const [watermarkAssetId, setWatermarkAssetId] = React.useState("m3");
  const [watermarkSettings, setWatermarkSettings] = React.useState({ posX: 5, posY: 8, size: 8, opacity: 49 });
  const [sentences, setSentences] = React.useState(() => [...SENTENCES]);
  const [editingSentence, setEditingSentence] = React.useState(null);
  const [sentenceDraft, setSentenceDraft] = React.useState("");
  const [saveState, setSaveState] = React.useState("saved");
  const autosaveTimer = React.useRef(null);
  const [draft, setDraft] = React.useState(null); // null | { progress: 0..100, stage, done?: boolean }

  const markConfigChanged = React.useCallback(() => {
    setSaveState("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => setSaveState("saved"), 650);
  }, []);

  React.useEffect(() => () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
  }, []);

  // Simulated draft render — drives the progress bar under the editor toolbar.
  React.useEffect(() => {
    if (!draft || draft.done || draft.cancelled) return;
    const id = setInterval(() => {
      setDraft((d) => {
        if (!d) return d;
        const next = Math.min(100, d.progress + (1.6 + Math.random() * 1.4));
        const stage =
          next < 18 ? "verifying cache" :
          next < 55 ? "pre-rendering clips" :
          next < 70 ? "building subtitles.srt" :
          next < 95 ? "ffmpeg compose" : "muxing audio";
        if (next >= 100) {
          return { ...d, progress: 100, stage: "done", done: true, finishedAt: Date.now() };
        }
        return { ...d, progress: next, stage };
      });
    }, 180);
    return () => clearInterval(id);
  }, [draft]);

  // Auto-dismiss the bar 2.6s after completion.
  React.useEffect(() => {
    if (!draft?.done) return;
    const id = setTimeout(() => setDraft(null), 2600);
    return () => clearTimeout(id);
  }, [draft?.done]);

  const startDraft = () => {
    if (draft && !draft.done) return; // already running
    setDraft({ progress: 0, stage: "verifying cache" });
  };
  const cancelDraft = () => setDraft(null);

  React.useEffect(() => {
    if (!playing) return;
    let raf,last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const nt = t + dt;
        return nt >= PROJECT_DURATION ? 0 : nt;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  React.useEffect(() => {
    const onDocClick = () => {setContextMenu(null);setShowLayersMenu(false);};
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const currentSentence = React.useMemo(() => {
    const s = sentences.find((s) => time >= s.start && time <= s.end);
    return s ? s.idx : sentences.find((s) => time < s.start)?.idx ?? sentences.length;
  }, [time, sentences]);

  const onSentenceSelect = (idx, e) => {
    if (e.shiftKey && selection.length > 0) {
      const lo = Math.min(selection[0], idx);
      const hi = Math.max(selection[selection.length - 1], idx);
      setSelection(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
    } else {
      setSelection([idx]);
      setTime(sentences[idx - 1]?.start ?? 0);
    }
  };

  const onSentenceContext = (idx, e) => {
    setContextMenu({ x: e.clientX, y: e.clientY, sentenceIdx: idx });
  };

  const startSentenceEdit = (idx) => {
    const sentence = sentences.find((s) => s.idx === idx);
    setEditingSentence(idx);
    setSentenceDraft(sentence?.text || "");
    setSelection([idx]);
    setTime(sentence?.start ?? 0);
  };

  const cancelSentenceEdit = () => {
    setEditingSentence(null);
    setSentenceDraft("");
  };

  const commitSentenceEdit = (idx) => {
    const text = sentenceDraft.trim();
    if (!text) return cancelSentenceEdit();
    setSentences((current) => {
      const next = current.map((s) => s.idx === idx ? { ...s, text } : s);
      window.SENTENCES = next;
      return next;
    });
    cancelSentenceEdit();
    markConfigChanged();
  };

  const sentenceRangeForTimes = (start, end) => {
    const overlapping = sentences.filter((s) => s.end > start && s.start < end);
    if (overlapping.length === 0) {
      const nearest = sentences.reduce((best, s) => Math.abs(s.start - start) < Math.abs(best.start - start) ? s : best, sentences[0]);
      return [nearest.idx, nearest.idx];
    }
    return [overlapping[0].idx, overlapping[overlapping.length - 1].idx];
  };

  // ── merge sentences ──
  const mergeSentences = () => {
    const sorted = [...selection].sort((a, b) => a - b);
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    const merged = sentences.filter((s) => s.idx >= lo && s.idx <= hi);
    if (merged.length < 2) return;

    const text = merged.map((s) => s.text).join(" ");
    const start = merged[0].start;
    const end = merged[merged.length - 1].end;
    const conf = merged.reduce((sum, s) => sum + s.conf, 0) / merged.length;
    const gap = hi - lo;

    const filtered = sentences
      .filter((s) => s.idx < lo || s.idx > hi)
      .map((s) => s.idx > hi ? { ...s, idx: s.idx - gap } : { ...s });

    const newSentence = { idx: lo, start, end, text, conf, orphan: false };
    filtered.splice(lo - 1, 0, newSentence);
    filtered.forEach((s, i) => { s.idx = i + 1; });

    // update clip anchors that reference merged sentences
    const remap = (f, t) => {
      if (f > hi) return [f - gap, t - gap];
      if (f >= lo && t <= hi) return [lo, lo];
      if (f < lo && t >= lo) return [f, lo];
      if (f <= hi && t > hi) return [lo, t - gap];
      return [f, t];
    };

    const newLayers = layers.map((L) => ({
      ...L,
      items: L.items.map((it) => {
        if (!it.sentences) return it;
        const [f, t] = remap(it.sentences[0], it.sentences[1]);
        return { ...it, sentences: [f, t] };
      })
    }));

    setSentences(filtered);
    window.SENTENCES = filtered;
    setLayers(newLayers);
    setSelection([lo]);
    setContextMenu(null);
    markConfigChanged();
  };

  // ── layer mutations ──
  const patchItem = (layerId, itemId, patch) => {
    setLayers((ls) => ls.map((L) => L.id !== layerId ? L : {
      ...L, items: L.items.map((it) => it.id !== itemId ? it : { ...it, ...patch })
    }));
    markConfigChanged();
  };

  const deleteItem = (layerId, itemId) => {
    setLayers((ls) => {
      const next = ls.map((L) => L.id !== layerId ? L : { ...L, items: L.items.filter((it) => it.id !== itemId) });
      // auto-delete empty fg/pip layers
      const cleaned = next.filter((L) => !((L.kind === "fg" || L.kind === "pip") && L.items.length === 0));
      return cleaned;
    });
    setSelItem(null);
    markConfigChanged();
  };

  const resizeItem = (layerId, itemId, side, dPct) => {
    const dt = dPct / 100 * PROJECT_DURATION;
    setLayers((ls) => ls.map((L) => L.id !== layerId ? L : {
      ...L, items: L.items.map((it) => {
        if (it.id !== itemId) return it;
        const start = side === "l" ? Math.max(0, Math.min(it.end - 0.5, it.start + dt)) : it.start;
        const end = side === "r" ? Math.min(PROJECT_DURATION, Math.max(it.start + 0.5, it.end + dt)) : it.end;
        return { ...it, start, end, sentences: sentenceRangeForTimes(start, end) };
      })
    }));
    markConfigChanged();
  };

  const onAssignSubmit = (data) => {
    // Edit mode: update existing item in place (asset/range/motion/etc.)
    if (data.editing) {
      setLayers((ls) => ls.map((L) => L.id !== data.editing.layerId ? L : {
        ...L,
        items: L.items.map((it) => it.id !== data.editing.itemId ? it : {
          ...it,
          mediaId: data.mediaId,
          sentences: data.sentences,
          start: data.start,
          end: data.end,
          motion: data.motion,
          transitions: data.transitions,
          pip: data.pip
        })
      }));
      setSelItem({ layerId: data.editing.layerId, itemId: data.editing.itemId });
      markConfigChanged();
      return;
    }
    const id = `${data.comp === "pip" ? "pip" : "fg"}-${Math.random().toString(36).slice(2, 7)}`;
    const newItem = {
      id,
      mediaId: data.mediaId,
      sentences: data.sentences,
      start: data.start,
      end: data.end,
      motion: data.motion,
      transitions: data.transitions,
      pip: data.pip
    };
    setLayers((ls) => {
      let target = ls.find((L) => L.id === data.zTarget);
      if (target && target.items) {
        return ls.map((L) => L.id === data.zTarget ? { ...L, items: [...L.items, newItem] } : L);
      }
      // create new layer
      const fgCount = ls.filter((L) => L.kind === "fg").length;
      const pipCount = ls.filter((L) => L.kind === "pip").length;
      const isPip = data.comp === "pip";
      const newLayer = {
        id: (isPip ? "L-pip-" : "L-fg-") + Math.random().toString(36).slice(2, 5),
        kind: isPip ? "pip" : "fg",
        name: isPip ? `PiP · z${pipCount + 3}` : `Foreground · z${fgCount + 1}`,
        items: [newItem]
      };
      // insert PiP layers above FG, FG layers above BG, SUB stays at top
      const subIdx = ls.findIndex((L) => L.kind === "sub");
      const bgIdx = ls.findIndex((L) => L.kind === "bg");
      const insertAt = isPip ? subIdx + 1 : bgIdx;
      const next = [...ls];
      next.splice(insertAt, 0, newLayer);
      return next;
    });
    setSelItem({ layerId: data.zTarget !== "__new__" ? data.zTarget : null, itemId: id });
    markConfigChanged();
  };

  // ── BG add ──
  const addBackground = () => {
    setLayers((ls) => {
      const bg = ls.find((L) => L.kind === "bg");
      if (bg) return ls;
      const newBG = { id: "L-bg", kind: "bg", name: "Background", items: [{
          id: "bg-001", mediaId: "m2", mediaIds: ["m2", "m4", "m7", "m5"], sentences: [1, sentences.length], start: 0, end: PROJECT_DURATION,
          schedule: [
            { id: "bg-seg-m2-1", mediaId: "m2", start: 0, end: 12, lockedDuration: true },
            { id: "bg-seg-m4-2", mediaId: "m4", start: 12, end: 180, lockedDuration: false },
            { id: "bg-seg-m7-3", mediaId: "m7", start: 180, end: 188, lockedDuration: true },
            { id: "bg-seg-m5-4", mediaId: "m5", start: 188, end: PROJECT_DURATION, lockedDuration: false },
          ],
          motion: { kind: "ken_burns", easing: "linear" },
          transitions: { in: "cut", out: "cut" }, crossfade: 0.6
        }] };
      return [...ls, newBG];
    });
    markConfigChanged();
  };

  const removeBackground = () => {
    setLayers((ls) => ls.filter((L) => L.kind !== "bg"));
    setSelItem(null);
    markConfigChanged();
  };

  const resolution = RESOLUTIONS[resolutionKey];
  const subtitleText = sentences[currentSentence - 1]?.text || "";
  const watermarkAsset = MEDIA_BY_ID[watermarkAssetId];
  const bgItem = layers.find((L) => L.kind === "bg")?.items[0];
  const hasBG = !!bgItem;

  const layerCounts = {
    fg: layers.filter((L) => L.kind === "fg").length,
    pip: layers.filter((L) => L.kind === "pip").length
  };

  const saveSubSettings = (next) => {
    setSubSettings(next);
    markConfigChanged();
  };

  const changeWatermarkAsset = (id) => {
    setWatermarkAssetId(id);
    markConfigChanged();
  };

  const changeWatermarkEnabled = (next) => {
    setWatermarkOn(next);
    markConfigChanged();
  };

  const changeWatermarkSettings = (next) => {
    setWatermarkSettings(next);
    markConfigChanged();
  };

  return (
    <div className="screen" data-screen-label="03 Editor" style={{ display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
      <div className="editor" style={{ flex: 1, minHeight: 0 }}>
        <div className="editor-bar">
          <div className="title">
            <button className="iconbtn" onClick={() => go("launcher")}><Icon name="folderOpen" /></button>
            <h2>Tokyo Essay</h2>
          </div>
          <div className="center"></div>
          <div className="right">
            <span className={"save-state " + saveState}>{saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : ""}</span>
            <button className="btn" onClick={startDraft} disabled={draft && !draft.done}>
              {draft && !draft.done ? `Drafting · ${Math.round(draft.progress)}%` : "Render Draft"}
            </button>
            <button className="btn accent" onClick={() => go("render")}><Icon name="film" size={13} /> Render Final</button>
          </div>
        </div>

        {draft &&
        <div className={"draft-bar " + (draft.done ? "draft-bar-done" : "")} role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(draft.progress)}>
            <div className="draft-bar-fill" style={{ width: `${draft.progress}%` }} />
            <div className="draft-bar-meta">
              <span className="stage" style={{ background: 'none', color: 'white' }}>
                <span style={{ color: 'inherit' }}>{draft.done ? "Draft ready" : "Rendering draft"}</span>
                <span className="muted"  style={{ color: 'inherit' }}>: {draft.stage}</span>
              </span>
              <span className="pct">{Math.round(draft.progress)}%</span>
              {!draft.done &&
              <button className="btn ghost xs" onClick={cancelDraft}>Cancel</button>
              }
            </div>
          </div>
        }

        <div className="editor-body">
          <Transcript
            sentences={sentences}
            selection={selection}
            currentSentence={currentSentence}
            onSelect={onSentenceSelect}
            onContext={onSentenceContext}
            editingSentence={editingSentence}
            sentenceDraft={sentenceDraft}
            onStartEdit={startSentenceEdit}
            onDraftChange={setSentenceDraft}
            onCommitEdit={commitSentenceEdit}
            onCancelEdit={cancelSentenceEdit} />
          

          <div className="center-pane">
            <Preview
              playing={playing} time={time}
              onTogglePlay={() => setPlaying((p) => !p)}
              currentSentence={currentSentence}
              layers={layers}
              resolution={resolution}
              subtitleText={subtitleText}
              showWatermark={watermarkOn}
              watermarkAsset={watermarkAsset}
              watermarkSettings={watermarkSettings} />
            
            {/* Preview controls strip */}
            <div className="preview-controls">
              <div className="pc-left">
                <div className="seg sm">
                  <button className={resolutionKey === "1080p" ? "on" : ""} onClick={() => setResolutionKey("1080p")}>1080p</button>
                  <button className={resolutionKey === "720p" ? "on" : ""} onClick={() => setResolutionKey("720p")}>720p</button>
                  <button className={resolutionKey === "vert" ? "on" : ""} onClick={() => setResolutionKey("vert")}>9:16</button>
                </div>
              </div>
              <div className="pc-right">
                <div className="layers-pop-wrap">
                  <button className="btn sm ghost" onClick={(e) => {e.stopPropagation();setShowLayersMenu((s) => !s);}}>
                    <Icon name="layers" size={13} /> Layers · {layers.length}
                  </button>
                  {showLayersMenu &&
                  <div className="layers-pop" onClick={(e) => e.stopPropagation()}>
                      <div className="lp-head">Layer order · top renders on top</div>
                      <div className="lp-rows">
                      {layers.map((L) =>
                      <div key={L.id} className="lp-row" onClick={() => {if (L.items[0]) setSelItem({ layerId: L.id, itemId: L.items[0].id });setShowLayersMenu(false);}}>
                          <span className={"ldot " + L.kind} />
                          <span className="name">{L.name}</span>
                          <span className="ct">{L.items.length} {L.items.length === 1 ? "item" : "items"}</span>
                          {L.kind === "bg" && <button className="iconbtn xs" onClick={(e) => {e.stopPropagation();removeBackground();}} title="Remove BG"><Icon name="trash" size={11} /></button>}
                        </div>
                      )}
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>

            <Timeline
              layers={layers} time={time} onSeek={setTime}
              selection={selItem}
              onSelect={(layerId, itemId) => setSelItem({ layerId, itemId })}
              onResize={resizeItem}
              onDelete={deleteItem}
              sentences={sentences} />
            
          </div>

          <div className="tcol rail">
            <div className="rail-tabs">
              <button className="on">Inspector</button>
            </div>
            <div className="rail-body">
              <div className="global-config">
                <div className="gc-head">
                  <span>Global video config</span>
                  <span className="tag info">SQLite</span>
                </div>
                <button className={"gc-row " + (watermarkOn ? "on" : "")} onClick={() => setModal({ kind: "watermark" })}>
                  <span><Icon name="image" size={13}/> Watermark</span>
                  <span>{watermarkAsset?.name || "Choose"}</span>
                </button>
                <button className="gc-row" onClick={() => setModal({ kind: "subtitles" })}>
                  <span><Icon name="type" size={13}/> Subtitles</span>
                  <span>{subSettings.burnin ? "Burn-in" : "Sidecar"}</span>
                </button>
                <button className={"gc-row"} onClick={() => setModal({ kind: "bg" })}>
                  <span><Icon name="plusCircle" size={13}/>{hasBG ? "Change" : "Add"} Background</span>
                  <span>Choose</span>
                </button>
              </div>
              <Inspector selection={selItem} layers={layers}
              onPatch={patchItem} onDelete={deleteItem}
              onChangeAsset={(layer, item) => setModal({
                kind: "assign",
                range: item.sentences,
                editing: {
                  layerId: layer.id, itemId: item.id, kind: layer.kind,
                  mediaId: item.mediaId, sentences: item.sentences,
                  motion: item.motion, transitions: item.transitions, pip: item.pip
                }
              })}
              onChangeBGAsset={() => setModal({ kind: "bg" })} />
              
            </div>
          </div>
        </div>
      </div>

      {contextMenu &&
      <div className="ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => {setModal({ kind: "assign", range: [contextMenu.sentenceIdx, contextMenu.sentenceIdx] });setContextMenu(null);}}>
            <Icon name="upload" size={12} /> Assign media to range…
          </button>
          {selection.length >= 2 &&
          <button onClick={mergeSentences}>
            <Icon name="cut" size={12} /> Merge {selection.length} sentences
          </button>
          }
          <button onClick={() => {setSelection([contextMenu.sentenceIdx]);setTime(sentences[contextMenu.sentenceIdx - 1]?.start ?? 0);setContextMenu(null);}}>
            <Icon name="play" size={12} /> Play from here
          </button>
        </div>
      }

      <AssignModal
        open={modal?.kind === "assign"}
        onClose={() => setModal(null)}
        onSubmit={onAssignSubmit}
        initialRange={modal?.range}
        layers={layers}
        editing={modal?.editing} />
      
      <BGModal
        open={modal?.kind === "bg"}
        onClose={() => setModal(null)}
        bgItem={layers.find((L) => L.kind === "bg")?.items[0]}
        onApply={(data) => {
          setLayers((ls) => {
            const exists = ls.find((L) => L.kind === "bg");
            if (exists) {
              return ls.map((L) => L.kind !== "bg" ? L : {
                ...L, items: L.items.map((it) => ({ ...it, mediaIds: data.mediaIds, mediaId: data.mediaId, schedule: data.schedule, motion: data.motion, crossfade: data.crossfade }))
              });
            }
            const newBG = { id: "L-bg", kind: "bg", name: "Background", items: [{
                id: "bg-001", mediaIds: data.mediaIds, mediaId: data.mediaId, sentences: [1, sentences.length], start: 0, end: PROJECT_DURATION,
                schedule: data.schedule, motion: data.motion, transitions: { in: "cut", out: "cut" }, crossfade: data.crossfade
              }] };
            return [...ls, newBG];
          });
          markConfigChanged();
          setModal(null);
        }} />

      <WatermarkModal
        open={modal?.kind === "watermark"}
        onClose={() => setModal(null)}
        assetId={watermarkAssetId}
        onSelect={changeWatermarkAsset}
        enabled={watermarkOn}
        onEnabledChange={changeWatermarkEnabled}
        settings={watermarkSettings}
        onSettingsChange={changeWatermarkSettings} />
      
      <SubtitlesModal
        open={modal?.kind === "subtitles"}
        onClose={() => setModal(null)}
        settings={subSettings}
        resolution={resolution}
        onSave={saveSubSettings} />
      
    </div>);

};

window.EditorScreen = EditorScreen;
