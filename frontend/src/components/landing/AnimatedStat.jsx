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
    <article ref={ref} className="landing-stat rounded-[1.75rem] border border-[#0F3D24]/10 bg-white p-5 shadow-[0_18px_45px_rgba(15,61,36,0.07)] md:p-6">
      <p className="text-4xl font-black tracking-tight text-[#0F3D24] md:text-5xl">
        {prefix}
        {displayValue}
        {suffix}
      </p>
      <p className="mt-3 text-sm font-semibold leading-6 text-[#87A878]">{label}</p>
    </article>
  );
}

export default AnimatedStat;
