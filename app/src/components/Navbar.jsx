import { Link, NavLink } from "react-router-dom";
import { useTheme } from "../context/ThemeContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";
import { resources } from "../i18n/translations.js";

export default function Navbar() {
  const { toggleTheme } = useTheme();
  const { isAuthed, logout, isAdmin, isTeacher } = useAuth();
  const { t, i18n } = useTranslation();

  const navLinkClass = ({ isActive }) => `nav-link${isActive ? " is-active" : ""}`;
  const languageOptions = Object.keys(resources || {}).sort();

  return (
    <nav className="nav-shell">
      <div className="container">
        <div className="nav-inner">
          <Link to="/" className="nav-brand" aria-label="SecureLearn home">
            <div className="nav-logo" aria-hidden="true" />
            <div className="nav-title">SecureLearn</div>
          </Link>

          <div className="nav-links" aria-label="Primary navigation">
            <NavLink to="/" className={navLinkClass}>{t("home")}</NavLink>
            <NavLink to="/courses" className={navLinkClass}>{t("courses")}</NavLink>
            {isAuthed && <NavLink to="/profile" className={navLinkClass}>{t("profile")}</NavLink>}
            {(isAdmin || isTeacher) && <NavLink to="/users/new" className={navLinkClass}>{t("users")}</NavLink>}
            {isAdmin && <NavLink to="/admin" className={navLinkClass}>{t("admin")}</NavLink>}
          </div>

          <div className="nav-actions">
            <select
              className="nav-select"
              value={i18n.language}
              onChange={(e) => {
                const nextLang = e.target.value;
                localStorage.setItem("lang", nextLang);
                i18n.changeLanguage(nextLang);
              }}
              aria-label={t("language")}
            >
              {languageOptions.map((lang) => (
                <option key={lang} value={lang}>{lang.toUpperCase()}</option>
              ))}
            </select>

            <button type="button" className="btn" onClick={toggleTheme} aria-label={t("theme")}>
              🌓
            </button>

            {isAuthed ? (
              <button type="button" className="btn btnPrimary" onClick={logout}>{t("logout")}</button>
            ) : (
              <Link className="btn btnPrimary" to="/auth/login">{t("login")}</Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
