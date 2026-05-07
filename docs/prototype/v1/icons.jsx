// Icon set — minimal stroke icons. 1.5px stroke, 16px viewBox.
const Icon = ({ name, size = 16, className = "" }) => {
  const paths = {
    folder: <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v6.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-8z" />,
    plus: <path d="M8 3v10M3 8h10" />,
    play: <path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" />,
    pause: <g><rect x="4.5" y="3.5" width="2.5" height="9" fill="currentColor" stroke="none" /><rect x="9" y="3.5" width="2.5" height="9" fill="currentColor" stroke="none" /></g>,
    skipBack: <g><rect x="3" y="4" width="1.5" height="8" fill="currentColor" stroke="none" /><path d="M13 4l-7 4 7 4z" fill="currentColor" stroke="none" /></g>,
    skipFwd: <g><rect x="11.5" y="4" width="1.5" height="8" fill="currentColor" stroke="none" /><path d="M3 4l7 4-7 4z" fill="currentColor" stroke="none" /></g>,
    check: <path d="m3.5 8.5 3 3 6-7" />,
    x: <path d="m4 4 8 8M12 4l-8 8" />,
    upload: <g><path d="M8 11V3M5 6l3-3 3 3" /><path d="M3 12v.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5V12" /></g>,
    image: <g><rect x="2.5" y="3" width="11" height="10" rx="1.2" /><circle cx="6" cy="6.5" r="1" /><path d="m4 12 3-3 2 2 3-3 2 2" /></g>,
    film: <g><rect x="2.5" y="2.5" width="11" height="11" rx="1" /><path d="M5 2.5v11M11 2.5v11M2.5 5h11M2.5 8h11M2.5 11h11" /></g>,
    trash: <g><path d="M3 5h10M6 5V3.5h4V5M5 5l.7 8.5h4.6L11 5" /></g>,
    settings: <g><circle cx="8" cy="8" r="2" /><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.4 3.6l-1.4 1.4M5 11l-1.4 1.4M12.4 12.4 11 11M5 5 3.6 3.6" /></g>,
    layers: <g><path d="m8 2 6 3-6 3-6-3z" /><path d="m2 8 6 3 6-3M2 11l6 3 6-3" /></g>,
    type: <path d="M3 3h10M8 3v11M5.5 14h5" />,
    waveform: <path d="M2 8h1.5v3M5 5v6M7 4v8M9 6v4M11 3v9M13 6v4M14.5 8H13" />,
    search: <g><circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" /></g>,
    chevDown: <path d="m4 6 4 4 4-4" />,
    chevRight: <path d="m6 4 4 4-4 4" />,
    download: <g><path d="M8 3v8M5 8l3 3 3-3" /><path d="M3 13h10" /></g>,
    cpu: <g><rect x="3" y="3" width="10" height="10" rx="1" /><rect x="6" y="6" width="4" height="4" /><path d="M5.5 1.5v1.5M8 1.5v1.5M10.5 1.5v1.5M5.5 13v1.5M8 13v1.5M10.5 13v1.5M1.5 5.5h1.5M1.5 8h1.5M1.5 10.5h1.5M13 5.5h1.5M13 8h1.5M13 10.5h1.5" /></g>,
    sparkle: <path d="M8 1.5 9 6l4.5 1L9 8l-1 4.5L7 8l-4.5-1L7 6z" />,
    info: <g><circle cx="8" cy="8" r="6" /><path d="M8 7v4M8 5v.5" /></g>,
    alert: <g><path d="M8 1.5 14.5 13h-13z" /><path d="M8 6v3M8 11v.5" /></g>,
    grip: <g><circle cx="6" cy="4" r="0.8" fill="currentColor" /><circle cx="6" cy="8" r="0.8" fill="currentColor" /><circle cx="6" cy="12" r="0.8" fill="currentColor" /><circle cx="10" cy="4" r="0.8" fill="currentColor" /><circle cx="10" cy="8" r="0.8" fill="currentColor" /><circle cx="10" cy="12" r="0.8" fill="currentColor" /></g>,
    lock: <g><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></g>,
    eye: <g><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></g>,
    cut: <g><circle cx="5" cy="11" r="2" /><circle cx="11" cy="11" r="2" /><path d="M6.5 9.5 13 3M9.5 9.5 3 3" /></g>,
    save: <g><path d="M3 3h8.5L13 4.5V13H3z" /><path d="M5 3v3.5h6V3M5 13v-4h6v4" /></g>,
    folderOpen: <g><path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 7" /><path d="m2 7 1.2 6h10.5l1.3-6z" /></g>,
    keyboard: <g><rect x="1.5" y="4" width="13" height="8" rx="1" /><path d="M4 7h.5M6.5 7h.5M9 7h.5M11.5 7h.5M4 9.5h8" /></g>,
    cache: <g><ellipse cx="8" cy="4" rx="5" ry="1.8" /><path d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4" /><path d="M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" /></g>,
    close: <path d="m4 4 8 8M12 4l-8 8" />,
    sun: <g><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" /></g>,
    moon: <path d="M13 8.5A5.5 5.5 0 0 1 7.5 3a5.5 5.5 0 1 0 5.5 5.5z" />,
    plusCircle: <g><circle cx="8" cy="8" r="6" /><path d="M8 5.5v5M5.5 8h5" /></g>
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={"icon " + className} aria-hidden="true">
      {paths[name]}
    </svg>);

};

window.Icon = Icon;