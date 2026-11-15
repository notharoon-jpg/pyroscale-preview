function wirePanelMovement() {
  const panel = $("dr"), handle = $("move-panel"), dock = $("dock-panel");
  const margin = 8;
  let drag = null;
  let position = null;

  function place(left, top) {
    const maxX = Math.max(margin, document.documentElement.clientWidth - panel.offsetWidth - margin);
    const maxY = Math.max(margin, innerHeight - panel.offsetHeight - margin);
    position = {
      left: Math.min(maxX, Math.max(margin, left)),
      top: Math.min(maxY, Math.max(margin, top)),
    };
    panel.style.setProperty("--analysis-x", position.left + "px");
    panel.style.setProperty("--analysis-y", position.top + "px");
  }

  function undock() {
    if (position) return;
    const {left, top} = panel.getBoundingClientRect();
    document.body.classList.add("analysis-floating");
    dock.hidden = false;
    place(left, top);
    gResize();
  }

  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0 || drag) return;
    const {left, top} = panel.getBoundingClientRect();
    drag = {id: event.pointerId, left, top, x: event.clientX, y: event.clientY};
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", event => {
    if (event.pointerId !== drag?.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!position && Math.hypot(dx, dy) < 4) return;
    undock();
    place(drag.left + dx, drag.top + dy);
  });

  handle.addEventListener("lostpointercapture", () => { drag = null; });
  handle.addEventListener("click", undock);

  const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
  handle.addEventListener("keydown", event => {
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    undock();
    const step = event.shiftKey ? 48 : 16;
    place(position.left + direction[0] * step, position.top + direction[1] * step);
  });

  dock.addEventListener("click", () => {
    position = null;
    document.body.classList.remove("analysis-floating");
    dock.hidden = true;
    gResize();
    handle.focus();
  });

  window.addEventListener("resize", () => {
    if (position) place(position.left, position.top);
  });
}

