/*
 * WordPress -> static blog pages.
 *
 * One module, no dependencies, used in two places:
 *   - the Blog section of admin.html (in the browser; pages are handed back as a .zip)
 *   - tools/blog.mjs (in Node; pages are written straight into the site folder)
 *
 * Posts come from the WordPress REST API or from a WordPress export file (Tools > Export),
 * are cleaned (page-builder markup, share widgets and scripts removed), and are turned
 * into plain HTML pages under /blogs/ that reuse the site's own header and footer.
 */

export const POSTS_DIR = 'blogs';
// Folder names the generated site already uses inside /blogs/, so a post cannot take them.
const RESERVED_SLUGS = new Set(['page', 'media']);

/* ---------- text helpers ---------- */

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»',
  bull: '•', middot: '·', times: '×', euro: '€', pound: '£', yen: '¥', deg: '°', rarr: '→', larr: '←',
};

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return match; }
    }
    return NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const stripTags = (html) => decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const slugify = (text) =>
  text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';

export function formatDate(iso) {
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric',
  });
}

const clip = (text, max) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max).replace(/\s+\S*$/, '');
  return `${cut} …`;
};

/* ---------- HTML cleaning ---------- */

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'param', 'track']);

// Removed together with everything inside them.
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'noscript', 'svg', 'form', 'button', 'input', 'textarea', 'select',
  'object', 'embed', 'template', 'head', 'title', 'canvas', 'audio', 'video', 'map', 'nav',
]);

// Plugin widgets that sit inside post content (table of contents, share buttons, related posts).
const DROP_BY_CLASS = /\b(ez-toc|lwptoc|sharedaddy|jp-relatedposts|addtoany|elementor-widget-(?:share-buttons|social-icons|post-navigation|author-box)|wp-block-embed)/i;

// Everything else is unwrapped (its text stays, the tag goes). These tags are kept, with these attributes.
const KEEP_TAGS = {
  h2: [], h3: [], h4: [], h5: [], h6: [], p: [], br: [], hr: [], ul: [], ol: ['start'], li: [], blockquote: [],
  strong: [], b: [], em: [], i: [], u: [], a: ['href', 'target', 'rel', 'title'],
  img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'title'],
  table: [], thead: [], tbody: [], tfoot: [], tr: [], th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'],
  caption: [], figure: [], figcaption: [], pre: [], code: [], sup: [], sub: [], small: [], del: [], ins: [], mark: [],
  dl: [], dt: [], dd: [],
};

const BLOCK_TAGS = new Set(['div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'center', 'address', 'details', 'summary', 'fieldset']);

const TAG_PATTERN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(ATTR_PATTERN)) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attributes[match[1].toLowerCase()] = decodeEntities(value);
  }
  return attributes;
}

