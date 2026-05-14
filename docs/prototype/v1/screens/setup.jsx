const SetupScreen = ({ go }) => {
  const subtitleTone = { idle: "info", running: "warn", succeeded: "ok", failed: "err" };
  const subtitleLabel = { idle: "ready", running: "running", succeeded: "succeeded", failed: "failed" };
  const alignmentTone = { idle: "info", running: "warn", succeeded: "ok", failed: "err" };
  const alignmentLabel = { idle: "ready", running: "running", succeeded: "succeeded", failed: "failed" };

  const voiceInputRef = React.useRef(null);
  const transcriptInputRef = React.useRef(null);
  const watermarkInputRef = React.useRef(null);

  const [projectName, setProjectName] = React.useState("Tokyo Essay");
  const [voiceFile, setVoiceFile] = React.useState(null);
  const [transcriptFile, setTranscriptFile] = React.useState(null);
  const [watermarkFile, setWatermarkFile] = React.useState(null);

  const [subtitleStatus, setSubtitleStatus] = React.useState("idle");
  const [subtitleArtifact, setSubtitleArtifact] = React.useState(null);
  const [subtitleError, setSubtitleError] = React.useState("");

  const [alignmentStatus, setAlignmentStatus] = React.useState("idle");
  const [alignmentResult, setAlignmentResult] = React.useState(null);
  const [alignmentError, setAlignmentError] = React.useState("");

  const [creatingProject, setCreatingProject] = React.useState(false);

  const sentenceCount = Array.isArray(window.SENTENCES) ? window.SENTENCES.length : 0;
  const hasProjectName = projectName.trim().length > 0;
  const hasVoiceFile = Boolean(voiceFile);
  const subtitleReady = subtitleStatus === "succeeded";
  const alignmentReady = alignmentStatus === "succeeded";

  const currentStep = !hasProjectName ? 1 : !hasVoiceFile ? 2 : !subtitleReady ? 3 : !alignmentReady ? 4 : 4;
  const stepClass = (done, step) => (done ? "done" : currentStep === step ? "active" : "");

  const resetAfterVoiceChange = () => {
    setSubtitleStatus("idle");
    setSubtitleArtifact(null);
    setSubtitleError("");
    setAlignmentStatus("idle");
    setAlignmentResult(null);
    setAlignmentError("");
  };

  const onPickVoice = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setVoiceFile({
      name: file.name || "voice.wav",
      duration: "15:42",
      sampleRate: "48kHz",
      channels: "stereo",
    });
    resetAfterVoiceChange();
  };

  const onPickTranscript = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setTranscriptFile({ name: file.name || "transcript.txt" });
    setAlignmentStatus("idle");
    setAlignmentResult(null);
    setAlignmentError("");
  };

  const onPickWatermark = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setWatermarkFile({ name: file.name || "watermark.png" });
  };

  const openVoiceChooser = () => {
    if (voiceInputRef.current) voiceInputRef.current.click();
  };

  const openTranscriptChooser = () => {
    if (transcriptInputRef.current) transcriptInputRef.current.click();
  };

  const openWatermarkChooser = () => {
    if (watermarkInputRef.current) watermarkInputRef.current.click();
  };

  const runSubtitleGenerate = () => {
    if (!hasVoiceFile) return;
    setSubtitleStatus("running");
    setSubtitleError("");
    setSubtitleArtifact(null);
    setAlignmentStatus("idle");
    setAlignmentResult(null);
    setAlignmentError("");

    window.setTimeout(() => {
      const failed = Math.random() < 0.2;
      if (failed) {
        setSubtitleStatus("failed");
        setSubtitleError("generator timeout");
        return;
      }
      setSubtitleStatus("succeeded");
      setSubtitleArtifact({
        name: "subtitle.srt",
        cues: sentenceCount || 164,
        duration: voiceFile.duration,
      });
    }, 1200);
  };

  const runAlignment = () => {
    if (!hasVoiceFile || !subtitleReady) return;
    setAlignmentStatus("running");
    setAlignmentError("");
    setAlignmentResult(null);

    window.setTimeout(() => {
      const failed = Math.random() < 0.18;
      if (failed) {
        setAlignmentStatus("failed");
        setAlignmentError("alignment API unavailable");
        return;
      }

      const cues = subtitleArtifact ? subtitleArtifact.cues : 0;
      const corrections = transcriptFile ? Math.max(1, Math.round(cues * 0.09)) : 0;
      setAlignmentStatus("succeeded");
      setAlignmentResult({
        corrections,
        duration: subtitleArtifact ? subtitleArtifact.duration : "--:--",
      });
    }, 1200);
  };

  const createProject = () => {
    if (!alignmentReady || creatingProject) return;
    setCreatingProject(true);
    window.setTimeout(() => {
      setCreatingProject(false);
      go("editor");
    }, 800);
  };

  const subtitleMessage =
    subtitleStatus === "running"
      ? "Generating subtitle.srt from selected audio."
      : subtitleStatus === "failed"
      ? `subtitle.srt generation failed: ${subtitleError}.`
      : subtitleReady
      ? "subtitle.srt is ready. You can continue with alignment."
      : "Pick an audio file first, then run subtitle generation.";

  const alignmentMessage =
    alignmentStatus === "running"
      ? "Running alignment and applying corrections to subtitle.srt."
      : alignmentStatus === "failed"
      ? `Alignment failed: ${alignmentError}.`
      : alignmentReady
      ? `Alignment finished. ${alignmentResult ? alignmentResult.corrections : 0} subtitle updates applied.`
      : "Upload transcript.txt optionally, then run alignment.";

  return (
    <div className="screen" data-screen-label="02 Setup">
      <div className="setup">
        <div className="setup-head">
          <div>
            <p className="eyebrow">New project</p>
            <h1>SetUp</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => go("launcher")}>Cancel</button>
          </div>
        </div>

        <ol className="stepper">
          <li className={stepClass(hasProjectName, 1)}>
            <span className="num">{hasProjectName ? <Icon name="check" size={11} /> : "1"}</span>
            <div>Project Name</div>
          </li>
          <li className={stepClass(hasVoiceFile, 2)}>
            <span className="num">{hasVoiceFile ? <Icon name="check" size={11} /> : "2"}</span>
            <div>Voice</div>
          </li>
          <li className={stepClass(subtitleReady, 3)}>
            <span className="num">{subtitleReady ? <Icon name="check" size={11} /> : "3"}</span>
            <div>Subtitle</div>
          </li>
          <li className={stepClass(alignmentReady, 4)}>
            <span className="num">{alignmentReady ? <Icon name="check" size={11} /> : "4"}</span>
            <div>Alignment</div>
          </li>
        </ol>

        <div className="panel setup-card">
          <div className="row">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 14 }}>
              <div>
                <label className="field">Project name
                  <input id="setup-project-name" name="project_name" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                </label>
              </div>
              <div>
                <label className="field">Output preset
                  <select id="setup-output-preset" name="output_preset" defaultValue="final">
                    <option value="final">Final / 1080p / CRF 18</option>
                    <option value="draft">Draft / 720p / ultrafast</option>
                    <option value="vert">Vertical / 9:16 / 1080w</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="row">
            <h3 className="row-h">Voice</h3>
            <div className="drop-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className={"drop " + (hasVoiceFile ? "done" : "")} onClick={openVoiceChooser} style={{ cursor: "pointer" }}>
                <Icon name="waveform" size={22} />
                <strong>{hasVoiceFile ? voiceFile.name : "Voice for video"}</strong>
                {hasVoiceFile && (
                  <span className="tag ok" style={{ marginTop: 4 }}>selected</span>
                )}
                <button className="btn sm ghost" style={{ marginTop: 4 }}>
                  {hasVoiceFile ? "Replace" : "Choose audio"}
                </button>
                <input
                  ref={voiceInputRef}
                  type="file"
                  name="voice_file"
                  accept=".wav,.mp3,.m4a,audio/*"
                  onChange={onPickVoice}
                  style={{ display: "none" }}
                />
              </div>

              {subtitleReady && (
                <div className="drop done">
                  <Icon name="type" size={22} />
                  <strong>subtitle.srt</strong>
                  <span>{`${subtitleArtifact.cues} subtitles / ${subtitleArtifact.duration}`}</span>
                  <span className="tag ok" style={{ marginTop: 4 }}>succeeded</span>
                </div>
              )}
            </div>
          </div>

          {subtitleReady && (
            <div className="row">
              <h3 className="row-h">Subtitle Alignment</h3>
              <div className="drop-grid two">
                <div className={"drop " + (transcriptFile ? "done" : "")}  onClick={openTranscriptChooser} style={{ cursor: "pointer" }}>
                  <Icon name="type" size={22} />
                  <strong>{transcriptFile ? transcriptFile.name : "transcript for alignment"}</strong>
                  <span>{transcriptFile ? `Transcript for alignment` : ""}</span>
                  <button className="btn sm ghost" style={{ marginTop: 4 }}>
                    {transcriptFile ? "Replace" : "Choose"}
                  </button>
                  <input
                    ref={transcriptInputRef}
                    type="file"
                    name="transcript_file"
                    accept=".txt,text/plain"
                    onChange={onPickTranscript}
                    style={{ display: "none" }}
                  />
                </div>

                <div className={"drop " + (watermarkFile ? "done" : "")} onClick={openWatermarkChooser} style={{ cursor: "pointer" }}>
                  <Icon name="image" size={22} />
                  <strong>{watermarkFile ? watermarkFile.name : "Watermark for video"}</strong>
                  <span>optional</span>
                  <button className="btn sm ghost" style={{ marginTop: 4 }}>
                    {watermarkFile ? "Replace" : "Choose"}
                  </button>
                  <input
                    ref={watermarkInputRef}
                    type="file"
                    name="watermark_file"
                    accept=".png,.jpg,.jpeg,image/*"
                    onChange={onPickWatermark}
                    style={{ display: "none" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="row setup-bottom-actions">
            <div className="setup-create-meta">
              
            </div>
            <button className="btn primary" disabled={!alignmentReady || creatingProject} onClick={createProject}>
              <Icon name="plusCircle" size={14} />
              {creatingProject ? "Creating project..." : "Create project"}
            </button>
          </div>
        </div>

        <div className="setup-side">
          <div className="panel align-card">
            <div className="panel-head" style={{ padding: "10px 14px", border: 0 }}>
              <h3>Subtitle Generate</h3>
              <span className={"tag " + subtitleTone[subtitleStatus]}>
                <span className={"dot " + subtitleTone[subtitleStatus]} />
                {subtitleLabel[subtitleStatus]}
              </span>
            </div>
            <p style={{ margin: "0 14px 12px", fontSize: 12, color: "var(--text-2)", padding: 0 }}>
              {subtitleMessage}
            </p>
            <div style={{ padding: "0 14px 14px" }}>
              <div className="job">
                <strong style={{ fontSize: 12 }}>subtitle output</strong>
                <div className="kv"><span className="k">subtitles</span><span className="v">{subtitleArtifact ? subtitleArtifact.cues : "--"}</span></div>
                <div className="kv"><span className="k">duration</span><span className="v">{voiceFile ? voiceFile.duration : "--:--"}</span></div>
                <button className="btn accent" disabled={!hasVoiceFile || !hasProjectName || subtitleStatus === "running"} onClick={runSubtitleGenerate} style={{ justifyContent: "center" }}>
                  <Icon name="cpu" size={13} />
                  {subtitleStatus === "running" ? "Generating..." : "Generate subtitle"}
                </button>
              </div>
            </div>
          </div>

          {subtitleReady && (
            <div className="panel align-card">
              <div className="panel-head" style={{ padding: "10px 14px", border: 0 }}>
                <h3>Alignment</h3>
                <span className={"tag " + alignmentTone[alignmentStatus]}>
                  <span className={"dot " + alignmentTone[alignmentStatus]} />
                  {alignmentLabel[alignmentStatus]}
                </span>
              </div>
              <p style={{ margin: "0 14px 12px", fontSize: 12, color: "var(--text-2)", padding: 0 }}>
                {alignmentMessage}
              </p>
              <div style={{ padding: "0 14px 14px" }}>
                <div className="job">
                  <strong style={{ fontSize: 12 }}>subtitle correction</strong>
                  <div className="kv"><span className="k">subtitles</span><span className="v">{subtitleArtifact ? subtitleArtifact.cues : "--"}</span></div>
                  <div className="kv"><span className="k">duration</span><span className="v">{alignmentResult ? alignmentResult.duration : voiceFile ? voiceFile.duration : "--:--"}</span></div>
                  <div className="kv"><span className="k">corrections</span><span className="v">{alignmentResult ? alignmentResult.corrections : "--"}</span></div>
                  <button className="btn accent" disabled={!transcriptFile || alignmentStatus === "running"} onClick={runAlignment} style={{ justifyContent: "center" }}>
                    <Icon name="cpu" size={13} />
                    {alignmentStatus === "running" ? "Aligning..." : "Run Alignment"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

window.SetupScreen = SetupScreen;
