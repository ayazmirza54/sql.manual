/* Join visualiser — inline SVG venn cards, theme-aware, no dependencies. */
(function () {
  var box = document.getElementById('joinviz');
  if (!box) return;

  var W = 150, H = 62, r = 24, cx1 = 58, cx2 = 92, cy = 31;
  function svg(mode) {
    var clipA = '<clipPath id="c' + mode + '"><circle cx="' + cx1 + '" cy="' + cy + '" r="' + r + '"/></clipPath>';
    var base =
      '<circle class="venn-off" cx="' + cx1 + '" cy="' + cy + '" r="' + r + '"/>' +
      '<circle class="venn-off" cx="' + cx2 + '" cy="' + cy + '" r="' + r + '"/>';
    var hit = '';
    if (mode === 'inner') {
      hit = '<g clip-path="url(#c' + mode + ')"><circle class="venn-hit" cx="' + cx2 + '" cy="' + cy + '" r="' + r + '"/></g>';
    } else if (mode === 'left') {
      hit = '<circle class="venn-hit" cx="' + cx1 + '" cy="' + cy + '" r="' + r + '"/>';
    } else if (mode === 'right') {
      hit = '<circle class="venn-hit" cx="' + cx2 + '" cy="' + cy + '" r="' + r + '"/>';
    } else if (mode === 'full') {
      hit = '<circle class="venn-hit" cx="' + cx1 + '" cy="' + cy + '" r="' + r + '"/>' +
            '<circle class="venn-hit" cx="' + cx2 + '" cy="' + cy + '" r="' + r + '"/>';
    } else if (mode === 'cross') {
      hit = '<circle class="venn-hit" cx="' + cx1 + '" cy="' + cy + '" r="' + r + '"/>' +
            '<circle class="venn-hit" cx="' + cx2 + '" cy="' + cy + '" r="' + r + '"/>' +
            '<path d="M' + (cx1 - 8) + ' ' + (cy - 14) + ' L' + (cx2 + 8) + ' ' + (cy + 14) + '" stroke="currentColor" stroke-width="1.2" opacity=".5"/>';
    } else if (mode === 'self') {
      hit = '<circle class="venn-hit" cx="' + ((cx1 + cx2) / 2) + '" cy="' + cy + '" r="' + r + '"/>' +
            '<path d="M' + ((cx1 + cx2) / 2 + r) + ' ' + cy + ' a10 10 0 1 1 -6 -9" fill="none" stroke="currentColor" stroke-width="1.4"/>';
    } else if (mode === 'lateral') {
      hit = '<circle class="venn-a" cx="' + cx1 + '" cy="' + cy + '" r="' + r + '"/>' +
            '<circle class="venn-hit" cx="' + cx2 + '" cy="' + cy + '" r="12"/>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-hidden="true">' + clipA + base + hit + '</svg>';
  }

  var joins = [
    ['INNER JOIN', 'inner', '#inner-join'],
    ['LEFT JOIN', 'left', '#left-join-left-outer-join'],
    ['RIGHT JOIN', 'right', '#right-join'],
    ['FULL OUTER JOIN', 'full', '#full-outer-join'],
    ['CROSS JOIN', 'cross', '#cross-join'],
    ['SELF JOIN', 'self', '#self-join'],
    ['LATERAL JOIN', 'lateral', '#lateral-join-cross-apply']
  ];

  box.innerHTML = joins.map(function (j) {
    return '<a class="joincard" href="' + j[2] + '">' + svg(j[1]) +
           '<span class="joincard__n">' + j[0] + '</span></a>';
  }).join('');
})();
