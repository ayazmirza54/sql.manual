import { esc } from './md.mjs';
import { site, nav } from '../content/site.mjs';

const navHtml = (current) =>
  nav
    .map((n) => {
      const active = current === n.href || (n.href !== '/' && current.startsWith(n.href));
      return `<a class="nav__link${active ? ' is-active' : ''}"${active ? ' aria-current="page"' : ''} href="${n.href}">${esc(
        n.label
      )}</a>`;
    })
    .join('');

function breadcrumb(path) {
  const parts = path.split('/').filter(Boolean);
  const crumbs = [];
  let acc = '';
  for (const p of parts) {
    acc += '/' + p;
    crumbs.push(`<a href="${acc}/">${esc(p)}</a>`);
  }
  return `<nav class="crumb" aria-label="Breadcrumb"><span class="crumb__tilde">~</span>${
    crumbs.length ? '/' + crumbs.join('<span class="crumb__sep">/</span>') : ''
  }</nav>`;
}

function tocHtml(toc) {
  if (!toc || toc.length < 2) return '';
  const items = toc
    .filter((t) => t.level <= 3)
    .map((t) => `<li class="toc__i toc__i--${t.level}"><a href="#${t.id}">${esc(t.text)}</a></li>`)
    .join('');
  return `<nav class="toc" aria-label="On this page"><p class="toc__h">ON THIS PAGE</p><ul class="toc__l">${items}</ul></nav>`;
}

function sidebarHtml(sidebar, current) {
  if (!sidebar || !sidebar.length) return '';
  const groups = sidebar
    .map((g) => {
      const links = g.items
        .map(
          (it) =>
            `<li><a class="sb__link${it.href === current ? ' is-active' : ''}"${
              it.href === current ? ' aria-current="page"' : ''
            } href="${it.href}">${esc(it.label)}</a></li>`
        )
        .join('');
      return `<div class="sb__group"><p class="sb__title">${esc(g.title)}</p><ul class="sb__list">${links}</ul></div>`;
    })
    .join('');
  return `<aside class="sb" aria-label="Section navigation"><div class="sb__inner">${groups}</div></aside>`;
}