const isSafeUrl = (url) => {
  const value = url.trim();
  if (!value) return false;
  if (/^(https?:|mailto:|tel:)/i.test(value)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('//');
};

function cleanSrcset(srcset) {
  return srcset
    .split(',')
    .map((candidate) => candidate.trim())
    .filter((candidate) => {
      const url = candidate.split(/\s+/)[0];
      return url && isSafeUrl(url) && /^[\w.\s-]*$/.test(candidate.slice(url.length));
    })
    .join(', ');
}

const attr = (name, value) => ` ${name}="${escapeHtml(value)}"`;

/**
 * Keeps a small set of tags and attributes, drops page-builder wrappers, widgets and anything
 * that could run script. `resolveLink` may rewrite link addresses (for example to local pages).
 */
export function sanitizeHtml(html, { resolveLink = (href) => href } = {}) {
  let out = '';
  let cursor = 0;
  const stack = [];
  let skipping = -1;

  const emit = (text) => { if (skipping < 0) out += text; };

  const openTag = (tag, attributes) => {
    if (tag === 'h1') tag = 'h2';
    if (!(tag in KEEP_TAGS)) return { tag, markup: '' };
    let markup = `<${tag}`;
    const allowed = KEEP_TAGS[tag];

    if (tag === 'a') {
      const href = attributes.href;
      if (!href || !isSafeUrl(href)) return { tag, markup: '' };
      markup += attr('href', resolveLink(href.trim()));
      if (attributes.title) markup += attr('title', attributes.title);
      if (attributes.target === '_blank') markup += ' target="_blank" rel="noopener noreferrer"';
      return { tag, markup: `${markup}>` };
    }

    if (tag === 'img') {
      const src = attributes.src;
      if (!src || !isSafeUrl(src)) return { tag, markup: null };
      markup += attr('src', src.trim());
      const srcset = attributes.srcset ? cleanSrcset(attributes.srcset) : '';
      if (srcset) markup += attr('srcset', srcset);
      if (srcset && attributes.sizes && /^[\w\s,()%.:<>=-]+$/.test(attributes.sizes)) markup += attr('sizes', attributes.sizes);
      markup += attr('alt', attributes.alt || '');
      for (const name of ['width', 'height']) if (/^\d+$/.test(attributes[name] || '')) markup += attr(name, attributes[name]);
      return { tag, markup: `${markup} loading="lazy" decoding="async">` };
    }

    for (const name of allowed) {
      const value = attributes[name];
      if (value === undefined || value === '') continue;
      if (/^(start|colspan|rowspan)$/.test(name) && !/^\d+$/.test(value)) continue;
      if (name === 'scope' && !/^(row|col|rowgroup|colgroup)$/.test(value)) continue;
      markup += attr(name, value);
    }
    return { tag, markup: `${markup}>` };
  };

  const closeOne = (entry) => {
    if (entry.emitted && skipping < 0) out += `</${entry.tag}>`;
  };

  for (const match of html.matchAll(TAG_PATTERN)) {
    emit(html.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    if (!match[2]) continue;

    const closing = match[1] === '/';
    const name = match[2].toLowerCase();

    if (!closing) {
      const attributes = parseAttributes(match[3].replace(/\/\s*$/, ''));
      const classAndId = `${attributes.class || ''} ${attributes.id || ''}`;
      const drop = DROP_WITH_CONTENT.has(name) || DROP_BY_CLASS.test(classAndId);

      if (VOID_TAGS.has(name) || /\/\s*$/.test(match[3])) {
        if (skipping < 0 && !drop) {
          if (name === 'br' || name === 'hr') out += `<${name}>`;
          else if (name === 'img') {
            const image = openTag('img', attributes);
            if (image.markup) out += image.markup;
          }
        }
        continue;
      }

      if (skipping >= 0) { stack.push({ tag: name, emitted: false }); continue; }

      if (drop) {
        stack.push({ tag: name, emitted: false });
        skipping = stack.length - 1;
        continue;
      }

      const { tag, markup } = openTag(name, attributes);
      stack.push({ tag, sourceTag: name, emitted: markup !== '' });
      if (markup) out += markup;
      else if (BLOCK_TAGS.has(name)) out += '\n';
    } else {
      let index = stack.length - 1;
      while (index >= 0 && stack[index].sourceTag !== name && stack[index].tag !== name) index -= 1;
      if (index < 0) continue;
      while (stack.length > index) {
        const entry = stack.pop();
        const wasSkipRoot = skipping === stack.length;
        closeOne(entry);
        if (wasSkipRoot) skipping = -1;
        else if (skipping < 0 && !entry.emitted && BLOCK_TAGS.has(entry.sourceTag || entry.tag)) out += '\n';
      }
    }
  }
  emit(html.slice(cursor));
  while (stack.length) closeOne(stack.pop());

  return tidy(out);
}

function tidy(html) {
  let result = html
    .replace(/<(p|h[2-6]|li|strong|b|em|i|u)>\s*(?:&nbsp;| |<br>|\s)*<\/\1>/gi, '')
    .replace(/<(p|h[2-6]|li|strong|b|em|i|u)>\s*(?:&nbsp;| |<br>|\s)*<\/\1>/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Loose text left at the top level (outside any block) becomes a paragraph.
  const blockStart = /^(<(?:p|h[2-6]|ul|ol|table|blockquote|figure|pre|hr|dl)\b)/i;
  const pieces = [];
  let depth = 0;
  let buffer = '';
  const flush = () => {
    const text = buffer.trim();
    if (text) pieces.push(blockStart.test(text) ? text : `<p>${text}</p>`);
    buffer = '';
  };
  for (const token of result.split(/(<\/?(?:p|h[2-6]|ul|ol|table|blockquote|figure|pre|dl)\b[^>]*>|<hr>)/gi)) {
    if (!token) continue;
    const opens = /^<(p|h[2-6]|ul|ol|table|blockquote|figure|pre|dl)\b/i.test(token);
    const closes = /^<\/(p|h[2-6]|ul|ol|table|blockquote|figure|pre|dl)>/i.test(token);
    if (/^<hr>$/i.test(token) && depth === 0) { flush(); pieces.push(token); continue; }
    if (opens && depth === 0) flush();
    if (opens) depth += 1;
    buffer += token;
    if (closes) { depth = Math.max(0, depth - 1); if (depth === 0) flush(); }
  }
  flush();
  result = pieces.join('\n');
  return result;
}

/** Gives headings anchors and (for longer posts) a table of contents before the first heading. */
export function addStructure(html, { toc = true } = {}) {
  const used = new Set();
  const entries = [];
  const withIds = html.replace(/<h([2-6])>([\s\S]*?)<\/h\1>/gi, (full, level, inner) => {
    const text = stripTags(inner);
    if (!text) return '';
    let id = slugify(text).slice(0, 60);
    let unique = id;
    for (let n = 2; used.has(unique); n += 1) unique = `${id}-${n}`;
    used.add(unique);
    if (level === '2' || level === '3') entries.push({ level: Number(level), text, id: unique });
    return `<h${level} id="${unique}">${inner}</h${level}>`;
  });

  // Same rule WordPress's table-of-contents plugin used: worth showing from four headings up.
  if (!toc || entries.length < 4) return withIds;

  let list = '';
  let inSub = false;
  let seenTop = false;
  entries.forEach((entry) => {
    const isTop = entry.level === 2 || !seenTop; // an h3 before any h2 counts as a top-level entry
    const item = `<a href="#${entry.id}">${escapeHtml(entry.text)}</a>`;
    if (isTop) {
      if (inSub) list += '</ul></li>';
      else if (seenTop) list += '</li>';
      list += `<li>${item}`;
      inSub = false;
      seenTop = true;
    } else {
      if (!inSub) { list += '<ul>'; inSub = true; }
      list += `<li>${item}</li>`;
    }
  });
  list += inSub ? '</ul></li>' : '</li>';
  const contents = `<details class="toc" open><summary>Table of Contents</summary><ol>${list}</ol></details>`;
  const first = withIds.search(/<h[2-6]\b/i);
  return first < 0 ? withIds : `${withIds.slice(0, first)}${contents}\n${withIds.slice(first)}`;
}

/* ---------- reading posts from WordPress ---------- */

/** Reads every published post from a WordPress site's REST API. */
export async function fetchWpPosts(address, { fetchImpl = globalThis.fetch, onProgress } = {}) {
  let base = address.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  base = base.replace(/\/wp-json.*$/, '');

  const posts = [];
  let total = 1;
  for (let page = 1; page <= total; page += 1) {
    const response = await fetchImpl(`${base}/wp-json/wp/v2/posts?per_page=100&page=${page}&_embed=1&orderby=date&order=desc`, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(90000) : undefined,
    });
    if (!response.ok) {
      if (response.status === 400 && page > 1) break;
      throw new Error(response.status === 404
        ? 'That address does not look like a WordPress site (no REST API found).'
        : `The site answered with an error (${response.status}).`);
    }
    total = Number(response.headers.get('X-WP-TotalPages')) || 1;
    posts.push(...(await response.json()));
    onProgress?.({ loaded: posts.length, total: Number(response.headers.get('X-WP-Total')) || posts.length });
  }
  return { origin: new URL(base).origin, posts: posts.map(fromRestPost).filter(Boolean) };
}

function fromRestPost(post) {
  if (post.status && post.status !== 'publish') return null;
  const embedded = post._embedded || {};
  const terms = (embedded['wp:term'] || []).flat();
  const featured = (embedded['wp:featuredmedia'] || [])[0];
  return {
    id: post.id,
    slug: post.slug,
    title: stripTags(post.title?.rendered || ''),
    date: post.date,
    modified: post.modified || post.date,
    excerptHtml: post.excerpt?.rendered || '',
    contentHtml: post.content?.rendered || '',
    categories: terms.filter((t) => t.taxonomy === 'category').map((t) => decodeEntities(t.name)),
    tags: terms.filter((t) => t.taxonomy === 'post_tag').map((t) => decodeEntities(t.name)),
    author: embedded.author?.[0]?.name || '',
    featured: featured?.source_url ? { src: featured.source_url, alt: featured.alt_text || '' } : null,
  };
}

/* WordPress export files (Tools > Export). Content there is the raw editor text, so paragraphs are rebuilt. */

const xmlTag = (block, tag) => {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  if (!match) return '';
  const cdata = match[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : decodeEntities(match[1]);
};

function wpAutoParagraphs(text) {
  const cleaned = text
    .replace(/<!--[\s\S]*?-->/g, '')
    // [caption] wraps an image and its caption text
    .replace(/\[caption[^\]]*\]\s*((?:<a\b[^>]*>\s*)?<img\b[^>]*>(?:\s*<\/a>)?)([\s\S]*?)\[\/caption\]/g,
      (match, image, caption) => `<figure>${image}${caption.trim() ? `<figcaption>${caption.trim()}</figcaption>` : ''}</figure>`)
    .replace(/\[\/?[a-z_][\w-]*(?:\s[^\]]*)?\]/gi, '');

  // Like WordPress itself: blank lines separate paragraphs, single line breaks become <br>.
  const blockStart = /^<(?:p|h[1-6]|ul|ol|li|table|blockquote|figure|pre|hr|div|section|dl|details)\b/i;
  return cleaned
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => (blockStart.test(chunk) ? chunk : `<p>${chunk.replace(/\n/g, '<br>')}</p>`))
    .join('\n');
}

