// Top-level app shell with screen routing + Tweaks.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "amber",
  "density": "normal",
  "theme": "dark",
  "showStatusbar": true,
  "lang": "en"
} /*EDITMODE-END*/;

const ACCENT_PALETTES = {
  amber: { color: "oklch(0.78 0.13 70)", bg: "oklch(0.78 0.13 70 / 0.12)", line: "oklch(0.78 0.13 70 / 0.32)" },
  cyan: { color: "oklch(0.78 0.12 200)", bg: "oklch(0.78 0.12 200 / 0.12)", line: "oklch(0.78 0.12 200 / 0.32)" },
  violet: { color: "oklch(0.74 0.13 305)", bg: "oklch(0.74 0.13 305 / 0.12)", line: "oklch(0.74 0.13 305 / 0.32)" },
  green: { color: "oklch(0.78 0.13 145)", bg: "oklch(0.78 0.13 145 / 0.12)", line: "oklch(0.78 0.13 145 / 0.32)" }
};

const App = () => {
  const [screen, setScreen] = React.useState("launcher");
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    const p = ACCENT_PALETTES[t.accent] || ACCENT_PALETTES.amber;
    const root = document.documentElement;
    root.style.setProperty("--amber", p.color);
    root.style.setProperty("--amber-bg", p.bg);
    root.style.setProperty("--amber-line", p.line);
  }, [t.accent]);

  React.useEffect(() => {
    const sizes = { compact: "12px", normal: "13px", cozy: "14px" };
    document.body.style.fontSize = sizes[t.density] || "13px";
  }, [t.density]);

  React.useEffect(() => {
    document.documentElement.dataset.theme = t.theme || "dark";
  }, [t.theme]);

  return (
    <div className="app">
      <header className="titlebar">
        <Logo />
        <div />
        <div className="right">
          <button className="iconbtn" onClick={() => setTweak("theme", t.theme === "dark" ? "light" : "dark")} title="Toggle theme">
            <Icon name={t.theme === "dark" ? "sun" : "moon"} size={14} />
          </button>
          <div className="seg sm lang-seg" title="Interface language">
            <button className={t.lang === "en" ? "on" : ""} onClick={() => setTweak("lang", "en")}>EN</button>
            <button className={t.lang === "zh" ? "on" : ""} onClick={() => setTweak("lang", "zh")}>ZH</button>
          </div>
        </div>
      </header>

      {screen === "launcher" && <LauncherScreen go={setScreen} />}
      {screen === "setup" && <SetupScreen go={setScreen} />}
      {screen === "editor" && <EditorScreen go={setScreen} />}
      {screen === "render" && <RenderScreen go={setScreen} />}

      {t.showStatusbar !== false && <StatusBar screen={screen} />}

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakRadio label="Mode" value={t.theme} options={["dark", "light"]} onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label="Accent" value={t.accent} options={["amber", "cyan", "violet", "green"]} onChange={(v) => setTweak("accent", v)} />
        <TweakSection label="Density" />
        <TweakRadio label="UI" value={t.density} options={["compact", "normal", "cozy"]} onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Chrome" />
        <TweakToggle label="Status bar" value={t.showStatusbar} onChange={(v) => setTweak("showStatusbar", v)} />
        <TweakRadio label="Language" value={t.lang} options={["en", "zh"]} onChange={(v) => setTweak("lang", v)} />
      </TweaksPanel>
    </div>);

};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
