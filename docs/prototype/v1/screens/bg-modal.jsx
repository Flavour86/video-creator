// BGModal: background coverage planner for mixed images and footage.

const BG_PROJECT_DURATION = 942;

const bgSecondsFromDurationLabel = (dur) => {
  const parts = String(dur || "00:00").split(":").map((p) => Number(p) || 0);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] || 0;
};

const bgNativeDuration = (media) => media?.kind === "video" ? Math.max(1, bgSecondsFromDurationLabel(media.dur)) : null;
const bgClamp = (value, min = 0, max = BG_PROJECT_DURATION) => Math.min(max, Math.max(min, Number(value) || 0));
const bgTime = (seconds) => fmtTC(bgClamp(seconds), false);
const bgParseTimeInput = (value, fallback = 0) => {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (raw.includes(":")) {
    const parts = raw.split(":").map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) return fallback;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || fallback;
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};
const bgDraftKey = (seg, field) => `${seg.id}:${field}`;

const buildBgSchedule = (ids, current = []) => {
  return ids.map((mediaId, index) => {
    const media = MEDIA_BY_ID[mediaId];
    const existing = current.find((seg) => seg.mediaId === mediaId);
    const native = bgNativeDuration(media);
    const start = bgClamp(existing?.start ?? 0);
    const end = bgClamp(existing?.end ?? 0, start);
    return {
      id: existing?.id || `bg-seg-${mediaId}-${index + 1}`,
      mediaId,
      start,
      end,
      lockedDuration: !!native
    };
  });
};

