const s = document.currentScript;
const when = s.dataset.when;
if (!when || new URLSearchParams(location.search).has(when)) {
  location.replace(s.dataset.to + (s.hasAttribute('data-keep') ? location.search + location.hash : ''));
}
