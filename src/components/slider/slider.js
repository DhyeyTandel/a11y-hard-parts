import { Keys } from '../../utils/keys.js';
import { ensureId, setDefault, emit } from '../../utils/dom.js';

/**
 * Slider — APG "Slider" and "Slider (Multi-Thumb)".
 *
 * The attribute people leave out is `aria-valuetext`, and it is the one that
 * decides whether the control is usable. `aria-valuenow="3"` on a delivery-speed
 * slider announces "3" — three what? With `aria-valuetext="Next day"` it
 * announces something a person can act on. Use it whenever the raw number is
 * not self-describing: currency, dates, named steps, ratios.
 *
 * The second thing people leave out is a per-thumb accessible name on a range
 * slider. Two thumbs both labelled "Price" are indistinguishable; they need to
 * be "Minimum price" and "Maximum price".
 *
 * The third is the moving `aria-valuemin`/`aria-valuemax` on a range slider.
 * Each thumb's range is bounded by its neighbour, so the announced bounds must
 * move as the other thumb moves — otherwise the screen reader promises a range
 * the thumb cannot actually reach.
 *
 * Expected markup:
 *
 *   <div data-a11y-slider data-min="0" data-max="100" data-step="5">
 *     <label id="vol-label">Volume</label>
 *     <div data-a11y-slider-track>
 *       <div data-a11y-slider-thumb data-value="40" aria-labelledby="vol-label"></div>
 *     </div>
 *   </div>
 */
export class Slider {
  /**
   * @param {Element} root
   * @param {object} [options]
   * @param {number} [options.min=0]
   * @param {number} [options.max=100]
   * @param {number} [options.step=1]
   * @param {number} [options.largeStep] PageUp/PageDown increment. Defaults to
   *   a tenth of the range, rounded to the step.
   * @param {(value: number, index: number) => string} [options.format]
   *   Produces `aria-valuetext`.
   * @param {'horizontal'|'vertical'} [options.orientation='horizontal']
   * @param {(values: number[]) => void} [options.onChange]
   */
  constructor(root, options = {}) {
    this.root = root;
    const data = root.dataset;

    this.min = options.min ?? Number(data.min ?? 0);
    this.max = options.max ?? Number(data.max ?? 100);
    this.step = options.step ?? Number(data.step ?? 1);
    this.orientation = options.orientation ?? (data.a11ySliderOrientation === 'vertical' ? 'vertical' : 'horizontal');
    this.largeStep = options.largeStep ?? Math.max(this.step, this._quantize((this.max - this.min) / 10));
    this.options = options;

    this.track = root.querySelector('[data-a11y-slider-track]') ?? root;
    this.thumbs = Array.from(root.querySelectorAll('[data-a11y-slider-thumb]'));
    if (this.thumbs.length === 0) throw new Error('[Slider] Requires at least one [data-a11y-slider-thumb].');

    this.values = this.thumbs.map((thumb, index) =>
      this._clamp(Number(thumb.dataset.value ?? this.min), index),
    );

    this._applyStaticAria();
    this._bindEvents();
    this.render();
  }

  _applyStaticAria() {
    this.thumbs.forEach((thumb, index) => {
      setDefault(thumb, 'role', 'slider');
      setDefault(thumb, 'tabindex', '0');
      if (this.orientation === 'vertical') setDefault(thumb, 'aria-orientation', 'vertical');

      if (!thumb.hasAttribute('aria-label') && !thumb.hasAttribute('aria-labelledby')) {
        console.warn(
          this.thumbs.length > 1
            ? '[Slider] Each thumb of a range slider needs its own name ' +
                '("Minimum price" / "Maximum price"). Two thumbs called "Price" ' +
                'are indistinguishable.'
            : '[Slider] The thumb has no accessible name.',
          thumb,
        );
      }
      ensureId(thumb, 'slider-thumb');
    });
  }

  _bindEvents() {
    for (const thumb of this.thumbs) {
      thumb.addEventListener('keydown', this._onKeydown.bind(this));
      thumb.addEventListener('pointerdown', this._onThumbPointerDown.bind(this));
    }
    this.track.addEventListener('pointerdown', this._onTrackPointerDown.bind(this));
  }

  _quantize(value) {
    const steps = Math.round((value - this.min) / this.step);
    const snapped = this.min + steps * this.step;
    // Re-round to the step's own precision, or 0.1 + 0.2 arithmetic leaves
    // values like 30.000000000000004 in aria-valuenow.
    const decimals = (String(this.step).split('.')[1] ?? '').length;
    return Number(snapped.toFixed(decimals));
  }

  /** Clamp to the slider's bounds and, for a range slider, to its neighbours. */
  _clamp(value, index) {
    const lower = index > 0 ? this.values?.[index - 1] ?? this.min : this.min;
    const upper = index < this.thumbs.length - 1 ? this.values?.[index + 1] ?? this.max : this.max;
    return Math.min(Math.max(this._quantize(value), Math.max(this.min, lower)), Math.min(this.max, upper));
  }

