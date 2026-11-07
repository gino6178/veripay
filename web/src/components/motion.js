// Motion on the signed-out pages (anime.js): each section is visible as it is, and plays once when it scrolls into
// view (a line drawing itself, steps in turn, amounts counting up). With reduced motion nothing moves.
import { useEffect } from "react";
import { animate, stagger, svg } from "animejs";

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "outQuart";

// run(el) once, when el is a third in view
export function useInView(ref, run, deps = []) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || typeof IntersectionObserver !== "function") return;
    let done = false;
    const io = new IntersectionObserver((es) => { if (!done && es.some((e) => e.isIntersecting)) { done = true; io.disconnect(); run(el); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// a path drawing itself, start to end
export function drawLine(path, { duration = 1400, delay = 0 } = {}) {
  if (!path) return;
  const [d] = svg.createDrawable(path);
  animate(d, { draw: ["0 0", "0 1"], duration, delay, ease: "inOutQuart" });
}

// items arriving in turn, from just below
export function inTurn(items, { delay = 0, gap = 140, y = 14 } = {}) {
  if (!items?.length) return;
  animate(items, { opacity: { from: 0 }, y: { from: y }, duration: 600, delay: stagger(gap, { start: delay }), ease: EASE });
}

// a dollar figure counting up to the amount it already shows ("$232.05")
export function countUp(el, { duration = 1100, delay = 0 } = {}) {
  const m = el?.textContent.match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return;
  const to = +m[2].replace(/,/g, ""), dp = (m[2].split(".")[1] || "").length, o = { v: 0 };
  const show = (v) => { el.textContent = `${m[1]}${v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}${m[3]}`; };
  animate(o, { v: to, duration, delay, ease: EASE, onUpdate: () => show(o.v), onComplete: () => show(to) });
}
