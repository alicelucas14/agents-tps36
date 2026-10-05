/*
 * Search for the blog list. The pages themselves are plain HTML; this only runs when the
 * address has ?s=words, filters /blogs/search.json, and swaps the cards for the matches.
 */
(() => {
  const grid = document.getElementById('blog-grid');
  const status = document.getElementById('blog-status');
  if (!grid || !status) return;

  const query = (new URLSearchParams(window.location.search).get('s') || '').trim();
  if (!query) return;

  document.querySelectorAll('.blog-search input[name="s"]').forEach((input) => { input.value = query; });
  document.title = `Search: ${query} | ${document.title.split('|').pop().trim()}`;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const makeCard = (item) => {
    const card = el('article', 'blog-card');
    const image = el('a', item.i ? 'blog-card-image' : 'blog-card-image blog-card-image--empty');
    image.href = item.u;
    image.tabIndex = -1;
    image.setAttribute('aria-hidden', 'true');
    if (item.i) {
      const img = el('img');
      img.src = item.i;
      img.alt = '';
      img.loading = 'lazy';
      image.append(img);
    }
    const title = el('h2', 'blog-card-title');
    const link = el('a', '', item.t);
    link.href = item.u;
    title.append(link);
    const more = el('a', 'blog-card-more');
    more.href = item.u;
    more.append('Read More ', el('span', '', '→'));
    more.lastChild.setAttribute('aria-hidden', 'true');
    card.append(image, title, el('p', 'blog-card-excerpt', item.e), more);
    return card;
  };

  const showStatus = (nodes) => {
    status.replaceChildren(...nodes);
    status.hidden = false;
  };

  const backLink = () => {
    const link = el('a', '', 'Show all articles');
    link.href = '/blogs/';
    return link;
  };

  fetch('/blogs/search.json')
    .then((response) => {
      if (!response.ok) throw new Error('search data unavailable');
      return response.json();
    })
    .then((items) => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const matches = items.filter((item) => {
        const text = `${item.t} ${item.e} ${(item.g || []).join(' ')}`.toLowerCase();
        return words.every((word) => text.includes(word));
      });
      grid.replaceChildren(...matches.map(makeCard));
      const pagination = document.getElementById('blog-pagination');
      if (pagination) pagination.hidden = true;
      const summary = matches.length
        ? `${matches.length} article${matches.length === 1 ? '' : 's'} for “${query}”. `
        : `No articles match “${query}”. `;
      showStatus([document.createTextNode(summary), backLink()]);
    })
    .catch(() => showStatus([document.createTextNode('Search is not available right now. '), backLink()]));
})();
