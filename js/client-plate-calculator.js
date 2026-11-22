(function () {
  'use strict';

  const units = {
    lb: {
      bar: 45, target: 135,
      bars: [['Olympic', 45], ['Women’s', 35], ['Technique', 15]],
      targets: [95, 135, 185, 225, 315],
      inventory: [[45, 4], [35, 1], [25, 2], [10, 2], [5, 1], [2.5, 1]]
    },
    kg: {
      bar: 20, target: 60,
      bars: [['Olympic', 20], ['Women’s', 15], ['Technique', 7]],
      targets: [40, 60, 80, 100, 140],
      inventory: [[25, 2], [20, 4], [15, 1], [10, 2], [5, 1], [2.5, 1], [1.25, 1]]
    }
  };

  function pairCount(value) {
    return Math.min(8, Math.max(0, Math.trunc(Number(value) || 0)));
  }

  function calculate(target, bar, inventory) {
    if (!Number.isFinite(target) || !Number.isFinite(bar) || target <= 0 || bar <= 0) {
      return { error: 'Enter positive target and bar weights.' };
    }
    if (target < bar) {
      return { error: 'The target is lighter than the bar. Choose a lighter bar or increase the target.' };
    }

    // Track every attainable weight per side in hundredths, keeping the fewest plates at each weight.
    const reachable = new Map([[0, { count: 0, plates: [] }]]);
    for (const [weight, available] of inventory) {
      const plateTicks = Math.round(weight * 100);
      for (const [side, load] of [...reachable]) {
        for (let count = 1; count <= pairCount(available); count++) {
          const nextSide = side + plateTicks * count;
          const nextCount = load.count + count;
          if ((reachable.get(nextSide)?.count ?? Infinity) <= nextCount) continue;
          reachable.set(nextSide, { count: nextCount, plates: [...load.plates, [weight, count]] });
        }
      }
    }

    const requestedSide = (target - bar) * 50;
    let nearest = 0;
    for (const side of reachable.keys()) {
      const difference = Math.abs(side - requestedSide);
      const nearestDifference = Math.abs(nearest - requestedSide);
      if (difference < nearestDifference || (difference === nearestDifference && side < nearest)) nearest = side;
    }
    return {
      weight: bar + nearest / 50,
      plates: reachable.get(nearest).plates,
      exact: Math.abs(nearest - requestedSide) < 1e-7
    };
  }

  function renderFields(fields, unit) {
    const preset = units[unit];
    const options = (presets, kind) => presets.map(([label, weight]) =>
      `<button type="button" data-plate-preset="${kind}" value="${weight}">${label}</button>`).join('');
    fields.innerHTML = `
      <label>Weight unit <select data-plate-unit><option value="lb">Pounds (lb)</option><option value="kg">Kilograms (kg)</option></select></label>
      <label>Target weight (${unit}) <input type="number" inputmode="decimal" step="any" min="0" data-plate-target value="${preset.target}" /></label>
      <div class="client-plate-presets" role="group" aria-label="Common target weights">${options(preset.targets.map(weight => [`${weight} ${unit}`, weight]), 'target')}</div>
      <label>Bar weight (${unit}) <input type="number" inputmode="decimal" step="any" min="0" data-plate-bar value="${preset.bar}" /></label>
      <div class="client-plate-presets" role="group" aria-label="Bar presets">${options(preset.bars.map(([label, weight]) => [`${label} · ${weight} ${unit}`, weight]), 'bar')}</div>
      <p class="client-plate-result" data-plate-result role="status"></p>
      <fieldset class="client-plate-inventory">
        <legend>Available plate pairs</legend>
        <p>One pair provides one plate for each side.</p>
        ${preset.inventory.map(([weight, count]) => `<label>${weight} ${unit} pairs <input type="number" inputmode="numeric" step="1" min="0" max="8" data-plate-pairs="${weight}" value="${count}" /></label>`).join('')}
      </fieldset>`;
    fields.querySelector('[data-plate-unit]').value = unit;
    renderResult(fields);
  }

  const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

  function renderResult(fields) {
    const unit = fields.querySelector('[data-plate-unit]').value;
    const target = fields.querySelector('[data-plate-target]').valueAsNumber;
    const bar = fields.querySelector('[data-plate-bar]').valueAsNumber;
    const inventory = [...fields.querySelectorAll('[data-plate-pairs]')]
      .map(input => [Number(input.dataset.platePairs), input.valueAsNumber]);
    const load = calculate(target, bar, inventory);
    const result = fields.querySelector('[data-plate-result]');
    if (load.error) {
      result.textContent = load.error;
      return;
    }
    const breakdown = load.plates.map(([weight, count]) => `${count} × ${weight} ${unit}`).join(' + ');
    const total = `${format.format(load.weight)} ${unit}`;
    result.textContent = `${load.exact ? 'Exact load' : 'Nearest available load'} ${total}. ${breakdown ? `Per side: ${breakdown}.` : 'Bar only.'}`;
  }

  function mount(container) {
    const fields = container.querySelector('[data-plate-calculator-fields]');
    if (!fields || fields.firstElementChild) return;
    renderFields(fields, 'lb');
    fields.addEventListener('input', event => {
      if (event.target.matches('input')) renderResult(fields);
    });
    fields.addEventListener('change', event => {
      if (event.target.matches('[data-plate-unit]')) {
        renderFields(fields, event.target.value);
        fields.querySelector('[data-plate-unit]').focus();
      } else if (event.target.matches('[data-plate-pairs]')) {
        event.target.value = pairCount(event.target.value);
        renderResult(fields);
      }
    });
    fields.addEventListener('click', event => {
      const button = event.target.closest('[data-plate-preset]');
      if (!button) return;
      fields.querySelector(`[data-plate-${button.dataset.platePreset}]`).value = button.value;
      renderResult(fields);
    });
  }

  if (typeof module !== 'undefined') module.exports = { calculate, units };
  if (typeof document !== 'undefined') {
    document.addEventListener('toggle', event => {
      if (event.target.matches?.('[data-client-plate-calculator][open]')) mount(event.target);
    }, true);
  }
}());
