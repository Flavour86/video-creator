// Design system tokens — single source of truth for the visual language.
// All values are read live from CSS custom properties on :root so this page
// stays in sync with styles.css automatically.

const Swatch = ({ name, varName, note }) => {
  const [hex, setHex] = React.useState("");
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current) return;
    const cs = getComputedStyle(ref.current);
    setHex(cs.backgroundColor);
  }, [varName]);
  return (
    <div className="ds-swatch">
      <div className="ds-swatch-chip" ref={ref} style={{ background: `var(${varName})` }}/>
      <div className="ds-swatch-meta">
        <div className="ds-swatch-name">{name}</div>
        <div className="ds-swatch-var">{varName}</div>
        {note && <div className="ds-swatch-note">{note}</div>}
      </div>
    </div>
  );
};

const TypeSpec = ({ label, size, weight, family, sample, lh, ls }) => (
  <div className="ds-type-row">
    <div className="ds-type-meta">
      <div className="ds-type-label">{label}</div>
      <div className="ds-type-spec">
        <span>{size}px</span>
        <span>·</span>
        <span>{weight}</span>
        {lh && <><span>·</span><span>lh {lh}</span></>}
        {ls && <><span>·</span><span>ls {ls}</span></>}
        <span>·</span>
        <span>{family}</span>
      </div>
    </div>
    <div className="ds-type-sample" style={{
      fontSize: size, fontWeight: weight, lineHeight: lh || 1.45,
      letterSpacing: ls || "normal",
      fontFamily: family === "mono" ? "var(--font-mono)" : "var(--font-sans)",
    }}>{sample}</div>
  </div>
);

const SpaceBar = ({ name, px }) => (
  <div className="ds-space-row">
    <div className="ds-space-name">{name}</div>
    <div className="ds-space-bar"><div style={{ width: px }}/></div>
    <div className="ds-space-px">{px}px</div>
  </div>
);

const RadiusBox = ({ name, varName }) => (
  <div className="ds-radius">
    <div className="ds-radius-box" style={{ borderRadius: `var(${varName})` }}/>
    <div className="ds-radius-name">{name}</div>
    <div className="ds-radius-var">{varName}</div>
  </div>
);

const ShadowBox = ({ name, varName }) => (
  <div className="ds-shadow">
    <div className="ds-shadow-box" style={{ boxShadow: `var(${varName})` }}/>
    <div className="ds-radius-name">{name}</div>
    <div className="ds-radius-var">{varName}</div>
  </div>
);

