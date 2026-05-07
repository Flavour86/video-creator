// Shared atoms

const Logo = () => (
  <div className="brand">
    <div className="logo">VC</div>
    <div>
      <div>Video Creator</div>
    </div>
    <div className="sub">phase 1 · local</div>
  </div>
);

const StatusBar = ({ screen }) => {
  const segs = {
    launcher: [["dot ok","sidecar 127.0.0.1:8787"], ["dot ok","ffmpeg 6.1"], ["dot ok","cuda 12.8 · rtx 5070 ti"], ["dot info","node 22.4 · python 3.11.7"]],
    setup:    [["dot ok","sidecar"], ["dot warn","alignment pending"], ["dot ok","disk 412 GB free"], ["dot info","E:\\video-projects\\tokyo-essay"]],
    editor:   [["dot ok","alignment cached"], ["dot ok","cache 24/24 warm"], ["dot info","autosave · 02s ago"], ["dot info","tokyo-essay/project.json"]],
    render:   [["dot warn","render in progress · 43%"], ["dot info","ffmpeg pid 4218 · 1.2x"], ["dot ok","cuda nvenc available"], ["dot info","output renders/final-2026-05-06-1530.mp4"]],
  };
  const items = segs[screen] || segs.launcher;
  return (
    <div className="statusbar">
      <div className="seg"><span className="kbd">⌘K</span><span>command</span></div>
      <div style={{display:"flex", gap:0, justifyContent:"center", flex:1}}>
        {items.map(([cls, text], i) => (
          <div className="seg" key={i}><span className={cls}></span><span>{text}</span></div>
        ))}
      </div>
      <div className="seg"><span>v0.1.0-prototype</span></div>
    </div>
  );
};

window.Logo = Logo;
window.StatusBar = StatusBar;
