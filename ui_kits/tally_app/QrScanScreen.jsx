/* QrScanScreen — full-screen camera with viewfinder, success and permission states */
function QrScanScreen({ c, state = 'scanning', onClose }) {
  // state: scanning | success | denied
  return (
    <div style={{
      position: 'relative', background: '#061E1E', height: '100%',
      overflow: 'hidden', color: '#fff',
    }}>
      {/* Faux camera feed: dark gradient + soft city blur */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(120% 80% at 50% 0%, #1c4d49 0%, #0a2625 60%, #061E1E 100%)',
      }}></div>
      {/* Light blobs for depth */}
      <div style={{ position: 'absolute', left: '10%', top: '30%', width: 220, height: 220, borderRadius: 220, background: 'rgba(94,230,160,0.10)', filter: 'blur(40px)' }}></div>
      <div style={{ position: 'absolute', right: '5%', top: '60%', width: 260, height: 260, borderRadius: 260, background: 'rgba(255,255,255,0.06)', filter: 'blur(50px)' }}></div>

      {/* Top translucent header */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, padding: '52px 14px 12px',
        display: 'flex', alignItems: 'center',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0))',
        zIndex: 3,
      }}>
        <div onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 18, marginLeft: 8,
          background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <ion-icon name="close" style={{ fontSize: 20, color: '#fff' }}></ion-icon>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>Scan invite code</div>
        <div style={{ width: 44 }}></div>
      </div>

      {/* Viewfinder */}
      {state !== 'denied' && (
        <Viewfinder state={state} c={c} />
      )}

      {state === 'denied' && (
        <PermissionDenied c={c} />
      )}

      {/* Bottom hint sheet */}
      {state !== 'denied' && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding: '18px 22px 32px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0))',
          zIndex: 3,
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: 16, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ion-icon name="link-outline" style={{ fontSize: 18 }}></ion-icon>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Or paste a link</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>tally.cc/g/…</div>
            </div>
            <ion-icon name="chevron-forward" style={{ fontSize: 16, opacity: 0.6 }}></ion-icon>
          </div>
        </div>
      )}
    </div>
  );
}

function Viewfinder({ state, c }) {
  const size = 230;
  const corner = 28;
  const stroke = 4;
  const tick = c.primary;
  const success = state === 'success';
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 2,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {/* Top spacer */}
      <div style={{ flex: 0.7 }}></div>

      {/* Square */}
      <div style={{ position: 'relative', width: size, height: size }}>
        {/* Cutout border */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 22,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.18)',
        }}></div>

        {/* Corner ticks */}
        {[
          { t: 0, l: 0,    b: 'a' },
          { t: 0, r: 0,    b: 'b' },
          { b: 0, l: 0,    b: 'c' },
          { b: 0, r: 0,    b: 'd' },
        ].map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: p.t, bottom: p.b !== undefined && p.b !== 'a' && p.b !== 'b' && p.b !== 'c' && p.b !== 'd' ? p.b : (i >= 2 ? 0 : undefined),
            left: i === 0 || i === 2 ? 0 : undefined,
            right: i === 1 || i === 3 ? 0 : undefined,
            width: corner, height: corner,
            borderTop: i < 2 ? `${stroke}px solid ${tick}` : 'none',
            borderBottom: i >= 2 ? `${stroke}px solid ${tick}` : 'none',
            borderLeft: i % 2 === 0 ? `${stroke}px solid ${tick}` : 'none',
            borderRight: i % 2 === 1 ? `${stroke}px solid ${tick}` : 'none',
            borderTopLeftRadius: i === 0 ? 18 : 0,
            borderTopRightRadius: i === 1 ? 18 : 0,
            borderBottomLeftRadius: i === 2 ? 18 : 0,
            borderBottomRightRadius: i === 3 ? 18 : 0,
          }}></div>
        ))}

        {/* Scan line OR success check */}
        {!success && (
          <div style={{
            position: 'absolute', left: 16, right: 16, top: '50%',
            height: 2, background: `linear-gradient(90deg, transparent, ${tick}, transparent)`,
            boxShadow: `0 0 14px ${tick}`,
          }}></div>
        )}
        {success && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 90, height: 90, borderRadius: 45, background: c.primary, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 50,
              boxShadow: `0 0 0 10px rgba(94,230,160,0.20)`,
            }}>
              <ion-icon name="checkmark"></ion-icon>
            </div>
          </div>
        )}
      </div>

      {/* Caption */}
      <div style={{ marginTop: 22, fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)', textAlign: 'center', padding: '0 24px' }}>
        {success ? 'Joining Tokyo trip 2025…' : 'Point at a Tally QR to join'}
      </div>

      <div style={{ flex: 1 }}></div>
    </div>
  );
}

function PermissionDenied({ c }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 2,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '0 28px',
    }}>
      <div style={{
        width: 84, height: 84, borderRadius: 26,
        background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 38,
      }}>
        <ion-icon name="camera-reverse-outline"></ion-icon>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 18, textAlign: 'center', letterSpacing: -0.3 }}>
        Allow camera access
      </div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8, textAlign: 'center', lineHeight: 1.5 }}>
        Tally needs your camera to scan invite codes. You can change this anytime.
      </div>
      <div style={{ marginTop: 22, width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          background: c.primary, color: '#fff', borderRadius: 12, padding: '14px 16px',
          fontSize: 15, fontWeight: 700, textAlign: 'center', cursor: 'pointer',
        }}>Open Settings</div>
        <div style={{
          background: 'transparent', color: 'rgba(255,255,255,0.8)', borderRadius: 12, padding: '12px 16px',
          fontSize: 14, fontWeight: 700, textAlign: 'center', cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.16)',
        }}>Paste a link instead</div>
      </div>
    </div>
  );
}

window.QrScanScreen = QrScanScreen;
