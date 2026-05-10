const RenderScreen = ({ go }) => {
  const [percent, setPercent] = React.useState(43);
  React.useEffect(() => {
    const id = setInterval(() => {
      setPercent((p) => p >= 99 ? p : p + Math.random() * 0.3);
    }, 600);
    return () => clearInterval(id);
  }, []);
  const eta = Math.max(0, Math.round((100 - percent) * 11));
  const etaM = Math.floor(eta / 60), etaS = eta % 60;

  return (
    <div className="screen" data-screen-label="04 Render">
      <div className="render">
        <div className="render-head">
          <div>
            <p className="eyebrow">Current project</p>
            <h1>Tokyo Essay / 1080p final render</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => go("editor")}>Back to editor</button>
            <button className="btn" style={{ color: "var(--red)", borderColor: "oklch(0.7 0.16 25 / 0.4)" }}><Icon name="x" size={13} /> Cancel render</button>
          </div>
        </div>

        <div className="panel render-card">
          <div className="top">
            <div>
              <h2>Tokyo Essay</h2>
              <span className="specs">1920x1080 / H.264 / CRF 18 / x264 slow / AAC 192kbps / BT.709</span>
            </div>
            <span className="tag warn"><span className="dot warn" />composing</span>
          </div>

          <div className="bigbar" role="progressbar" aria-valuenow={Math.floor(percent)} aria-valuemin="0" aria-valuemax="100">
            <span style={{ width: `${percent}%` }} />
          </div>

          <div className="render-stats">
            <div><strong>{percent.toFixed(1)}%</strong><span>complete</span></div>
            <div><strong>1.2x</strong><span>encode speed</span></div>
            <div><strong>{etaM}:{String(etaS).padStart(2, "0")}</strong><span>eta</span></div>
            <div><strong>{Math.floor(percent * 285).toLocaleString()}</strong><span>frames written</span></div>
          </div>

          <div className="stages">
            <div className="stage done"><span className="num"><Icon name="check" size={9} /></span><span>Verify alignment cache</span><span className="muted mono">warm</span><span className="when">+0.4s</span></div>
            <div className="stage done"><span className="num"><Icon name="check" size={9} /></span><span>Pre-render cached clips / 4 of 4 warm</span><span className="muted mono">cache</span><span className="when">+1.2s</span></div>
            <div className="stage done"><span className="num"><Icon name="check" size={9} /></span><span>Build subtitles sidecar</span><span className="muted mono">164 cues</span><span className="when">+0.3s</span></div>
            <div className="stage active"><span className="num">4</span><span>Compose filtergraph / ffmpeg single pass</span><span className="muted mono">libx264 slow</span><span className="when">running</span></div>
            <div className="stage"><span className="num">5</span><span>Mux output with +faststart</span><span className="muted mono">renders/</span><span className="when">queued</span></div>
            <div className="stage"><span className="num">6</span><span>Append render history</span><span className="muted mono">SQLite</span><span className="when">queued</span></div>
          </div>
        </div>

        <div className="panel log-card">
          <div className="panel-head">
            <h3>ffmpeg log</h3>
            <span className="meta">tail / live</span>
          </div>
          <div className="body">
            <div><span className="ts">[15:30:01]</span> <span className="info">*</span> ffmpeg -i voice.wav -filter_complex_script cache/graph.txt</div>
            <div><span className="ts">[15:30:02]</span> <span className="ok">ok</span> Stream #0:0 to h264 (libx264) (yuv420p)</div>
            <div><span className="ts">[15:30:02]</span> <span className="ok">ok</span> Stream #0:1 to aac (LC) 48000Hz stereo</div>
            <div><span className="ts">[15:30:18]</span> frame=  3210 fps= 28 q=18.0 size=  9612kB time=00:01:47.00 bitrate=735.6kbits/s speed=1.18x</div>
            <div><span className="ts">[15:30:31]</span> frame=  5208 fps= 30 q=18.0 size= 16344kB time=00:02:53.60 bitrate=771.0kbits/s speed=1.20x</div>
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-head"><h3>Render History</h3></div>
            <div className="history">
              <div className="row">
                <div className="ic"><Icon name="film" size={14} /></div>
                <div>
                  <strong>Tokyo Essay / final</strong>
                  <span>1080p / rendering now</span>
                </div>
                <span className="tag warn"><span className="dot warn"/>live</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Output</h3></div>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
              <div className="kv"><span className="k">project</span><span className="v">Tokyo Essay</span></div>
              <div className="kv"><span className="k">resolution</span><span className="v">1920 x 1080</span></div>
              <div className="kv"><span className="k">framerate</span><span className="v">30 fps</span></div>
              <div className="kv"><span className="k">video</span><span className="v">h264 / crf 18 / slow</span></div>
              <div className="kv"><span className="k">audio</span><span className="v">aac / 192k / 48kHz</span></div>
              <div className="kv"><span className="k">est. size</span><span className="v">~118 MB</span></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>After render</h3></div>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn" disabled style={{ opacity: 0.5 }}><Icon name="folder" size={13} /> Reveal in Explorer</button>
              <button className="btn" disabled style={{ opacity: 0.5 }}><Icon name="play" size={13} /> Play locally</button>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-4)" }}>Available when render completes.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>);

};

window.RenderScreen = RenderScreen;
