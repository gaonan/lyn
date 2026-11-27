function colorHex(channels) {
  return "#" + channels.map(channel => channel.toString(16).padStart(2, "0")).join("");
}

function colorFromHSV(hue, saturation, value) {
  const sector = hue / 60;
  const chroma = value * saturation;
  const middle = chroma * (1 - Math.abs(sector % 2 - 1));
  const levels = [[chroma, middle, 0], [middle, chroma, 0], [0, chroma, middle],
    [0, middle, chroma], [middle, 0, chroma], [chroma, 0, middle]];
  return colorHex(levels[Math.floor(sector)].map(level => Math.round((level + value - chroma) * 255)));
}

function createColorPicker(onColor) {
  const panel = byId("custom-color");
  const area = panel.querySelector(".color-area");
  const hueInput = panel.querySelector('input[type="range"]');
  const hexInput = panel.querySelector('input[type="text"]');
  const channelInputs = [...panel.querySelectorAll('input[type="number"]')];
  const choices = {
    color: { button: byId("base-color"), slot: byId("base-picker-slot") },
    thread: { button: byId("pattern-color"), slot: byId("thread-picker-slot") }
  };
  let target, colors, context, pointer, editing;
  let color = "", hue = 0, saturation = 0, value = 0;

  function paintControls(source) {
    area.style.setProperty("--hue", hue);
    area.style.setProperty("--sat", saturation * 100 + "%");
    area.style.setProperty("--val", (1 - value) * 100 + "%");
    hueInput.value = Math.round(hue) % 360;
    if (source !== hexInput) hexInput.value = color.toUpperCase();
    rgb(color).forEach((channel, index) => {
      if (channelInputs[index] !== source) channelInputs[index].value = channel;
    });
  }

  function readColor(next) {
    const [red, green, blue] = rgb(next).map(channel => channel / 255);
    const high = Math.max(red, green, blue);
    const chroma = high - Math.min(red, green, blue);
    if (chroma) {
      const sector = high === red ? (green - blue) / chroma
        : high === green ? 2 + (blue - red) / chroma : 4 + (red - green) / chroma;
      hue = (sector * 60 + 360) % 360;
    }
    saturation = high ? chroma / high : 0;
    value = high;
  }

  function choose(next, source, fromPalette = false) {
    if (!fromPalette) readColor(next);
    const changed = color !== next;
    color = next;
    paintControls(source);
    if (!changed) return;
    const firstEdit = editing !== source;
    editing = source;
    onColor(target, next, firstEdit);
  }

  function toggle(next) {
    editing = undefined;
    if (target) choices[target].button.setAttribute("aria-expanded", "false");
    target = next === target ? undefined : next;
    panel.hidden = !target;
    if (!target) return;
    const { button, slot } = choices[target];
    slot.append(panel);
    button.setAttribute("aria-expanded", "true");
    color = colors[target];
    readColor(color);
    paintControls();
  }

  for (const [key, { button }] of Object.entries(choices)) {
    button.addEventListener("click", () => toggle(key));
  }

  function aim(event) {
    const rect = area.getBoundingClientRect();
    saturation = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    value = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    choose(colorFromHSV(hue, saturation, value), area, true);
  }
  area.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    pointer = event.pointerId;
    editing = undefined;
    area.setPointerCapture(pointer);
    aim(event);
  });
  area.addEventListener("pointermove", event => {
    if (event.pointerId === pointer) aim(event);
  });
  area.addEventListener("lostpointercapture", () => { pointer = editing = undefined; });
  hueInput.addEventListener("input", () => {
    hue = Number(hueInput.value);
    choose(colorFromHSV(hue, saturation, value), hueInput, true);
  });
  hueInput.addEventListener("change", () => { editing = undefined; });

  hexInput.addEventListener("input", () => {
    const hex = "#" + hexInput.value.replace(/^#/, "").toLowerCase();
    if (isColor(hex)) choose(hex, hexInput);
  });
  hexInput.addEventListener("change", () => {
    const short = hexInput.value.replace(/^#/, "").toLowerCase();
    if (/^[\da-f]{3}$/.test(short)) choose("#" + [...short].map(c => c + c).join(""), hexInput);
  });
  channelInputs.forEach((input, index) => input.addEventListener("input", () => {
    if (!input.value || !input.validity.valid) return;
    const channels = rgb(color);
    channels[index] = input.valueAsNumber;
    choose(colorHex(channels), input);
  }));
  for (const input of [hueInput, hexInput, ...channelInputs]) input.addEventListener("blur", () => {
    editing = undefined;
    paintControls();
  });

  return {
    sync(next, partKey, allowed) {
      colors = next;
      const differentPart = context !== partKey;
      context = partKey;
      for (const [key, { button }] of Object.entries(choices)) button.style.setProperty("--chosen", colors[key]);
      if (!target) return;
      if (!allowed[target]) {
        toggle(target);
      } else if (differentPart || color !== colors[target]) {
        editing = undefined;
        color = colors[target];
        readColor(color);
        paintControls();
      }
    }
  };
}
