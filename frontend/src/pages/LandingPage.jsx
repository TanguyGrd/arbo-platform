import { useState } from "react";
import { Link } from "react-router-dom";

import FaqAccordion from "../components/landing/FaqAccordion.jsx";
import LandingIcon from "../components/landing/LandingIcons.jsx";
import "../components/landing/landing.css";

const farmerSteps = [
  ["map", "Étape 1", "Dessinez votre parcelle sur notre carte interactive"],
  ["clock", "Étape 2", "Recevez votre diagnostic carbone en 30 secondes"],
  ["euro", "Étape 3", "Publiez et vendez vos crédits, recevez 85%"],
];

const buyerSteps = [
  ["search", "Parcourez les projets certifiés par région et essence"],
  ["filter", "Choisissez vos crédits selon votre stratégie CSRD"],
  ["certificate", "Téléchargez vos certificats de compensation"],
];

const tabs = [
  ["farmers", "Pour les agriculteurs"],
  ["companies", "Pour les entreprises"],
  ["process", "Comment ça marche"],
  ["faq", "FAQ"],
];

const processSteps = [
  "L'agriculteur dessine sa parcelle sur ARBO",
  "Notre moteur calcule la séquestration carbone (pvlib + HAIES V2)",
  "Les crédits sont publiés sur la marketplace ARBO",
  "L'entreprise achète et reçoit son certificat",
  "L'agriculteur reçoit 85% du prix de vente",
];

