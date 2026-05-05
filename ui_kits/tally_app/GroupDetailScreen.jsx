/* GroupDetailScreen — Expenses / Balances / Totals tabs */
function GroupDetailScreen({ c, group, expenses, initialTab = 'expenses', onBack, onAddExpense, onMic }) {
  const [tab, setTab] = React.useState(initialTab);

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
        <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: c.text, textAlign: 'center' }}>{group.name}</div>
        <div style={{ display: 'flex', gap: 8, marginRight: 12 }}>
          <div style={{ width: 32, height: 32, color: c.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ion-icon name="qr-code-outline" style={{ fontSize: 22 }}></ion-icon>
          </div>
          <div style={{ width: 32, height: 32, color: c.text, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ion-icon name="settings-outline" style={{ fontSize: 22 }}></ion-icon>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 16px 8px' }}>
        <SegmentedControl
          c={c}
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'expenses', label: 'Expenses' },
            { key: 'balances', label: 'Balances' },
            { key: 'totals', label: 'Totals' },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 110px' }}>
        {tab === 'expenses' && <ExpensesTab c={c} group={group} expenses={expenses} />}
        {tab === 'balances' && <BalancesTab c={c} group={group} />}
        {tab === 'totals' && <TotalsTab c={c} group={group} />}
      </div>

      <FabPill onAdd={onAddExpense} onMic={onMic} c={c} />
      <TabBar value="home" onChange={() => {}} c={c} />
    </div>
  );
}

function GroupTotalCard({ c, group }) {
  return (
    <div style={{
      background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 16,
      padding: 16, boxShadow: c.shadowCard,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>Group total</div>
          <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{group.expenseCount} expenses · {group.members.length} members</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
            {group.currency} {group.total.toLocaleString()}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <div style={{ flex: 1, background: c.owedSoft, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, color: c.muted, fontWeight: 600 }}>People owe you</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: c.owed, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
            {group.currency} {group.owed.toFixed(2)}
          </div>
        </div>
        <div style={{ flex: 1, background: c.inputSurface, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, color: c.muted, fontWeight: 600 }}>You owe</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: c.muted, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
            {group.currency} {group.owe.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpensesTab({ c, group, expenses }) {
  const byMonth = React.useMemo(() => {
    const out = {};
    expenses.forEach((e) => { (out[e.month] ||= []).push(e); });
    return out;
  }, [expenses]);

  return (
    <>
      <GroupTotalCard c={c} group={group} />
      {Object.entries(byMonth).map(([month, items]) => (
        <div key={month} style={{ marginTop: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: c.muted, marginBottom: 10 }}>{month}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((e) => <ExpenseRow key={e.id} c={c} group={group} e={e} />)}
          </div>
        </div>
      ))}
    </>
  );
}

function ExpenseRow({ c, group, e }) {
  const youOwe = e.yourShare > 0 && e.paidBy !== 'You';
  const youLent = e.paidBy === 'You' && e.amount > e.yourShare;
  const lentAmt = youLent ? e.amount - e.yourShare : 0;

  return (
    <div style={{
      background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 16,
      padding: 14, boxShadow: c.shadowCard,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: c.muted, fontVariantNumeric: 'tabular-nums', minWidth: 26 }}>
          #{e.num}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{e.title}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
            {group.currency} {e.amount.toLocaleString()}
          </div>
          <div style={{
            fontSize: 12, fontWeight: 600, marginTop: 2,
            color: youOwe ? c.owe : (youLent ? c.owed : c.muted), fontVariantNumeric: 'tabular-nums',
          }}>
            {youOwe ? `You owe ${group.currency} ${e.yourShare.toFixed(2)}` :
             youLent ? `You lent ${group.currency} ${lentAmt.toFixed(2)}` :
             `Your share ${group.currency} ${e.yourShare.toFixed(2)}`}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: c.border, margin: '10px 0' }}></div>

      {/* Avatar strip + payer ring */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 44, padding: '4px 0', display: 'flex', flexDirection: 'column', alignItems: 'center',
          color: c.muted, fontSize: 10, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', textAlign: 'center',
        }}>
          <ion-icon name="receipt-outline" style={{ fontSize: 18, color: c.muted }}></ion-icon>
          <div style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{e.date}</div>
        </div>
        <div style={{ flex: 1, display: 'flex', gap: 10, overflowX: 'auto', alignItems: 'flex-start' }}>
          {group.members.map((m) => {
            const isPayer = m === e.paidBy;
            return (
              <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: '0 0 auto', paddingTop: 6 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 20,
                    background: c.owedSoft, color: c.primary,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 16,
                    border: isPayer ? `2px solid ${c.primary}` : `2px solid transparent`,
                    boxSizing: 'border-box',
                  }}>{m === 'You' ? 'Y' : m.slice(0, 1)}</div>
                  {isPayer && (
                    <div style={{
                      position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                      background: c.primary, color: '#fff', fontSize: 9, fontWeight: 800,
                      padding: '2px 6px', borderRadius: 999, letterSpacing: 0.3,
                      display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
                    }}>
                      <ion-icon name="wallet-outline" style={{ fontSize: 9 }}></ion-icon>
                      PAID
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: isPayer ? c.text : c.muted, fontWeight: isPayer ? 700 : 500 }}>
                  {m === 'You' ? 'You' : m}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BalancesTab({ c, group }) {
  const settlements = group.settlements || [];
  return (
    <>
      <GroupTotalCard c={c} group={group} />

      {/* Simplify card */}
      <div style={{
        background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 16,
        padding: 16, marginTop: 16, boxShadow: c.shadowCard,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.text }}>Simplify debts</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>Fewest settlements in balances</div>
            <div style={{ fontSize: 13, color: c.primary, fontWeight: 600, marginTop: 8 }}>Fewer payments. Same net amounts.</div>
          </div>
          <div style={{
            width: 44, height: 26, borderRadius: 999, background: c.primary, position: 'relative', flexShrink: 0,
          }}>
            <div style={{ position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: 11, background: '#fff' }}></div>
          </div>
        </div>

        <div style={{
          background: c.owedSoft, borderRadius: 12, padding: 14, marginTop: 14,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {['A', 'B', 'C'].map((l, i) => (
              <React.Fragment key={l}>
                <div style={{
                  width: 26, height: 26, borderRadius: 13, background: c.surface, border: `1px solid ${c.primary}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: c.primary,
                }}>{l}</div>
                {i < 2 && <ion-icon name="arrow-forward" style={{ fontSize: 12, color: c.muted }}></ion-icon>}
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.primary, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ion-icon name="arrow-down" style={{ fontSize: 11 }}></ion-icon>
            SIMPLIFY
            <ion-icon name="arrow-down" style={{ fontSize: 11 }}></ion-icon>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 15, background: c.surface, border: `2px solid ${c.primary}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: c.primary,
            }}>A</div>
            <ion-icon name="arrow-forward" style={{ fontSize: 14, color: c.muted }}></ion-icon>
            <div style={{
              width: 30, height: 30, borderRadius: 15, background: c.surface, border: `2px solid ${c.primary}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: c.primary,
            }}>C</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999,
              background: c.surface, border: `1px solid ${c.primary}`, color: c.primary, fontSize: 11, fontWeight: 700, marginLeft: 4,
            }}>
              <ion-icon name="checkmark" style={{ fontSize: 12 }}></ion-icon>
              One payment
            </div>
          </div>
        </div>
      </div>

      {/* Settlements */}
      <div style={{
        background: c.surface, border: `1px solid ${c.cardRim}`, borderRadius: 16,
        padding: 16, marginTop: 16, boxShadow: c.shadowCard,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ion-icon name="swap-horizontal-outline" style={{ fontSize: 20, color: c.primary }}></ion-icon>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: c.text }}>Suggested settlements</div>
          <ion-icon name="share-outline" style={{ fontSize: 20, color: c.primary, cursor: 'pointer' }}></ion-icon>
        </div>
        <div style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>Fewest payments to settle everyone up.</div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {settlements.map((s, i) => (
            <div key={i} style={{ background: c.owedSoft, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={s.from} size={36} c={c} bg={c.surface} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
                  {s.from} <span style={{ color: c.muted, fontWeight: 500 }}>pays</span> {s.to}
                </div>
                <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>Tap to mark settled</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
                  {group.currency} {s.amount.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: c.primary, fontWeight: 700, marginTop: 2, cursor: 'pointer' }}>Remind</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function StackedBar({ items, c, height = 18 }) {
  const total = items.reduce((s, x) => s + x.amount, 0) || 1;
  return (
    <div style={{ display: 'flex', height, borderRadius: 9, overflow: 'hidden', background: c.inputSurface }}>
      {items.map((x, i) => (
        <div key={i} style={{ width: `${(x.amount / total) * 100}%`, background: x.color }}></div>
      ))}
    </div>
  );
}

function LegendRow({ c, swatch, label, amount, currency, percent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 12, height: 12, borderRadius: 4, background: swatch, flexShrink: 0 }}></div>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: c.text }}>{label}</div>
      <div style={{ fontSize: 12, color: c.muted, fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'right' }}>{percent}%</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: c.text, fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'right' }}>
        {currency} {amount.toLocaleString()}
      </div>
    </div>
  );
}

function TotalsTab({ c, group }) {
  const byPerson = group.byPerson || [];
  const byCategory = group.byCategory || [];
  const personTotal = byPerson.reduce((s, x) => s + x.amount, 0) || 1;
  const catTotal = byCategory.reduce((s, x) => s + x.amount, 0) || 1;

  return (
    <>
      <GroupTotalCard c={c} group={group} />

      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text, marginBottom: 12 }}>By person</div>
        <StackedBar items={byPerson} c={c} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {byPerson.map((p, i) => (
            <LegendRow key={i} c={c} swatch={p.color} label={p.name} amount={p.amount}
              currency={group.currency} percent={Math.round((p.amount / personTotal) * 100)} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text, marginBottom: 12 }}>By category</div>
        <StackedBar items={byCategory} c={c} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {byCategory.map((p, i) => (
            <LegendRow key={i} c={c} swatch={p.color} label={p.name} amount={p.amount}
              currency={group.currency} percent={Math.round((p.amount / catTotal) * 100)} />
          ))}
        </div>
      </div>
    </>
  );
}

window.GroupDetailScreen = GroupDetailScreen;