export function parseWxr(xml) {
  if (!/<rss[\s>]/.test(xml) || !/<wp:wxr_version>/.test(xml)) {
    throw new Error('That file is not a WordPress export. In WordPress choose Tools → Export → Posts and download the .xml file.');
  }
  const origin = (xmlTag(xml, 'wp:base_site_url') || xmlTag(xml, 'link') || '').replace(/\/+$/, '');
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  const attachments = new Map();
  for (const item of items) {
    if (xmlTag(item, 'wp:post_type') === 'attachment') attachments.set(xmlTag(item, 'wp:post_id'), xmlTag(item, 'wp:attachment_url'));
  }

  const posts = [];
  for (const item of items) {
    if (xmlTag(item, 'wp:post_type') !== 'post' || xmlTag(item, 'wp:status') !== 'publish') continue;
    const categories = [];
    const tags = [];
    for (const term of item.matchAll(/<category domain="(category|post_tag)"[^>]*>([\s\S]*?)<\/category>/g)) {
      const cdata = term[2].match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
      (term[1] === 'category' ? categories : tags).push(decodeEntities(cdata ? cdata[1] : term[2]));
    }
    const thumbnail = item.match(/<wp:meta_key>\s*(?:<!\[CDATA\[)?_thumbnail_id(?:\]\]>)?\s*<\/wp:meta_key>\s*<wp:meta_value>\s*(?:<!\[CDATA\[)?(\d+)/);
    const featuredSrc = thumbnail && attachments.get(thumbnail[1]);
    const date = xmlTag(item, 'wp:post_date');
    posts.push({
      id: Number(xmlTag(item, 'wp:post_id')) || undefined,
      slug: xmlTag(item, 'wp:post_name') || slugify(stripTags(xmlTag(item, 'title'))),
      title: stripTags(xmlTag(item, 'title')),
      date: date.replace(' ', 'T'),
      modified: (xmlTag(item, 'wp:post_modified') || date).replace(' ', 'T'),
      excerptHtml: xmlTag(item, 'excerpt:encoded'),
      contentHtml: wpAutoParagraphs(xmlTag(item, 'content:encoded')),
      categories, tags,
      author: '',
      featured: featuredSrc ? { src: featuredSrc, alt: '' } : null,
    });
  }
  return { origin, posts };
}

/* ---------- turning raw posts into clean posts ---------- */

export function preparePosts(rawPosts, { origin = '', toc = true } = {}) {
  const taken = new Set();
  const posts = rawPosts
    .filter((raw) => raw.slug && raw.title)
    .map((raw) => {
      let slug = raw.slug;
      if (RESERVED_SLUGS.has(slug)) slug = `${slug}-post`;
      while (taken.has(slug)) slug = `${slug}-2`;
      taken.add(slug);
      return { raw, slug };
    });
  const known = new Set(posts.map((p) => p.slug));
  const originUrl = origin ? new URL(origin) : null;

  // Links to other posts on the old site become links to the new pages.
  const resolveLink = (href) => {
    if (href.startsWith('#') || !originUrl) return href;
    try {
      const url = new URL(href, `${originUrl.origin}/`);
      if (url.origin !== originUrl.origin) return href;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length === 1 && known.has(parts[0])) return `/${POSTS_DIR}/${parts[0]}/${url.hash}`;
      if (parts.length === 1 && parts[0] === POSTS_DIR) return `/${POSTS_DIR}/`;
      return url.href;
    } catch {
      return href;
    }
  };

  return posts
    .map(({ raw, slug }) => {
      const html = addStructure(sanitizeHtml(raw.contentHtml, { resolveLink }), { toc });
      const imageTag = html.match(/<img\b[^>]*>/i)?.[0] || '';
      const firstSrc = imageTag.match(/\ssrc="([^"]*)"/)?.[1];
      const firstAlt = imageTag.match(/\salt="([^"]*)"/)?.[1] || '';
      const image = raw.featured || (firstSrc ? { src: decodeEntities(firstSrc), alt: decodeEntities(firstAlt) } : null);
      const excerptText = stripTags(raw.excerptHtml).replace(/\s*(\[…\]|\[&hellip;\]|Read more.*)$/i, '').trim()
        || stripTags(html.match(/<p>[\s\S]*?<\/p>/i)?.[0] || '');
      return {
        id: raw.id,
        slug,
        originalSlug: raw.slug,
        title: raw.title,
        date: raw.date,
        modified: raw.modified,
        excerpt: clip(excerptText, 220),
        html,
        image: image ? { src: image.src, alt: image.alt || '' } : null,
        category: raw.categories[0] || 'Blog',
        tags: raw.tags,
        author: raw.author || '',
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* ---------- pages ---------- */

/** Pulls the header, footer and font link out of index.html, so blog pages always match the site. */
export function extractChrome(indexHtml) {
  const block = (tag, cls) => {
    const start = indexHtml.search(new RegExp(`<${tag}\\s+class="${cls}"`));
    const end = indexHtml.indexOf(`</${tag}>`, start);
    if (start < 0 || end < 0) throw new Error(`Could not find the site ${cls} in index.html.`);
    return indexHtml.slice(start, end + tag.length + 3);
  };
  const fonts = indexHtml.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/);
  // The floating social icons are optional: an index.html without them just gives blog pages none.
  const sidebarStart = indexHtml.search(/<nav\s+class="social-bar"/);
  const sidebarEnd = sidebarStart < 0 ? -1 : indexHtml.indexOf('</nav>', sidebarStart);
  return {
    // Home-page anchors in the header must lead back to the home page from here.
    header: block('header', 'site-header').replace(/href="#([^"]*)"/g, (m, hash) => `href="/${hash ? `#${hash}` : ''}"`),
    footer: block('footer', 'site-footer'),
    sidebar: sidebarEnd < 0 ? '' : indexHtml.slice(sidebarStart, sidebarEnd + '</nav>'.length),
    fonts: fonts ? fonts[0] : '',
  };
}

const jsonForScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function pageShell({ title, description, canonical, image, type = 'website', jsonLd, chrome, body }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : ''}
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : ''}
    ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />\n    <meta name="twitter:card" content="summary_large_image" />` : '<meta name="twitter:card" content="summary" />'}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    ${chrome.fonts}
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/blog.css" />
    ${jsonLd ? `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>` : ''}
  </head>
  <body class="blog-page" data-keep-title>
${chrome.header}

${body}

${chrome.footer}
${chrome.sidebar ? `\n    ${chrome.sidebar}\n` : ''}
    <script src="/content.js"></script>
    <script src="/content-lib.js"></script>
    <script src="/script.js"></script>
    <script src="/blog.js"></script>
  </body>
</html>
`;
}

