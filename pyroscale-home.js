(() => {
const $ = id => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function showHeroEarth() {
  const canvas = $("hero-planet");
  const poster = canvas.previousElementSibling;
  const context = canvas.getContext("2d");
  if (!context) return;
  const stage = $("hero-stage"), motion = $("hero-motion");
  const diameter = canvas.width, radius = diameter / 2;
  const textureWidth = 1024, textureHeight = 512;
  const image = context.createImageData(diameter, diameter);
  const surface = [];
  const latitude = Math.PI / 15;
  const cos = Math.cos(latitude), sin = Math.sin(latitude);
  for (let row = 0; row < diameter; row++) {
    const y = (radius - row - .5) / radius;
    for (let column = 0; column < diameter; column++) {
      const x = (column + .5 - radius) / radius;
      if (x * x + y * y >= 1) continue;
      const z = Math.sqrt(1 - x * x - y * y);
      const u = Math.atan2(x, z * cos - y * sin) / (2 * Math.PI);
      const v = .5 - Math.asin(y * cos + z * sin) / Math.PI;
      const sunlight = Math.max(0, Math.min(1, (-.85 * x + .43 * y + .3 * z + .065) / .56));
      const atmosphere = (1 - z) ** 3 * (.18 + .82 * sunlight);
      surface.push({
        pixel: (row * diameter + column) * 4,
        u: Math.floor((u + .5) * textureWidth),
        row: Math.min(textureHeight - 1, Math.floor(v * textureHeight)) * textureWidth,
        sunlight: sunlight * sunlight * (3 - 2 * sunlight),
        atmosphere,
        alpha: Math.min(1, (1 - Math.hypot(x, y)) * radius) * 255
      });
    }
  }
  async function texture(file) {
    const source = new Image();
    source.src = "assets/" + file;
    await source.decode();
    const sample = document.createElement("canvas");
    sample.width = textureWidth;
    sample.height = textureHeight;
    const pixels = sample.getContext("2d", {willReadFrequently: true});
    pixels.drawImage(source, 0, 0, textureWidth, textureHeight);
    return pixels.getImageData(0, 0, textureWidth, textureHeight).data;
  }
  Promise.all([
    texture("earth-blue-marble.jpg"),
    texture("earth-night.jpg").catch(() => new Uint8Array(textureWidth * textureHeight * 4))
  ]).then(([day, night]) => {
    let angle = -65, pointer = 0, drift = 0, visible = true, previous = 0, frame = 0;
    function paint() {
      const offset = Math.round((angle + drift) / 360 * textureWidth);
      for (const {pixel, u, row, sunlight, atmosphere, alpha} of surface) {
        const sample = (row + ((u + offset + textureWidth) % textureWidth)) * 4;
        const light = .08 + .85 * sunlight, dark = .8 * (1 - sunlight);
        image.data[pixel] = day[sample] * light + night[sample] * dark + 17 * atmosphere;
        image.data[pixel + 1] = day[sample + 1] * light + night[sample + 1] * dark + 101 * atmosphere;
        image.data[pixel + 2] = day[sample + 2] * light + night[sample + 2] * dark + 152 * atmosphere;
        image.data[pixel + 3] = alpha;
      }
      context.putImageData(image, 0, 0);
    }
    function animate(time) {
      frame = 0;
      if (!visible || stage.parentElement.hidden || reducedMotion.matches || motion.getAttribute("aria-pressed") === "true") return;
      frame = requestAnimationFrame(animate);
      const elapsed = time - previous;
      if (elapsed < 48) return;
      previous = time;
      angle = (angle + Math.min(78, elapsed) * .0017) % 360;
      drift += (pointer - drift) * .22;
      paint();
    }
    function resume() {
      if (!frame) frame = requestAnimationFrame(animate);
    }
    stage.addEventListener("pointermove", event => {
      if (event.pointerType === "mouse") {
        const {left, width} = stage.getBoundingClientRect();
        pointer = ((event.clientX - left) / width - .5) * 22;
      }
    });
    stage.addEventListener("pointerleave", () => { pointer = 0; });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) resume();
      }).observe(stage);
    } else {
      new MutationObserver(resume).observe(stage.parentElement, {attributes: true, attributeFilter: ["hidden"]});
    }
    motion.addEventListener("click", () => queueMicrotask(resume));
    reducedMotion.addEventListener("change", resume);
    paint();
    canvas.hidden = false;
    poster.hidden = true;
    updateMotionButton();
    resume();
  }).catch(() => {
    canvas.hidden = true;
    poster.hidden = false;
    updateMotionButton();
  });
}

const motionButton = $("hero-motion");
function updateMotionButton() {
  motionButton.hidden = reducedMotion.matches || $("hero-planet").hidden;
}
motionButton.onclick = () => {
  const paused = motionButton.getAttribute("aria-pressed") === "true";
  motionButton.setAttribute("aria-pressed", String(!paused));
};
reducedMotion.addEventListener("change", updateMotionButton);

function wireSectionReveals() {
  if (!("IntersectionObserver" in window)) return;
  const sections = [...document.querySelectorAll(".home-section")];
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("revealed");
      observer.unobserve(entry.target);
    }
  }, {rootMargin: "0px 0px -12% 0px"});
  for (const section of sections) {
    section.classList.add("reveal-ready");
    observer.observe(section);
  }
  for (const link of document.querySelectorAll('.landing-nav a[href^="#"]')) {
    link.addEventListener("click", () => {
      const section = document.getElementById(link.hash.slice(1));
      if (reducedMotion.matches || !sections.includes(section) || !section.classList.contains("revealed")) return;
      if (location.hash === link.hash) return;
      section.classList.remove("revealed");
      // Commit the starting opacity before observing again, even if the section is still in view.
      section.getBoundingClientRect();
      observer.observe(section);
    });
  }
}

wireSectionReveals();
showHeroEarth();
})();
