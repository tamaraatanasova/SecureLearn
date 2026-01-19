import { Outlet, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { preloadFaceModels } from "../../lib/faceApi.js";

const tabClass = ({ isActive }) =>
  `nav-link${isActive ? " is-active" : ""}`;

export default function AuthLayout() {
  const { t } = useTranslation();

  useEffect(() => {
    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 250));
    schedule(() => preloadFaceModels());
  }, []);

  return (
    <div className="container page" style={{ paddingTop: 34 }}>
      <div className="auth-grid">
        <div className="card auth-panel auth-aside">
          <div className="auth-badge">🔐 Secure Access</div>

          <div className="auth-title">{t("authTitle")}</div>
          <p className="small auth-subtitle">{t("authSubtitle")}</p>

          <div className="auth-tabs">
            <NavLink to="/auth/login" className={tabClass}>{t("login")}</NavLink>
            <NavLink to="/auth/signup" className={tabClass}>{t("signup")}</NavLink>
            <NavLink to="/auth/face" className={tabClass}>{t("faceLogin")}</NavLink>
          </div>

          <div className="auth-note">
            <div className="small">
              Face recognition login is supported. In Phase 2, liveness detection will run after face match.
            </div>
          </div>

          <div className="auth-note">
            <div style={{ fontWeight: 800 }}>Security idea (thesis-ready)</div>
            <div className="small" style={{ marginTop: 6 }}>
              Log each attempt (match/no-match), then enforce liveness check (live/spoof) before allowing access.
            </div>
          </div>
        </div>

        <div className="card auth-panel">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