function metaBar(meta) {
  if (!meta) return '';
  const rows = Object.entries(meta)
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<div class="pmeta__i"><span class="pmeta__k">${esc(k.toUpperCase())}</span><span class="pmeta__v">${esc(
          String(v)
        )}</span></div>`
    )
    .join('');
  return `<div class="pmeta">${rows}</div>`;
}

function relatedHtml(related) {
  if (!related || !related.length) return '';
  const items = related
    .map((r) => `<a class="rel__i" href="${r.href}"><span class="rel__t">${esc(r.label)}</span><span class="rel__a">→</span></a>`)
    .join('');
  return `<section class="rel"><h2 class="rel__h">RELATED TOPICS</h2><div class="rel__g">${items}</div></section>`;
}

function pager(prev, next) {
  if (!prev && !next) return '';
  const one = (p, dir) =>
    p
      ? `<a class="pager__i pager__i--${dir}" href="${p.href}"><span class="pager__d">${
          dir === 'prev' ? '← PREV' : 'NEXT →'
        }</span><span class="pager__t">${esc(p.label)}</span></a>`
      : '<span></span>';
  return `<nav class="pager" aria-label="Pagination">${one(prev, 'prev')}${one(next, 'next')}</nav>`;
}

/**
 * @param {object} p
 * @param {string} p.path      site-absolute path, e.g. /sql/joins/
 * @param {string} p.title
 * @param {string} p.description
 * @param {string} p.body      main HTML
 */
export function layout(p) {
  const {
    path,
    title,
    description = site.description,
    body,
    toc = [],
    sidebar = [],
    meta = null,
    related = [],
    prev = null,
    next = null,
    hero = '',
    wide = false,
    scripts = [],
    keywords = '',
    showCrumb = true,
  } = p;

  const canonical = site.url.replace(/\/$/, '') + path;
  const fullTitle = path === '/' ? `${site.name} — ${site.tagline}` : `${title} · ${site.name}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': path === '/' ? 'WebSite' : 'TechArticle',
    name: fullTitle,
    headline: title,
    description,
    url: canonical,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: site.name, url: site.url },
    ...(path === '/'
      ? {
          potentialAction: {
            '@type': 'SearchAction',
            target: `${site.url}/search/?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }
      : {}),
  };

  return `<!doctype html>
<html lang="en" data-theme="dark" data-scheme="${esc(site.scheme)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${keywords ? `<meta name="keywords" content="${esc(keywords)}">` : ''}
<link rel="canonical" href="${esc(canonical)}">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#000000">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/DepartureMono-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/InstrumentSans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/styles.css">
<script>(function(){try{var t=localStorage.getItem('sqlt-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}})();</script>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="hdr">
  <div class="hdr__top">
    <a class="brand" href="/" aria-label="SQL Terminal home">
      <span class="brand__mark" aria-hidden="true">&gt;</span>
      <span class="brand__name">sql terminal</span>
    </a>
    <button class="search-trigger" type="button" data-open-palette aria-label="Open search (Command K)">
      <span class="search-trigger__p">$</span>
      <span class="search-trigger__t">search the reference</span>
      <span class="search-trigger__k"><kbd>⌘</kbd><kbd>K</kbd></span>
    </button>
    <div class="hdr__act">
      <button class="iconbtn" type="button" data-theme-toggle aria-label="Toggle color theme" title="Toggle theme">
        <svg class="iconbtn__t" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" stroke="none"/></svg>
      </button>
      <a class="iconbtn iconbtn--wide" href="${site.repo}" target="_blank" rel="noopener noreferrer">SOURCE</a>
      <button class="iconbtn iconbtn--menu" type="button" data-nav-toggle aria-expanded="false" aria-label="Toggle navigation">≡</button>
    </div>
  </div>
  <nav class="nav" aria-label="Primary"><div class="nav__scroll">${navHtml(path)}</div></nav>
</header>
${hero}
<div class="shell${wide ? ' shell--wide' : ''}${sidebar.length ? '' : ' shell--nosb'}">
  ${sidebarHtml(sidebar, path)}
  <main class="main" id="main">
    ${showCrumb && path !== '/' ? breadcrumb(path) : ''}
    ${metaBar(meta)}
    ${body}
    ${relatedHtml(related)}
    ${pager(prev, next)}
  </main>
  ${toc.length > 1 ? `<div class="toccol">${tocHtml(toc)}</div>` : ''}
</div>
<footer class="ftr">
  <div class="ftr__in">
    <div class="ftr__col">
      <p class="ftr__brand"><b aria-hidden="true">&gt;</b> sql terminal</p>
      <p class="ftr__t">${esc(site.tagline)} Reference material for engineers, analysts, DBAs and students.</p>
      <p class="ftr__t ftr__t--dim">Content is hand-written and version-aware. Where engines differ, the difference is shown rather than hidden.</p>
    </div>
    <div class="ftr__col">
      <p class="ftr__h">REFERENCE</p>
      <a href="/sql/">SQL fundamentals</a><a href="/functions/">Function encyclopedia</a><a href="/datatypes/">Data types</a><a href="/operators/">Operators</a><a href="/commands/">Commands</a>
    </div>
    <div class="ftr__col">
      <p class="ftr__h">ENGINES</p>
      <a href="/databases/postgresql/">PostgreSQL</a><a href="/databases/mysql/">MySQL</a><a href="/databases/sqlite/">SQLite</a><a href="/databases/sqlserver/">SQL Server</a><a href="/databases/">All 16 engines</a>
    </div>
    <div class="ftr__col">
      <p class="ftr__h">TOOLS</p>
      <a href="/comparison/">Dialect diff</a><a href="/playground/">SQL playground</a><a href="/cheatsheets/">Cheat sheets</a><a href="/cookbook/">Cookbook</a><a href="/cli/">CLI reference</a>
    </div>
  </div>
  <div class="ftr__bar">
    <span>© ${site.updated} ${esc(site.name)}</span>
    <span class="ftr__status"><span class="dot dot--ok"></span>docs build ok</span>
    <span class="ftr__credit">Made by <b>Ayaz</b> <i aria-hidden="true">×</i><span class="sr-only"> and </span> <b>Claude</b> <i aria-hidden="true">×</i><span class="sr-only"> and </span> <b>Codex</b></span>
    <a href="${site.repo}" target="_blank" rel="noopener noreferrer">Contribute a correction</a>
  </div>
</footer>

<div class="palette" data-palette hidden>
  <div class="palette__scrim" data-palette-close></div>
  <div class="palette__box" role="dialog" aria-modal="true" aria-label="Command palette">
    <div class="palette__inputrow">
      <span class="palette__prompt">$</span>
      <input class="palette__input" type="text" placeholder="search functions, syntax, engines, recipes…" autocomplete="off" spellcheck="false" data-palette-input aria-label="Search">
      <kbd class="palette__esc">ESC</kbd>
    </div>
    <div class="palette__filters" data-palette-filters></div>
    <div class="palette__results" data-palette-results role="listbox" aria-label="Search results"></div>
    <div class="palette__foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
      <span><kbd>↵</kbd> open</span>
      <span><kbd>TAB</kbd> filter</span>
      <span class="palette__count" data-palette-count></span>
    </div>
  </div>
</div>
<script src="/assets/app.js" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>`;
}
