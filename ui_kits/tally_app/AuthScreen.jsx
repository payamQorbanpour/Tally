/* AuthScreen — sign-in / create-account, with optional error state */
function AuthScreen({ c, mode = 'signin', error = false, onBack, onSubmit, onToggle, onLocal, onForgot }) {
  const isSignIn = mode === 'signin';
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
        <div style={{ flex: 1 }}></div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px 28px' }}>
        {/* Brand mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: c.primary, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, letterSpacing: -1,
          }}>T</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: c.text }}>Tally</div>
        </div>

        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: c.text }}>
            {isSignIn ? 'Welcome back' : 'Create your account'}
          </div>
          <div style={{ fontSize: 14, color: c.muted, marginTop: 6 }}>
            {isSignIn ? 'Sign in to sync across devices.' : 'Sync expenses everywhere — free, no credit card.'}
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{
          marginTop: 22, display: 'flex', background: c.inputSurface,
          borderRadius: 12, padding: 4,
        }}>
          {[
            { key: 'signin', label: 'Sign in' },
            { key: 'signup', label: 'Create account' },
          ].map((t) => {
            const on = mode === t.key;
            return (
              <div key={t.key} onClick={() => onToggle && onToggle(t.key)} style={{
                flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 9,
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                background: on ? c.surface : 'transparent',
                color: on ? c.text : c.muted,
                boxShadow: on ? c.shadowSegment : 'none',
              }}>{t.label}</div>
            );
          })}
        </div>

        {/* Form */}
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!isSignIn && (
            <Field c={c} label="Name" value="Sara Lin" />
          )}
          <Field c={c} label="Email" value={isSignIn ? "sara@hey.com" : ""} placeholder={isSignIn ? "" : "you@example.com"} type="email" error={error} />
          <Field c={c} label="Password" value={isSignIn ? "••••••••" : ""} placeholder={isSignIn ? "" : "8+ characters"} type="password" eye error={error} errorText={error ? 'Email or password is incorrect.' : ''} />
        </div>

        {isSignIn && (
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <span onClick={onForgot} style={{ color: c.primary, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Forgot password?</span>
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          <Button label={isSignIn ? 'Continue' : 'Create account'} variant="primary" size="md" fullWidth c={c} onClick={onSubmit}
            right={<ion-icon name="arrow-forward" style={{ fontSize: 18 }}></ion-icon>} />
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 22 }}>
          <div style={{ flex: 1, height: 1, background: c.border }}></div>
          <div style={{ fontSize: 12, color: c.muted, fontWeight: 600 }}>or</div>
          <div style={{ flex: 1, height: 1, background: c.border }}></div>
        </div>

        {/* Social-ish row, kept understated */}
        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          {[
            { icon: 'logo-apple', label: 'Apple' },
            { icon: 'logo-google', label: 'Google' },
          ].map((p) => (
            <div key={p.label} style={{
              flex: 1, background: c.surface, border: `1px solid ${c.cardRim}`,
              borderRadius: 12, padding: '12px 6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: 'pointer', boxShadow: c.shadowSegment,
              color: c.text, fontSize: 14, fontWeight: 700,
            }}>
              <ion-icon name={p.icon} style={{ fontSize: 18 }}></ion-icon>
              {p.label}
            </div>
          ))}
        </div>

        {/* Local-only escape hatch */}
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <span onClick={onLocal} style={{ color: c.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', borderBottom: `1px dashed ${c.border}`, paddingBottom: 1 }}>
            Use locally without an account
          </span>
        </div>

        {!isSignIn && (
          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 11, color: c.muted, lineHeight: 1.5 }}>
            By continuing you agree to our <span style={{ color: c.text, fontWeight: 600 }}>Terms</span> and <span style={{ color: c.text, fontWeight: 600 }}>Privacy</span>.
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ c, label, value, placeholder, type = 'text', eye, error, errorText }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, paddingLeft: 2 }}>
        {label}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: c.inputSurface, borderRadius: 12,
        padding: '12px 14px',
        border: error ? `1.5px solid ${c.owe}` : `1px solid transparent`,
      }}>
        <div style={{
          flex: 1, fontSize: 15, fontWeight: 600,
          color: value ? c.text : c.muted,
          fontFamily: type === 'password' ? 'inherit' : 'inherit',
          letterSpacing: type === 'password' && value ? 2 : 0,
        }}>
          {value || placeholder}
        </div>
        {eye && (
          <ion-icon name="eye-outline" style={{ fontSize: 18, color: c.muted, cursor: 'pointer' }}></ion-icon>
        )}
      </div>
      {errorText && (
        <div style={{ marginTop: 6, fontSize: 12, color: c.owe, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          <ion-icon name="alert-circle" style={{ fontSize: 13 }}></ion-icon>
          {errorText}
        </div>
      )}
    </div>
  );
}

window.AuthScreen = AuthScreen;
window.AuthField = Field;
