// Inspector — context-aware. Renders parameters for the selected item
// matching its layer kind (sub / bg / fg / pip).

const POS_LABELS_INS = ["TL","TC","TR","ML","MC","MR","BL","BC","BR"];

const InspectorEmpty = () => (
  <div className="ins-empty">
    <Icon name="layers" size={22}/>
    <strong>Nothing selected</strong>
    <p>Click an item in any layer to edit its parameters.<br/>Right-click a sentence to add a new foreground or PiP item.</p>
  </div>
);

const InspectorSub = ({ item, onPatch }) => (
  <>
    <div className="ins-section">
      <h4>Subtitles · auto</h4>
      <p className="hint">Cues are derived from aligned sentence ranges. Edit a single cue by clicking it in the transcript.</p>
      <div className="kv"><span className="k">cue count</span><span className="v">164</span></div>
      <div className="kv"><span className="k">avg duration</span><span className="v">3.4 s</span></div>
      <div className="kv"><span className="k">cps cap</span><span className="v">17</span></div>
    </div>
    <div className="ins-section">
      <h4>Style</h4>
      <div className="field-grid">
        <div className="label">Burn-in</div>
        <div className="seg">
          <button className={item.burnIn ? "on" : ""} onClick={()=>onPatch({burnIn: true})}>On</button>
          <button className={!item.burnIn ? "on" : ""} onClick={()=>onPatch({burnIn: false})}>Off</button>
        </div>
        <div className="label">Font</div>
        <select value={item.font || "inter"} onChange={(e)=>onPatch({font: e.target.value})}>
          <option value="inter">Inter</option><option value="ibm">IBM Plex Sans</option><option value="system">System</option>
        </select>
        <div className="label">Size</div>
        <input type="number" value={item.fontSize || 36} onChange={(e)=>onPatch({fontSize: +e.target.value})}/>
        <div className="label">Position</div>
        <div className="seg">
          <button className={(item.subPos||"bottom")==="bottom"?"on":""} onClick={()=>onPatch({subPos:"bottom"})}>Bottom</button>
          <button className={item.subPos==="top"?"on":""} onClick={()=>onPatch({subPos:"top"})}>Top</button>
        </div>
      </div>
    </div>
  </>
);

const InspectorBG = ({ item, onPatch, onDelete, onChangeAsset }) => {
  const m = MEDIA_BY_ID[item.mediaId];
  return (
    <>
      <div className="ins-section">
        <h4>Background</h4>
        <button className="ins-asset clickable" onClick={onChangeAsset} title="Click to change asset">
          <div className="ins-thumb" style={{background: thumbGrad(m?.thumb)}}/>
          <div>
            <div className="name">{m?.name}</div>
            <div className="meta">{m?.kind === "video" ? m.dur : `${m?.w}×${m?.h}`} · {m?.size}</div>
          </div>
          <span className="swap-hint"><Icon name="upload" size={11}/> change</span>
        </button>
        <p className="hint">Plays underneath all other layers. When the foreground covers the screen, BG is hidden.</p>
      </div>
      <div className="ins-section">
        <h4>Cycle &amp; crossfade</h4>
        <div className="field-grid">
          <div className="label">Cycle</div>
          <div className="seg">
            <button className={!item.cycle ? "on" : ""} onClick={()=>onPatch({cycle:false})}>Hold</button>
            <button className={item.cycle ? "on" : ""} onClick={()=>onPatch({cycle:true})}>Cycle list</button>
          </div>
          <div className="label">Crossfade</div>
          <input type="number" step="0.1" value={item.crossfade ?? 0.6} onChange={(e)=>onPatch({crossfade:+e.target.value})}/>
        </div>
      </div>
      <div className="ins-section">
        <h4>Motion</h4>
        <div className="field-grid">
          <div className="label">Kind</div>
          <select value={item.motion?.kind || "static"} onChange={(e)=>onPatch({motion:{...item.motion, kind:e.target.value}})}>
            <option value="none">None</option>
            <option value="ken_burns">Ken Burns · subtle</option>
            <option value="ken_burns_strong">Ken Burns · strong</option>
          </select>
        </div>
      </div>
      <button className="btn ghost danger ins-del" onClick={onDelete}><Icon name="trash" size={12}/> Remove background</button>
    </>
  );
};

