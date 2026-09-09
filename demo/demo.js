/**
 * Demo-site chrome only. Nothing here is part of the library.
 */

const KEY = 'a11y-demo-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const button = document.querySelector('.theme-toggle');
  if (!button) return;
  button.textContent = theme === 'dark' ? 'Light' : 'Dark';
  // The button's job is "switch to X", so its name must say X, not the state.
  button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
}

export function initChrome() {
  let stored;
  try { stored = localStorage.getItem(KEY); } catch { stored = null; }
  const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(stored ?? preferred);

  document.querySelector('.theme-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  });

  const here = location.pathname.split('/').pop() || 'index.html';
  for (const link of document.querySelectorAll('.site-nav a')) {
    if (link.getAttribute('href').endsWith(here)) link.setAttribute('aria-current', 'page');
  }
}
