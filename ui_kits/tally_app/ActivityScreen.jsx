/* ActivityScreen — sectioned timeline, filter chips, with optional empty state */
function ActivityScreen({ c, items, filter = 'all', onFilter, onMic, onAdd, empty = false, rtl = false }) {
  const filters = [
    { key: 'all', label: 'All' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'settlements', label: 'Settlements' },
    { key: 'members', label: 'Members' },
  ];

  // Group by section
  const sections = React.useMemo(() => {
    const map = { Today: [], 'This week': [], Earlier: [] };
    (items || []).forEach((it) => { map[it.section] = map[it.section] || []; map[it.section].push(it); });
    return Object.entries(map).filter(([, arr]) => arr.length);
  }, [items]);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ background: c.bg, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '62px 20px 8px', display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: c.text, letterSpacing: -0.5 }}>
          {rtl ? 'فعالیت' : 'Activity'}
        </div>
        <div style={{ flex: 1 }}></div>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background: c.owedSoft,
          color: c.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <ion-icon name="search-outline" style={{ fontSize: 18 }}></ion-icon>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ padding: '8px 20px 4px', display: 'flex', gap: 8, overflow: 'auto' }}>
        {filters.map((f) => {
          const on = filter === f.key;
          return (
            <div key={f.key} onClick={() => onFilter && onFilter(f.key)} style={{
              padding: '8px 14px', borderRadius: 999,
              background: on ? c.primary : c.surface,
              color: on ? '#fff' : c.text,
              border: `1px solid ${on ? c.primary : c.cardRim}`,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{f.label}</div>
          );
        })}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 110px' }}>
        {empty ? (
          <EmptyState c={c}
            icon="time-outline"
            title="No activity yet"
            subtitle="Once you create a group or split a bill, you'll see it here."
            ctaLabel="Create your first group"
          />
        ) : (
          sections.map(([section, rows]) => (
            <div key={section} style={{ marginTop: 18 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: c.muted,
                textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, paddingLeft: 4,
              }}>
                {rtl ? (section === 'Today' ? 'امروز' : section === 'This week' ? 'این هفته' : 'پیش‌تر') : section}
              </div>
              <div style={{
                background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 14,
                boxShadow: c.shadowCard, overflow: 'hidden',
              }}>
                {rows.map((it, i) => <ActivityRow key={it.id} it={it} c={c} first={i === 0} rtl={rtl} />)}
              </div>
            </div>
          ))
        )}
      </div>

      <FabPill onAdd={onAdd} onMic={onMic} c={c} />
      <TabBar value="activity" onChange={() => {}} c={c} />
    </div>
  );
}

function ActivityRow({ it, c, first, rtl }) {
  const iconBg = it.kind === 'settle' ? c.owedSoft
              : it.kind === 'group'  ? c.inputSurface
              : it.kind === 'friend' ? c.inputSurface
              : c.owedSoft;
  const iconFg = it.kind === 'settle' ? c.primary : c.primary;
  const pillFg = it.amountSign > 0 ? c.owed : it.amountSign < 0 ? c.owe : c.muted;
  const pillBg = it.amountSign > 0 ? c.owedSoft : it.amountSign < 0 ? c.oweSoft : c.inputSurface;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
      borderTop: first ? 'none' : `1px solid ${c.border}`,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 11, background: iconBg, color: iconFg, marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <ion-icon name={it.icon} style={{ fontSize: 17 }}></ion-icon>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: c.text, lineHeight: 1.35 }}>
          <span style={{ fontWeight: 800 }}>{it.actor}</span> {it.verb} {it.object && <span style={{ fontWeight: 700 }}>{it.object}</span>}{it.suffix && <span style={{ color: c.muted }}> {it.suffix}</span>}
        </div>
        <div style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>{it.time}</div>
      </div>
      {it.amount && (
        <div style={{
          padding: '5px 10px', borderRadius: 999, background: pillBg, color: pillFg,
          fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', marginTop: 4,
        }}>{it.amount}</div>
      )}
    </div>
  );
}

function EmptyState({ c, icon, title, subtitle, ctaLabel }) {
  return (
    <div style={{ marginTop: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 24px' }}>
      <div style={{
        width: 80, height: 80, borderRadius: 24, background: c.owedSoft, color: c.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
      }}>
        <ion-icon name={icon} style={{ fontSize: 38 }}></ion-icon>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: c.text, letterSpacing: -0.3 }}>{title}</div>
      <div style={{ fontSize: 14, color: c.muted, marginTop: 6, lineHeight: 1.5 }}>{subtitle}</div>
      {ctaLabel && (
        <div style={{ marginTop: 18 }}>
          <Button label={ctaLabel} variant="primary" size="md" c={c} />
        </div>
      )}
    </div>
  );
}

window.ActivityScreen = ActivityScreen;
window.ActivityEmptyState = EmptyState;
