import { Link } from "react-router-dom";

import AnimatedStat from "../components/landing/AnimatedStat.jsx";
import FaqAccordion from "../components/landing/FaqAccordion.jsx";
import LandingIcon from "../components/landing/LandingIcons.jsx";
import "../components/landing/landing.css";

const farmerSteps = [
  ["map", "Dessinez votre parcelle", "Tracez vos contours et lignes d'arbres directement dans ARBO."],
  ["leaf", "Recevez un diagnostic carbone complet", "Visualisez stockage carbone, conformité PAC et potentiel de revenus."],
  ["euro", "Vendez vos crédits sur la marketplace", "Publiez vos crédits carbone et conservez 85% des revenus."],
];

const buyerSteps = [
  ["search", "Parcourez la marketplace de crédits certifiés", "Identifiez des projets agroforestiers français suivis dans ARBO."],
  ["filter", "Choisissez selon essence, région, durée", "Sélectionnez les crédits alignés avec vos objectifs RSE et CSRD."],
  ["certificate", "Recevez votre certificat de compensation", "Centralisez les preuves et justificatifs de vos achats carbone."],
];

const reasons = [
  ["shield", "Conforme Label Bas-Carbone", "Architecture pensée pour la réforme septembre 2025."],
  ["report", "Compatible reporting CSRD", "Données projetées pour vos preuves climat et extra-financières."],
  ["chain", "Traçabilité blockchain à venir", "Historique des crédits et transactions conçu pour l'auditabilité."],
  ["handshake", "Pas d'intermédiaires", "85% des revenus carbone revient directement à l'agriculteur."],
];

