import { useTranslation } from "react-i18next";

export default function Home() {
  const { t } = useTranslation();
  return (
    <div className="container page" style={{ paddingTop: 10 }}>
      <section className="home-hero">
        <div>
          <div className="home-kicker">{t("homeKicker")}</div>
          <h1 className="home-title">
            {t("homeTitle")}
          </h1>
          <p className="home-subtitle">
            {t("homeSubtitle")}
          </p>
          <div className="home-actions">
            <a className="btn btnPrimary" href="/courses">
              {t("homeCtaExplore")}
            </a>
            <a className="btn" href="/auth/login">
              {t("homeCtaTeach")}
            </a>
          </div>
        </div>
        <div className="home-hero-card card cardPad">
          <div className="home-metric">
            <div className="home-metric-label">{t("homeMetric1Label")}</div>
            <div className="home-metric-value">{t("homeMetric1Value")}</div>
          </div>
          <div className="home-metric">
            <div className="home-metric-label">{t("homeMetric2Label")}</div>
            <div className="home-metric-value">{t("homeMetric2Value")}</div>
          </div>
          <div className="home-metric">
            <div className="home-metric-label">{t("homeMetric3Label")}</div>
            <div className="home-metric-value">{t("homeMetric3Value")}</div>
          </div>
        </div>
      </section>

      <section className="home-grid">
        <div className="card cardPad home-panel">
          <div className="home-panel-title">{t("homePanel1Title")}</div>
          <p className="small">
            {t("homePanel1Body")}
          </p>
        </div>
        <div className="card cardPad home-panel">
          <div className="home-panel-title">{t("homePanel2Title")}</div>
          <p className="small">
            {t("homePanel2Body")}
          </p>
        </div>
        <div className="card cardPad home-panel">
          <div className="home-panel-title">{t("homePanel3Title")}</div>
          <p className="small">
            {t("homePanel3Body")}
          </p>
        </div>
      </section>

      <section className="home-steps">
        <div className="home-steps-header">
          <div className="home-panel-title">{t("homeStepsTitle")}</div>
          <p className="small">{t("homeStepsSubtitle")}</p>
        </div>
        <div className="home-steps-grid">
          <div className="card cardPad home-step">
            <div className="home-step-index">01</div>
            <div className="home-step-title">{t("homeStep1Title")}</div>
            <p className="small">{t("homeStep1Body")}</p>
          </div>
          <div className="card cardPad home-step">
            <div className="home-step-index">02</div>
            <div className="home-step-title">{t("homeStep2Title")}</div>
            <p className="small">{t("homeStep2Body")}</p>
          </div>
          <div className="card cardPad home-step">
            <div className="home-step-index">03</div>
            <div className="home-step-title">{t("homeStep3Title")}</div>
            <p className="small">{t("homeStep3Body")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
