import LandingIcon from "./LandingIcons.jsx";

const faqs = [
  {
    question: "Comment fonctionne le Label Bas-Carbone ?",
    answer:
      "Le Label Bas-Carbone encadre des projets de réduction ou de séquestration d'émissions. Un projet documente sa méthodologie, son suivi et ses gains carbone avant validation par les autorités compétentes.",
  },
  {
    question: "Quels types d'arbres sont éligibles ?",
    answer:
      "Les essences doivent être adaptées au sol, au climat et au système agricole. ARBO privilégie les essences agroforestières robustes comme le chêne, le noyer, le peuplier ou l'alisier selon le contexte local.",
  },
  {
    question: "Combien je peux gagner par hectare ?",
    answer:
      "Le revenu dépend de la surface, de la densité d'arbres, de la méthodologie carbone, du prix du crédit et de la durée du projet. ARBO affiche une estimation avant toute publication.",
  },
  {
    question: "Comment ARBO gagne de l'argent ?",
    answer:
      "ARBO prend une commission de 15% sur les revenus carbone vendus. L'agriculteur conserve 85% des revenus générés par ses crédits.",
  },
  {
    question: "Les crédits ARBO sont-ils officiellement certifiés LBC ?",
    answer:
      "ARBO est en phase MVP. Les crédits actuels sont pré-LBC. La certification officielle est en cours via un mandataire LBC agréé.",
  },
];

function FaqAccordion() {
  return (
    <div className="grid gap-4">
      {faqs.map((faq, index) => (
        <details key={faq.question} className="group rounded-3xl border border-[#0F3D24]/10 bg-white p-6 shadow-[0_18px_50px_rgba(15,61,36,0.07)]" open={index === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-bold text-[#0F3D24]">
            {faq.question}
            <LandingIcon name="plus" className="h-5 w-5 shrink-0 text-[#2ECC71] transition-transform" />
          </summary>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#627466]">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}

export default FaqAccordion;
