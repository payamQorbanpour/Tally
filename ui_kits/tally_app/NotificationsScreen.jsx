/* NotificationsScreen — sectioned feed with invitation/payment/settle/expense rows */
function NotificationsScreen({ c, onBack }) {
  const sections = [
    { key: 'today', label: 'Today', items: [
      { kind: 'invite', actor: 'Marco Vitale', body: 'invited you to', target: 'Lunch run',
        time: '2m ago', avatar: 'M', accept: true },
      { kind: 'payment', actor: 'Aiko Tanaka', body: 'paid you', target: '$18.40',
        time: '1h ago', icon: 'arrow-down-circle', amount: '+$18.40', sign: 1 },
    ]},
    { key: 'yest', label: 'Yesterday', items: [
      { kind: 'settle', actor: 'Jamal Ali', body: 'requested settlement of', target: '$32.10',
        time: 'Yesterday · 18:42', icon: 'sync-circle', amount: '$32.10', sign: -1 },
      { kind: 'expense', actor: 'Marco', body: 'added', target: 'Dinner @ Saburo\'s',
        suffix: 'in Tokyo trip 2025', time: 'Yesterday · 19:21', icon: 'receipt', amount: '−¥2,100', sign: -1 },
    ]},
    { key: 'earlier', label: 'Earlier', items: [
      { kind: 'expense', actor: 'You', body: 'added', target: 'Airbnb cleaning fee',
        suffix: 'in Tokyo trip 2025', time: 'Mar 11', icon: 'receipt', amount: '+¥3,600', sign: 1 },
      { kind: 'group', actor: 'Priya', body: 'created group', target: 'Roomies',
        time: 'Jan 11', icon: 'people-circle' },
    ]},
  ];

  return (
    <div style={{ background: c.bg, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '52px 8px 0' }}>
        <div onClick={onBack} style={{
          width: 36, height: 36, marginLeft: 8, borderRadius: 18,
          border: `1px solid ${c.cardRim}`, color: c.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <ion-icon name="chevron-back" style={{ fontSize: 18 }}></ion-icon>
        </div>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: c.text, textAlign: 'center' }}>Notifications</div>
        <div style={{ width: 44, display: 'flex', justifyContent: 'flex-end', paddingRight: 12 }}>
          <ion-icon name="ellipsis-horizontal" style={{ fontSize: 22, color: c.text, cursor: 'pointer' }}></ion-icon>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 18px 30px' }}>
        {/* Unread chip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 999, background: c.primary, color: '#fff',
          fontSize: 12, fontWeight: 800, marginTop: 6, marginBottom: 10,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: '#fff' }}></span>
          You have 2 unread
        </div>

        {sections.map((sec) => (
          <div key={sec.key} style={{ marginTop: 14 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: c.muted,
              textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, paddingLeft: 4,
            }}>{sec.label}</div>
            <div style={{
              background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 14,
              boxShadow: c.shadowCard, overflow: 'hidden',
            }}>
              {sec.items.map((it, i) => <NotifRow key={i} it={it} c={c} first={i === 0} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotifRow({ it, c, first }) {
  const isInvite = it.kind === 'invite';
  const pillFg = it.sign > 0 ? c.owed : it.sign < 0 ? c.owe : c.muted;
  const pillBg = it.sign > 0 ? c.owedSoft : it.sign < 0 ? c.oweSoft : c.inputSurface;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
      borderTop: first ? 'none' : `1px solid ${c.border}`,
    }}>
      {isInvite ? (
        <Avatar name={it.avatar || it.actor} size={34} c={c} />
      ) : (
        <div style={{
          width: 34, height: 34, borderRadius: 11, background: c.owedSoft, color: c.primary, marginTop: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <ion-icon name={it.icon} style={{ fontSize: 18 }}></ion-icon>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: c.text, lineHeight: 1.4 }}>
          <span style={{ fontWeight: 800 }}>{it.actor}</span> {it.body} <span style={{ fontWeight: 700 }}>{it.target}</span>
          {it.suffix && <span style={{ color: c.muted }}> {it.suffix}</span>}
        </div>
        <div style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>{it.time}</div>
        {isInvite && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button label="Accept" variant="primary" size="sm" c={c} />
            <Button label="Decline" variant="secondary" size="sm" c={c} />
          </div>
        )}
      </div>
      {it.amount && (
        <div style={{
          padding: '5px 10px', borderRadius: 999, background: pillBg, color: pillFg,
          fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', marginTop: 4,
        }}>{it.amount}</div>
      )}
      {!isInvite && !it.amount && (
        <ion-icon name="chevron-forward" style={{ fontSize: 16, color: c.muted, marginTop: 10 }}></ion-icon>
      )}
    </div>
  );
}

window.NotificationsScreen = NotificationsScreen;
