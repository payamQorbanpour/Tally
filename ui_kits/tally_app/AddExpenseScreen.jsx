/* AddExpenseScreen — clean: amount + description + paid by + share cards.
 * Category + split picker live in an Advanced disclosure (collapsed by default). */
function AddExpenseScreen({ c, group, onClose, onSave, advancedDefault = false, defaultSplitMode = 'equal' }) {
  const [amount, setAmount] = React.useState('60.00');
  const [desc, setDesc] = React.useState('Lake boat');
  const [splitMode, setSplitMode] = React.useState(defaultSplitMode);
  const [category, setCategory] = React.useState('general');
  const [advancedOpen, setAdvancedOpen] = React.useState(advancedDefault);
  const [paidBy, setPaidBy] = React.useState('You');
  // Per-member split state — keyed by member name. Same shape across modes; meaning differs.
  const [splitValues, setSplitValues] = React.useState(() => {
    const exact = (parseFloat('60.00') / Math.max(1, group.members.length)).toFixed(2);
    const obj = {};
    group.members.forEach((m) => {
      obj[m] = { exact, percent: (100 / group.members.length).toFixed(0), shares: 1, included: true, adjust: 0 };
    });
    return obj;
  });
  const updateMember = (m, key, val) => setSplitValues((prev) => ({ ...prev, [m]: { ...prev[m], [key]: val } }));

  const cats = [
    { key: 'general', icon: 'receipt-outline', label: 'General' },
    { key: 'food', icon: 'restaurant-outline', label: 'Food' },
    { key: 'snack', icon: 'fast-food-outline', label: 'Snacks' },
    { key: 'drink', icon: 'beer-outline', label: 'Drinks' },
    { key: 'home', icon: 'home-outline', label: 'Home' },
    { key: 'transport', icon: 'car-outline', label: 'Transport' },
  ];

  const splitModes = [
    { key: 'equal', icon: 'people-outline', label: 'Equal' },
    { key: 'exact', icon: 'calculator-outline', label: 'Exact' },
    { key: 'percent', icon: 'pie-chart-outline', label: '%' },
    { key: 'shares', icon: 'layers-outline', label: 'Shares' },
    { key: 'adjust', icon: 'options-outline', label: 'Adj' },
  ];

  const perPerson = (parseFloat(amount || '0') / Math.max(1, group.members.length));

  return (
    <div style={{ background: c.bg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '52px 4px 0' }}>
        <div onClick={onClose} style={{ padding: '8px 14px', color: c.primary, fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Cancel</div>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: c.text, textAlign: 'center' }}>Add expense</div>
        <div onClick={onSave} style={{ padding: '8px 14px', color: c.primary, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Save</div>
      </div>

      {/* Date pill */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 6px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: c.inputSurface, padding: '6px 12px', borderRadius: 999,
          color: c.text, fontSize: 13, fontWeight: 600,
        }}>
          <ion-icon name="calendar-outline"></ion-icon>
          Today, 7:21 PM
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 28px' }}>
        {/* Amount block */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 0 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Amount</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.muted }}>{group.currency}</div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                fontFamily: 'inherit', fontSize: 56, fontWeight: 800, letterSpacing: -1,
                color: c.text, background: 'transparent', border: 0, outline: 'none',
                width: 200, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
              }}
            />
          </div>
        </div>

        {/* Description (filled mint) */}
        <Field label="What was this for?" c={c}>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. Dinner at Saburo's"
            style={{
              fontFamily: 'inherit', fontSize: 16, padding: '14px 16px',
              borderRadius: 12, border: 'none', background: c.inputSurface, color: c.text,
              outline: 'none', width: '100%', boxSizing: 'border-box', fontWeight: 600,
            }}
          />
        </Field>

        {/* Paid by */}
        <Field label="Paid by" c={c}>
          <div style={{
            background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 14,
            boxShadow: c.shadowCard, overflow: 'hidden',
          }}>
            {group.members.map((m, i) => {
              const on = paidBy === m;
              return (
                <div key={m} onClick={() => setPaidBy(m)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                  borderTop: i === 0 ? 'none' : `1px solid ${c.border}`, cursor: 'pointer',
                }}>
                  <Avatar name={m} size={32} c={c} />
                  <div style={{ flex: 1, fontSize: 15, color: c.text, fontWeight: 600 }}>{m === 'You' ? 'You' : m}</div>
                  {on && <ion-icon name="checkmark-circle" style={{ color: c.primary, fontSize: 22 }}></ion-icon>}
                </div>
              );
            })}
          </div>
        </Field>

        {/* Equal-split summary */}
        <div style={{
          background: c.owedSoft, borderRadius: 14, padding: 14, marginTop: 18,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12, background: c.primary, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>
            <ion-icon name="people"></ion-icon>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: c.primary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Split equally
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.text, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              {group.currency} {perPerson.toFixed(2)} each · {group.members.length} people
            </div>
          </div>
        </div>

        {/* Advanced disclosure */}
        <div style={{ marginTop: 18 }}>
          <div onClick={() => setAdvancedOpen((v) => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 4px',
            cursor: 'pointer', userSelect: 'none', borderTop: `1px solid ${c.border}`,
          }}>
            <ion-icon name="options-outline" style={{ fontSize: 18, color: c.muted }}></ion-icon>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: c.text }}>Advanced</div>
            <div style={{ fontSize: 12, color: c.muted, marginRight: 6 }}>
              Split: {(splitModes.find((m) => m.key === splitMode) || splitModes[0]).label}
            </div>
            <ion-icon name={advancedOpen ? 'chevron-up' : 'chevron-down'} style={{ fontSize: 16, color: c.muted }}></ion-icon>
          </div>

          {advancedOpen && (
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Split method
              </div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {splitModes.map((m) => {
                  const on = splitMode === m.key;
                  return (
                    <div key={m.key} onClick={() => setSplitMode(m.key)} style={{
                      flex: '0 0 auto', padding: '10px 14px', borderRadius: 12,
                      background: on ? c.owedSoft : c.surface,
                      color: on ? c.primary : c.muted,
                      border: on ? `1px solid ${c.primary}` : `1px solid ${c.border}`,
                      fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    }}>
                      <ion-icon name={m.icon} style={{ fontSize: 16 }}></ion-icon>
                      {m.label}
                    </div>
                  );
                })}
              </div>

              {/* Per-member split inputs */}
              <SplitMembers
                c={c}
                group={group}
                mode={splitMode}
                amount={parseFloat(amount || '0')}
                values={splitValues}
                onChange={updateMember}
              />

              <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, margin: '18px 0 8px' }}>
                Category
              </div>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                {cats.map((cat) => {
                  const on = category === cat.key;
                  return (
                    <div key={cat.key} onClick={() => setCategory(cat.key)} style={{
                      flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer',
                    }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: on ? c.primary : c.owedSoft,
                        color: on ? '#fff' : c.primary,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                      }}>
                        <ion-icon name={cat.icon}></ion-icon>
                      </div>
                      <div style={{ fontSize: 10, color: c.muted }}>{cat.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, c }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

window.AddExpenseScreen = AddExpenseScreen;

/* SplitMembers — per-member input rows whose UI changes by split mode. */
function SplitMembers({ c, group, mode, amount, values, onChange }) {
  const members = group.members;

  // Live totals for the live "remaining" footer
  let footer = null;
  if (mode === 'exact') {
    const sum = members.reduce((s, m) => s + (parseFloat(values[m].exact || 0) || 0), 0);
    const remaining = amount - sum;
    footer = { label: 'Sum of shares', a: `${group.currency} ${sum.toFixed(2)}`, b: `${group.currency} ${amount.toFixed(2)}`, ok: Math.abs(remaining) < 0.01, hint: remaining > 0 ? `${group.currency} ${remaining.toFixed(2)} left` : remaining < 0 ? `${group.currency} ${Math.abs(remaining).toFixed(2)} over` : 'Balanced' };
  } else if (mode === 'percent') {
    const sum = members.reduce((s, m) => s + (parseFloat(values[m].percent || 0) || 0), 0);
    footer = { label: 'Total', a: `${sum.toFixed(0)}%`, b: '100%', ok: Math.abs(sum - 100) < 0.5, hint: sum < 100 ? `${(100 - sum).toFixed(0)}% left` : sum > 100 ? `${(sum - 100).toFixed(0)}% over` : 'Balanced' };
  } else if (mode === 'shares') {
    const totalShares = members.reduce((s, m) => s + (parseFloat(values[m].shares || 0) || 0), 0) || 1;
    footer = { label: 'Total shares', a: `${totalShares}`, b: `1 share = ${group.currency} ${(amount / totalShares).toFixed(2)}`, ok: true };
  } else if (mode === 'equal') {
    const included = members.filter((m) => values[m].included);
    const per = included.length ? amount / included.length : 0;
    footer = { label: `${included.length} of ${members.length} included`, a: `${group.currency} ${per.toFixed(2)} each`, b: '', ok: included.length > 0 };
  } else if (mode === 'adjust') {
    const adj = members.reduce((s, m) => s + (parseFloat(values[m].adjust || 0) || 0), 0);
    const remainder = amount - adj;
    const each = members.length ? remainder / members.length : 0;
    footer = { label: 'Adjustments', a: `${group.currency} ${adj.toFixed(2)}`, b: `Then ${group.currency} ${each.toFixed(2)} each`, ok: true };
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {mode === 'equal' ? 'Who is in?' : mode === 'exact' ? 'Exact amounts' : mode === 'percent' ? 'Percentages' : mode === 'shares' ? 'Shares' : 'Adjustments + equal split'}
      </div>
      <div style={{
        background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 14,
        boxShadow: c.shadowCard, overflow: 'hidden',
      }}>
        {members.map((m, i) => (
          <SplitRow key={m} c={c} m={m} i={i} mode={mode} v={values[m]} group={group} amount={amount}
            allShares={members.reduce((s, x) => s + (parseFloat(values[x].shares || 0) || 0), 0) || 1}
            includedCount={members.filter((x) => values[x].included).length || 1}
            onChange={(key, val) => onChange(m, key, val)} />
        ))}
      </div>

      {footer && (
        <div style={{
          marginTop: 10, padding: '10px 14px', borderRadius: 12,
          background: footer.ok ? c.owedSoft : c.oweSoft,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <ion-icon name={footer.ok ? 'checkmark-circle' : 'alert-circle'} style={{ fontSize: 18, color: footer.ok ? c.primary : c.owe }}></ion-icon>
          <div style={{ flex: 1, fontSize: 12, color: c.text, fontWeight: 600 }}>{footer.label}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: footer.ok ? c.primary : c.owe, fontVariantNumeric: 'tabular-nums' }}>
            {footer.a}{footer.b ? ` / ${footer.b}` : ''}
          </div>
          {footer.hint && <div style={{ fontSize: 11, color: c.muted, marginLeft: 4 }}>· {footer.hint}</div>}
        </div>
      )}
    </div>
  );
}

function SplitRow({ c, m, i, mode, v, group, amount, allShares, includedCount, onChange }) {
  const inputBase = {
    fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
    border: 'none', background: c.inputSurface, color: c.text,
    outline: 'none', padding: '8px 10px', borderRadius: 10, width: 84,
    textAlign: 'right', fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box',
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      borderTop: i === 0 ? 'none' : `1px solid ${c.border}`,
    }}>
      <Avatar name={m} size={32} c={c} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{m === 'You' ? 'You' : m}</div>
        {/* Live preview */}
        <div style={{ fontSize: 11, color: c.muted, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {mode === 'equal' && (v.included
            ? `Owes ${group.currency} ${(amount / includedCount).toFixed(2)}`
            : 'Not included')}
          {mode === 'exact' && `Owes ${group.currency} ${(parseFloat(v.exact || 0) || 0).toFixed(2)}`}
          {mode === 'percent' && `Owes ${group.currency} ${(amount * (parseFloat(v.percent || 0) || 0) / 100).toFixed(2)}`}
          {mode === 'shares' && `${v.shares} share${v.shares != 1 ? 's' : ''} · ${group.currency} ${(amount * (parseFloat(v.shares || 0) || 0) / allShares).toFixed(2)}`}
          {mode === 'adjust' && `Owes equal share ${(parseFloat(v.adjust || 0) || 0) >= 0 ? '+' : ''}${(parseFloat(v.adjust || 0) || 0).toFixed(2)}`}
        </div>
      </div>

      {mode === 'equal' && (
        <div onClick={() => onChange('included', !v.included)} style={{
          width: 26, height: 26, borderRadius: 13,
          background: v.included ? c.primary : c.surface,
          border: v.included ? 'none' : `2px solid ${c.border}`,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}>
          {v.included && <ion-icon name="checkmark" style={{ fontSize: 18 }}></ion-icon>}
        </div>
      )}

      {mode === 'exact' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: c.muted, fontSize: 13, fontWeight: 600 }}>{group.currency}</span>
          <input type="number" value={v.exact} onChange={(e) => onChange('exact', e.target.value)} style={inputBase} />
        </div>
      )}

      {mode === 'percent' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="number" value={v.percent} onChange={(e) => onChange('percent', e.target.value)} style={{ ...inputBase, width: 64 }} />
          <span style={{ color: c.muted, fontSize: 13, fontWeight: 600 }}>%</span>
        </div>
      )}

      {mode === 'shares' && (
        <div style={{ display: 'flex', alignItems: 'center', background: c.inputSurface, borderRadius: 10, padding: 2 }}>
          <div onClick={() => onChange('shares', Math.max(0, (parseInt(v.shares) || 0) - 1))} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: c.primary, cursor: 'pointer',
          }}>
            <ion-icon name="remove" style={{ fontSize: 16 }}></ion-icon>
          </div>
          <div style={{ minWidth: 24, textAlign: 'center', fontWeight: 800, color: c.text, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            {v.shares}
          </div>
          <div onClick={() => onChange('shares', (parseInt(v.shares) || 0) + 1)} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: c.primary, cursor: 'pointer',
          }}>
            <ion-icon name="add" style={{ fontSize: 16 }}></ion-icon>
          </div>
        </div>
      )}

      {mode === 'adjust' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: c.muted, fontSize: 13, fontWeight: 600 }}>{group.currency}</span>
          <input type="number" value={v.adjust} onChange={(e) => onChange('adjust', e.target.value)} placeholder="0.00" style={inputBase} />
        </div>
      )}
    </div>
  );
}
