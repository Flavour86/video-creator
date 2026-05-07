const SetupScreen = ({ go }) => {
  return (
    <div className="screen" data-screen-label="02 Setup">
    <div className="setup">
      <div className="setup-head">
        <div>
          <p className="eyebrow">New project</p>
          <h1>Create project folder</h1>
        </div>
        <div style={{display:"flex", gap:8}}>
          <button className="btn" onClick={() => go("launcher")}>Cancel</button>
          <button className="btn primary" onClick={() => go("editor")}>Continue → Editor</button>
        </div>
      </div>

      <ol className="stepper">
        <li className="done">
          <span className="num"><Icon name="check" size={11}/></span>
          <div>Folder<small>E:\video-projects\tokyo-essay</small></div>
        </li>
        <li className="active">
          <span className="num">2</span>
          <div>Voice + transcript<small>two required inputs</small></div>
        </li>
        <li>
          <span className="num">3</span>
          <div>Alignment<small>WhisperX forced align</small></div>
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
                  <option value="final">Final · 1080p · CRF 18</option>
                  <option value="draft">Draft · 720p · ultrafast</option>
                  <option value="vert">Vertical · 9:16 · 1080w</option>
                </select>
              </label>
            </div>
          </div>
          <div className="path-card" style={{marginTop:12}}>
            <Icon name="folder" size={18}/>
            <div style={{flex:1, minWidth:0}}>
              <strong>E:\video-projects\tokyo-essay</strong>
              <span>project.json · media/ · renders/ · .vc/ will be created here</span>
            </div>
            <button className="btn sm">Change…</button>
          </div>
        </div>

        <div className="row">
          <h3 className="row-h">Inputs</h3>
          <p className="row-sub">Voice and transcript are the only inputs needed up front. Add media later from the Editor — assets are imported the moment you assign them to a sentence.</p>
          <div className="drop-grid two">
            <div className="drop done">
              <Icon name="waveform" size={22}/>
              <strong>voice.wav</strong>
              <span>15:42 · 48kHz · stereo</span>
              <span className="tag ok" style={{marginTop:4}}>copied</span>
            </div>
            <div className="drop done">
              <Icon name="type" size={22}/>
              <strong>transcript.txt</strong>
              <span>164 sentences detected</span>
              <span className="tag ok" style={{marginTop:4}}>parsed</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel align-card">
        <div className="panel-head" style={{padding:"10px 14px", border:0}}>
          <h3>Alignment</h3>
          <span className="tag warn"><span className="dot warn"/>pending</span>
        </div>
        <p style={{margin:"0 14px 12px", fontSize:12, color:"var(--text-2)", padding:0}}>
          WhisperX timestamps the provided transcript against <span className="mono">voice.wav</span>. The text is the reference; ASR never runs.
        </p>
        <div style={{padding:"0 14px 14px"}}>
          <div className="job">
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <strong style={{fontSize:12}}>Forced alignment</strong>
              <span className="tag info"><span className="dot info"/>cache miss</span>
            </div>
            <div className="hash">sha256(voice.wav + transcript.txt) = 8a3f2c1d…</div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11}}>
              <div className="kv"><span className="k">device</span><span className="v">cuda · fp16</span></div>
              <div className="kv"><span className="k">model</span><span className="v">large-v3</span></div>
              <div className="kv"><span className="k">est. time</span><span className="v">~52s</span></div>
              <div className="kv"><span className="k">audio dur</span><span className="v">15:42</span></div>
            </div>
            <button className="btn accent" style={{justifyContent:"center"}}>
              <Icon name="cpu"/> Run alignment
            </button>
          </div>

          <ul className="checks">
            <li><span className="dot ok"/>Transcript readable · 164 sentences</li>
            <li><span className="dot ok"/>Audio stream valid · pcm_s16le · 48kHz</li>
            <li><span className="dot info"/>Media is added later from the Editor</li>
            <li><span className="dot info"/>Cache will write to <span className="mono">.vc/alignment.json</span></li>
          </ul>
        </div>
      </div>
    </div>
    </div>
  );
};

window.SetupScreen = SetupScreen;
