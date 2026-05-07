// BGModal — simple asset picker for the background layer.
// BG always spans the full project, so we don't expose range or compositing.

const BGModal = ({ open, onClose, onApply, bgItem }) => {
  const isEdit = !!bgItem;
  const initialIds = bgItem?.mediaIds || (bgItem?.mediaId ? [bgItem.mediaId] : ["m6"]);
  const [mediaIds, setMediaIds] = React.useState(initialIds);
  const [motionKind, setMotionKind] = React.useState(bgItem?.motion?.kind || "ken_burns");
  const [easing, setEasing] = React.useState(bgItem?.motion?.easing || "ease_in_out");
  const [crossfade, setCrossfade] = React.useState(bgItem?.crossfade ?? 0.6);

  React.useEffect(() => {
    if (!open) return;
    const ids = bgItem?.mediaIds || (bgItem?.mediaId ? [bgItem.mediaId] : ["m6"]);
    setMediaIds(ids);
    setMotionKind(bgItem?.motion?.kind || "ken_burns");
    setEasing(bgItem?.motion?.easing || "ease_in_out");
    setCrossfade(bgItem?.crossfade ?? 0.6);
  }, [open, bgItem]);

  if (!open) return null;

  // selection kind = kind of currently-selected items (locks the picker to one kind at a time)
  const lockedKind = mediaIds.length > 0 ? MEDIA_BY_ID[mediaIds[0]]?.kind : null;

  const toggleAsset = (mm) => {
    if (mediaIds.includes(mm.id)) {
      // last one stays — must keep at least one
      if (mediaIds.length === 1) return;
      setMediaIds(mediaIds.filter((x) => x !== mm.id));
    } else {
      // if a different kind is already selected, replace selection rather than mix
      if (lockedKind && mm.kind !== lockedKind) {
        setMediaIds([mm.id]);
      } else {
        setMediaIds([...mediaIds, mm.id]);
      }
    }
  };

  const submit = () => {
    onApply({
      mediaIds,
      mediaId: mediaIds[0], // back-compat for the single-asset code paths
      motion: { kind: motionKind, easing },
      crossfade
    });
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{isEdit ? "Change background" : "Add background"}</h2>
            <p>The background spans the entire video and shows whenever no foreground is active.</p>
          </div>
          <button className="iconbtn" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>
              Assets
              <span className="label-meta">{mediaIds.length} selected · {lockedKind === "video" ? "clips" : "images"} only</span>
              <button className="btn ghost xs label-action" onClick={() => alert("Open native file dialog → import to project's media library.")}>
                <Icon name="folder" size={11}/> Import from disk…
              </button>
            </label>
            <div className="asset-grid">
              {MEDIA.map((mm) => {
                const sel = mediaIds.includes(mm.id);
                const willReplace = !sel && lockedKind && mm.kind !== lockedKind;
                return (
                  <button key={mm.id}
                  className={"asset-card " + (sel ? "on " : "") + (willReplace ? "will-replace" : "")}
                  onClick={() => toggleAsset(mm)}
                  title={willReplace ? `Switches selection to ${mm.kind === "video" ? "clips" : "images"}` : null}>
                    <div className="thumb" style={{ background: thumbGrad(mm.thumb) }}>
                      <span className="badge">{mm.kind === "video" ? "MP4" : "IMG"}</span>
                      {sel && <span className="sel-tick"><Icon name="check" size={11} /></span>}
                    </div>
                    <div className="name">{mm.name}</div>
                  </button>);
              })}
            </div>
            {mediaIds.length > 1 && <p className="hint">{mediaIds.length} {lockedKind === "video" ? "clips" : "images"} will play in sequence and loop. Reorder by clicking to deselect, then re-select in the desired order.</p>}
          </div>

          <div className="field-row two">
            <div className="field">
              <label>Motion</label>
              <select value={motionKind} onChange={(e) => setMotionKind(e.target.value)}>
                <option value="none">None — static</option>
                <option value="ken_burns">Ken Burns · subtle</option>
                <option value="ken_burns_strong">Ken Burns · strong</option>
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
            <label>Crossfade between cycles</label>
            <div className="range-row">
              <input type="range" min={0} max={2} step={0.1} value={crossfade} onChange={(e) => setCrossfade(+e.target.value)} style={{ flex: 1 }} />
              <span className="num-val">{crossfade.toFixed(1)}s</span>
            </div>
            <p className="hint">When the background image cycles to the next asset in the playlist, this is how long the crossfade takes.</p>
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