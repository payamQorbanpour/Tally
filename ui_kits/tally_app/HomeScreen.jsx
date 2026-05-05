/* HomeScreen — Groups list with summary card on top, FAB pill, tab bar */
function HomeScreen({ c, groups, summary, onOpenGroup, onAdd, onMic }) {
  return (
    <div style={{ background: c.bg, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '62px 20px 8px', display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: c.text, letterSpacing: -0.5 }}>Groups</div>
        <div style={{ flex: 1 }}></div>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background: c.owedSoft,
          color: c.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <ion-icon name="search-outline" style={{ fontSize: 18 }}></ion-icon>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 100px' }}>
        {/* Net summary card */}
        <div style={{
          background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 18,
          padding: 18, boxShadow: c.shadowCard,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Your net balance
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: c.owed, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
              +${summary.net.toFixed(2)}
            </div>
            <div style={{ fontSize: 13, color: c.muted, fontWeight: 600 }}>across {groups.length} groups</div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <div style={{ flex: 1, background: c.owedSoft, borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.primary, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                People owe you
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: c.owed, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                ${summary.owed.toFixed(2)}
              </div>
            </div>
            <div style={{ flex: 1, background: c.oweSoft, borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.owe, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                You owe
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: c.owe, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                ${summary.owe.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Group rows */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((g) => {
            const sign = g.myBalance >= 0;
            return (
              <div key={g.id} onClick={() => onOpenGroup(g.id)} style={{
                background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 16,
                padding: 14, display: 'flex', alignItems: 'center', gap: 12,
                cursor: 'pointer', boxShadow: c.shadowCard,
              }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 13, background: c.owedSoft, color: c.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <ion-icon name={g.icon} style={{ fontSize: 22 }}></ion-icon>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {g.name}
                  </div>
                  <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>
                    {g.members.length} members · {g.created}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: sign ? c.primary : c.owe,
                    textTransform: 'uppercase', letterSpacing: 0.4,
                  }}>
                    {sign ? 'You lent' : 'You owe'}
                  </div>
                  <div style={{
                    fontSize: 17, fontWeight: 800, color: sign ? c.owed : c.owe,
                    fontVariantNumeric: 'tabular-nums', marginTop: 2,
                  }}>
                    {g.currency}{Math.abs(g.myBalance).toLocaleString(undefined, { minimumFractionDigits: g.currency === '¥' ? 0 : 2 })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add group dashed card */}
          <div style={{
            border: `2px dashed ${c.border}`, borderRadius: 16, padding: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            color: c.muted, fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>
            <ion-icon name="add-circle-outline" style={{ fontSize: 18 }}></ion-icon>
            New group
          </div>
        </div>
      </div>

      <FabPill onAdd={onAdd} onMic={onMic} c={c} />
      <TabBar value="home" onChange={() => {}} c={c} />
    </div>
  );
}

window.HomeScreen = HomeScreen;