const postUrl = (post) => `/${POSTS_DIR}/${post.slug}/`;
const pageUrl = (page) => (page <= 1 ? `/${POSTS_DIR}/` : `/${POSTS_DIR}/page/${page}/`);

const searchForm = (idSuffix) => `<form class="blog-search" role="search" action="/${POSTS_DIR}/" method="get">
        <label class="visually-hidden" for="blog-search-${idSuffix}">Search articles</label>
        <input id="blog-search-${idSuffix}" type="search" name="s" placeholder="Search articles" autocomplete="off" />
        <button type="submit">Search</button>
      </form>`;

function card(post) {
  const image = post.image
    ? `<a class="blog-card-image" href="${postUrl(post)}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(post.image.src)}" alt="" loading="lazy" decoding="async" /></a>`
    : `<a class="blog-card-image blog-card-image--empty" href="${postUrl(post)}" tabindex="-1" aria-hidden="true"></a>`;
  return `<article class="blog-card">
        ${image}
        <h2 class="blog-card-title"><a href="${postUrl(post)}">${escapeHtml(post.title)}</a></h2>
        <p class="blog-card-excerpt">${escapeHtml(post.excerpt)}</p>
        <a class="blog-card-more" href="${postUrl(post)}" aria-label="Read more: ${escapeHtml(post.title)}">Read More <span aria-hidden="true">→</span></a>
      </article>`;
}

