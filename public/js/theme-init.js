// Applied before first paint to avoid a light/dark flash. Kept tiny and synchronous.
(function () {
  try {
    var saved = localStorage.getItem('pulse:theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();