function LandingPage() {
  return (
    <div className="landing-page min-h-screen bg-[#FAF9F6] text-[#183B2A]">
      <header className="absolute left-0 right-0 top-0 z-20">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 md:px-8">
          <Link to="/" className="rounded-full bg-white/12 px-4 py-2 text-lg font-black tracking-[0.22em] text-white backdrop-blur">
            ARBO
          </Link>
          <Link to="/app" className="rounded-full border border-white/35 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white hover:text-[#0F3D24]">
            Connexion
          </Link>
        </nav>
      </header>

      <main>
        <section className="hero-photo relative isolate flex min-h-screen items-center overflow-hidden bg-cover bg-center">
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#FAF9F6] to-transparent" />
          <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-12 px-5 py-32 md:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="max-w-4xl">
              <p className="mb-5 inline-flex rounded-full border border-white/25 bg-white/12 px-4 py-2 text-sm font-bold uppercase tracking-[0.24em] text-[#DDF8E7] backdrop-blur">
                Crédits carbone agroforestiers
              </p>
              <h1 className="text-5xl font-black tracking-[-0.055em] text-white md:text-7xl lg:text-8xl">
                Transformez votre agroforesterie en revenus carbone
              </h1>
              <p className="mt-7 max-w-2xl text-xl font-medium leading-9 text-[#FAF9F6]/90 md:text-2xl">
                ARBO certifie, valorise et vend vos crédits carbone Label Bas-Carbone. Vous gardez 85% des revenus.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Link to="/app?role=farmer" className="rounded-full bg-[#2ECC71] px-7 py-4 text-center text-base font-extrabold text-[#0F3D24] shadow-[0_18px_45px_rgba(46,204,113,0.28)] transition hover:-translate-y-0.5 hover:bg-[#48DE84]">
                  Je suis agriculteur
                </Link>
                <Link to="/app?role=buyer" className="rounded-full bg-[#FAF9F6] px-7 py-4 text-center text-base font-extrabold text-[#0F3D24] shadow-[0_18px_45px_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5 hover:bg-white">
                  Je suis entreprise RSE
                </Link>
              </div>
            </div>

            <aside className="rounded-[2rem] border border-white/25 bg-white/12 p-6 text-white shadow-[0_28px_90px_rgba(0,0,0,0.22)] backdrop-blur md:p-8">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#DDF8E7]">Marketplace MVP</p>
              <p className="mt-5 text-3xl font-black leading-tight md:text-4xl">Du design parcellaire au certificat carbone, dans un même flux.</p>
              <div className="mt-8 grid gap-4">
                {["Diagnostic carbone", "Publication marketplace", "Reversement agriculteur 85%"].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/12 p-4">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#2ECC71]" />
                    <span className="font-bold">{item}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <Section eyebrow="Chiffres clés" title="Des ordres de grandeur lisibles dès le premier diagnostic">
          <div className="grid gap-5 md:grid-cols-3">
            <AnimatedStat value={85} suffix="%" label="Revenus reversés à l'agriculteur" />
            <AnimatedStat value={20} suffix=" ans" label="Durée des projets carbone" />
            <AnimatedStat value={50} prefix="+" suffix=" tCO2/ha" label="Séquestration moyenne sur 20 ans" />
          </div>
          <p className="mt-6 rounded-2xl bg-[#0F3D24]/5 px-5 py-4 text-sm font-semibold text-[#627466]">
            Estimations indicatives basées sur les méthodologies du Label Bas-Carbone
          </p>
        </Section>

        <JourneySection eyebrow="Pour les agriculteurs" title="Comment ça marche" steps={farmerSteps} />
        <JourneySection eyebrow="Pour les entreprises" title="Comment ça marche" steps={buyerSteps} muted />

        <Section eyebrow="Pourquoi ARBO" title="Une plateforme carbone sobre, traçable et alignée terrain">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {reasons.map(([icon, title, text]) => (
              <article key={title} className="rounded-[1.75rem] border border-[#0F3D24]/10 bg-white p-6 shadow-[0_20px_60px_rgba(15,61,36,0.07)]">
                <IconBubble icon={icon} />
                <h3 className="mt-5 text-xl font-extrabold text-[#0F3D24]">{title}</h3>
                <p className="mt-3 leading-7 text-[#627466]">{text}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section eyebrow="FAQ" title="Questions fréquentes">
          <FaqAccordion />
        </Section>
      </main>

      <footer className="border-t border-[#0F3D24]/10 bg-[#0F3D24] text-[#FAF9F6]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1fr_1.4fr] md:px-8">
          <div>
            <p className="text-2xl font-black tracking-[0.24em]">ARBO</p>
            <p className="mt-4 max-w-sm leading-7 text-[#FAF9F6]/70">
              Plateforme agroforestière pour certifier, valoriser et vendre des crédits carbone.
            </p>
          </div>
          <div className="grid gap-5 text-sm font-semibold text-[#FAF9F6]/75 sm:grid-cols-2">
            <p>Mentions légales : ATARA LTD (UK Company 17054670)</p>
            <p>
              Contact : <a className="text-[#2ECC71] hover:text-white" href="mailto:contact@arbo.earth">contact@arbo.earth</a>
            </p>
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              <a href="/privacy-policy" className="hover:text-white">Privacy Policy</a>
              <a href="/terms-of-service" className="hover:text-white">Terms of Service</a>
              <a href="/risk-disclaimer" className="hover:text-white">Risk Disclaimer</a>
            </div>
            <p className="sm:col-span-2">Copyright © 2026 ARBO. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ eyebrow, title, children }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
      <div className="mb-10 max-w-3xl">
        <p className="text-sm font-black uppercase tracking-[0.24em] text-[#2ECC71]">{eyebrow}</p>
        <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-[#0F3D24] md:text-5xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function JourneySection({ eyebrow, title, steps, muted = false }) {
  return (
    <section className={muted ? "bg-white" : "bg-[#FAF9F6]"}>
      <Section eyebrow={eyebrow} title={title}>
        <div className="grid gap-5 lg:grid-cols-3">
          {steps.map(([icon, stepTitle, text], index) => (
            <article key={stepTitle} className="rounded-[2rem] border border-[#0F3D24]/10 bg-[#FAF9F6] p-6 shadow-[0_24px_70px_rgba(15,61,36,0.08)] md:p-8">
              <div className="flex items-center justify-between gap-4">
                <IconBubble icon={icon} />
                <span className="text-5xl font-black text-[#0F3D24]/10">0{index + 1}</span>
              </div>
              <h3 className="mt-7 text-2xl font-extrabold tracking-[-0.02em] text-[#0F3D24]">{stepTitle}</h3>
              <p className="mt-4 text-base leading-7 text-[#627466]">{text}</p>
            </article>
          ))}
        </div>
      </Section>
    </section>
  );
}

function IconBubble({ icon }) {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E7F6EC] text-[#0F3D24]">
      <LandingIcon name={icon} className="h-7 w-7" />
    </span>
  );
}

export default LandingPage;
