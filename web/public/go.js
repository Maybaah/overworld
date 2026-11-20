const s = document.currentScript;
location.replace(s.dataset.to + (s.hasAttribute('data-keep') ? location.search + location.hash : ''));
