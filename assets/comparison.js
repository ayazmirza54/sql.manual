/* Dialect diff — toggle engines on/off, persisted across visits. */
(function () {
  var KEY = 'sqlt-dialects';
  var chips = [].slice.call(document.querySelectorAll('[data-dialect]'));
  var cells = [].slice.call(document.querySelectorAll('.diffcell'));
  var allBtn = document.querySelector('[data-dialect-all]');
  if (!chips.length) return;

  var on = {};
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') on = saved;
  } catch (e) {}
  if (!Object.keys(on).length) chips.forEach(function (c) { on[c.getAttribute('data-dialect')] = true; });

  function apply() {
    chips.forEach(function (c) {
      c.classList.toggle('is-on', !!on[c.getAttribute('data-dialect')]);
      c.setAttribute('aria-pressed', String(!!on[c.getAttribute('data-dialect')]));
    });
    cells.forEach(function (cell) {
      cell.hidden = !on[cell.getAttribute('data-dialect')];
    });
    try { localStorage.setItem(KEY, JSON.stringify(on)); } catch (e) {}
  }

  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var d = c.getAttribute('data-dialect');
      on[d] = !on[d];
      apply();
    });
  });

  if (allBtn) {
    allBtn.addEventListener('click', function () {
      var anyOff = chips.some(function (c) { return !on[c.getAttribute('data-dialect')]; });
      chips.forEach(function (c) { on[c.getAttribute('data-dialect')] = anyOff; });
      apply();
    });
  }
  apply();
})();
