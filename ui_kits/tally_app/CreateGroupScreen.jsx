/* CreateGroupScreen — form to create a new group, with member chips & invite hint */
function CreateGroupScreen({ c, onBack, variant = 'prefilled', rtl = false }) {
  const isSolo = variant === 'solo';
  const groupName = rtl ? 'سفر توکیو ۲۰۲۵' : 'Tokyo trip 2025';
  const namePlaceholder = rtl ? 'نام گروه' : 'e.g. Roomies, Tokyo trip…';

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ background: c.bg, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '52px 8px 0' }}>
        <div onClick={onBack} style={{
          width: 36, height: 36, marginInlineStart: 8, borderRadius: 18,
          border: `1px solid ${c.cardRim}`, color: c.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <ion-icon name={rtl ? 'chevron-forward' : 'chevron-back'} style={{ fontSize: 18 }}></ion-icon>
        </div>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: c.text, textAlign: 'center' }}>
          {rtl ? 'گروه جدید' : 'New group'}
        </div>
        <div style={{ width: 44 }}></div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 110px' }}>
        {/* Name */}
        <FieldLabel c={c}>{rtl ? 'نام گروه' : 'Group name'}</FieldLabel>
        <div style={{
          background: c.inputSurface, borderRadius: 12, padding: '14px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <ion-icon name="people-outline" style={{ fontSize: 18, color: c.muted }}></ion-icon>
          <div style={{ fontSize: 16, fontWeight: 700, color: c.text, flex: 1 }}>{groupName}</div>
        </div>

        {/* Currency */}
        <FieldLabel c={c} top={18}>{rtl ? 'واحد پول' : 'Currency'}</FieldLabel>
        <div style={{
          background: c.inputSurface, borderRadius: 12, padding: '14px 14px',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: c.owedSoft, color: c.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800,
          }}>¥</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>JPY · Japanese Yen</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>Used for all expenses in this group</div>
          </div>
          <ion-icon name="chevron-down" style={{ fontSize: 16, color: c.muted }}></ion-icon>
        </div>

        {/* Members */}
        <FieldLabel c={c} top={22}>{rtl ? 'اعضا' : 'Members'}</FieldLabel>
        <div style={{
          background: c.inputSurface, borderRadius: 12, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <ion-icon name="search-outline" style={{ fontSize: 18, color: c.muted }}></ion-icon>
          <div style={{ fontSize: 15, fontWeight: 500, color: c.muted, flex: 1 }}>
            {rtl ? 'جستجوی دوستان…' : 'Search friends or add by email…'}
          </div>
        </div>

        {/* Selected chips OR empty state */}
        {isSolo ? (
          <div style={{
            marginTop: 14, padding: '18px 16px',
            background: c.owedSoft, border: `1px dashed ${c.primary}55`, borderRadius: 14,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 11, background: c.surface, color: c.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ion-icon name="information-circle-outline" style={{ fontSize: 18 }}></ion-icon>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: c.text }}>It's just you for now</div>
              <div style={{ fontSize: 12, color: c.text, opacity: 0.7, marginTop: 4, lineHeight: 1.5 }}>
                Add at least one friend to split expenses, or invite someone with a link.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { name: 'You', you: true },
              { name: 'Marco', selected: true },
              { name: 'Aiko', selected: true },
              { name: 'Kenji', selected: true },
            ].map((m) => (
              <div key={m.name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px 6px 6px', borderRadius: 999,
                background: m.you ? c.primary : c.owedSoft,
                color: m.you ? '#fff' : c.primary,
                border: `1px solid ${m.you ? c.primary : c.primary + '40'}`,
                fontSize: 13, fontWeight: 700,
              }}>
                <Avatar name={m.name} size={22} c={c}
                  bg={m.you ? 'rgba(255,255,255,0.25)' : c.surface}
                  fg={m.you ? '#fff' : c.primary} />
                {m.name}
                {!m.you && <ion-icon name="close" style={{ fontSize: 14, opacity: 0.6, cursor: 'pointer' }}></ion-icon>}
              </div>
            ))}
          </div>
        )}

        {/* Suggestions list */}
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: c.muted,
            textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, paddingLeft: 4,
          }}>{rtl ? 'پیشنهادها' : 'Suggested'}</div>
          <div style={{
            background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 14,
            boxShadow: c.shadowCard, overflow: 'hidden',
          }}>
            {[
              { name: 'Lee Park', via: 'From Us' },
              { name: 'Priya Nair', via: 'From Roomies' },
              { name: 'Renee Cole', via: '' },
            ].map((m, i) => (
              <div key={m.name} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                borderTop: i === 0 ? 'none' : `1px solid ${c.border}`, cursor: 'pointer',
              }}>
                <Avatar name={m.name} size={32} c={c} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{m.name}</div>
                  {m.via && <div style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>{m.via}</div>}
                </div>
                <div style={{
                  width: 28, height: 28, borderRadius: 14, border: `1px solid ${c.cardRim}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.primary, fontSize: 18,
                }}>+</div>
              </div>
            ))}
            {/* Invite by link */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderTop: `1px solid ${c.border}`, background: c.owedSoft, cursor: 'pointer',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, background: c.primary, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ion-icon name="link-outline" style={{ fontSize: 16 }}></ion-icon>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: c.text }}>Invite by link</div>
                <div style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>They don't need an account.</div>
              </div>
              <ion-icon name="chevron-forward" style={{ fontSize: 16, color: c.muted }}></ion-icon>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '14px 20px 28px', background: c.bg,
        borderTop: `1px solid ${c.border}`,
      }}>
        <Button label={rtl ? 'ساختن گروه' : 'Create group'} variant="primary" size="md" fullWidth c={c}
          right={<ion-icon name="arrow-forward" style={{ fontSize: 18 }}></ion-icon>} />
      </div>
    </div>
  );
}

function FieldLabel({ c, children, top = 0 }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: c.muted,
      textTransform: 'uppercase', letterSpacing: 0.6,
      marginTop: top, marginBottom: 6, paddingLeft: 4,
    }}>{children}</div>
  );
}

window.CreateGroupScreen = CreateGroupScreen;
