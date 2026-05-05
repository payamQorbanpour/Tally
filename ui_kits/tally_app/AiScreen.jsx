/* AiScreen — capture state: 4 tiles (Camera / Gallery / Describe / Voice) */
function AiScreen({ c, onMic, onAdd }) {
  const tiles = [
    { icon: 'camera-outline', label: 'Photo', sub: 'Snap the receipt', on: true },
    { icon: 'image-outline', label: 'Gallery', sub: 'Pick from photos' },
  ];
  return (
    <div style={{ background: c.bg, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '62px 20px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background: c.primary, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ion-icon name="sparkles" style={{ fontSize: 18 }}></ion-icon>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: c.text, letterSpacing: -0.4 }}>Add with AI</div>
          <div style={{ fontSize: 12, color: c.muted }}>Faster than typing it in</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 110px' }}>
        {/* Group context pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: c.owedSoft, padding: '6px 12px', borderRadius: 999,
          color: c.primary, fontSize: 12, fontWeight: 700,
        }}>
          <ion-icon name="airplane-outline"></ion-icon>
          Adding to · Tokyo trip 2025
          <ion-icon name="chevron-down" style={{ fontSize: 12 }}></ion-icon>
        </div>

        {/* Big input methods grid */}
        <div style={{
          marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        }}>
          {tiles.map((t) => (
            <div key={t.label} style={{
              background: t.on ? c.primary : c.surface,
              border: t.on ? `1px solid ${c.primary}` : `1px solid ${c.cardRim}`,
              borderRadius: 18, padding: '20px 16px',
              display: 'flex', flexDirection: 'column', gap: 10,
              boxShadow: c.shadowCard, cursor: 'pointer',
              minHeight: 130,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: t.on ? 'rgba(255,255,255,0.2)' : c.owedSoft,
                color: t.on ? '#fff' : c.primary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ion-icon name={t.icon} style={{ fontSize: 22 }}></ion-icon>
              </div>
              <div style={{ flex: 1 }}></div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.on ? '#fff' : c.text }}>{t.label}</div>
              <div style={{ fontSize: 12, color: t.on ? 'rgba(255,255,255,0.85)' : c.muted, marginTop: -6 }}>{t.sub}</div>
            </div>
          ))}
        </div>

        {/* Describe box */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Or just type it
          </div>
          <div style={{
            background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 16,
            padding: 14, boxShadow: c.shadowCard, display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontSize: 14, color: c.muted, lineHeight: 1.5 }}>
              <span style={{ color: c.text }}>"Dinner at Saburo's, ¥8400. Marco and I split it."</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1, fontSize: 12, color: c.muted }}>Tally figures out who paid, who's in, and the math.</div>
              <button style={{
                background: c.primary, color: '#fff', border: 'none', borderRadius: 999,
                padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <ion-icon name="sparkles"></ion-icon>
                Analyze
              </button>
            </div>
          </div>
        </div>

        {/* Recent AI runs */}
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: c.muted, marginBottom: 8 }}>Recent</div>
          {[
            { title: '7-Eleven · ¥1,240', sub: '4 items extracted', icon: 'receipt-outline' },
            { title: 'Voice: "Cab to Shibuya 1480"', sub: 'Transport · ¥1,480', icon: 'mic-outline' },
          ].map((r) => (
            <div key={r.title} style={{
              background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 12,
              padding: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, boxShadow: c.shadowCard,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: c.owedSoft, color: c.primary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ion-icon name={r.icon} style={{ fontSize: 18 }}></ion-icon>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{r.title}</div>
                <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{r.sub}</div>
              </div>
              <ion-icon name="chevron-forward" style={{ fontSize: 18, color: c.muted }}></ion-icon>
            </div>
          ))}
        </div>
      </div>

      <FabPill onAdd={onAdd} onMic={onMic} c={c} />
      <TabBar value="ai" onChange={() => {}} c={c} />
    </div>
  );
}

/* AiAssignScreen — receipt items + drag-to-assign result page */
function AiAssignScreen({ c, onClose, onSave }) {
  const items = [
    { id: 1, label: 'Sapporo bottle', amount: 1200, who: ['Marco', 'You'] },
    { id: 2, label: 'Karaage plate', amount: 1400, who: ['Marco'] },
    { id: 3, label: 'Yakitori (chicken)', amount: 1800, who: ['You', 'Aiko', 'Marco'] },
    { id: 4, label: 'Shochu pour', amount: 900, who: ['Aiko'] },
    { id: 5, label: 'Salad', amount: 800, who: ['You'] },
    { id: 6, label: 'Rice', amount: 600, who: ['You', 'Marco'] },
    { id: 7, label: 'Service charge', amount: 700, who: ['You', 'Aiko', 'Marco'] },
  ];
  const total = items.reduce((s, x) => s + x.amount, 0);
  const members = ['You', 'Aiko', 'Marco'];

  return (
    <div style={{ background: c.bg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '52px 4px 0' }}>
        <div onClick={onClose} style={{ padding: '8px 14px', color: c.primary, fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Cancel</div>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: c.text, textAlign: 'center' }}>Assign items</div>
        <div onClick={onSave} style={{ padding: '8px 14px', color: c.primary, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Save</div>
      </div>

      {/* AI banner */}
      <div style={{
        margin: '4px 16px 6px', padding: '10px 12px', borderRadius: 12,
        background: c.owedSoft, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <ion-icon name="sparkles" style={{ color: c.primary, fontSize: 18 }}></ion-icon>
        <div style={{ flex: 1, fontSize: 12, color: c.text, fontWeight: 600 }}>
          <span style={{ color: c.primary }}>AI extracted 7 items</span> from Saburo's · ¥{total.toLocaleString()}
        </div>
        <div style={{ fontSize: 11, color: c.primary, fontWeight: 700 }}>Edit</div>
      </div>

      {/* Member chips (drop targets) */}
      <div style={{ padding: '6px 16px 8px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {members.map((m, i) => (
          <div key={m} style={{
            flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 999,
            background: i === 0 ? c.primary : c.surface,
            color: i === 0 ? '#fff' : c.text,
            border: i === 0 ? 'none' : `1px solid ${c.cardRim}`,
            fontSize: 13, fontWeight: 700, boxShadow: c.shadowCard,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 11,
              background: i === 0 ? 'rgba(255,255,255,0.25)' : c.owedSoft,
              color: i === 0 ? '#fff' : c.primary, fontSize: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{m === 'You' ? 'Y' : m.slice(0, 1)}</div>
            {m}
            <span style={{ opacity: 0.7, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
              ¥{Math.round(items.filter((x) => x.who.includes(m)).reduce((s, x) => s + x.amount / x.who.length, 0)).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 16px 28px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, margin: '8px 4px 8px' }}>
          Items · drag to assign
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it) => (
            <div key={it.id} style={{
              background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 14,
              padding: '12px 12px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: c.shadowCard,
            }}>
              <ion-icon name="reorder-three-outline" style={{ fontSize: 22, color: c.muted }}></ion-icon>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{it.label}</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {it.who.map((w) => (
                    <div key={w} style={{
                      width: 20, height: 20, borderRadius: 10,
                      background: c.owedSoft, color: c.primary,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, border: `1.5px solid ${c.surface}`,
                    }}>{w === 'You' ? 'Y' : w.slice(0, 1)}</div>
                  ))}
                  <div style={{ fontSize: 11, color: c.muted, marginLeft: 4, alignSelf: 'center' }}>
                    {it.who.length === 1 ? `${it.who[0]} only` : `${it.who.length} people`}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
                ¥{it.amount.toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 18, padding: '14px 16px', borderRadius: 14,
          background: c.owedSoft, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: c.primary, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ion-icon name="checkmark" style={{ fontSize: 20 }}></ion-icon>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              All items assigned
            </div>
            <div style={{ fontSize: 13, color: c.text, marginTop: 2 }}>
              Tap Save to add 7 items as one expense.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.AiScreen = AiScreen;
window.AiAssignScreen = AiAssignScreen;
