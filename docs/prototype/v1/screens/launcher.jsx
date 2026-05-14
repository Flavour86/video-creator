const LauncherScreen = ({ go }) => {
  const renderStatusMeta = {
    rendered: { tone: "ok", label: "rendered" },
    rendering: { tone: "warn", label: "rendering" },
    queued: { tone: "info", label: "queued" },
    failed: { tone: "err", label: "failed" },
    unrendered: { tone: "warn", label: "unrendered" },
  };
  const [playingProject, setPlayingProject] = React.useState(null);
  const [pageSize, setPageSize] = React.useState(4);
  const [page, setPage] = React.useState(1);
  const openProject = (p) => go("editor");
  const totalProjects = PROJECTS.length;
  const totalPages = Math.max(1, Math.ceil(totalProjects / pageSize));

  React.useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pageStart = (page - 1) * pageSize;
  const pageProjects = PROJECTS.slice(pageStart, pageStart + pageSize);
  const rangeStart = totalProjects === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(totalProjects, pageStart + pageProjects.length);

  return (
    <div className="screen" data-screen-label="01 Launcher">
      <div className="launcher">
        <div className="launcher-head">
          <div>
            <p className="eyebrow">Local workspace</p>
            <h1>Recent projects</h1>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={() => go("setup")}><Icon name="plus"/> New project</button>
          </div>
        </div>

        <div className="project-list">
          {pageProjects.map((p, i) => {
            const status = renderStatusMeta[p.renderStatus] || renderStatusMeta.unrendered;
            return (
            <div key={i} role="button" tabIndex={0} className="proj-card"
            onClick={() => openProject(p)}
            onKeyDown={(e) => {if (e.key === "Enter" || e.key === " ") openProject(p);}}>
              <div className={"proj-thumb " + p.thumb}>
                <div></div><div></div><div></div>
                {p.rendered &&
                <button className="proj-play-overlay" onClick={(e) => {e.stopPropagation();setPlayingProject(p);}} title="Play render">
                  <Icon name="play" size={20} />
                </button>
                }
              </div>
              <div className="proj-info">
                <h2>{p.name}</h2>
                <div className="meta">
                  <span><strong>{p.voice}</strong> voice</span>
                  <span><strong>{p.sentences}</strong> sentences</span>
                  <span><strong>{p.media}</strong> media</span>
                  <span>opened {p.lastOpened}</span>
                </div>
              </div>
              <div className="proj-state">
                <span className={"tag " + status.tone}><span className={"dot " + status.tone}/>{status.label}</span>
                <Icon name="chevRight" />
              </div>
            </div>
            );
          })}
        </div>

        <div className="launcher-pagination" aria-label="Project list pagination">
          <div className="launcher-pagination-left">
            <label htmlFor="launcher-page-size">Page size</label>
            <select
              id="launcher-page-size"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[5, 10, 20, 40].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
          <div className="launcher-pagination-right">
            <button
              className="btn"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
            >
              <Icon name="skipBack" />
              Previous
            </button>
            <span className="launcher-page">Page {page} / {totalPages}</span>
            <button
              className="btn"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
            >
              Next
              <Icon name="skipFwd" />
            </button>
          </div>
        </div>
      </div>

      {playingProject &&
      <div className="modal-back" onClick={() => setPlayingProject(null)}>
        <div className="modal small" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2>{playingProject.name}</h2>
              <p>{playingProject.renderFile || "latest render"}</p>
            </div>
            <button className="iconbtn" onClick={() => setPlayingProject(null)}><Icon name="close" /></button>
          </div>
          <div className="modal-body">
            <div className={"render-player " + playingProject.thumb}>
              <button className="iconbtn play"><Icon name="play" size={18}/></button>
              <span>Rendered video preview</span>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn primary" onClick={() => setPlayingProject(null)}>Done</button>
          </div>
        </div>
      </div>
      }
    </div>
  );
};

window.LauncherScreen = LauncherScreen;
