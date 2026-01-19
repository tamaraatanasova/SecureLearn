import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext.jsx";

export default function LoginEmail() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");

    const { error: authError } = await login(email, password);
    if (authError) {
      setError(authError.message);
      setIsSubmitting(false);
      return;
    }

    const redirectTo = location.state?.from || "/profile";
    navigate(redirectTo);
    setIsSubmitting(false);
  };

  return (
    <>
      <div className="auth-title">{t("login")}</div>
      <div className="small mt-1.5">{t("useEmail")}</div>

      <form onSubmit={onSubmit} className="auth-form">
        <div className="auth-field">
          <label className="small">{t("email")}</label>
          <input className="input" type="email" name="email" placeholder="name@example.com" required />
        </div>

        <div className="auth-field">
          <label className="small">{t("password")}</label>
          <input className="input" type="password" name="password" placeholder="••••••••" required />
        </div>

        <div className="auth-actions">
          <button className="btn btnPrimary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? t("signingIn") : t("continue")}
          </button>
          <div className="auth-divider">{t("or")}</div>
          <Link className="btn" to="/auth/face">
            {t("useFace")}
          </Link>
        </div>

        {error && <div className="small text-[color:var(--primary)]">{error}</div>}

        <div className="small">
          {t("noAccount")}{" "}
          <Link to="/auth/signup" className="text-[color:var(--primary)] font-semibold">
            {t("createAccount")}
          </Link>
        </div>
      </form>
    </>
  );
}
