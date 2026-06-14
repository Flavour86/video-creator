// SubtitlesModal: edit global subtitle styling.

const SubtitlesModal = ({ open, onClose, settings, onSave, resolution }) => {
  const [s, setS] = React.useState(settings || {});
  const [maxCharsDraft, setMaxCharsDraft] = React.useState(String((settings || {}).maxChars ?? 42));
  React.useEffect(() => {
    if (!open) return;
    setS(settings || {});
    setMaxCharsDraft(String((settings || {}).maxChars ?? 42));
  }, [open, settings]);
  if (!open) return null;

  const renderResolution = resolution || RESOLUTIONS["1080p"];
  const shown = s.show ?? s.burnin ?? true;
  const upd = (k, v) => setS({ ...s, [k]: v });
  const clampMaxChars = (value, fallback = s.maxChars ?? 42) => {
    const parsed = Number(String(value ?? "").trim() || fallback);
    if (!Number.isFinite(parsed)) return Math.max(20, Math.min(80, Math.round(fallback)));
    return Math.max(20, Math.min(80, Math.round(parsed)));
  };
  const updateMaxChars = (raw) => {
    setMaxCharsDraft(raw);
    const trimmed = String(raw).trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 20 || parsed > 80) return;
    setS({ ...s, maxChars: Math.round(parsed) });
  };
  const commitMaxChars = () => {
    const next = clampMaxChars(maxCharsDraft);
    setMaxCharsDraft(String(next));
    setS({ ...s, maxChars: next });
  };
  const updShow = () => {
    const next = !shown;
    setS({ ...s, show: next, burnin: next });
  };
  const hexToRgb = (hex) => {
    const clean = String(hex || "#000000").replace("#", "");
    const n = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const bgRgb = hexToRgb(s.bgColor || "#000000");
  const bgOpacity = (s.bgOpacity ?? 62) / 100;
  const bgMode = s.bg || "block";
  const bgFillEnabled = bgMode === "block" || bgMode === "pill";
  const bgRadiusEnabled = bgMode === "block";
  const cueBackground = bgFillEnabled
    ? `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${bgOpacity})`
    : "transparent";
  const cueRadius = bgMode === "pill" ? 999 : (s.bgRadius ?? 8);
  const previewTargetWidth = renderResolution.aspect < 1 ? 300 : 892;
  const previewScale = previewTargetWidth / renderResolution.w;
  const previewFontSize = Math.max(11, Math.round((s.size || 42) * previewScale));
  const previewLineHeight = Math.round(previewFontSize * 1.18);
  const safeTop = Math.round(renderResolution.h * 0.09 * previewScale);
  const safeBottom = Math.round((s.pos === "bottom_low" ? renderResolution.h * 0.055 : renderResolution.h * 0.04) * previewScale);
  const cueMaxWidth = Math.round(renderResolution.w * 0.64 * previewScale);
  const cueStyle = {
    fontSize: previewFontSize,
    lineHeight: `${previewLineHeight}px`,
    color: s.color || "#ffffff",
    backgroundColor: cueBackground,
    borderRadius: cueRadius,
    fontFamily: s.font || "Arial",
    maxWidth: cueMaxWidth,
    top: s.pos === "top" ? safeTop : "auto",
    bottom: s.pos === "top" ? "auto" : safeBottom
  };
  const maxChars = clampMaxChars(s.maxChars ?? 42);
  const previewLines = wrapSubtitleText(
    "This subtitle preview follows your style and stays inside the safe zone.",
    maxChars
  );

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal subtitles-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Subtitles</h2>
            <p>Subtitles are auto-generated from the transcript via WhisperX alignment. Use the switch to show or hide them.</p>
          </div>
          <button className="iconbtn" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          <div className="field-row two">
            <div className="field">
              <label>Background</label>
              <select value={bgMode} onChange={(e) => upd("bg", e.target.value)}>
                <option value="block">Block background</option>
                <option value="pill">Pill background</option>
                <option value="shadow">Drop shadow only</option>
                <option value="none">None</option>
              </select>
            </div>
            <div className="field">
              <label>Position</label>
              <select value={s.pos || "bottom"} onChange={(e) => upd("pos", e.target.value)}>
                <option value="bottom">Bottom - safe zone</option>
                <option value="bottom_low">Bottom - low</option>
                <option value="top">Top</option>
              </select>
            </div>
          </div>
          <div className="field-row two">
            <div className="field">
              <label>Font</label>
              <select value={s.font || "Arial"} onChange={(e) => upd("font", e.target.value)}>
                <option>Arial</option><option>Inter</option><option>Helvetica Neue</option><option>SF Pro</option>
              </select>
            </div>
            <div className="field">
              <label>Color</label>
              <div className="color-field">
                <input type="color" value={s.color || "#ffffff"} onChange={(e) => upd("color", e.target.value)} />
                <span>{s.color || "#ffffff"}</span>
              </div>
            </div>
          </div>
          <div className="field-row two subtitle-format-row">
            <div className="field">
              <label>Size</label>
              <div className="range-row">
                <input type="range" min={28} max={72} value={s.size || 42} onChange={(e) => upd("size", +e.target.value)} style={{ flex: 1 }} />
                <span className="num-val">{s.size || 42}px</span>
              </div>
            </div>
            <div className="field">
              <label>Max characters per line</label>
              <input
                className="text-field"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={maxCharsDraft}
                onBlur={commitMaxChars}
                onChange={(e) => updateMaxChars(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
            </div>
          </div>
          <label className="switch-row subtitle-switch">
            <button
              type="button"
              role="switch"
              aria-checked={!!shown}
              className={"switch " + (shown ? "on" : "")}
              onClick={updShow}>
              <span className="knob" />
            </button>
            <span className="switch-label">Show subtitles</span>
          </label>
          <div className={"subtitle-bg-controls " + (!bgFillEnabled ? "is-disabled" : "")} aria-disabled={!bgFillEnabled}>
            <div className={"field " + (!bgFillEnabled ? "is-disabled" : "")}>
              <label>Background color</label>
              <div className="color-field">
                <input type="color" value={s.bgColor || "#000000"} disabled={!bgFillEnabled} onChange={(e) => upd("bgColor", e.target.value)} />
                <span>{s.bgColor || "#000000"}</span>
              </div>
            </div>
            <div className={"field " + (!bgFillEnabled ? "is-disabled" : "")}>
              <label>Opacity</label>
              <div className="range-row">
                <input type="range" min={0} max={100} value={s.bgOpacity ?? 62} disabled={!bgFillEnabled} onChange={(e) => upd("bgOpacity", +e.target.value)} style={{ flex: 1 }} />
                <span className="num-val">{s.bgOpacity ?? 62}%</span>
              </div>
            </div>
            <div className={"field " + (!bgRadiusEnabled ? "is-disabled" : "")}>
              <label>Radius</label>
              <div className="range-row">
                <input type="range" min={0} max={32} value={s.bgRadius ?? 8} disabled={!bgRadiusEnabled} onChange={(e) => upd("bgRadius", +e.target.value)} style={{ flex: 1 }} />
                <span className="num-val">{s.bgRadius ?? 8}px</span>
              </div>
            </div>
          </div>
          <div className="sub-preview">
            <div className="sp-frame" style={{ aspectRatio: `${renderResolution.w} / ${renderResolution.h}`, width: renderResolution.aspect < 1 ? "min(100%, 300px)" : undefined }}>
              <span className="sp-label">Preview · {renderResolution.aspect < 1 ? "9:16" : "16:9"}</span>
              {shown && (
                <div className={"sp-cue " + bgMode} style={cueStyle}>
                  {previewLines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => {onSave(s);onClose();}}>Apply</button>
        </div>
      </div>
    </div>);

};

window.SubtitlesModal = SubtitlesModal;
