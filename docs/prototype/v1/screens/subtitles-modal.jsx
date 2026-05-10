// SubtitlesModal: edit global subtitle styling.

const SubtitlesModal = ({ open, onClose, settings, onSave }) => {
  const [s, setS] = React.useState(settings || {});
  React.useEffect(() => {if (open) setS(settings || {});}, [open, settings]);
  if (!open) return null;
  const upd = (k, v) => setS({ ...s, [k]: v });

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Subtitles</h2>
            <p>Subtitles are auto-generated from the transcript via WhisperX alignment. Style and burn-in below.</p>
          </div>
          <button className="iconbtn" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          <div className="field-row two">
            <div className="field">
              <label>Background</label>
              <select value={s.bg} onChange={(e) => upd("bg", e.target.value)}>
                <option value="none">None</option>
                <option value="pill">Pill · 60% black</option>
                <option value="block">Block · 80% black</option>
                <option value="shadow">Drop shadow only</option>
              </select>
            </div>
            <div className="field">
              <label>Position</label>
              <select value={s.pos} onChange={(e) => upd("pos", e.target.value)}>
                <option value="bottom">Bottom · safe zone</option>
                <option value="bottom_low">Bottom · low</option>
                <option value="top">Top</option>
              </select>
            </div>
          </div>
          <div className="field-row two">
            <div className="field">
              <label>Font</label>
              <select value={s.font} onChange={(e) => upd("font", e.target.value)}>
                <option>Inter</option><option>Söhne</option><option>Helvetica Neue</option><option>SF Pro</option>
              </select>
            </div>
            <div className="field">
              <label>Max chars / line</label>
              <input type="number" min={20} max={80} value={s.maxChars || 42} onChange={(e) => upd("maxChars", +e.target.value)} style={{height: `31px`}} />
            </div>
          </div>
          <div className="field-row two">
            <div className="field">
              <label>Size</label>
              <div className="range-row">
                <input type="range" min={28} max={72} value={s.size || 44} onChange={(e) => upd("size", +e.target.value)} style={{ flex: 1 }} />
                <span className="hint size-hint">{s.size || 44}px @ 1080p</span>
              </div>
            </div>
            <div className="field">
              <label>Burn-in</label>
              <label className="switch-row">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!s.burnin}
                  className={"switch " + (s.burnin ? "on" : "")}
                  onClick={() => upd("burnin", !s.burnin)}>
                  <span className="knob" />
                </button>
              </label>
            </div>
          </div>
          <div className="sub-preview">
            <div className="sp-frame">
              <div className={"sp-cue " + (s.bg || "none")} style={{ fontSize: 14 * ((s.size || 44) / 44), top: s.pos === "top" ? 16 : "auto", bottom: s.pos === "bottom" ? 32 : s.pos === "bottom_low" ? 14 : "auto" }}>
                Drop an image onto a sentence and the editor knows when it should appear.
              </div>
              <span className="sp-label">Preview · 16:9</span>
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
