// labels.js — pure label-visibility state factory. Kept separate so tests can
// exercise the toggle logic without importing the DOM-dependent editor module.

export function createLabelState(initial = true) {
  let visible = initial;
  return {
    get() {
      return visible;
    },
    toggle() {
      visible = !visible;
      return visible;
    },
    set(v) {
      visible = Boolean(v);
    },
  };
}