function LandingPage() {
  const [activeTab, setActiveTab] = useState("farmers");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function showTab(tabId) {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  }

  return (
    <div className="landing-page min-h-screen bg-[#FAF9F6] text-[#0F3D24]">
      <header className="landing-header fixed inset-x-0 top-0 z-40 border-b border-[#0F3D24]/10 bg-[#FAF9F6]/95 backdrop-blur-xl">
        <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link to="/" className="rounded-2xl bg-[#FAF9F6] px-4 py-2 text-xl font-black tracking-[0.16em] text-[#0F3D24] shadow-sm">
            ARBO
          </Link>

          <div className="hidden items-center gap-8 text-sm font-extrabold text-[#0F3D24] lg:flex">
            <button type="button" onClick={() => showTab("process")} className="landing-nav-link">Comment ça marche</button>
            <button type="button" onClick={() => showTab("companies")} className="landing-nav-link">Marketplace</button>
            <button type="button" onClick={() => showTab("faq")} className="landing-nav-link">FAQ</button>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <Link to="/app" className="rounded-full border border-[#0F3D24]/25 px-5 py-2.5 text-sm font-extrabold text-[#0F3D24] transition hover:border-[#0F3D24] hover:bg-white">
              Se connecter
            </Link>
            <Link to="/app?role=farmer" className="rounded-full bg-[#0F3D24] px-5 py-2.5 text-sm font-extrabold text-[#FAF9F6] transition hover:bg-[#145A34]">
              Commencer
            </Link>
          </div>

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#0F3D24]/15 text-[#0F3D24] lg:hidden"
            aria-expanded={mobileMenuOpen}
            aria-label="Ouvrir le menu"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <LandingIcon name={mobileMenuOpen ? "x" : "menu"} className="h-6 w-6" />
          </button>
        </nav>

        {mobileMenuOpen && (
          <div className="border-t border-[#0F3D24]/10 bg-[#FAF9F6] px-5 py-4 shadow-[0_24px_60px_rgba(15,61,36,0.12)] lg:hidden">
            <div className="mx-auto grid max-w-7xl gap-3">
              <button type="button" onClick={() => showTab("process")} className="landing-mobile-link">Comment ça marche</button>
              <button type="button" onClick={() => showTab("companies")} className="landing-mobile-link">Marketplace</button>
              <button type="button" onClick={() => showTab("faq")} className="landing-mobile-link">FAQ</button>
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                <Link to="/app" className="rounded-full border border-[#0F3D24]/25 px-5 py-3 text-center font-extrabold text-[#0F3D24]">Se connecter</Link>
                <Link to="/app?role=farmer" className="rounded-full bg-[#0F3D24] px-5 py-3 text-center font-extrabold text-[#FAF9F6]">Commencer</Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="landing-tab-bar fixed inset-x-0 top-20 z-30 border-y border-[#0F3D24]/10 bg-[#FAF9F6]/96 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl overflow-x-auto px-5 py-3 md:px-8">
          <div className="landing-tabs inline-flex min-w-full gap-2 rounded-full bg-white p-1.5 shadow-[0_18px_50px_rgba(15,61,36,0.08)] md:min-w-0">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => showTab(id)}
                className={activeTab === id ? "landing-tab landing-tab-active" : "landing-tab"}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="pt-36">
        <section className="hero-photo relative isolate overflow-hidden bg-cover bg-center">
          <div className="absolute inset-0 bg-[#0F3D24]/10" />
          <div className="relative z-10 mx-auto grid min-h-[680px] w-full max-w-7xl items-center gap-12 px-5 py-20 md:px-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-3xl">
              <p className="mb-5 inline-flex rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-[#DDF8E7] backdrop-blur">
                Carbone agroforestier français
              </p>
              <h1 className="max-w-3xl text-5xl font-black tracking-[-0.055em] text-white md:text-6xl lg:text-7xl">
                Vos arbres valent de l'argent.
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-[#FAF9F6]/90 md:text-xl">
                ARBO diagnostique, certifie et commercialise vos crédits carbone agroforestiers. 85% des revenus vous reviennent.
              </p>
              <div className="mt-9 flex flex-col gap-4 sm:flex-row">
                <Link to="/app?role=farmer" className="rounded-full bg-[#2ECC71] px-7 py-4 text-center text-base font-black text-[#0F3D24] shadow-[0_18px_45px_rgba(46,204,113,0.28)] transition hover:-translate-y-0.5 hover:bg-[#49DD85]">
                  Je suis agriculteur
                </Link>
                <Link to="/app?role=buyer" className="rounded-full bg-[#FAF9F6] px-7 py-4 text-center text-base font-black text-[#0F3D24] shadow-[0_18px_45px_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5 hover:bg-white">
                  Je suis entreprise RSE
                </Link>
              </div>
              <p className="mt-6 rounded-full border border-white/20 bg-white/12 px-5 py-3 text-sm font-extrabold text-[#FAF9F6] backdrop-blur">
                ✓ Conforme Label Bas-Carbone · ✓ Compatible CSRD · ✓ 0 intermédiaire
              </p>
            </div>

            <aside className="rounded-[2rem] border border-white/25 bg-white/14 p-6 text-white shadow-[0_28px_90px_rgba(0,0,0,0.22)] backdrop-blur-xl md:p-8">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-[#DDF8E7]">Tableau de bord ARBO</p>
              <div className="mt-7 grid gap-4">
                <HeroMetric label="Revenus agriculteur" value="85%" />
                <HeroMetric label="Durée projet" value="20 ans" />
                <HeroMetric label="Diagnostic" value="30 s" />
              </div>
              <p className="mt-6 rounded-2xl bg-white/12 p-4 text-sm font-semibold leading-6 text-[#FAF9F6]/82">
                Un seul espace pour simuler, publier et vendre vos crédits carbone agroforestiers.
              </p>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-20">
          <div className="landing-panel rounded-[2rem] border border-[#0F3D24]/10 bg-white p-5 shadow-[0_28px_80px_rgba(15,61,36,0.08)] md:p-8 lg:p-10">
            {activeTab === "farmers" && <FarmersTab />}
            {activeTab === "companies" && <CompaniesTab />}
            {activeTab === "process" && <ProcessTab />}
            {activeTab === "faq" && <FaqTab />}
          </div>
        </section>
      </main>

      <footer className="bg-[#0F3D24] text-[#FAF9F6]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1fr_1.5fr] md:px-8">
          <div>
            <p className="text-2xl font-black tracking-[0.22em]">ARBO</p>
            <p className="mt-4 max-w-sm leading-7 text-[#FAF9F6]/72">La marketplace française des crédits carbone agroforestiers.</p>
          </div>
          <div className="grid gap-5 text-sm font-bold text-[#FAF9F6]/74">
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              <Link to="/app" className="hover:text-white">Connexion</Link>
              <Link to="/app?role=farmer" className="hover:text-white">S'inscrire</Link>
              <a href="/privacy-policy" className="hover:text-white">Privacy Policy</a>
              <a href="/terms-of-service" className="hover:text-white">CGU</a>
              <a href="/risk-disclaimer" className="hover:text-white">Risques</a>
            </div>
            <p>ARBO SAS (en cours d'immatriculation) · France · <a className="text-[#2ECC71] hover:text-white" href="mailto:contact@arbo.earth">contact@arbo.earth</a></p>
            <p>© 2026 ARBO. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function HeroMetric({ label, value }) {
  return (
    <div className="rounded-3xl bg-white/12 p-5">
      <p className="text-sm font-bold text-[#FAF9F6]/72">{label}</p>
      <p className="mt-2 text-4xl font-black tracking-tight text-white">{value}</p>
    </div>
  );
}

function FarmersTab() {
  return (
    <TabLayout eyebrow="Pour les agriculteurs" title="Transformez vos haies et arbres en revenus carbone.">
      <StepGrid steps={farmerSteps} />
      <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.75rem] bg-[#0F3D24] p-6 text-[#FAF9F6] md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[#2ECC71]">Simulation</p>
          <p className="mt-4 text-3xl font-black leading-tight">Exemple : 10 ha de chêne sur 20 ans = ~180 tCO2 = ~6 300€ pour vous</p>
          <p className="mt-4 text-sm font-semibold leading-6 text-[#FAF9F6]/75">Estimation indicative, ajustée selon surface, essence, région et méthode carbone.</p>
        </div>
        <div className="rounded-[1.75rem] border border-[#0F3D24]/10 bg-[#FAF9F6] p-6 md:p-8">
          <LandingIcon name="tree" className="h-12 w-12 text-[#2ECC71]" />
          <p className="mt-5 text-2xl font-black text-[#0F3D24]">85% reversés</p>
          <p className="mt-3 leading-7 text-[#87A878]">Pas d'intermédiaire : ARBO garde 15% de commission, le reste revient à l'agriculteur.</p>
        </div>
      </div>
    </TabLayout>
  );
}

function CompaniesTab() {
  return (
    <TabLayout eyebrow="Pour les entreprises" title="Achetez des crédits transparents pour vos engagements climat.">
      <div className="mb-8 grid gap-3 rounded-[1.5rem] border border-[#0F3D24]/10 bg-[#FAF9F6] p-4 md:grid-cols-3">
        {["Région: Nouvelle-Aquitaine ▼", "Essence: Chêne ▼", "Budget: 500€ - 5000€"].map((filter) => (
          <div key={filter} className="rounded-full border border-[#0F3D24]/10 bg-white px-5 py-3 text-sm font-extrabold text-[#0F3D24]">
            {filter}
          </div>
        ))}
      </div>
      <StepGrid steps={buyerSteps} />
    </TabLayout>
  );
}

function ProcessTab() {
  return (
    <TabLayout eyebrow="Comment ça marche" title="Un parcours simple, du champ au certificat.">
      <ol className="relative grid gap-5 border-l-2 border-[#2ECC71]/35 pl-6 md:pl-9">
        {processSteps.map((step, index) => (
          <li key={step} className="relative rounded-[1.5rem] border border-[#0F3D24]/10 bg-[#FAF9F6] p-5">
            <span className="absolute -left-[2.45rem] top-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#2ECC71] text-sm font-black text-[#0F3D24] md:-left-[3.05rem]">
              {index + 1}
            </span>
            <p className="text-lg font-extrabold leading-7 text-[#0F3D24]">{step}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 rounded-[1.5rem] border border-[#C9801A]/25 bg-[#FFF8E8] p-5 text-sm font-bold leading-6 text-[#7A520F]">
        ⚠️ ARBO est en phase MVP. Les crédits actuels sont pré-LBC. La certification officielle est en cours via un mandataire agréé.
      </p>
    </TabLayout>
  );
}

function FaqTab() {
  return (
    <TabLayout eyebrow="FAQ" title="Les réponses essentielles avant de commencer.">
      <FaqAccordion />
    </TabLayout>
  );
}

function TabLayout({ eyebrow, title, children }) {
  return (
    <div className="landing-tab-content">
      <div className="mb-8 max-w-3xl">
        <p className="text-sm font-black uppercase tracking-[0.24em] text-[#2ECC71]">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#0F3D24] md:text-5xl">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function StepGrid({ steps }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {steps.map(([icon, title, text], index) => (
        <article key={`${title}-${text}`} className="rounded-[1.75rem] border border-[#0F3D24]/10 bg-white p-6 shadow-[0_18px_45px_rgba(15,61,36,0.06)]">
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-[#E7F6EC] text-[#0F3D24]">
              <LandingIcon name={icon} className="h-9 w-9" />
            </span>
            <span className="text-4xl font-black text-[#0F3D24]/10">0{index + 1}</span>
          </div>
          {text ? (
            <>
              <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-[#2ECC71]">{title}</p>
              <h3 className="mt-3 text-2xl font-black leading-tight text-[#0F3D24]">{text}</h3>
            </>
          ) : (
            <h3 className="mt-6 text-2xl font-black leading-tight text-[#0F3D24]">{title}</h3>
          )}
        </article>
      ))}
    </div>
  );
}

export default LandingPage;
