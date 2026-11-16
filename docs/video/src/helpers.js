      // Helpers shared by every scene (inlined by build.mjs). Everything is a tween on `tl`.
      const EASE_IN = "power3.out";
      // A block arrives: blur 8px -> 0 with a fade, optionally rising a little.
      function inn(sel, t, o = {}) {
        tl.fromTo(sel, { opacity: 0, filter: "blur(8px)", y: o.y ?? 0 },
          { opacity: 1, filter: "blur(0px)", y: 0, duration: o.d ?? 0.4, ease: EASE_IN, stagger: o.stagger ?? 0 }, t);
      }
      // A line arrives word by word (words wrapped at build time).
      function words(sel, t, gap = 0.07) {
        tl.fromTo(sel + " .w", { opacity: 0, filter: "blur(6px)" },
          { opacity: 1, filter: "blur(0px)", duration: 0.2, ease: "power2.out", stagger: gap }, t);
      }
      function out(sel, t, d = 0.25) {
        tl.to(sel, { opacity: 0, filter: "blur(8px)", duration: d, ease: "power3.in" }, t);
      }
      // Fit image region r = [x, y, w, h] (image CSS px) into box {x, y, w, h} of its viewport.
      function fit(r, box) {
        const s = Math.min(box.w / r[2], box.h / r[3]);
        return { x: box.x + (box.w - r[2] * s) / 2 - r[0] * s, y: box.y + (box.h - r[3] * s) / 2 - r[1] * s, scale: s };
      }
      function camSet(sel, r, box) { tl.set(sel, fit(r, box), 0); }
      function camTo(sel, r, box, t, d = 1.4) {
        tl.to(sel, { ...fit(r, box), duration: d, ease: "power2.inOut" }, t);
      }
      function hlIn(sel, t) { tl.fromTo(sel, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power2.out" }, t); }
      function hlOut(sel, t) { tl.to(sel, { opacity: 0, duration: 0.3, ease: "power2.in" }, t); }
      // Draw an SVG stroke that has pathLength="1" and stroke-dasharray="1".
      function draw(sel, t, d = 0.6) {
        tl.fromTo(sel, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: d, ease: "power2.inOut" }, t);
      }
      // Every scene leaves the same way: its stage blurs out on the paper ground.
      function endScene(sel) { out(sel, D - 0.34, 0.3); }
