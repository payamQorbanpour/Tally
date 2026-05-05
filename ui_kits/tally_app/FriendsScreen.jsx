/* FriendsScreen — friends list with per-friend balances */
function FriendsScreen({ c, friends, summary, onAdd, onMic, onOpenFriend }) {
  return (
    <div style={{ background: c.bg, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '62px 20px 4px', display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: c.text, letterSpacing: -0.4 }}>Friends</div>
          <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{friends.length} people · sorted by amount</div>
        </div>
        <div style={{
          width: 38, height: 38, borderRadius: 19, background: c.owedSoft, color: c.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <ion-icon name="person-add-outline" style={{ fontSize: 18 }}></ion-icon>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ padding: '8px 20px 4px' }}>
        <div style={{
          background: c.inputSurface, borderRadius: 12, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 8, color: c.muted, fontSize: 14,
        }}>
          <ion-icon name="search-outline" style={{ fontSize: 18 }}></ion-icon>
          <span style={{ flex: 1 }}>Search friends…</span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 110px' }}>
        {/* Net summary */}
        <div style={{
          background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 16,
          padding: 14, boxShadow: c.shadowCard, display: 'flex', gap: 10,
        }}>
          <div style={{ flex: 1, padding: '4px 6px' }}>
            <div style={{ fontSize: 11, color: c.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Owe you</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.owed, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              ${summary.owed.toFixed(2)}
            </div>
          </div>
          <div style={{ width: 1, background: c.border }}></div>
          <div style={{ flex: 1, padding: '4px 6px' }}>
            <div style={{ fontSize: 11, color: c.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>You owe</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.owe, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              ${summary.owe.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, overflowX: 'auto' }}>
          {['All', 'Owe you', 'You owe', 'Settled'].map((f, i) => (
            <div key={f} style={{
              flex: '0 0 auto', padding: '6px 12px', borderRadius: 999,
              background: i === 0 ? c.primary : c.surface,
              color: i === 0 ? '#fff' : c.muted,
              border: i === 0 ? 'none' : `1px solid ${c.border}`,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>{f}</div>
          ))}
        </div>

        {/* Friends list */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {friends.map((f) => <FriendRow key={f.name} c={c} f={f} onClick={() => onOpenFriend?.(f)} />)}
        </div>

        {/* Invite */}
        <div onClick={onAdd} style={{
          marginTop: 16, padding: '14px 16px', borderRadius: 14,
          background: c.owedSoft, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12, background: c.surface, color: c.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ion-icon name="link-outline" style={{ fontSize: 20 }}></ion-icon>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.primary }}>Invite a friend</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>Share a QR or link · they don't need an account</div>
          </div>
          <ion-icon name="chevron-forward" style={{ fontSize: 18, color: c.muted }}></ion-icon>
        </div>
      </div>

      <FabPill onAdd={onAdd} onMic={onMic} c={c} />
      <TabBar value="friends" onChange={() => {}} c={c} />
    </div>
  );
}

function FriendRow({ c, f, onClick }) {
  const owed = f.balance > 0;
  const settled = f.balance === 0;
  const sub = settled ? 'All settled' : owed ? `owes you in ${f.via}` : `you owe in ${f.via}`;
  const color = settled ? c.muted : owed ? c.owed : c.owe;
  return (
    <div onClick={onClick} style={{
      background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 14,
      padding: '12px 14px', boxShadow: c.shadowCard,
      display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
    }}>
      <Avatar name={f.name} size={42} c={c} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{f.name}</div>
        <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: c.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {settled ? '·' : owed ? 'owes you' : 'you owe'}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {settled ? '—' : `$${Math.abs(f.balance).toFixed(2)}`}
        </div>
      </div>
    </div>
  );
}

window.FriendsScreen = FriendsScreen;