const BGModal = ({ open, onClose, onApply, bgItem }) => {
  const isEdit = !!bgItem;
  const initialIds = bgItem?.mediaIds || (bgItem?.mediaId ? [bgItem.mediaId] : ["m2", "m4", "m7", "m5"]);
  const [mediaIds, setMediaIds] = React.useState(initialIds);
  const [segments, setSegments] = React.useState(buildBgSchedule(initialIds, bgItem?.schedule || []));
  const [motionKind, setMotionKind] = React.useState(bgItem?.motion?.kind || "ken_burns");
  const [easing, setEasing] = React.useState(bgItem?.motion?.easing || "ease_in_out");
  const [crossfade, setCrossfade] = React.useState(bgItem?.crossfade ?? 0.6);
  const [draggingId, setDraggingId] = React.useState(null);
  const [timeDrafts, setTimeDrafts] = React.useState({});

  React.useEffect(() => {
    if (!open) return;
    const ids = bgItem?.mediaIds || (bgItem?.mediaId ? [bgItem.mediaId] : ["m2", "m4", "m7", "m5"]);
    setMediaIds(ids);
    setSegments(buildBgSchedule(ids, bgItem?.schedule || []));
    setMotionKind(bgItem?.motion?.kind || "ken_burns");
    setEasing(bgItem?.motion?.easing || "ease_in_out");
    setCrossfade(bgItem?.crossfade ?? 0.6);
    setDraggingId(null);
    setTimeDrafts({});
  }, [open, bgItem]);

  if (!open) return null;

  const selectedAssets = mediaIds.map((id) => MEDIA_BY_ID[id]).filter(Boolean);
  const unselectedAssets = MEDIA.filter((mm) => !mediaIds.includes(mm.id));
  const orderedAssets = mediaIds.length <= 1 ? MEDIA.slice(0, 6) : [...selectedAssets, ...unselectedAssets].slice(0, 6);

  const syncIds = (nextIds, nextSegments = segments) => {
    setMediaIds(nextIds);
    setSegments(buildBgSchedule(nextIds, nextSegments));
  };

  const toggleAsset = (mm) => {
    if (mediaIds.includes(mm.id)) {
      if (mediaIds.length === 1) return;
      syncIds(mediaIds.filter((x) => x !== mm.id), segments.filter((seg) => seg.mediaId !== mm.id));
    } else {
      const native = bgNativeDuration(mm);
      const nextSegments = [...segments, {
        id: `bg-seg-${mm.id}-${mediaIds.length + 1}`,
        mediaId: mm.id,
        start: 0,
        end: 0,
        lockedDuration: !!native
      }];
      syncIds([...mediaIds, mm.id], nextSegments);
    }
  };

  const moveAsset = (dragId, targetId) => {
    if (!dragId || dragId === targetId) return;
    const from = mediaIds.indexOf(dragId);
    const to = mediaIds.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const nextIds = [...mediaIds];
    const [pickedId] = nextIds.splice(from, 1);
    nextIds.splice(to, 0, pickedId);
    const nextSegments = nextIds.map((id) => segments.find((seg) => seg.mediaId === id)).filter(Boolean);
    syncIds(nextIds, nextSegments);
  };

  const patchSegment = (index, patch) => {
    setSegments((current) => current.map((seg, i) => {
      if (i !== index) return seg;
      const media = MEDIA_BY_ID[seg.mediaId];
      const native = bgNativeDuration(media);
      let start = patch.start !== undefined ? bgClamp(patch.start) : seg.start;
      let end = patch.end !== undefined ? bgClamp(patch.end, start) : seg.end;
      if (patch.duration !== undefined) end = bgClamp(start + Math.max(0, Number(patch.duration) || 0), start);
      if (native && patch.start !== undefined && patch.end === undefined && patch.duration === undefined) end = bgClamp(start + native, start);
      if (end < start) end = start;
      return { ...seg, start, end, lockedDuration: !!native };
    }));
  };

  const extendToEnd = (index) => patchSegment(index, { end: BG_PROJECT_DURATION });

  const orderedSegments = mediaIds.map((id) => segments.find((seg) => seg.mediaId === id)).filter(Boolean);
  const imageRangeCount = orderedSegments.filter((seg) => MEDIA_BY_ID[seg.mediaId]?.kind !== "video").length;
  const setTimeDraft = (key, value) => {
    setTimeDrafts((current) => ({ ...current, [key]: value }));
  };
  const clearTimeDraft = (key) => {
    setTimeDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const commitTimeDraft = (index, seg, field) => {
    const key = bgDraftKey(seg, field);
    if (timeDrafts[key] === undefined) return;
    const duration = Math.max(0, seg.end - seg.start);
    const fallback = field === "hold" ? duration : seg[field];
    const nextValue = bgParseTimeInput(timeDrafts[key], fallback);
    patchSegment(index, field === "hold" ? { duration: nextValue } : { [field]: nextValue });
    clearTimeDraft(key);
  };
  const renderTimeField = (seg, index, field, label, disabled = false) => {
    const duration = Math.max(0, seg.end - seg.start);
    const numeric = field === "hold" ? duration : seg[field];
    const key = bgDraftKey(seg, field);
    return (
      <label className="bg-time-field">
        <span>{label}</span>
        <input
          type="text"
          inputMode="numeric"
          value={timeDrafts[key] ?? bgTime(numeric)}
          disabled={disabled}
          title="Use mm:ss, hh:mm:ss, or seconds"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setTimeDraft(key, e.target.value)}
          onBlur={() => commitTimeDraft(index, seg, field)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitTimeDraft(index, seg, field);
              e.currentTarget.blur();
            }
          }} />
      </label>);
  };

  const submit = () => {
    onApply({
      mediaIds,
      mediaId: mediaIds[0],
      schedule: orderedSegments,
      motion: { kind: motionKind, easing },
      crossfade
    });
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal background-modal v11-bg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{isEdit ? "Change background" : "Add background"}</h2>
            <p>Build a timed background plan from images and footage.</p>
          </div>
          <button className="iconbtn" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="modal-body bg-plan-body">
          <div className="bg-plan-left">
            <div className="field">
              <div className="asset-picker-head">
                <label>
                  Assets
                  <span className="label-meta">{mediaIds.length} selected</span>
                </label>
                <button className="btn ghost" onClick={() => alert("Open native file dialog and import to the project's media library.")}>
                  <Icon name="folder" size={13}/> Import from disk...
                </button>
              </div>
              <div className="asset-grid bg-asset-grid bg-plan-assets">
                {orderedAssets.map((mm) => {
                  const sel = mediaIds.includes(mm.id);
                  return (
                    <div
                      key={mm.id}
                      className={[
                        "asset-card",
                        sel ? "on sortable" : "",
                        draggingId === mm.id ? "dragging" : "",
                        draggingId && sel && draggingId !== mm.id ? "drop-target" : ""
                      ].join(" ")}
                      role="button"
                      tabIndex={0}
                      draggable={sel && mediaIds.length > 1}
                      onClick={() => toggleAsset(mm)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleAsset(mm); }}
                      onDragStart={(e) => {
                        if (!sel) return;
                        setDraggingId(mm.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", mm.id);
                      }}
                      onDragOver={(e) => {
                        if (!draggingId || !sel) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        moveAsset(e.dataTransfer.getData("text/plain") || draggingId, mm.id);
                        setDraggingId(null);
                      }}
                      onDragEnd={() => setDraggingId(null)}>
                      <div className="thumb" style={{ background: thumbGrad(mm.thumb) }}>
                        <span className="badge">{mm.kind === "video" ? "MP4" : "IMG"}</span>
                        {sel && <span className="sel-tick"><Icon name="check" size={12} /></span>}
                      </div>
                      <div className="name" title={mm.name}>{mm.name}</div>
                      {sel && mediaIds.length > 1 &&
                      <button className="asset-delete" title="Remove asset" onClick={(e) => {
                        e.stopPropagation();
                        syncIds(mediaIds.filter((id) => id !== mm.id), segments.filter((seg) => seg.mediaId !== mm.id));
                      }}>
                        <Icon name="trash" size={12} />
                      </button>}
                    </div>);
                })}
              </div>
            </div>

            <div className="field-row two bg-motion-grid">
              <div className="field">
                <label>Motion</label>
                <select value={motionKind} onChange={(e) => setMotionKind(e.target.value)}>
                  <option value="none">None - static</option>
                  <option value="ken_burns">Ken Burns - subtle</option>
                  <option value="ken_burns_strong">Ken Burns - strong</option>
                </select>
              </div>
              <div className="field">
                <label>Easing</label>
                <select value={easing} onChange={(e) => setEasing(e.target.value)} disabled={motionKind === "none"}>
                  <option value="linear">linear</option>
                  <option value="ease_in">ease in</option>
                  <option value="ease_out">ease out</option>
                  <option value="ease_in_out">ease in-out</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label>Crossfade</label>
              <div className="range-row">
                <input type="range" min={0} max={2} step={0.1} value={crossfade} onChange={(e) => setCrossfade(+e.target.value)} />
                <span className="num-val">{crossfade.toFixed(1)}s</span>
              </div>
            </div>
          </div>

          <div className="bg-plan-right">
            <div className="bg-plan-head">
              <div>
                <label>Coverage plan</label>
                <span>{imageRangeCount} image ranges / {orderedSegments.length} total / drag rows to reorder</span>
              </div>
            </div>

            <div className="bg-segment-list">
              {orderedSegments.map((seg, index) => {
                const media = MEDIA_BY_ID[seg.mediaId];
                const isVideo = media?.kind === "video";
                return (
                  <div
                    key={seg.id}
                    className={[
                      "bg-segment-row",
                      isVideo ? "video" : "image",
                      draggingId === seg.mediaId ? "dragging" : "",
                      draggingId && draggingId !== seg.mediaId ? "drop-target" : ""
                    ].join(" ")}
                    draggable={mediaIds.length > 1}
                    onDragStart={(e) => {
                      setDraggingId(seg.mediaId);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", seg.mediaId);
                    }}
                    onDragOver={(e) => {
                      if (!draggingId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      moveAsset(e.dataTransfer.getData("text/plain") || draggingId, seg.mediaId);
                      setDraggingId(null);
                    }}
                    onDragEnd={() => setDraggingId(null)}>
                    <div className="bg-segment-thumb" style={{ background: thumbGrad(media?.thumb) }}>
                      <span>{isVideo ? "MP4" : "IMG"}</span>
                    </div>
                    <div className="bg-segment-main">
                      <div className="bg-segment-title">
                        <strong title={media?.name}>{media?.name}</strong>
                        <span className="bg-segment-title-tools">
                          <em>{isVideo ? `native ${media?.dur}` : `${bgTime(seg.start)}-${bgTime(seg.end)}`}</em>
                          {!isVideo &&
                          <button className="btn ghost bg-row-action" onClick={(e) => { e.stopPropagation(); extendToEnd(index); }}>Extend</button>}
                        </span>
                      </div>
                      <div className="bg-time-grid">
                        {renderTimeField(seg, index, "start", "Start")}
                        {renderTimeField(seg, index, "end", "End", isVideo)}
                        {renderTimeField(seg, index, "hold", "Hold", isVideo)}
                      </div>
                    </div>
                  </div>);
              })}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>{isEdit ? "Save changes" : "Add background"}</button>
        </div>
      </div>
    </div>);

};

window.BGModal = BGModal;
