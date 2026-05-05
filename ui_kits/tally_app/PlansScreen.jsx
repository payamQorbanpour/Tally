/* PlansScreen — modal pricing screen with monthly/yearly toggle, 3 plans */
function PlansScreen({ c, period = 'yearly', onPeriod, onClose }) {
  const yearly = period === 'yearly';
  const plans = [
    {
      key: 'free', name: 'Free', priceMonthly: 0, priceYearly: 0,
      tagline: 'Get started, no card needed.', cta: 'Current plan', current: true,
      features: ['Up to 3 groups', 'Manual expense entry', 'Equal & exact splits', 'Light + dark themes'],
    },
    {
      key: 'plus', name: 'Plus', priceMonthly: 4.99, priceYearly: 47.88,
      tagline: 'For people who split a lot.', cta: 'Start 7-day trial', highlight: true, badge: 'Most popular',
      features: ['Unlimited groups', 'AI receipt scanning', 'Multi-currency with FX', 'Recurring expenses', 'Priority support'],
    },
    {
      key: 'trip', name: 'Trip Pass', priceMonthly: 9.99, priceYearly: null,
      tagline: 'One-off, one trip, one group.', cta: 'Buy Trip Pass', oneOff: true,
      features: ['One Plus group for 30 days', 'AI receipts in this group', 'No recurring charge'],
    },
  ];

  return (
    <div style={{ background: c.bg, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '52px 8px 0' }}>
        <div onClick={onClose} style={{
          width: 36, height: 36, marginLeft: 8, borderRadius: 18,
          border: `1px solid ${c.cardRim}`, color: c.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <ion-icon name="close" style={{ fontSize: 18 }}></ion-icon>
        </div>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: c.text, textAlign: 'center' }}>Plans</div>
        <div style={{ width: 44 }}></div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 18px 28px' }}>
        {/* Hero */}
        <div style={{ padding: '4px 6px 14px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: c.text, letterSpacing: -0.5 }}>
            More groups, fewer headaches.
          </div>
          <div style={{ fontSize: 14, color: c.muted, marginTop: 6, lineHeight: 1.5 }}>
            Plus unlocks unlimited groups, AI receipts, and multi-currency.
          </div>
        </div>

        {/* Period toggle */}
        <div style={{
          display: 'flex', background: c.inputSurface, borderRadius: 12, padding: 4, marginBottom: 14,
        }}>
          {[
            { key: 'monthly', label: 'Monthly' },
            { key: 'yearly', label: 'Yearly' },
          ].map((t) => {
            const on = period === t.key;
            return (
              <div key={t.key} onClick={() => onPeriod && onPeriod(t.key)} style={{
                flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 9,
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                background: on ? c.surface : 'transparent', color: on ? c.text : c.muted,
                boxShadow: on ? c.shadowSegment : 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                {t.label}
                {t.key === 'yearly' && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: c.primary,
                    background: c.owedSoft, padding: '2px 7px', borderRadius: 999,
                  }}>Save 20%</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Plan cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {plans.map((p) => <PlanCard key={p.key} p={p} c={c} yearly={yearly} />)}
        </div>

        {/* Footer fine print */}
        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 11, color: c.muted, lineHeight: 1.5 }}>
          Auto-renews. Cancel anytime in Account.{' '}
          <span style={{ color: c.text, fontWeight: 700, borderBottom: `1px dashed ${c.border}` }}>Restore purchases</span>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ p, c, yearly }) {
  const price = p.oneOff ? p.priceMonthly : (yearly ? p.priceYearly : p.priceMonthly);
  const period = p.oneOff ? 'one-time' : (yearly ? '/year' : '/month');
  return (
    <div style={{
      position: 'relative',
      background: p.highlight ? c.owedSoft : c.surface,
      border: `${p.highlight ? 1.5 : 1}px solid ${p.highlight ? c.primary : c.cardRim}`,
      borderRadius: 18, padding: 16, boxShadow: c.shadowCard,
    }}>
      {p.badge && (
        <div style={{
          position: 'absolute', top: -10, right: 14,
          padding: '4px 10px', borderRadius: 999, background: c.primary, color: '#fff',
          fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
        }}>{p.badge}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: c.text }}>{p.name}</div>
        {p.current && (
          <div style={{
            padding: '2px 8px', borderRadius: 999, background: c.inputSurface,
            color: c.muted, fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
          }}>CURRENT</div>
        )}
      </div>
      <div style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>{p.tagline}</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: c.text, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
          {price === 0 ? 'Free' : `$${price.toFixed(2)}`}
        </div>
        {price > 0 && (
          <div style={{ fontSize: 13, color: c.muted, fontWeight: 600 }}>{period}</div>
        )}
      </div>

      <div style={{ height: 1, background: c.border, margin: '14px 0' }}></div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {p.features.map((f) => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 11, background: c.primary, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ion-icon name="checkmark" style={{ fontSize: 14 }}></ion-icon>
            </div>
            <div style={{ fontSize: 14, color: c.text, fontWeight: 600 }}>{f}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <Button label={p.cta} variant={p.highlight ? 'primary' : (p.current ? 'secondary' : 'outline')} size="md" fullWidth c={c} disabled={p.current} />
      </div>
    </div>
  );
}

window.PlansScreen = PlansScreen;
