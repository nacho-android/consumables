import { KeyRound } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Message } from "./Message";

export function PasswordChange(): JSX.Element {
  const { changePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(null);
    setError(null);
    if (password.length < 12) {
      setError("Use at least 12 characters.");
      return;
    }
    try {
      await changePassword(password);
      setPassword("");
      setStatus("Password changed.");
    } catch {
      setError("Password change failed. Sign out and use password reset if your session is old.");
    }
  }

  return (
    <form className="inline-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="new-password">New password</label>
      <div className="field-row">
        <input
          id="new-password"
          type="password"
          minLength={12}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button className="secondary" type="submit">
          <KeyRound size={18} aria-hidden="true" />
          Change
        </button>
      </div>
      {status ? <Message kind="success">{status}</Message> : null}
      {error ? <Message kind="error">{error}</Message> : null}
    </form>
  );
}
