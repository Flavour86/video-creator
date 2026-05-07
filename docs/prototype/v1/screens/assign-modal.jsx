// AssignModal — invoked from sentence right-click "Upload to range".
// Configures: asset, sentence range, compositing (FS/PiP), z-target layer,
// PiP position/size/radius/opacity, motion, easing, transitions.

const POS_LABELS = ["TL","TC","TR","ML","MC","MR","BL","BC","BR"];

const AssignModal = ({ open, onClose, onSubmit, initialRange, layers, editing }) => {
  const isEdit = !!editing;
  const [mediaId, setMediaId] = React.useState(editing?.mediaId || "m1");
  const [rangeLo, setRangeLo] = React.useState(initialRange?.[0] || editing?.sentences?.[0] || 1);
  const [rangeHi, setRangeHi] = React.useState(initialRange?.[1] || editing?.sentences?.[1] || initialRange?.[0] || 1);
  const [comp, setComp] = React.useState(editing?.kind === "pip" ? "pip" : "fullscreen");
  const [zTarget, setZTarget] = React.useState(editing?.layerId || "__new__");
  const [pip, setPip] = React.useState(editing?.pip || { posX: 2, posY: 2, size: 30, radius: 12, opacity: 100 });
  const [motionKind, setMotionKind] = React.useState(editing?.motion?.kind || "static");
  const [easing, setEasing] = React.useState(editing?.motion?.easing || "ease_in_out");
  const [trIn, setTrIn] = React.useState(editing?.transitions?.in || "fade");
  const [trOut, setTrOut] = React.useState(editing?.transitions?.out || "cut");

  React.useEffect(() => {
    if (!open) return;
    setMediaId(editing?.mediaId || "m1");
    setRangeLo(initialRange?.[0] || editing?.sentences?.[0] || 1);
    setRangeHi(initialRange?.[1] || editing?.sentences?.[1] || initialRange?.[0] || 1);
    setComp(editing?.kind === "pip" ? "pip" : "fullscreen");
    setZTarget(editing?.layerId || "__new__");
    setPip(editing?.pip || { posX: 2, posY: 2, size: 30, radius: 12, opacity: 100 });
    setMotionKind(editing?.motion?.kind || "static");
    setEasing(editing?.motion?.easing || "ease_in_out");
    setTrIn(editing?.transitions?.in || "fade");
    setTrOut(editing?.transitions?.out || "cut");
  }, [open, editing, initialRange]);

  if (!open) return null;
  const m = MEDIA_BY_ID[mediaId];
  const startTC = SENTENCES[Math.max(0, Math.min(SENTENCES.length-1, rangeLo-1))]?.start ?? 0;
  const endTC = SENTENCES[Math.max(0, Math.min(SENTENCES.length-1, rangeHi-1))]?.end ?? 0;

  const fgLayers = layers.filter(l => l.kind === "fg");
  const pipLayers = layers.filter(l => l.kind === "pip");
  const targetLayers = comp === "pip" ? pipLayers : fgLayers;

  const submit = () => {
    onSubmit({
      mediaId,
      sentences: [Math.min(rangeLo, rangeHi), Math.max(rangeLo, rangeHi)],
      start: startTC,
      end: endTC,
      comp,
      zTarget,
      pip: comp === "pip" ? pip : undefined,
      motion: { kind: motionKind, easing },
      transitions: { in: trIn, out: trOut },
      editing: editing ? { layerId: editing.layerId, itemId: editing.itemId } : undefined,
    });
    onClose();
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{isEdit ? "Edit assignment" : "Upload to range"}</h2>
            <p>Place a media asset over a span of sentences. The timeline is computed automatically.</p>
          </div>
          <button className="iconbtn" onClick={onClose}><Icon name="close"/></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>
              Asset
              <button className="btn ghost xs label-action" onClick={() => alert("Open native file dialog → import to project's media library.")}>
                <Icon name="folder" size={11}/> Import from disk…
              </button>
            </label>
            <div className="asset-grid">
              {MEDIA.map((mm) => (
                <button key={mm.id} className={"asset-card " + (mm.id === mediaId ? "on" : "")} onClick={() => setMediaId(mm.id)}>
                  <div className="thumb" style={{background: thumbGrad(mm.thumb)}}>
                    <span className="badge">{mm.kind === "video" ? "MP4" : "IMG"}</span>
                  </div>
                  <div className="name">{mm.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Sentence range</label>
            <div className="range-row">
              <span className="hint">From</span>
              <input type="number" min={1} max={SENTENCES.length} value={rangeLo} onChange={(e)=>setRangeLo(+e.target.value||1)} className="num"/>
              <span className="hint">to</span>
              <input type="number" min={1} max={SENTENCES.length} value={rangeHi} onChange={(e)=>setRangeHi(+e.target.value||1)} className="num"/>
              <span className="tag info" style={{marginLeft:"auto"}}>
                <span className="dot info"/>{fmtTC(startTC,false)}–{fmtTC(endTC,false)} · {(endTC - startTC).toFixed(1)}s
              </span>
            </div>
            <div className="range-preview">
              {SENTENCES.slice(Math.min(rangeLo, rangeHi)-1, Math.max(rangeLo, rangeHi)).map((s) => (
                <div key={s.idx} className="rp-row"><span className="idx">s{s.idx}</span><span className="text">{s.text}</span></div>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Compositing</label>
            <div className="comp-pick">
              <button className={"comp-card " + (comp==="fullscreen" ? "on" : "")} onClick={()=>setComp("fullscreen")}>
                <div className="comp-illu fs">
                  <div className="img"></div>
                </div>
                <strong>Fullscreen</strong>
                <span>Foreground replaces background while active.</span>
              </button>
              <button className={"comp-card " + (comp==="pip" ? "on" : "")} onClick={()=>setComp("pip")}>
                <div className="comp-illu pip">
                  <div className="img"></div>
                  <div className="pip-rect"></div>
                </div>
                <strong>Picture-in-picture</strong>
                <span>Overlay sits on top; multi-stack supported.</span>
              </button>
            </div>
          </div>

          <div className="field">
            <label>Layer</label>
            <select value={zTarget} onChange={(e)=>setZTarget(e.target.value)} className="select-wide">
              <option value="__new__">+ Create new {comp === "pip" ? "PiP" : "Foreground"} layer (z{(comp === "pip" ? pipLayers.length+1 : fgLayers.length+1)})</option>
              {targetLayers.map((l) => (
                <option key={l.id} value={l.id}>{l.name} · {l.items.length} items</option>
              ))}
            </select>
            <p className="hint">Higher layers render on top. PiP layers always sit above foreground.</p>
          </div>

          {comp === "pip" && (
            <div className="field">
              <label>PiP placement</label>
              <div className="pip-cfg">
                <div className="pos-grid">
                  {[0,1,2].map((y) => [0,1,2].map((x) => {
                    const on = pip.posX === x && pip.posY === y;
                    return <button key={y*3+x} className={"pos-cell " + (on?"on":"")} onClick={()=>setPip({...pip, posX:x, posY:y})}>{POS_LABELS[y*3+x]}</button>;
                  }))}
                </div>
                <div className="pip-fields">
                  <div className="row"><span>Size</span><input type="range" min={15} max={60} value={pip.size} onChange={(e)=>setPip({...pip, size:+e.target.value})}/><span className="num-val">{pip.size}%</span></div>
                  <div className="row"><span>Radius</span><input type="range" min={0} max={32} value={pip.radius} onChange={(e)=>setPip({...pip, radius:+e.target.value})}/><span className="num-val">{pip.radius}px</span></div>
                  <div className="row"><span>Opacity</span><input type="range" min={20} max={100} value={pip.opacity} onChange={(e)=>setPip({...pip, opacity:+e.target.value})}/><span className="num-val">{pip.opacity}%</span></div>
                </div>
                <div className="pip-preview">
                  <div className="pp-frame">
                    {comp === "pip" && (
                      <div className="pp-pip" style={{
                        width: `${pip.size}%`, aspectRatio: "16/9", borderRadius: pip.radius, opacity: pip.opacity/100,
                        left: pip.posX === 0 ? "4%" : pip.posX === 1 ? "50%" : "auto",
                        right: pip.posX === 2 ? "4%" : "auto",
                        top: pip.posY === 0 ? "4%" : pip.posY === 1 ? "50%" : "auto",
                        bottom: pip.posY === 2 ? "4%" : "auto",
                        transform: `translate(${pip.posX===1?"-50%":"0"}, ${pip.posY===1?"-50%":"0"})`,
                        background: thumbGrad(m?.thumb || "night"),
                      }}/>
                    )}
                    <div className="pp-label">Preview</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="field-row two">
            <div className="field">
              <label>Motion</label>
              <select value={motionKind} onChange={(e)=>setMotionKind(e.target.value)}>
                <option value="none">None — static</option>
                <option value="ken_burns">Ken Burns · subtle</option>
                <option value="ken_burns_strong">Ken Burns · strong</option>
                <option value="zoom_in">Zoom in</option>
                <option value="zoom_out">Zoom out</option>
                <option value="pan_left">Pan left</option>
                <option value="pan_right">Pan right</option>
              </select>
            </div>
            <div className="field">
              <label>Easing</label>
              <select value={easing} onChange={(e)=>setEasing(e.target.value)} disabled={motionKind === "none"}>
                <option value="linear">linear</option>
                <option value="ease_in">ease in</option>
                <option value="ease_out">ease out</option>
                <option value="ease_in_out">ease in-out</option>
              </select>
            </div>
          </div>

          <div className="field-row two">
            <div className="field">
              <label>Transition in</label>
              <select value={trIn} onChange={(e)=>setTrIn(e.target.value)}>
                <option value="cut">cut</option>
                <option value="fade">fade · 0.4s</option>
                <option value="slide_left">slide left</option>
                <option value="slide_right">slide right</option>
                <option value="dip_black">dip to black</option>
              </select>
            </div>
            <div className="field">
              <label>Transition out</label>
              <select value={trOut} onChange={(e)=>setTrOut(e.target.value)}>
                <option value="cut">cut</option>
                <option value="fade">fade · 0.4s</option>
                <option value="slide_left">slide left</option>
                <option value="slide_right">slide right</option>
                <option value="dip_black">dip to black</option>
              </select>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>{isEdit ? "Save changes" : "Add to project"}</button>
        </div>
      </div>
    </div>
  );
};

window.AssignModal = AssignModal;
