import { describe, it, assert, mount, press } from '../harness.js';
import { Slider } from '../../src/components/slider/slider.js';
import { Keys } from '../../src/utils/keys.js';

const single = (attrs = '') => `
  <div class="a11y-slider" data-a11y-slider data-min="0" data-max="100" data-step="5" ${attrs}>
    <span id="vol-label">Volume</span>
    <div class="a11y-slider__track" data-a11y-slider-track>
      <div class="a11y-slider__thumb" data-a11y-slider-thumb data-value="40" aria-labelledby="vol-label"></div>
    </div>
  </div>
`;

const range = `
  <div class="a11y-slider" data-a11y-slider data-min="0" data-max="1000" data-step="10">
    <div class="a11y-slider__track" data-a11y-slider-track>
      <div data-a11y-slider-thumb data-value="200" aria-label="Minimum price"></div>
      <div data-a11y-slider-thumb data-value="800" aria-label="Maximum price"></div>
    </div>
  </div>
`;

function setup(markup = single(), options = {}) {
  const root = mount(markup);
  const slider = new Slider(root.querySelector('[data-a11y-slider]'), options);
  return { root, slider, thumbs: Array.from(root.querySelectorAll('[data-a11y-slider-thumb]')) };
}

describe('Slider — ARIA', () => {
  it('exposes role, bounds and the current value', () => {
    const { thumbs } = setup();
    assert.attribute(thumbs[0], 'role', 'slider');
    assert.attribute(thumbs[0], 'aria-valuemin', '0');
    assert.attribute(thumbs[0], 'aria-valuemax', '100');
    assert.attribute(thumbs[0], 'aria-valuenow', '40');
    assert.attribute(thumbs[0], 'tabindex', '0');
  });

  it('adds aria-valuetext when a formatter makes the number meaningful', () => {
    const { thumbs } = setup(single(), { format: (v) => `${v} percent` });
    assert.attribute(thumbs[0], 'aria-valuetext', '40 percent');
  });

  it('omits aria-valuetext when the raw number already says everything', () => {
    const { thumbs } = setup();
    assert.noAttribute(thumbs[0], 'aria-valuetext');
  });

  it('marks a vertical slider', () => {
    const { thumbs } = setup(single('data-a11y-slider-orientation="vertical"'));
    assert.attribute(thumbs[0], 'aria-orientation', 'vertical');
  });
});

describe('Slider — keyboard', () => {
  it('steps with the arrow keys on both axes', () => {
    const { slider, thumbs } = setup();
    press(thumbs[0], Keys.ArrowRight);
    assert.equal(slider.values[0], 45);
    press(thumbs[0], Keys.ArrowUp);
    assert.equal(slider.values[0], 50);
    press(thumbs[0], Keys.ArrowLeft);
    press(thumbs[0], Keys.ArrowDown);
    assert.equal(slider.values[0], 40);
  });

  it('takes a larger step with Page Up and Page Down', () => {
    const { slider, thumbs } = setup();
    press(thumbs[0], Keys.PageUp);
    assert.equal(slider.values[0], 50, 'a tenth of the range');
    press(thumbs[0], Keys.PageDown);
    assert.equal(slider.values[0], 40);
  });

  it('goes to the bounds with Home and End', () => {
    const { slider, thumbs } = setup();
    press(thumbs[0], Keys.End);
    assert.equal(slider.values[0], 100);
    press(thumbs[0], Keys.Home);
    assert.equal(slider.values[0], 0);
  });

  it('consumes the keys it handles, so the page does not scroll or jump', () => {
    const { thumbs } = setup();
    for (const key of [Keys.PageUp, Keys.PageDown, Keys.Home, Keys.End, Keys.ArrowUp, Keys.ArrowDown]) {
      assert.ok(press(thumbs[0], key).defaultPrevented, `${key} must be prevented`);
    }
  });

  it('leaves keys it does not handle alone', () => {
    const { thumbs } = setup();
    assert.notOk(press(thumbs[0], Keys.Tab).defaultPrevented);
  });

  it('clamps at the bounds', () => {
    const { slider, thumbs } = setup();
    press(thumbs[0], Keys.End);
    press(thumbs[0], Keys.ArrowRight);
    assert.equal(slider.values[0], 100);
  });

  it('snaps to the step and keeps the value free of float noise', () => {
    const root = mount(`
      <div data-a11y-slider data-min="0" data-max="1" data-step="0.1">
        <div data-a11y-slider-track>
          <div data-a11y-slider-thumb data-value="0.3" aria-label="Opacity"></div>
        </div>
      </div>
    `);
    const slider = new Slider(root.querySelector('[data-a11y-slider]'));
    const thumb = root.querySelector('[data-a11y-slider-thumb]');
    press(thumb, Keys.ArrowRight);
    assert.equal(slider.values[0], 0.4);
    assert.attribute(thumb, 'aria-valuenow', '0.4', 'not 0.4000000000000001');
  });

  it('follows the visual direction of the track in right-to-left', () => {
    const root = mount(`<div dir="rtl">${single()}</div>`);
    const slider = new Slider(root.querySelector('[data-a11y-slider]'));
    const thumb = root.querySelector('[data-a11y-slider-thumb]');
    press(thumb, Keys.ArrowRight);
    assert.equal(slider.values[0], 35, 'in RTL the right arrow moves towards the lower end');
  });
});

describe('Slider — multi-thumb', () => {
  it('narrows each thumb’s announced bounds to its neighbours', () => {
    const { thumbs } = setup(range);
    assert.attribute(thumbs[0], 'aria-valuemin', '0');
    assert.attribute(thumbs[0], 'aria-valuemax', '800', 'the min thumb cannot pass the max thumb');
    assert.attribute(thumbs[1], 'aria-valuemin', '200');
    assert.attribute(thumbs[1], 'aria-valuemax', '1000');
  });

  it('moves those bounds as the other thumb moves', () => {
    const { slider, thumbs } = setup(range);
    slider.setValue(1, 500);
    assert.attribute(thumbs[0], 'aria-valuemax', '500');
  });

  it('stops the thumbs crossing', () => {
    const { slider } = setup(range);
    slider.setValue(0, 950);
    assert.equal(slider.values[0], 800, 'clamped to the max thumb');
  });

  it('gives each thumb its own name', () => {
    const { thumbs } = setup(range);
    assert.attribute(thumbs[0], 'aria-label', 'Minimum price');
    assert.attribute(thumbs[1], 'aria-label', 'Maximum price');
  });
});