  setValue(index, value, { emitEvent = true } = {}) {
    const next = this._clamp(value, index);
    if (next === this.values[index]) return this;
    this.values[index] = next;
    this.render();

    if (emitEvent) {
      this.options.onChange?.(this.values.slice());
      emit(this.root, 'a11y-slider:change', { values: this.values.slice(), index, slider: this });
    }
    return this;
  }

  render() {
    this.thumbs.forEach((thumb, index) => {
      const value = this.values[index];
      // The bounds move with the neighbouring thumbs, so what is announced is
      // the range this thumb can actually reach right now.
      const lower = index > 0 ? this.values[index - 1] : this.min;
      const upper = index < this.thumbs.length - 1 ? this.values[index + 1] : this.max;

      thumb.setAttribute('aria-valuemin', String(lower));
      thumb.setAttribute('aria-valuemax', String(upper));
      thumb.setAttribute('aria-valuenow', String(value));

      const text = this.options.format?.(value, index);
      if (text) thumb.setAttribute('aria-valuetext', text);

      const percent = ((value - this.min) / (this.max - this.min)) * 100;
      thumb.style.setProperty('--slider-position', `${percent}%`);
    });

    // Expose the filled portion for CSS, so the track can be drawn without a
    // second element per thumb.
    const first = ((this.values[0] - this.min) / (this.max - this.min)) * 100;
    const last = ((this.values[this.values.length - 1] - this.min) / (this.max - this.min)) * 100;
    this.track.style.setProperty('--slider-fill-start', this.thumbs.length > 1 ? `${first}%` : '0%');
    this.track.style.setProperty('--slider-fill-end', `${last}%`);
  }

  _onKeydown(event) {
    const index = this.thumbs.indexOf(event.currentTarget);
    if (index === -1) return;

    // In a right-to-left writing mode the left arrow must increase the value:
    // the arrows follow the visual direction of the track, not the numeric axis.
    const rtl = getComputedStyle(this.root).direction === 'rtl';
    const value = this.values[index];
    let next = null;

    switch (event.key) {
      case Keys.ArrowRight: next = value + (rtl ? -this.step : this.step); break;
      case Keys.ArrowLeft: next = value - (rtl ? -this.step : this.step); break;
      case Keys.ArrowUp: next = value + this.step; break;
      case Keys.ArrowDown: next = value - this.step; break;
      case Keys.PageUp: next = value + this.largeStep; break;
      case Keys.PageDown: next = value - this.largeStep; break;
      case Keys.Home: next = this.min; break;
      case Keys.End: next = this.max; break;
      default: return;
    }

    // Prevented so Page keys do not scroll the page and Home/End do not jump
    // to the top or bottom of the document while the user is adjusting.
    event.preventDefault();
    this.setValue(index, next);
  }

  _valueFromPointer(event) {
    const rect = this.track.getBoundingClientRect();
    const rtl = getComputedStyle(this.root).direction === 'rtl';

    let ratio;
    if (this.orientation === 'vertical') {
      ratio = 1 - (event.clientY - rect.top) / rect.height;
    } else {
      ratio = (event.clientX - rect.left) / rect.width;
      if (rtl) ratio = 1 - ratio;
    }
    return this.min + Math.min(1, Math.max(0, ratio)) * (this.max - this.min);
  }

  _startDrag(index, event) {
    const thumb = this.thumbs[index];
    // Pointer capture keeps the drag alive when the pointer leaves the track,
    // so the value does not freeze the moment the user's hand wanders.
    thumb.setPointerCapture?.(event.pointerId);
    thumb.focus();

    const onMove = (moveEvent) => this.setValue(index, this._valueFromPointer(moveEvent));
    const onUp = (upEvent) => {
      thumb.releasePointerCapture?.(upEvent.pointerId);
      thumb.removeEventListener('pointermove', onMove);
      thumb.removeEventListener('pointerup', onUp);
      thumb.removeEventListener('pointercancel', onUp);
    };

    thumb.addEventListener('pointermove', onMove);
    thumb.addEventListener('pointerup', onUp);
    thumb.addEventListener('pointercancel', onUp);
  }

  _onThumbPointerDown(event) {
    const index = this.thumbs.indexOf(event.currentTarget);
    if (index === -1) return;
    event.preventDefault();
    event.stopPropagation();
    this._startDrag(index, event);
  }

  _onTrackPointerDown(event) {
    if (event.target.closest('[data-a11y-slider-thumb]')) return;
    event.preventDefault();

    const value = this._valueFromPointer(event);
    // Move whichever thumb is nearest, so clicking the track does something
    // predictable on a range slider instead of always grabbing the first.
    let nearest = 0;
    let bestDistance = Infinity;
    this.values.forEach((current, index) => {
      const distance = Math.abs(current - value);
      if (distance < bestDistance) { bestDistance = distance; nearest = index; }
    });

    this.setValue(nearest, value);
    this._startDrag(nearest, event);
  }
}

export function initSliders(scope = document) {
  return Array.from(scope.querySelectorAll('[data-a11y-slider]')).map((root) => new Slider(root));
}
