/* ConfirmEmailOverlay — bottom sheet over Main when email is unverified */
function ConfirmEmailOverlay({ c, state = 'default', behind, onClose }) {
  // state: default | sent | dismissed
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
      {/* Behind app, dimmed */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
        {behind}
      </div>
      <div style={{
        position: 'absolute', inset: 0, background: 'rgba(6,30,30,0.45)',
      }}></div>

      {state === 'dismissed' ? (
        <div style={{
          position: 'absolute', left: 16, right: 16, top: 60,
          background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 14,
          padding: '12px 14px', boxShadow: c.shadowCard,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 9, background: c.inputSurface, color: c.muted,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ion-icon name="mail-unread-outline" style={{ fontSize: 15 }}></ion-icon>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: c.text }}>Email not confirmed</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>Working locally. Tap to confirm.</div>
          </div>
          <ion-icon name="chevron-forward" style={{ fontSize: 16, color: c.muted }}></ion-icon>
        </div>
      ) : (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          background: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: '14px 22px 28px', boxShadow: '0 -10px 30px rgba(6,30,30,0.18)',
        }}>
          {/* Drag handle */}
          <div style={{ width: 38, height: 4, borderRadius: 2, background: c.border, margin: '0 auto 14px' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20,
              background: state === 'sent' ? c.primary : c.owedSoft,
              color: state === 'sent' ? '#fff' : c.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ion-icon name={state === 'sent' ? 'checkmark' : 'mail-outline'} style={{ fontSize: 32 }}></ion-icon>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, color: c.text, letterSpacing: -0.3 }}>
            {state === 'sent' ? 'Email sent ✓' : 'Confirm your email'}
          </div>
          <div style={{ textAlign: 'center', fontSize: 14, color: c.muted, marginTop: 8, lineHeight: 1.5 }}>
            {state === 'sent'
              ? 'Check sara@tally.com — open the link on this device to finish.'
              : <>We sent a link to <span style={{ color: c.text, fontWeight: 700 }}>sara@tally.com</span>. Open it on this device to finish setting up.</>}
          </div>

          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button label="I've confirmed — continue" variant="primary" size="md" fullWidth c={c} onClick={onClose}
              right={<ion-icon name="arrow-forward" style={{ fontSize: 18 }}></ion-icon>} />
            <Button label={state === 'sent' ? 'Resend in 30s' : 'Resend email'} variant="secondary" size="md" fullWidth c={c} disabled={state === 'sent'} />
            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <span style={{ color: c.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', borderBottom: `1px dashed ${c.border}`, paddingBottom: 1 }}>
                Use locally for now
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.ConfirmEmailOverlay = ConfirmEmailOverlay;
