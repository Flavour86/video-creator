const SetupScreen = ({ go }) => {
  const [alignment, setAlignment] = React.useState("succeeded");
  const runAlignment = () => {
    setAlignment("running");
    window.setTimeout(() => setAlignment("succeeded"), 1400);
  };
  const alignmentDone = alignment === "succeeded";

  return (
    <div className="screen" data-screen-label="02 Setup">
      <div className="setup">
        <div className="setup-head">
          <div>
            <p className="eyebrow">New project</p>
            <h1>SetUp</h1>
          </div>
          <div style={{display:"flex", gap:8}}>
            <button className="btn" onClick={() => go("launcher")}>Cancel</button>
            <button className="btn primary" disabled={!alignmentDone} onClick={() => go("editor")}>Continue to editor</button>
          </div>
        </div>

        <ol className="stepper">
          <li className="done">
            <span className="num"><Icon name="check" size={11}/></span>
            <div>Folder<small>selected</small></div>
          </li>
          <li className="done">
            <span className="num"><Icon name="check" size={11}/></span>
            <div>Voice + transcript<small>detected automatically</small></div>
          </li>
          <li className="done">
            <span className="num"><Icon name="check" size={11}/></span>
            <div>Alignment<small>ready</small></div>
          </li>
        </ol>

        <div className="panel setup-card">
          <div className="row">
            <div style={{display:"grid", gridTemplateColumns:"1fr 200px", gap:14}}>
              <div>
                <label className="field">Project name
                  <input defaultValue="Tokyo Essay"/>
                </label>
              </div>
              <div>
                <label className="field">Output preset
                  <select defaultValue="final">
                    <option value="final">Final / 1080p / CRF 18</option>
                    <option value="draft">Draft / 720p / ultrafast</option>
                    <option value="vert">Vertical / 9:16 / 1080w</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="row">
            <h3 className="row-h">Inputs</h3>
            <p className="row-sub">Voice and transcript are detected from the selected folder. Watermark is optional; visual media is imported later from the Editor.</p>
            <div className="drop-grid three">
              <div className="drop done">
                <Icon name="waveform" size={22}/>
                <strong>voice.wav</strong>
                <span>15:42 / 48kHz / stereo</span>
                <span className="tag ok" style={{marginTop:4}}>copied</span>
              </div>
              <div className="drop done">
                <Icon name="type" size={22}/>
                <strong>transcript.txt</strong>
                <span>164 sentences detected</span>
                <span className="tag ok" style={{marginTop:4}}>parsed</span>
              </div>
              <div className="drop">
                <Icon name="image" size={22}/>
                <strong>watermark.png</strong>
                <span>optional</span>
                <button className="btn sm ghost" style={{marginTop:4}}>Choose</button>
              </div>
            </div>
          </div>
        </div>

        <div className="panel align-card">
          <div className="panel-head" style={{padding:"10px 14px", border:0}}>
            <h3>Alignment</h3>
            <span className={"tag " + (alignment === "running" ? "warn" : alignmentDone ? "ok" : "info")}>
              <span className={"dot " + (alignment === "running" ? "warn" : alignmentDone ? "ok" : "info")}/>
              {alignment === "running" ? "aligning" : alignmentDone ? "succeeded" : "ready"}
            </span>
          </div>
          <p style={{margin:"0 14px 12px", fontSize:12, color:"var(--text-2)", padding:0}}>
            {alignment === "running" ? "Calling the local alignment API and waiting for sentence timestamps." : alignmentDone ? "Sentence timestamps are ready. Entering the editor is allowed only after this succeeds." : "Run alignment before entering the editor."}
          </p>
          <div style={{padding:"0 14px 14px"}}>
            <div className="job">
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <strong style={{fontSize:12}}>Forced alignment</strong>
              </div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11}}>
                <div className="kv"><span className="k">sentences</span><span className="v">164</span></div>
                <div className="kv"><span className="k">duration</span><span className="v">15:42</span></div>
              </div>
              <button className="btn accent" disabled={alignment === "running"} onClick={runAlignment} style={{justifyContent:"center"}}>
                <Icon name="cpu" size={13}/>{alignment === "running" ? "Calling alignment" : "Run alignment"}
              </button>
            </div>

            <ul className="checks">
              <li><span className="dot ok"/>Transcript readable / 164 sentences</li>
              <li><span className="dot ok"/>Audio stream valid / pcm_s16le / 48kHz</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

window.SetupScreen = SetupScreen;