function pagination(page, pages) {
  if (pages <= 1) return '';
  const shown = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 2) shown.add(3);
  if (page >= pages - 1) shown.add(pages - 2);
  const items = [];
  let previous = 0;
  for (let n = 1; n <= pages; n += 1) {
    if (!shown.has(n)) continue;
    if (n - previous > 1) items.push('<span class="pagination-gap" aria-hidden="true">…</span>');
    items.push(n === page ? `<span class="pagination-current" aria-current="page">${n}</span>` : `<a href="${pageUrl(n)}">${n}</a>`);
    previous = n;
  }
  return `<nav class="pagination" aria-label="Blog pages">
      ${page > 1 ? `<a class="pagination-step" rel="prev" href="${pageUrl(page - 1)}">← Previous</a>` : ''}
      ${items.join('\n      ')}
      ${page < pages ? `<a class="pagination-step" rel="next" href="${pageUrl(page + 1)}">Next →</a>` : ''}
    </nav>`;
}

/**
 * Builds every blog file. Returns [{ path, content }] with paths relative to the site folder.
 * settings: { title, perPage, author }.
 */
export function buildBlogFiles(posts, { settings, siteUrl = '', chrome, siteName = 'Teen Patti Stars', meta = {} }) {
  const title = settings.title || 'Blogs';
  const perPage = Math.max(1, Math.min(48, Number(settings.perPage) || 9));
  const site = siteUrl.replace(/\/+$/, '');
  const abs = (path) => (site ? `${site}${path}` : '');
  const files = [];
  const pages = Math.max(1, Math.ceil(posts.length / perPage));
  // WordPress keeps author names private, so posts without one use the byline from the settings.
  const authorOf = (post) => post.author || settings.author || '';

  // Listing pages
  for (let page = 1; page <= pages; page += 1) {
    const slice = posts.slice((page - 1) * perPage, page * perPage);
    const heading = page === 1 ? title : `${title} – Page ${page}`;
    const body = `    <main class="blog-main">
      <div class="blog-head">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">›</span><span aria-current="page">${escapeHtml(title)}</span></nav>
        <div class="blog-head-row">
          <h1 id="blog-heading">${escapeHtml(title)}</h1>
          ${searchForm('list')}
        </div>
      </div>
      <p class="blog-status" id="blog-status" role="status" hidden></p>
      <div class="blog-grid" id="blog-grid">
      ${slice.map(card).join('\n      ')}
      </div>
      <div id="blog-pagination">${pagination(page, pages)}</div>
    </main>`;
    files.push({
      path: page === 1 ? `${POSTS_DIR}/index.html` : `${POSTS_DIR}/page/${page}/index.html`,
      content: pageShell({
        title: `${heading} | ${siteName}`,
        description: `${title} from ${siteName}: guides, tips and news for Teen Patti players and agents.`,
        canonical: abs(pageUrl(page)),
        chrome, body,
      }),
    });
  }

  // Post pages
  const recent = posts.slice(0, 5);
  posts.forEach((post, index) => {
    const newer = posts[index - 1];
    const older = posts[index + 1];
    const url = abs(postUrl(post));
    const metaLine = [
      `<time datetime="${escapeHtml(post.date.slice(0, 10))}">${escapeHtml(formatDate(post.date))}</time>`,
      authorOf(post) ? `<span>by ${escapeHtml(authorOf(post))}</span>` : '',
      post.category ? `<span>${escapeHtml(post.category)}</span>` : '',
    ].filter(Boolean).join('<span class="post-meta-dot" aria-hidden="true">·</span>');
    const body = `    <main class="blog-main">
      <div class="post-layout">
        <article class="post">
          <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">›</span><a href="/${POSTS_DIR}/">${escapeHtml(title)}</a><span aria-hidden="true">›</span><span aria-current="page">${escapeHtml(clip(post.title, 60))}</span></nav>
          <h1 class="post-title">${escapeHtml(post.title)}</h1>
          <p class="post-meta">${metaLine}</p>
          <div class="post-content">
${post.html}
          </div>
          ${post.tags.length ? `<p class="post-tags"><span class="visually-hidden">Tags:</span> ${post.tags.map((tag) => `<a href="/${POSTS_DIR}/?s=${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`).join(' ')}</p>` : ''}
          <nav class="post-nav" aria-label="More posts">
            ${older ? `<a class="post-nav-older" rel="prev" href="${postUrl(older)}"><span>← Older</span>${escapeHtml(older.title)}</a>` : '<span></span>'}
            ${newer ? `<a class="post-nav-newer" rel="next" href="${postUrl(newer)}"><span>Newer →</span>${escapeHtml(newer.title)}</a>` : '<span></span>'}
          </nav>
        </article>
        <aside class="sidebar" aria-label="Sidebar">
          <section class="widget">
            <h2 class="widget-title">Search</h2>
            ${searchForm('side')}
          </section>
          <section class="widget">
            <h2 class="widget-title">Recent Posts</h2>
            <ul class="widget-list">
              ${recent.map((r) => `<li><a href="${postUrl(r)}">${escapeHtml(r.title)}</a></li>`).join('\n              ')}
            </ul>
          </section>
        </aside>
      </div>
    </main>`;
    const description = clip(post.excerpt || stripTags(post.html), 158);
    files.push({
      path: `${POSTS_DIR}/${post.slug}/index.html`,
      content: pageShell({
        title: `${post.title} | ${siteName}`,
        description,
        canonical: url,
        image: post.image && /^https?:/i.test(post.image.src) ? post.image.src : post.image && site ? `${site}${post.image.src}` : '',
        type: 'article',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          datePublished: post.date,
          dateModified: post.modified || post.date,
          ...(authorOf(post) ? { author: { '@type': 'Person', name: authorOf(post) } } : {}),
          publisher: { '@type': 'Organization', name: siteName },
          ...(url ? { mainEntityOfPage: url } : {}),
          ...(post.image && /^https?:/i.test(post.image.src) ? { image: post.image.src } : {}),
        },
        chrome, body,
      }),
    });
  });

  // Data for search, and for rebuilding later without fetching again
  files.push({
    path: `${POSTS_DIR}/search.json`,
    content: JSON.stringify(posts.map((p) => ({ t: p.title, u: postUrl(p), e: p.excerpt, i: p.image ? p.image.src : '', g: p.tags }))),
  });
  files.push({
    path: `${POSTS_DIR}/posts.json`,
    content: JSON.stringify({ importedAt: meta.importedAt || new Date().toISOString(), source: meta.source || '', origin: meta.origin || '', posts }),
  });

  // For search engines, and for pointing the old WordPress addresses at the new pages
  const urls = [abs(`/${POSTS_DIR}/`), ...posts.map((p) => abs(postUrl(p)))];
  if (site) {
    files.push({
      path: `${POSTS_DIR}/sitemap.xml`,
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((loc, i) => `  <url><loc>${escapeHtml(loc)}</loc>${i > 0 ? `<lastmod>${escapeHtml((posts[i - 1].modified || posts[i - 1].date).slice(0, 10))}</lastmod>` : ''}</url>`)
        .join('\n')}\n</urlset>\n`,
    });
  }
  files.push({
    path: `${POSTS_DIR}/redirects.txt`,
    content: `# Old WordPress address -> new page (permanent redirect). Works as a Netlify _redirects file;\n# for Apache or nginx, turn each line into a 301 rule.\n${posts
      .filter((p) => p.originalSlug)
      .map((p) => `/${p.originalSlug}/ ${postUrl(p)} 301`)
      .join('\n')}\n`,
  });
  return files;
}

/* ---------- zip (no compression), so the admin page can hand back a folder ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

export function makeZip(files, now = new Date()) {
  const encoder = new TextEncoder();
  const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, date, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
