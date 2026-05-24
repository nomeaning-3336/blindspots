// AppShell.jsx — minimal top bar. Brand, theme toggle, Add FEN, avatar. No big nav.

function TopBar({ user, theme, onToggleTheme, onAddFen }) {
  return (
    <div className="topbar">
      <div className="brand">
        <Ic.Logo className="mark" style={{color: "currentColor"}}/>
        <span>blindspots<span className="tld">.gg</span></span>
      </div>
      <div className="right">
        <button className="btn-quiet" onClick={onAddFen}>
          <Ic.Plus/> Add FEN
        </button>
        <button className="btn-quiet" onClick={onToggleTheme} title="Toggle theme">
          {theme === "paper" ? <Ic.Moon/> : <Ic.Sun/>}
        </button>
        <div className="avatar">{user.initials}</div>
      </div>
    </div>
  );
}

Object.assign(window, { TopBar });