const TokensScreen = () => {
  return (
    <div className="screen ds-screen" data-screen-label="00 Tokens">
      <div className="ds-wrap">
        <header className="ds-head">
          <div>
            <p className="eyebrow">Design system</p>
            <h1>Tokens</h1>
            <p className="ds-lede">Single source of truth for the Video Creator interface. All tokens are exposed as CSS custom properties on <code>:root</code> in <code>styles.css</code>. Components reference them — never raw values.</p>
          </div>
          <div className="ds-jump">
            <a href="#colors">Colors</a>
            <a href="#type">Type</a>
            <a href="#space">Spacing</a>
            <a href="#radius">Radii</a>
            <a href="#shadow">Shadows</a>
            <a href="#components">Components</a>
          </div>
        </header>

        {/* ─── Colors ─── */}
        <section className="ds-section" id="colors">
          <header className="ds-section-head">
            <h2>Colors</h2>
            <p>Built on OKLCH. Surfaces ramp from <code>bg-0</code> to <code>bg-5</code>; text ramps from <code>text</code> to <code>text-4</code>. Accents share chroma 0.13 across hues so they read at equivalent visual weight.</p>
          </header>

          <h3 className="ds-sub">Surfaces</h3>
          <div className="ds-grid swatches">
            <Swatch name="Background" varName="--bg-0" note="App canvas"/>
            <Swatch name="Panel" varName="--bg-1" note="Default surface"/>
            <Swatch name="Panel raised" varName="--bg-2" note="Cards, inspector"/>
            <Swatch name="Inset" varName="--bg-3" note="Inputs, fills"/>
            <Swatch name="Hover" varName="--bg-4"/>
            <Swatch name="Active" varName="--bg-5"/>
          </div>

          <h3 className="ds-sub">Text</h3>
          <div className="ds-grid swatches">
            <Swatch name="Text" varName="--text" note="Primary"/>
            <Swatch name="Text 2" varName="--text-2" note="Secondary"/>
            <Swatch name="Text 3" varName="--text-3" note="Tertiary / labels"/>
            <Swatch name="Text 4" varName="--text-4" note="Disabled / hints"/>
          </div>

          <h3 className="ds-sub">Lines</h3>
          <div className="ds-grid swatches">
            <Swatch name="Line" varName="--line" note="Default border"/>
            <Swatch name="Line soft" varName="--line-soft" note="Inner dividers"/>
          </div>

          <h3 className="ds-sub">Accents</h3>
          <p className="ds-note">Each accent has three variants: solid (<code>--*</code>), 12% tint (<code>--*-bg</code>), 32% line (<code>--*-line</code>). The amber accent maps to "now / active" in the editor (playhead, selected clip, brand). Other hues are reserved for state semantics — never mix them with amber in the same surface.</p>
          <div className="ds-grid swatches">
            <Swatch name="Amber — accent / now" varName="--amber"/>
            <Swatch name="Amber tint" varName="--amber-bg"/>
            <Swatch name="Blue — info" varName="--blue"/>
            <Swatch name="Blue tint" varName="--blue-bg"/>
            <Swatch name="Green — ok / cached" varName="--green"/>
            <Swatch name="Green tint" varName="--green-bg"/>
            <Swatch name="Red — error" varName="--red"/>
            <Swatch name="Red tint" varName="--red-bg"/>
            <Swatch name="Violet — PiP layer" varName="--violet"/>
            <Swatch name="Violet tint" varName="--violet-bg"/>
          </div>
        </section>

        {/* ─── Type ─── */}
        <section className="ds-section" id="type">
          <header className="ds-section-head">
            <h2>Type</h2>
            <p>Two faces only. <strong>Inter Tight</strong> for UI and prose. <strong>JetBrains Mono</strong> for timecodes, paths, technical metadata, and any number that must align in a column.</p>
          </header>

          <div className="ds-grid type-faces">
            <div className="ds-face">
              <div className="ds-face-name">Inter Tight</div>
              <div className="ds-face-var">--font-sans</div>
              <div className="ds-face-sample" style={{ fontFamily: "var(--font-sans)" }}>
                <div style={{ fontWeight: 700, fontSize: 28, letterSpacing: "-0.01em" }}>Render the next take</div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>Weights 400 · 500 · 600 · 700</div>
                <div style={{ fontWeight: 400, fontSize: 13, color: "var(--text-3)" }}>The quick brown fox jumps over the lazy dog. 0123456789</div>
              </div>
            </div>
            <div className="ds-face">
              <div className="ds-face-name">JetBrains Mono</div>
              <div className="ds-face-var">--font-mono</div>
              <div className="ds-face-sample" style={{ fontFamily: "var(--font-mono)" }}>
                <div style={{ fontWeight: 600, fontSize: 22 }}>00:38.40 → 01:14.22</div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>Weights 400 · 500 · 600</div>
                <div style={{ fontWeight: 400, fontSize: 12, color: "var(--text-3)" }}>E:\projects\tokyo-essay\.vc\cache\fg-002.mp4</div>
              </div>
            </div>
          </div>

          <h3 className="ds-sub">Scale</h3>
          <div className="ds-type-stack">
            <TypeSpec label="Display" size={32} weight={700} ls="-0.02em" family="sans" sample="Tokyo Essay"/>
            <TypeSpec label="H1 / Screen title" size={24} weight={700} ls="-0.02em" family="sans" sample="Project setup"/>
            <TypeSpec label="H2 / Modal title" size={16} weight={600} ls="-0.01em" family="sans" sample="Upload to range"/>
            <TypeSpec label="Body" size={13} weight={400} family="sans" sample="The user never works in seconds — every assignment is anchored to a sentence range."/>
            <TypeSpec label="Caption" size={11} weight={500} family="sans" sample="Layer order · top renders on top"/>
            <TypeSpec label="Eyebrow / Label" size={11} weight={600} ls="0.06em" family="sans" sample="ASSETS"/>
            <TypeSpec label="Mono · TC" size={13} weight={500} family="mono" sample="00:38.40 → 01:14.22 · 41.2s"/>
            <TypeSpec label="Mono · meta" size={10.5} weight={400} family="mono" sample="cache 24/24 · 1080p · 30fps · BT.709"/>
          </div>
        </section>

        {/* ─── Spacing ─── */}
        <section className="ds-section" id="space">
          <header className="ds-section-head">
            <h2>Spacing</h2>
            <p>4px base unit. Component padding picks from this scale; freestyle values are not allowed.</p>
          </header>
          <div className="ds-space">
            <SpaceBar name="space-1" px={4}/>
            <SpaceBar name="space-2" px={6}/>
            <SpaceBar name="space-3" px={8}/>
            <SpaceBar name="space-4" px={10}/>
            <SpaceBar name="space-5" px={12}/>
            <SpaceBar name="space-6" px={14}/>
            <SpaceBar name="space-7" px={16}/>
            <SpaceBar name="space-8" px={20}/>
            <SpaceBar name="space-9" px={24}/>
            <SpaceBar name="space-10" px={32}/>
            <SpaceBar name="space-11" px={40}/>
            <SpaceBar name="space-12" px={56}/>
          </div>
        </section>

        {/* ─── Radii ─── */}
        <section className="ds-section" id="radius">
          <header className="ds-section-head">
            <h2>Radii</h2>
            <p>Four radii cover everything. Pills (999px) are reserved for tags and round buttons.</p>
          </header>
          <div className="ds-grid radii">
            <RadiusBox name="xs" varName="--r-xs"/>
            <RadiusBox name="sm" varName="--r-sm"/>
            <RadiusBox name="default" varName="--r"/>
            <RadiusBox name="md" varName="--r-md"/>
          </div>
        </section>

        {/* ─── Shadows ─── */}
        <section className="ds-section" id="shadow">
          <header className="ds-section-head">
            <h2>Shadows</h2>
            <p>Two elevations. Modals + popovers use the deeper drop. Inline cards stay flat.</p>
          </header>
          <div className="ds-grid shadows">
            <ShadowBox name="Elevation 1" varName="--shadow-1"/>
            <ShadowBox name="Elevation 2 — modal" varName="--shadow-2"/>
          </div>
        </section>

        {/* ─── Components ─── */}
        <section className="ds-section" id="components">
          <header className="ds-section-head">
            <h2>Components</h2>
            <p>Live samples — these are the same components used elsewhere in the app, rendered here for reference.</p>
          </header>

          <h3 className="ds-sub">Buttons</h3>
          <div className="ds-row">
            <button className="btn primary">Primary</button>
            <button className="btn accent"><Icon name="film" size={13}/> Render Final</button>
            <button className="btn">Default</button>
            <button className="btn ghost">Ghost</button>
            <button className="btn ghost xs">xs ghost</button>
            <button className="btn sm">sm</button>
            <button className="iconbtn"><Icon name="settings" size={14}/></button>
          </div>

          <h3 className="ds-sub">Tags · status</h3>
          <div className="ds-row">
            <span className="tag"><span className="dot"/>idle</span>
            <span className="tag info"><span className="dot info"/>cache 24/24</span>
            <span className="tag ok"><span className="dot ok"/>aligned</span>
            <span className="tag warn"><span className="dot warn"/>composing</span>
            <span className="tag err"><span className="dot err"/>missing asset</span>
          </div>

          <h3 className="ds-sub">Form fields</h3>
          <div className="ds-form-row">
            <label className="field">Project name<input defaultValue="Tokyo Essay"/></label>
            <label className="field">Resolution
              <select defaultValue="1080p"><option>1080p</option><option>720p</option><option>9:16</option></select>
            </label>
          </div>

          <h3 className="ds-sub">Keyboard</h3>
          <div className="ds-row">
            <span className="kbd">Space</span>
            <span className="kbd">⌘ Z</span>
            <span className="kbd">Shift ←</span>
            <span className="kbd">Backspace</span>
          </div>

          <h3 className="ds-sub">Layer chips</h3>
          <div className="ds-row">
            <span className="tag" style={{ borderColor: "var(--text-3)", color: "var(--text-2)" }}>SUB</span>
            <span className="tag" style={{ borderColor: "var(--violet)", color: "var(--violet)", background: "var(--violet-bg)" }}>PiP · z3</span>
            <span className="tag" style={{ borderColor: "var(--violet)", color: "var(--violet)", background: "var(--violet-bg)" }}>PiP · z2</span>
            <span className="tag" style={{ borderColor: "var(--amber-line)", color: "var(--amber)", background: "var(--amber-bg)" }}>FG · z1</span>
            <span className="tag" style={{ borderColor: "var(--blue)", color: "var(--blue)", background: "var(--blue-bg)" }}>BG</span>
          </div>
        </section>
      </div>
    </div>
  );
};

window.TokensScreen = TokensScreen;
