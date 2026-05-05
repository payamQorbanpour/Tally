/* OnboardingScreen — clean, single-message hero with logo + CTA */
function OnboardingScreen({ c, onContinue }) {
  return (
    <div style={{
      background: c.bg, height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '60px 28px 36px', boxSizing: 'border-box',
      textAlign: 'center',
    }}>
      <div style={{ marginTop: 36, marginBottom: 28 }}>
        <div style={{
          width: 96, height: 96, borderRadius: 26, background: c.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: c.shadowFab,
        }}>
          <ion-icon name="receipt-outline" style={{ fontSize: 48, color: '#fff' }}></ion-icon>
        </div>
      </div>

      <div style={{ fontSize: 32, fontWeight: 800, color: c.text, letterSpacing: -0.6, lineHeight: 1.15 }}>
        Split bills, <span style={{ color: c.primary }}>not friendships</span>
      </div>
      <div style={{ fontSize: 15, color: c.muted, marginTop: 14, lineHeight: 1.5, maxWidth: 280 }}>
        Track shared expenses with anyone — trips, roommates, dates. Tally does the math, AI reads the receipt.
      </div>

      {/* Three feature lines */}
      <div style={{ marginTop: 36, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[
          { icon: 'sparkles-outline', title: 'AI receipt scanning', sub: 'Snap a photo, items split themselves' },
          { icon: 'people-outline', title: 'Simplify debts', sub: 'Fewer payments, same net amounts' },
          { icon: 'cloud-done-outline', title: 'Sync everywhere', sub: 'Local-first, cloud backup, no logins required' },
        ].map((f) => (
          <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, background: c.owedSoft, color: c.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ion-icon name={f.icon} style={{ fontSize: 22 }}></ion-icon>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{f.title}</div>
              <div style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>{f.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }}></div>

      <button onClick={onContinue} style={{
        width: '100%', padding: '16px 0', borderRadius: 14,
        background: c.primary, color: '#fff', fontSize: 16, fontWeight: 700,
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: c.shadowFab,
      }}>Get started</button>
      <div style={{ fontSize: 12, color: c.muted, marginTop: 14 }}>
        No account needed. Add cloud sync later.
      </div>
    </div>
  );
}

window.OnboardingScreen = OnboardingScreen;
