/* InviteAcceptedScreen — celebratory confirmation after deep-link invite */
function InviteAcceptedScreen({ c, group, onOpen, onAll, onClose }) {
  const g = group || { name: 'Tokyo trip 2025', icon: 'airplane-outline', members: ['You','Aiko','Marco','Kenji'], currency: '¥' };
  return (
    <div style={{
      position: 'relative', background: c.bg, height: '100%',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Backdrop: blurred large group glyph */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.18, filter: 'blur(28px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: c.primary, fontSize: 320,
      }}>
        <ion-icon name={g.icon}></ion-icon>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '52px 8px 0', position: 'relative' }}>
        <div style={{ flex: 1 }}></div>
        <div onClick={onClose} style={{
          width: 36, height: 36, marginRight: 14, borderRadius: 18,
          background: c.surface, color: c.text, border: `1px solid ${c.cardRim}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <ion-icon name="close" style={{ fontSize: 18 }}></ion-icon>
        </div>
      </div>

      <div style={{ flex: 1, padding: '0 22px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* Confetti dots */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {[
            { x: '12%', y: '10%', s: 8, c: '#10B981' },
            { x: '84%', y: '6%', s: 6, c: '#F59E0B' },
            { x: '70%', y: '20%', s: 10, c: '#5EE6A0' },
            { x: '20%', y: '24%', s: 6, c: '#EF4444' },
            { x: '88%', y: '34%', s: 8, c: '#3B82F6' },
            { x: '8%', y: '38%', s: 7, c: '#A7F3D0' },
          ].map((d, i) => (
            <div key={i} style={{
              position: 'absolute', left: d.x, top: d.y,
              width: d.s, height: d.s, borderRadius: d.s, background: d.c,
            }}></div>
          ))}
        </div>

        {/* Sticker */}
        <div style={{ marginTop: 38, display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <div style={{
            width: 96, height: 96, borderRadius: 30, background: c.primary, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 50, boxShadow: c.shadowFab,
            transform: 'rotate(-6deg)',
          }}>
            <ion-icon name="checkmark"></ion-icon>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5, color: c.text }}>
            You're in!
          </div>
          <div style={{ fontSize: 14, color: c.muted, marginTop: 8, lineHeight: 1.5 }}>
            You've joined a group. Start splitting from your next bill.
          </div>
        </div>

        {/* Group card */}
        <div style={{
          marginTop: 26, background: c.surface, border: `1px solid ${c.cardRim}`,
          borderRadius: 18, padding: 16, boxShadow: c.shadowCard,
          display: 'flex', alignItems: 'center', gap: 14, position: 'relative',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: c.owedSoft, color: c.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ion-icon name={g.icon} style={{ fontSize: 28 }}></ion-icon>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: c.text }}>{g.name}</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{g.members.length} members</span>
              <span style={{ width: 3, height: 3, borderRadius: 2, background: c.muted }}></span>
              <span>{g.currency} JPY</span>
            </div>
            {/* Member avatar stack */}
            <div style={{ display: 'flex', marginTop: 8 }}>
              {g.members.slice(0, 4).map((m, i) => (
                <div key={m} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                  <Avatar name={m} size={22} c={c} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Spacer + CTAs */}
        <div style={{ flex: 1 }}></div>
        <div style={{ paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button label={`Open ${g.name.split(' ')[0]}`} variant="primary" size="md" fullWidth c={c} onClick={onOpen}
            right={<ion-icon name="arrow-forward" style={{ fontSize: 18 }}></ion-icon>} />
          <Button label="View all groups" variant="secondary" size="md" fullWidth c={c} onClick={onAll} />
        </div>
      </div>
    </div>
  );
}

window.InviteAcceptedScreen = InviteAcceptedScreen;
