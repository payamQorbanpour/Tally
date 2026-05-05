/* Tally primitives: Button, Avatar, Tile, SegmentedControl, FabPill, ScreenHeader */
const { useMemo } = React;

function Button({ label, variant = 'primary', size = 'md', left, right, fullWidth, onClick, disabled, c }) {
  const padY = size === 'sm' ? 10 : 14;
  const padX = size === 'sm' ? 14 : 16;
  const radius = size === 'sm' ? 10 : 12;
  const bg = variant === 'primary' ? c.primary
           : variant === 'secondary' ? c.surface
           : variant === 'destructive' ? c.destructive
           : 'transparent';
  const fg = variant === 'primary' ? '#fff'
           : variant === 'destructive' ? '#fff'
           : variant === 'ghost' ? c.primary
           : c.text;
  const border = variant === 'outline' ? `1.5px solid ${c.border}`
              : variant === 'secondary' ? `1px solid ${c.border}`
              : 'none';
  const shadow = variant === 'primary' ? c.shadowSegment : 'none';
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: bg, color: fg, border, borderRadius: radius,
      padding: `${padY}px ${padX}px`, fontSize: size === 'sm' ? 15 : 16,
      fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', boxShadow: shadow,
      width: fullWidth ? '100%' : 'auto', display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', gap: 8,
      opacity: disabled ? 0.45 : 1,
    }}>
      {left}{label}{right}
    </button>
  );
}

function Avatar({ name, size = 36, c, bg, fg }) {
  const letter = (name || '?').trim().slice(0, 1).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: bg ?? c.owedSoft, color: fg ?? c.primary,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: Math.max(10, size * 0.42), flexShrink: 0,
    }}>{letter}</div>
  );
}

function CategoryTile({ icon, c, size = 44, bg, fg }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 14,
      background: bg ?? c.owedSoft, color: fg ?? c.primary,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <ion-icon name={icon} style={{ fontSize: size * 0.5 }}></ion-icon>
    </div>
  );
}

function SegmentedControl({ tabs, value, onChange, c }) {
  return (
    <div style={{
      display: 'flex', background: c.surface, border: `1px solid ${c.border}`,
      borderRadius: 14, padding: 5, boxShadow: c.shadowSegment,
    }}>
      {tabs.map((t) => {
        const on = value === t.key;
        return (
          <div key={t.key} onClick={() => onChange(t.key)} style={{
            flex: 1, padding: '12px 0', textAlign: 'center', borderRadius: 11,
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
            background: on ? c.owedSoft : 'transparent',
            color: on ? c.primary : c.muted,
            border: on ? `1px solid ${c.primary}` : '1px solid transparent',
          }}>{t.label}</div>
        );
      })}
    </div>
  );
}

function FabPill({ onAdd, onMic, c, withTabBar = true }) {
  return (
    <div style={{
      position: 'absolute', right: 20,
      bottom: withTabBar ? 92 : 28,
      display: 'flex', alignItems: 'center',
      background: c.primary, borderRadius: 28, height: 56,
      overflow: 'hidden', boxShadow: c.shadowFab,
      zIndex: 5,
    }}>
      <div onClick={onMic} style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, cursor: 'pointer' }}>
        <ion-icon name="mic"></ion-icon>
      </div>
      <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.35)' }}></div>
      <div onClick={onAdd} style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32, fontWeight: 300, cursor: 'pointer', marginTop: -2 }}>+</div>
    </div>
  );
}

function ScreenHeader({ title, leftIcon = 'chevron-back', onLeft, right, c }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 48, padding: '0 4px',
      borderBottom: `1px solid ${c.border}`,
    }}>
      <div onClick={onLeft} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.primary, fontSize: 26, cursor: 'pointer' }}>
        {onLeft ? <ion-icon name={leftIcon}></ion-icon> : null}
      </div>
      <div style={{ flex: 1, fontSize: 17, fontWeight: 600, color: c.text, textAlign: 'center' }}>{title}</div>
      <div style={{ width: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>{right}</div>
    </div>
  );
}

function TabBar({ value, onChange, c }) {
  const tabs = [
    { key: 'home', icon: 'home-outline', iconOn: 'home', label: 'Home' },
    { key: 'friends', icon: 'person-outline', iconOn: 'person', label: 'Friends' },
    { key: 'ai', icon: 'sparkles-outline', iconOn: 'sparkles', label: 'AI' },
    { key: 'activity', icon: 'time-outline', iconOn: 'time', label: 'Activity' },
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      background: c.surface, borderTop: `1px solid ${c.border}`,
      display: 'flex', paddingBottom: 18, paddingTop: 8,
    }}>
      {tabs.map((t) => {
        const on = value === t.key;
        return (
          <div key={t.key} onClick={() => onChange(t.key)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, color: on ? c.primary : c.muted, cursor: 'pointer',
          }}>
            <ion-icon name={on ? t.iconOn : t.icon} style={{ fontSize: 24 }}></ion-icon>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{t.label}</div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { Button, Avatar, CategoryTile, SegmentedControl, FabPill, ScreenHeader, TabBar });
