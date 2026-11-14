import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../lib/demoAccounts';
import { errorMessage } from '../lib/errors';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError(signInError.message === 'Invalid login credentials' ? 'Wrong email or password.' : signInError.message);
      }
    } catch (unexpected) {
      setError(errorMessage(unexpected));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-card login">
      <div className="brand">
        <span className="brand-mark">A</span> Ajaia Docs
      </div>
      <p className="hint">A lightweight collaborative document editor. Sign in with a demo account to try editing and sharing.</p>
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" autoComplete="username" value={email} required onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            required
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="demo-accounts">
        <strong>Demo accounts</strong> · password <code>{DEMO_PASSWORD}</code>
        <ul>
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <span>
                {account.name} · {account.email}
              </span>
              <button
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                }}
              >
                Use
              </button>
            </li>
          ))}
        </ul>
        <p className="hint">Tip: open a second browser (or a private window) as another user to see sharing from both sides.</p>
      </div>
    </div>
  );
}