const InspectorFG = ({ item, layer, onPatch, onDelete, onChangeAsset }) => {
  const m = MEDIA_BY_ID[item.mediaId];
  return (
    <>
      <div className="ins-section">
        <h4>Foreground · {layer.name}</h4>
        <button className="ins-asset clickable" onClick={onChangeAsset} title="Click to change asset">
          <div className="ins-thumb" style={{background: thumbGrad(m?.thumb)}}/>
          <div>
            <div className="name">{m?.name}</div>
            <div className="meta">s{item.sentences[0]}–s{item.sentences[1]} · {fmtTC(item.start, false)}–{fmtTC(item.end, false)}</div>
          </div>
          <span className="swap-hint"><Icon name="upload" size={11}/> change</span>
        </button>
      </div>
      <div className="ins-section">
        <h4>Range</h4>
        <div className="field-grid">
          <div className="label">From</div>
          <input type="number" min={1} max={SENTENCES.length} value={item.sentences[0]} onChange={(e)=>{
            const lo = +e.target.value || 1;
            onPatch({sentences:[lo, Math.max(lo, item.sentences[1])], start: SENTENCES[lo-1].start});
          }}/>
          <div className="label">To</div>
          <input type="number" min={1} max={SENTENCES.length} value={item.sentences[1]} onChange={(e)=>{
            const hi = +e.target.value || 1;
            onPatch({sentences:[Math.min(item.sentences[0], hi), hi], end: SENTENCES[hi-1].end});
          }}/>
          <div className="label">Stretch</div>
          <span className="mono small">drag clip edges in the timeline ↗</span>
        </div>
      </div>
      <div className="ins-section">
        <h4>Motion</h4>
        <div className="field-grid">
          <div className="label">Kind</div>
          <select value={item.motion?.kind || "static"} onChange={(e)=>onPatch({motion:{...item.motion, kind:e.target.value}})}>
            <option value="none">None — static</option>
            <option value="ken_burns">Ken Burns · subtle</option>
            <option value="ken_burns_strong">Ken Burns · strong</option>
            <option value="zoom_in">Zoom in</option>
            <option value="zoom_out">Zoom out</option>
            <option value="pan_left">Pan left</option>
            <option value="pan_right">Pan right</option>
          </select>
          <div className="label">Easing</div>
          <select value={item.motion?.easing || "ease_in_out"} disabled={item.motion?.kind === "none"} onChange={(e)=>onPatch({motion:{...item.motion, easing:e.target.value}})}>
            <option value="linear">linear</option>
            <option value="ease_in">ease in</option>
            <option value="ease_out">ease out</option>
            <option value="ease_in_out">ease in-out</option>
          </select>
        </div>
      </div>
      <div className="ins-section">
        <h4>Transitions</h4>
        <div className="field-grid">
          <div className="label">In</div>
          <select value={item.transitions?.in || "fade"} onChange={(e)=>onPatch({transitions:{...item.transitions, in:e.target.value}})}>
            <option value="cut">cut</option>
            <option value="fade">fade · 0.4s</option>
            <option value="slide_left">slide left</option>
            <option value="slide_right">slide right</option>
            <option value="dip_black">dip to black</option>
          </select>
          <div className="label">Out</div>
          <select value={item.transitions?.out || "cut"} onChange={(e)=>onPatch({transitions:{...item.transitions, out:e.target.value}})}>
            <option value="cut">cut</option>
            <option value="fade">fade · 0.4s</option>
            <option value="slide_left">slide left</option>
            <option value="slide_right">slide right</option>
            <option value="dip_black">dip to black</option>
          </select>
        </div>
      </div>
      <button className="btn ghost danger ins-del" onClick={onDelete}><Icon name="trash" size={12}/> Delete item</button>
    </>
  );
};

