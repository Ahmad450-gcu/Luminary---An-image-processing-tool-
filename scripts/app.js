
'use strict';
import { initEditor, showToast } from './editor.js';

/* theme */
const root      = document.documentElement;
const THEME_KEY = 'luminary-theme';
function getTheme() {
  return localStorage.getItem(THEME_KEY) ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function setTheme(t) {
  root.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  });
}

function toggleTheme() {
  setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* page routing  */
const PAGES        = ['landing', 'editor', 'about', 'privacy'];
let   currentPage  = null;
let   transitioning = false;

function showPage(name) {
  if (name === currentPage || transitioning) return;
  transitioning = true;

  const outEl = currentPage ? document.getElementById(`page-${currentPage}`) : null;
  const inEl  = document.getElementById(`page-${name}`);
  if (!inEl) { transitioning = false; return; }

  // update nav active state immediately
  document.querySelectorAll('.nav-link[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === name);
  });

  function doEnter() {
    window.scrollTo({ top: 0, behavior: 'instant' });
    inEl.classList.add('active');
    inEl.getBoundingClientRect();
    inEl.style.opacity = '1';
    inEl.style.transform = 'translateY(0)';
    currentPage   = name;
    transitioning = false;
    if (name === 'editor') initEditor();
  }

  if (outEl) {
    outEl.style.transition = 'opacity .22s ease, transform .22s ease';
    outEl.style.opacity    = '0';
    outEl.style.transform  = 'translateY(6px)';
    setTimeout(() => {
      outEl.classList.remove('active');
      outEl.style.opacity    = '';
      outEl.style.transform  = '';
      outEl.style.transition = '';
      // prepare incoming page
      inEl.style.opacity    = '0';
      inEl.style.transform  = 'translateY(6px)';
      inEl.style.transition = 'none';
      doEnter();
      // trigger enter transition on next frame
      requestAnimationFrame(() => {
        inEl.style.transition = 'opacity .22s ease, transform .22s ease';
        inEl.style.opacity    = '1';
        inEl.style.transform  = 'translateY(0)';
        setTimeout(() => {
          inEl.style.transition = '';
          inEl.style.opacity    = '';
          inEl.style.transform  = '';
        }, 240);
      });
    }, 200);
  } else {
    doEnter();
  }
}

/* FAQ  */
function initFAQ() {
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item   = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
}

/* Nav  */
function initNav() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const page = el.dataset.page;
      if (page) showPage(page);
    });
  });
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });
}

/*boot */
document.addEventListener('DOMContentLoaded', () => {
  setTheme(getTheme());
  initNav();
  initFAQ();
  showPage('landing');
});
