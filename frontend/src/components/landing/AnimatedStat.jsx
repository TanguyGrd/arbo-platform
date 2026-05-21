import { useEffect, useRef, useState } from "react";

function AnimatedStat({ value, prefix = "", suffix = "", label }) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setDisplayValue(value);
      return undefined;
    }

    let animationFrame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        const start = performance.now();
        const duration = 1200;

        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplayValue(Math.round(value * eased));

          if (progress < 1) {
            animationFrame = window.requestAnimationFrame(tick);
          }
        }

        animationFrame = window.requestAnimationFrame(tick);
        observer.disconnect();
      },
      { threshold: 0.35 },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [value]);

  return (
    <article ref={ref} className="stat-card rounded-[2rem] border border-[#0F3D24]/10 bg-white p-6 shadow-[0_24px_70px_rgba(15,61,36,0.08)] md:p-8">
      <p className="text-5xl font-extrabold tracking-tight text-[#0F3D24] md:text-6xl">
        {prefix}
        {displayValue}
        {suffix}
      </p>
      <p className="mt-4 text-base font-semibold leading-7 text-[#627466]">{label}</p>
    </article>
  );
}

export default AnimatedStat;