const InspectorPiP = ({ item, layer, onPatch, onDelete, onChangeAsset }) => {
  const m = MEDIA_BY_ID[item.mediaId];
  const pip = item.pip || { posX: 2, posY: 2, size: 30, radius: 12, opacity: 100 };
  const setPip = (patch) => onPatch({ pip: { ...pip, ...patch } });
  return (
    <>
      <div className="ins-section">
        <h4>PiP · {layer.name}</h4>
        <button className="ins-asset clickable" onClick={onChangeAsset} title="Click to change asset">
          <div className="ins-thumb" style={{background: thumbGrad(m?.thumb), borderRadius: pip.radius/2}}/>
          <div>
            <div className="name">{m?.name}</div>
            <div className="meta">s{item.sentences[0]}–s{item.sentences[1]} · {fmtTC(item.start, false)}–{fmtTC(item.end, false)}</div>
          </div>
          <span className="swap-hint"><Icon name="upload" size={11}/> change</span>
        </button>
      </div>
      <div className="ins-section">
        <h4>Placement</h4>
        <div className="pos-grid">
          {[0,1,2].map((y) => [0,1,2].map((x) => {
            const on = pip.posX === x && pip.posY === y;
            return <button key={y*3+x} className={"pos-cell " + (on?"on":"")} onClick={()=>setPip({posX:x, posY:y})}>{POS_LABELS_INS[y*3+x]}</button>;
          }))}
        </div>
        <div className="pip-fields compact">
          <div className="row"><span>Size</span><input type="range" min={15} max={60} value={pip.size} onChange={(e)=>setPip({size:+e.target.value})}/><span className="num-val">{pip.size}%</span></div>
          <div className="row"><span>Radius</span><input type="range" min={0} max={32} value={pip.radius} onChange={(e)=>setPip({radius:+e.target.value})}/><span className="num-val">{pip.radius}px</span></div>
          <div className="row"><span>Opacity</span><input type="range" min={20} max={100} value={pip.opacity} onChange={(e)=>setPip({opacity:+e.target.value})}/><span className="num-val">{pip.opacity}%</span></div>
        </div>
      </div>
      <div className="ins-section">
        <h4>Range</h4>
        <div className="field-grid">
          <div className="label">From</div>
          <input type="number" min={1} max={SENTENCES.length} value={item.sentences[0]} onChange={(e)=>{
            const lo = +e.target.value || 1;
            onPatch({sentences:[lo, Math.max(lo, item.sentences[1])], start: SENTENCES[lo-1].start});
          }}/>
          <div className="label">To</div>
          <input type="number" min={1} max={SENTENCES.length} value={item.sentences[1]} onChange={(e)=>{
            const hi = +e.target.value || 1;
            onPatch({sentences:[Math.min(item.sentences[0], hi), hi], end: SENTENCES[hi-1].end});
          }}/>
        </div>
      </div>
      <div className="ins-section">
        <h4>Motion &amp; transitions</h4>
        <div className="field-grid">
          <div className="label">Motion</div>
          <select value={item.motion?.kind || "static"} onChange={(e)=>onPatch({motion:{...item.motion, kind:e.target.value}})}>
            <option value="none">None</option>
            <option value="zoom_in">Zoom in</option>
            <option value="zoom_out">Zoom out</option>
            <option value="ken_burns">Ken Burns · subtle</option>
          </select>
          <div className="label">In</div>
          <select value={item.transitions?.in || "fade"} onChange={(e)=>onPatch({transitions:{...item.transitions, in:e.target.value}})}>
            <option value="cut">cut</option><option value="fade">fade</option><option value="slide_left">slide left</option><option value="slide_right">slide right</option>
          </select>
          <div className="label">Out</div>
          <select value={item.transitions?.out || "fade"} onChange={(e)=>onPatch({transitions:{...item.transitions, out:e.target.value}})}>
            <option value="cut">cut</option><option value="fade">fade</option><option value="slide_left">slide left</option><option value="slide_right">slide right</option>
          </select>
        </div>
      </div>
      <button className="btn ghost danger ins-del" onClick={onDelete}><Icon name="trash" size={12}/> Delete PiP item</button>
    </>
  );
};

const Inspector = ({ selection, layers, onPatch, onDelete, onChangeAsset, onChangeBGAsset }) => {
  if (!selection) return <InspectorEmpty/>;
  const layer = layers.find(l => l.id === selection.layerId);
  if (!layer) return <InspectorEmpty/>;
  const item = layer.items.find(it => it.id === selection.itemId);
  if (!item) return <InspectorEmpty/>;

  const patch = (p) => onPatch(layer.id, item.id, p);
  const del = () => onDelete(layer.id, item.id);
  const changeAsset = () => onChangeAsset && onChangeAsset(layer, item);

  return (
    <div className="ins-body">
      {layer.kind === "sub" && <InspectorSub item={item} onPatch={patch}/>}
      {layer.kind === "bg" && <InspectorBG item={item} onPatch={patch} onDelete={del} onChangeAsset={onChangeBGAsset}/>}
      {layer.kind === "fg" && <InspectorFG item={item} layer={layer} onPatch={patch} onDelete={del} onChangeAsset={changeAsset}/>}
      {layer.kind === "pip" && <InspectorPiP item={item} layer={layer} onPatch={patch} onDelete={del} onChangeAsset={changeAsset}/>}
    </div>
  );
};

window.Inspector = Inspector;
