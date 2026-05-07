const LauncherScreen = ({ go }) => {
  return (
    <div className="screen" data-screen-label="01 Launcher">
    <div className="launcher">
      <div className="launcher-head">
        <div>
          <p className="eyebrow">Local workspace</p>
          <h1>Recent projects</h1>
        </div>
        <div className="actions">
          <button className="btn"><Icon name="folderOpen"/> Open folder…</button>
          <button className="btn primary" onClick={() => go("setup")}><Icon name="plus"/> New project</button>
        </div>
      </div>

      <div>
        {PROJECTS.map((p, i) => (
          <button key={i} className="proj-card" onClick={() => go("editor")}>
            <div className={"proj-thumb " + p.thumb}>
              <div></div><div></div><div></div>
            </div>
            <div className="proj-info">
              <h2>{p.name}</h2>
              <p className="path">{p.path}</p>
              <div className="meta">
                <span><strong>{p.voice}</strong> voice</span>
                <span><strong>{p.sentences}</strong> sentences</span>
                <span><strong>{p.media}</strong> media</span>
                <span>opened {p.lastOpened}</span>
              </div>
            </div>
            <div style={{display:"flex", gap:6}}>
              <span className="tag ok"><span className="dot ok"/>aligned</span>
              <Icon name="chevRight" />
            </div>
          </button>
        ))}

        <button className="proj-card" style={{borderStyle:"dashed", color:"var(--text-3)", justifyContent:"center"}} onClick={() => go("setup")}>
          <div></div>
          <div style={{display:"flex", alignItems:"center", gap:10, gridColumn:"1 / -1", justifyContent:"center"}}>
            <Icon name="plus" /> Create another project
          </div>
        </button>
      </div>

      <div className="launcher-side">
        <div className="runtime-card">
          <h3>Local runtime <span className="tag ok"><span className="dot ok"/>ready</span></h3>
          <div className="runtime-row">
            <Icon name="check" /><span className="label">Node.js</span><span className="value">22.4.1</span>
          </div>
          <div className="runtime-row">
            <Icon name="check" /><span className="label">Python</span><span className="value">3.11.7</span>
          </div>
          <div className="runtime-row">
            <Icon name="check" /><span className="label">ffmpeg</span><span className="value">6.1.1 · libx264</span>
          </div>
          <div className="runtime-row">
            <Icon name="check" /><span className="label">CUDA</span><span className="value">12.8 · sm_120</span>
          </div>
          <div className="runtime-row">
            <Icon name="check" /><span className="label">WhisperX</span><span className="value">large-v3</span>
          </div>
          <div className="metric-grid">
            <div><strong>0</strong><span>active renders</span></div>
            <div><strong>4</strong><span>cached projects</span></div>
          </div>
        </div>

        <div className="runtime-card">
          <h3>Tips</h3>
          <ul style={{margin:0, paddingLeft:14, fontSize:12, color:"var(--text-2)", display:"flex", flexDirection:"column", gap:6}}>
            <li>Drop a folder anywhere — same project.</li>
            <li>Re-record voice; keep your assignments.</li>
            <li>Phase 2 hooks AI gen via Fal / Modal.</li>
          </ul>
        </div>
      </div>
    </div>
    </div>
  );
};

window.LauncherScreen = LauncherScreen;
