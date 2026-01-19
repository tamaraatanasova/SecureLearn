import { Link } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext.jsx";

export default function SignupEmail() {
  const { t } = useTranslation();
  const { signup } = useAuth();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");

    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      setIsSubmitting(false);
      return;
    }

    const { error: authError } = await signup(email, password);
    if (authError) {
      setError(authError.message);
      setIsSubmitting(false);
      return;
    }

    setMessage(t("checkEmail"));
    setIsSubmitting(false);
  };

  return (
    <>
      <div className="auth-title">{t("signup")}</div>
      <div className="small mt-1.5">{t("createAccount")}</div>

      <form onSubmit={onSubmit} className="auth-form">
        <div className="auth-field">
          <label className="small">{t("email")}</label>
          <input className="input" type="email" name="email" placeholder="name@example.com" required />
        </div>

        <div className="auth-field">
          <label className="small">{t("password")}</label>
          <input className="input" type="password" name="password" placeholder="••••••••" required />
        </div>

        <div className="auth-field">
          <label className="small">{t("confirmPassword")}</label>
          <input className="input" type="password" name="confirmPassword" placeholder="••••••••" required />
        </div>

        <div className="auth-actions">
          <button className="btn btnPrimary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? t("signingUp") : t("continue")}
          </button>
        </div>

        {message && <div className="small">{message}</div>}
        {error && <div className="small text-[color:var(--primary)]">{error}</div>}

        <div className="small">
          {t("haveAccount")}{" "}
          <Link to="/auth/login" className="text-[color:var(--primary)] font-semibold">
            {t("login")}
          </Link>
        </div>
      </form>
    </>
  );
}
