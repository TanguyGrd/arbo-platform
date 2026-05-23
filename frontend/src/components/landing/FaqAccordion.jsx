import LandingIcon from "./LandingIcons.jsx";

const faqs = [
  {
    question: "Qu'est-ce que le Label Bas-Carbone ?",
    answer:
      "C'est le cadre français qui reconnaît des projets de réduction ou de séquestration carbone. Il impose une méthode, un suivi et une validation par les autorités compétentes.",
  },
  {
    question: "Quels arbres sont éligibles ?",
    answer:
      "Les essences doivent être adaptées au sol, au climat et au système agricole. ARBO privilégie notamment le chêne, le noyer, le peuplier ou l'alisier selon le contexte local.",
  },
  {
    question: "Combien puis-je gagner par hectare ?",
    answer:
      "Le revenu dépend de la surface, de l'essence, de la densité d'arbres, de la durée du projet et du prix de vente. ARBO affiche une estimation avant publication.",
  },
  {
    question: "Comment ARBO gagne-t-il de l'argent ?",
    answer:
      "ARBO prend 15% de commission sur chaque vente. L'agriculteur conserve 85% des revenus générés par ses crédits.",
  },
  {
    question: "Les crédits ARBO sont-ils officiellement certifiés LBC ?",
    answer:
      "ARBO est en phase MVP. Les crédits actuels sont pré-LBC. La certification officielle est en cours via un mandataire LBC agréé.",
  },
  {
    question: "Puis-je retirer mes crédits de la marketplace ?",
    answer:
      "Oui. Tant qu'un crédit n'est pas vendu, l'agriculteur peut le retirer de la marketplace ou ajuster sa publication.",
  },
];

function FaqAccordion() {
  return (
    <div className="grid gap-4">
      {faqs.map((faq, index) => (
        <details key={faq.question} className="landing-faq rounded-[1.5rem] border border-[#0F3D24]/10 bg-white p-5 shadow-[0_18px_45px_rgba(15,61,36,0.06)] md:p-6" open={index === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-extrabold text-[#0F3D24] md:text-lg">
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
