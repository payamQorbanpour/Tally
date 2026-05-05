/* AccountScreen — profile, balance summary, settings groups */
function AccountScreen({ c, onBack, onMic, onAdd }) {
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
        <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: c.text, textAlign: 'center' }}>Account</div>
        <div style={{ width: 44 }}></div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 110px' }}>
        {/* Profile card */}
        <div style={{
          background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 18,
          padding: 18, boxShadow: c.shadowCard, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ position: 'relative' }}>
            <Avatar name="Sara" size={64} c={c} />
            <div style={{
              position: 'absolute', right: -4, bottom: -4,
              width: 24, height: 24, borderRadius: 12, background: c.primary, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${c.surface}`,
            }}>
              <ion-icon name="pencil" style={{ fontSize: 11 }}></ion-icon>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.text }}>Sara Lin</div>
            <div style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>sara@hey.com</div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8,
              padding: '4px 10px', borderRadius: 999, background: c.owedSoft,
              color: c.primary, fontSize: 11, fontWeight: 700,
            }}>
              <ion-icon name="star" style={{ fontSize: 10 }}></ion-icon>
              Tally Plus
            </div>
          </div>
        </div>

        {/* Net summary */}
        <div style={{
          marginTop: 14, background: c.surface, border: `1px solid ${c.cardRim}`,
          borderRadius: 16, padding: 14, boxShadow: c.shadowCard, display: 'flex',
        }}>
          <div style={{ flex: 1, padding: '4px 6px' }}>
            <div style={{ fontSize: 11, color: c.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Net</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.owed, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>+$124.80</div>
          </div>
          <div style={{ width: 1, background: c.border }}></div>
          <div style={{ flex: 1, padding: '4px 6px' }}>
            <div style={{ fontSize: 11, color: c.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Groups</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.text, marginTop: 4 }}>3</div>
          </div>
          <div style={{ width: 1, background: c.border }}></div>
          <div style={{ flex: 1, padding: '4px 6px' }}>
            <div style={{ fontSize: 11, color: c.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Friends</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.text, marginTop: 4 }}>14</div>
          </div>
        </div>

        {/* Settings groups */}
        <SettingsGroup c={c} title="Preferences" items={[
          { icon: 'cash-outline', label: 'Default currency', value: 'USD ($)' },
          { icon: 'language-outline', label: 'Language', value: 'English' },
          { icon: 'moon-outline', label: 'Theme', value: 'System' },
          { icon: 'notifications-outline', label: 'Notifications', value: 'On' },
        ]} />

        <SettingsGroup c={c} title="Money" items={[
          { icon: 'card-outline', label: 'Payment methods', value: '2 saved' },
          { icon: 'qr-code-outline', label: 'My QR code', value: 'tally.cc/sara', accent: true },
          { icon: 'shield-checkmark-outline', label: 'Privacy & data', value: '' },
        ]} />

        <SettingsGroup c={c} title="Support" items={[
          { icon: 'help-circle-outline', label: 'Help center', value: '' },
          { icon: 'mail-outline', label: 'Contact support', value: '' },
          { icon: 'document-text-outline', label: 'Terms & privacy', value: '' },
        ]} />

        <div style={{ textAlign: 'center', marginTop: 18, padding: '14px 0' }}>
          <div style={{ color: c.owe, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Sign out</div>
          <div style={{ color: c.muted, fontSize: 11, marginTop: 8 }}>Tally · v3.4.1</div>
        </div>
      </div>

      <FabPill onAdd={onAdd} onMic={onMic} c={c} />
    </div>
  );
}

function SettingsGroup({ c, title, items }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, paddingLeft: 4 }}>
        {title}
      </div>
      <div style={{
        background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 14,
        boxShadow: c.shadowCard, overflow: 'hidden',
      }}>
        {items.map((it, i) => (
          <div key={it.label} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            borderTop: i === 0 ? 'none' : `1px solid ${c.border}`, cursor: 'pointer',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: it.accent ? c.primary : c.owedSoft,
              color: it.accent ? '#fff' : c.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ion-icon name={it.icon} style={{ fontSize: 16 }}></ion-icon>
            </div>
            <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: c.text }}>{it.label}</div>
            {it.value && (
              <div style={{ fontSize: 13, color: c.muted, fontWeight: 500 }}>{it.value}</div>
            )}
            <ion-icon name="chevron-forward" style={{ fontSize: 16, color: c.muted }}></ion-icon>
          </div>
        ))}
      </div>
    </div>
  );
}

/* QrShareModal — bottom sheet with QR code + share actions */
function QrShareModal({ c, group, onClose }) {
  // Simulate QR pattern with a CSS grid of squares
  const grid = React.useMemo(() => {
    const N = 21;
    const cells = [];
    for (let i = 0; i < N * N; i++) {
      // Deterministic pseudo-random
      const v = ((i * 9301 + 49297) % 233280) / 233280;
      cells.push(v > 0.5);
    }
    // Mark finder patterns (corners)
    const setBlock = (r, c2) => {
      for (let dr = 0; dr < 7; dr++) for (let dc = 0; dc < 7; dc++) {
        const idx = (r + dr) * N + (c2 + dc);
        const onEdge = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        cells[idx] = onEdge || inner;
      }
      // clear ring inside
      for (let dr = 1; dr < 6; dr++) for (let dc = 1; dc < 6; dc++) {
        const inner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        if (!inner) cells[(r + dr) * N + (c2 + dc)] = false;
      }
    };
    setBlock(0, 0); setBlock(0, N - 7); setBlock(N - 7, 0);
    return { N, cells };
  }, []);

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(6,30,30,0.55)',
      display: 'flex', alignItems: 'flex-end', zIndex: 50,
    }}>
      <div style={{
        background: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        width: '100%', boxSizing: 'border-box', padding: 22,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* Drag handle */}
        <div style={{ width: 38, height: 4, borderRadius: 2, background: c.border, alignSelf: 'center' }}></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.text }}>Invite to {group?.name || 'group'}</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>Scan, tap, or share — they don't need an account.</div>
          </div>
          <div onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 16, background: c.inputSurface, color: c.muted,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <ion-icon name="close" style={{ fontSize: 18 }}></ion-icon>
          </div>
        </div>

        {/* QR card */}
        <div style={{
          background: '#FFFFFF', borderRadius: 18, padding: 18,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          border: `1px solid ${c.cardRim}`, boxShadow: c.shadowCard,
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${grid.N}, 1fr)`,
            gap: 1, width: 200, height: 200,
          }}>
            {grid.cells.map((on, i) => (
              <div key={i} style={{ background: on ? '#061E1E' : '#FFFFFF', borderRadius: 1 }}></div>
            ))}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', background: c.owedSoft, borderRadius: 999,
            color: c.primary, fontSize: 13, fontWeight: 700,
          }}>
            <ion-icon name="link-outline"></ion-icon>
            tally.cc/g/tokyo-25
          </div>
        </div>

        {/* Share actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { icon: 'copy-outline', label: 'Copy link' },
            { icon: 'share-social-outline', label: 'Share' },
            { icon: 'logo-whatsapp', label: 'WhatsApp' },
            { icon: 'mail-outline', label: 'Email' },
          ].map((a) => (
            <div key={a.label} style={{
              flex: 1, background: c.surface, border: `1px solid ${c.cardRim}`,
              borderRadius: 14, padding: '12px 6px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              cursor: 'pointer', boxShadow: c.shadowCard,
            }}>
              <ion-icon name={a.icon} style={{ fontSize: 22, color: c.primary }}></ion-icon>
              <div style={{ fontSize: 11, fontWeight: 600, color: c.text }}>{a.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px', color: c.muted, fontSize: 12 }}>
          <ion-icon name="time-outline" style={{ fontSize: 16 }}></ion-icon>
          Link expires in 7 days · 4 members joined
        </div>
      </div>
    </div>
  );
}

window.AccountScreen = AccountScreen;
window.QrShareModal = QrShareModal;
