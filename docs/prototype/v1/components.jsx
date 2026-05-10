// Shared atoms

const Logo = () => (
  <div className="brand">
    <div className="logo">VC</div>
    <div>
      <div>Video Creator</div>
    </div>
  </div>
);

const StatusBar = () => (
  <div className="statusbar">
    <div className="seg"><span className="kbd">Ctrl K</span><span>command</span></div>
    <div />
    <div className="seg"><span>v0.1.0-prototype</span></div>
  </div>
);

window.Logo = Logo;
window.StatusBar = StatusBar;
