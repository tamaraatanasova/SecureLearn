import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { resources } from "../i18n/translations.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

const navClass = ({ isActive }) => `shell-navItem${isActive ? " is-active" : ""}`;

export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();
  const { isAuthed, isAdmin, isTeacher, logout, isLoading } = useAuth();
  const { toggleTheme } = useTheme();

  const isAuthArea = pathname.startsWith("/auth");
  const languageOptions = Object.keys(resources || {}).sort();

  if (isAuthArea) {
    return <div className="shell shell-auth">{children}</div>;
  }

  if (!isAuthed) {
    return (
      <div className="publicShell">
        <header className="publicTop">
          <div className="container publicTopInner">
            <div className="publicBrand">
              <div className="publicLogo" aria-hidden="true" />
              <div className="publicBrandText">SecureLearn</div>
            </div>

            <nav className="publicNav" aria-label="Primary">
              <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}>{t("home")}</NavLink>
              <NavLink to="/courses" className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}>{t("courses")}</NavLink>
            </nav>

            <div className="publicActions">
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

              <NavLink to="/auth/login" className="btn btnPrimary">
                {isLoading ? t("loading") : t("login")}
              </NavLink>
            </div>
          </div>
        </header>

        <div className="publicContent">{children}</div>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <div className="shell-logo" aria-hidden="true" />
          <div className="shell-brandText">SecureLearn</div>
        </div>

        <nav className="shell-nav" aria-label="Primary">
          <NavLink to="/" className={navClass}>{t("home")}</NavLink>
          <NavLink to="/courses" className={navClass}>{t("courses")}</NavLink>
          {isAuthed && <NavLink to="/profile" className={navClass}>{t("profile")}</NavLink>}
          {(isAdmin || isTeacher) && <NavLink to="/users/new" className={navClass}>{t("users")}</NavLink>}
          {isAdmin && <NavLink to="/admin" className={navClass}>{t("admin")}</NavLink>}
        </nav>

        <div className="shell-sidebarFooter">
          <div className="shell-row">
            <select
              className="shell-select"
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

            <button type="button" className="shell-iconBtn" onClick={toggleTheme} aria-label={t("theme")}>
              🌓
            </button>
          </div>

          {isAuthed ? (
            <button type="button" className="btn btnPrimary w-full" onClick={logout}>
              {t("logout")}
            </button>
          ) : (
            <NavLink to="/auth/login" className="btn btnPrimary w-full">
              {t("login")}
            </NavLink>
          )}
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-topTitle">{t("homeKicker")}</div>
          <div className="shell-topActions">
            <div className="shell-pill">{isAdmin ? t("roleAdmin") : isTeacher ? t("roleTeacher") : t("roleStudent")}</div>
          </div>
        </header>

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
