document.addEventListener('DOMContentLoaded', () => {
  const { load, safeUrl, format, DRAFT_KEY } = window.SiteContent;

  // Blog pages reuse this script for the shared header and footer.
  const onHome = Boolean(document.querySelector('.hero'));

  const get = (obj, path) => path.split('.').reduce((node, key) => (node == null ? node : node[key]), obj);

  // A link to a section of the home page can be a plain #anchor or a clean address such as /agency-plan/.
  // The sections that have a clean address carry a data-permalink attribute in index.html.
  const permalinkOf = (pathname) => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return '';
    let name = parts[0];
    try { name = decodeURIComponent(name); } catch { return ''; }
    return Array.from(document.querySelectorAll('main [data-permalink]')).some((node) => node.id === name) ? name : '';
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  // Social icons: Font Awesome Free by @fontawesome (https://fontawesome.com), CC BY 4.0.
  // (6.5.2, except the plain Telegram plane, which is 5.15.4.)
  // Each entry is [viewBox, path].
  const ICONS = {
    facebook: ['0 0 320 512', 'M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5c16.3 0 29.4 .4 37 1.2V7.9C291.4 4 256.4 0 236.2 0C129.3 0 80 50.5 80 159.4v42.1H14v97.8H80z'],
    twitter: ['0 0 512 512', 'M459.37 151.716c.325 4.548.325 9.097.325 13.645 0 138.72-105.583 298.558-298.558 298.558-59.452 0-114.68-17.219-161.137-47.106 8.447.974 16.568 1.299 25.34 1.299 49.055 0 94.213-16.568 130.274-44.832-46.132-.975-84.792-31.188-98.112-72.772 6.498.974 12.995 1.624 19.818 1.624 9.421 0 18.843-1.3 27.614-3.573-48.081-9.747-84.143-51.98-84.143-102.985v-1.299c13.969 7.797 30.214 12.67 47.431 13.319-28.264-18.843-46.781-51.005-46.781-87.391 0-19.492 5.197-37.36 14.294-52.954 51.655 63.675 129.3 105.258 216.365 109.807-1.624-7.797-2.599-15.918-2.599-24.04 0-57.828 46.782-104.934 104.934-104.934 30.213 0 57.502 12.67 76.67 33.137 23.715-4.548 46.456-13.32 66.599-25.34-7.798 24.366-24.366 44.833-46.132 57.827 21.117-2.273 41.584-8.122 60.426-16.243-14.292 20.791-32.161 39.308-52.628 54.253z'],
    telegram: ['0 0 448 512', 'M446.7 98.6l-67.6 318.8c-5.1 22.5-18.4 28.1-37.3 17.5l-103-75.9-49.7 47.8c-5.5 5.5-10.1 10.1-20.7 10.1l7.4-104.9 190.9-172.5c8.3-7.4-1.8-11.5-12.9-4.1L117.8 284 16.2 252.2c-22.1-6.9-22.5-22.1 4.6-32.7L418.2 66.4c18.4-6.9 34.5 4.1 28.5 32.2z'],
    whatsapp: ['0 0 448 512', 'M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z'],
    instagram: ['0 0 448 512', 'M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z'],
    youtube: ['0 0 576 512', 'M549.655 124.083c-6.281-23.65-24.787-42.276-48.284-48.597C458.781 64 288 64 288 64S117.22 64 74.629 75.486c-23.497 6.322-42.003 24.947-48.284 48.597-11.412 42.867-11.412 132.305-11.412 132.305s0 89.438 11.412 132.305c6.281 23.65 24.787 41.5 48.284 47.821C117.22 448 288 448 288 448s170.78 0 213.371-11.486c23.497-6.321 42.003-24.171 48.284-47.821 11.412-42.867 11.412-132.305 11.412-132.305s0-89.438-11.412-132.305zm-317.51 213.508V175.185l142.739 81.205-142.739 81.201z'],
  };

  const makeIcon = ([viewBox, path]) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    svg.append(shape);
    return svg;
  };

  const renderers = {
    menu: (items) =>
      items.map((item) => {
        const link = el('a', '', item.label);
        const href = safeUrl(item.url) || '#';
        // Home-page sections are reached through the home page from anywhere else.
        link.href = !onHome && href.startsWith('#') ? `/${href}` : href;
        link.dataset.text = item.label;
        return link;
      }),

    'footer.disclaimer': (items, content) => items.map((item) => el('p', '', format(item.text, content))),

    'footer.links': (items) =>
      items.map((item) => {
        const link = el('a', '', item.label);
        link.href = safeUrl(item.url) || '#';
        return link;
      }),

    'footer.social': (items) =>
      items.map((item) => {
        const link = el('a');
        link.href = safeUrl(item.url) || '#';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        if (ICONS[item.icon]) link.append(makeIcon(ICONS[item.icon]));
        link.append(el('span', '', item.label));
        return link;
      }),

    // The floating sidebar: items without a link are left out, so clearing a link hides that icon.
    'socialBar.items': (items) =>
      items
        .filter((item) => safeUrl(item.url))
        .map((item) => {
          const link = el('a');
          link.href = safeUrl(item.url);
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.title = item.label;
          link.dataset.network = item.icon;
          if (ICONS[item.icon]) link.append(makeIcon(ICONS[item.icon]));
          link.append(el('span', '', item.label));
          return link;
        }),

    features: (items, content) =>
      items.map((item) => {
        const card = el('article', 'stat-card feature-card');
        card.append(
          el('div', 'icon-wrap', item.icon),
          el('h2', '', format(item.title, content)),
          el('p', '', format(item.text, content))
        );
        return card;
      }),

    // Install guide: a phone screenshot with its numbered caption. Numbers follow the order.
    'steps.items': (items, content) =>
      items.map((item, index) => {
        const slide = el('figure', 'install-slide');
        slide.setAttribute('role', 'group');
        slide.setAttribute('aria-roledescription', 'slide');
        slide.setAttribute('aria-label', `${index + 1} of ${items.length}`);
        const img = el('img');
        img.src = safeUrl(item.image);
        img.alt = format(item.alt, content);
        slide.append(img, el('figcaption', '', `${index + 1}. ${format(item.text, content)}`));
        return slide;
      }),

    'agencyPlan.highlights': (items, content) =>
      items.map((item) => {
        const box = el('div', 'plan-highlight');
        const img = el('img');
        img.src = safeUrl(item.image);
        img.alt = format(item.alt, content);
        box.append(img, el('p', '', format(item.text, content)));
        return box;
      }),

    'agencyPlan.steps': (items, content) =>
      items.map((item) => {
        const row = el('li');
        row.append(el('strong', '', format(item.label, content)), ` ${format(item.text, content)}`);
        return row;
      }),

    'agencyPlan.notes': (items, content) => items.map((item) => el('p', '', format(item.text, content))),

    'bigAgent.items': (items, content) =>
      items.map((item) => {
        const card = el('article', 'agent-card');
        const img = el('img');
        img.src = safeUrl(item.image);
        img.alt = format(item.alt, content);
        card.append(img, el('h3', '', format(item.title, content)), el('p', '', format(item.text, content)));
        return card;
      }),

    'agencyBenefit.items': (items, content) => {
      // Re-rendering after an admin edit must not close the items the reader has open.
      const wasOpen = Array.from(document.querySelectorAll('[data-list="agencyBenefit.items"] details'), (node) => node.open);
      return items.map((item, index) => {
        const row = el('details', 'benefit-item');
        row.open = Boolean(wasOpen[index]);
        const body = el('div', 'benefit-body');
        format(item.text, content).split(/\n+/).filter(Boolean).forEach((line) => body.append(el('p', '', line)));
        row.append(el('summary', '', format(item.title, content)), body);
        return row;
      });
    },

    'partners.items': (items, content) =>
      items.map((item) => {
        const img = el('img');
        img.src = safeUrl(item.image);
        img.alt = format(item.name, content);
        return img;
      }),
  };

  function render() {
    const content = load();

    if (!document.body.hasAttribute('data-keep-title')) {
      document.title = format(content.seo.title, content);
      const description = document.querySelector('meta[name="description"]');
      if (description) description.setAttribute('content', format(content.seo.description, content));
    }

    document.querySelectorAll('[data-bind]').forEach((node) => {
      node.textContent = format(get(content, node.dataset.bind), content);
    });

    document.querySelectorAll('[data-href]').forEach((node) => {
      node.setAttribute('href', safeUrl(get(content, node.dataset.href)) || '#');
    });

    document.querySelectorAll('[data-src]').forEach((node) => {
      node.setAttribute('src', safeUrl(get(content, node.dataset.src)));
    });

    document.querySelectorAll('[data-alt]').forEach((node) => {
      node.setAttribute('alt', format(get(content, node.dataset.alt), content));
    });

    document.querySelectorAll('[data-list]').forEach((container) => {
      const items = get(content, container.dataset.list);
      container.replaceChildren(...renderers[container.dataset.list](items, content));
      container.hidden = items.length === 0;
    });

    document.querySelectorAll('[data-carousel]').forEach((root) => {
      buildCarousel(root, get(content, root.dataset.carousel));
    });

    document.querySelectorAll('.install-carousel').forEach(setupInstallDots);

    updateCurrentLink();
  }

  // Install guide: the slides sit in a row that scrolls sideways, so swiping, trackpads and the
  // arrow keys all work without any script. The dots only jump a whole page (as many slides as fit).
  function setupInstallDots(root) {
    const viewport = root.querySelector('.install-viewport');
    const dotsBox = root.querySelector('.install-dots');
    const slideWidth = () => (viewport.firstElementChild ? viewport.firstElementChild.offsetWidth : 0);
    const perView = () => (slideWidth() ? Math.max(1, Math.round(viewport.clientWidth / slideWidth())) : 1);
    const pageCount = () => Math.ceil(viewport.children.length / perView());
    const currentPage = () => {
      const page = slideWidth() * perView();
      return page ? Math.min(pageCount() - 1, Math.round(viewport.scrollLeft / page)) : 0;
    };

    const markDots = () => {
      const now = currentPage();
      Array.from(dotsBox.children).forEach((dot, i) => {
        if (i === now) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    };

    const buildDots = () => {
      const pages = pageCount();
      const per = perView();
      const total = viewport.children.length;
      dotsBox.hidden = pages < 2;
      dotsBox.replaceChildren(
        ...Array.from({ length: pages < 2 ? 0 : pages }, (_, i) => {
          const dot = el('button', 'install-dot');
          dot.type = 'button';
          const first = i * per + 1;
          const last = Math.min(total, first + per - 1);
          dot.setAttribute('aria-label', first === last ? `Show step ${first}` : `Show steps ${first} to ${last}`);
          dot.addEventListener('click', () => {
            viewport.scrollTo({ left: i * slideWidth() * per, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
          });
          return dot;
        })
      );
      markDots();
    };

    // Editing in the admin rebuilds the slides; keep the reader where they were.
    if (root.dataset.scroll) viewport.scrollLeft = Number(root.dataset.scroll);
    buildDots();

    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    let frame = 0;
    viewport.addEventListener('scroll', () => {
      root.dataset.scroll = String(viewport.scrollLeft);
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        markDots();
      });
    }, { passive: true });
    // The number of slides per page changes with the window width.
    if ('ResizeObserver' in window) new ResizeObserver(buildDots).observe(viewport);
    else window.addEventListener('resize', buildDots);
  }

  // Autoplaying banner slider: slides in from the right every 5s, loops without a rewind,
  // pauses on hover or focus, and also moves with dots and swipes.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function buildCarousel(root, slides) {
    // Re-rendering with the same slides (e.g. an unrelated admin edit) must not restart the slider.
    const key = JSON.stringify(slides);
    if (root.dataset.slidesKey === key) return;
    root.dataset.slidesKey = key;
    if (root.teardown) root.teardown();

    const viewport = root.querySelector('.slider-viewport');
    const track = root.querySelector('.slider-track');
    const dotsBox = root.querySelector('.slider-dots');
    const count = slides.length;
    root.hidden = count === 0;
    track.replaceChildren();
    dotsBox.replaceChildren();
    root.teardown = null;
    if (!count) return;

    const makeSlide = (slide, number, isClone) => {
      const node = el('div', 'slider-slide');
      const img = el('img');
      img.src = safeUrl(slide.image);
      img.alt = isClone ? '' : slide.alt;
      img.draggable = false;
      node.setAttribute('role', 'group');
      node.setAttribute('aria-roledescription', 'slide');
      node.setAttribute('aria-label', `${number} of ${count}`);
      if (isClone) node.setAttribute('aria-hidden', 'true');
      node.append(img);
      return node;
    };

    // Looping uses a clone of the last slide in front and of the first slide behind,
    // so the slider can keep moving in one direction and jump back unseen.
    const loop = count > 1 && !reducedMotion.matches;
    const nodes = slides.map((slide, i) => makeSlide(slide, i + 1, false));
    if (loop) {
      nodes.unshift(makeSlide(slides[count - 1], count, true));
      nodes.push(makeSlide(slides[0], 1, true));
    }
    track.append(...nodes);

    const dots = count > 1
      ? slides.map((_, i) => {
          const dot = el('button', 'slider-dot');
          dot.type = 'button';
          dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
          dotsBox.append(dot);
          return dot;
        })
      : [];

    const controller = new AbortController();
    const { signal } = controller;
    let index = 0;
    let position = loop ? 1 : 0;
    let busy = false;
    let paused = false;
    let autoplay = 0;
    let settle = 0;

    const place = (animate) => {
      track.style.transition = animate ? '' : 'none';
      track.style.transform = `translateX(${-position * 100}%)`;
    };

    const markDots = () => {
      dots.forEach((dot, i) => {
        if (i === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    };

    function goTo(target) {
      if (busy || count < 2) return;
      index = (target + count) % count;
      if (loop && target < 0) position = 0;
      else if (loop && target >= count) position = count + 1;
      else position = target + (loop ? 1 : 0);
      place(!reducedMotion.matches);
      markDots();
      if (!loop) return;
      busy = true;
      settle = window.setTimeout(() => {
        if (position === 0) position = count;
        else if (position === count + 1) position = 1;
        place(false);
        busy = false;
      }, 520);
    }

    const step = (delta) => {
      const target = index + delta;
      goTo(loop ? target : (target + count) % count);
    };

    const startAutoplay = () => {
      window.clearInterval(autoplay);
      if (count < 2 || reducedMotion.matches) return;
      autoplay = window.setInterval(() => {
        if (!paused && !document.hidden) step(1);
      }, 5000);
    };

    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        goTo(i);
        startAutoplay();
      }, { signal });
    });

    let swipeStart = null;
    viewport.addEventListener('pointerdown', (event) => { swipeStart = event.clientX; }, { signal });
    viewport.addEventListener('pointercancel', () => { swipeStart = null; }, { signal });
    viewport.addEventListener('pointerup', (event) => {
      if (swipeStart === null) return;
      const distance = event.clientX - swipeStart;
      swipeStart = null;
      if (Math.abs(distance) < 40) return;
      step(distance < 0 ? 1 : -1);
      startAutoplay();
    }, { signal });

    root.addEventListener('mouseenter', () => { paused = true; }, { signal });
    root.addEventListener('mouseleave', () => { paused = false; }, { signal });
    root.addEventListener('focusin', () => { paused = true; }, { signal });
    root.addEventListener('focusout', () => { paused = false; }, { signal });

    root.teardown = () => {
      controller.abort();
      window.clearInterval(autoplay);
      window.clearTimeout(settle);
    };

    place(false);
    markDots();
    startAutoplay();
  }

  // Bold the menu link for the section being read. Links that leave the page never match,
  // so the first link stays current until a linked section scrolls into view.
  // The menu link the visitor just chose stays current while its section is on screen, until
  // they scroll by hand. Without this, a short page that cannot scroll any further would
  // highlight a section further down instead of the one they asked for.
  let pinnedLink = null;

  const sectionFor = (link) => {
    const href = link.getAttribute('href');
    if (!href) return null;
    if (href[0] === '#') return href.length > 1 ? document.getElementById(decodeURIComponent(href.slice(1))) : null;
    try {
      const url = new URL(link.href);
      const id = url.origin === location.origin && !url.hash ? permalinkOf(url.pathname) : '';
      return id ? document.getElementById(id) : null;
    } catch {
      return null;
    }
  };

  function updateCurrentLink() {
    const links = Array.from(document.querySelectorAll('.site-menu a'));
    if (!links.length) return;
    if (!onHome) {
      links.forEach((link) => link.removeAttribute('aria-current'));
      return;
    }

    const headerHeight = document.querySelector('.site-header').offsetHeight;
    const line = headerHeight + 40;
    // Sections near the end of the page can never scroll up to the header, so at the
    // bottom the lowest linked section on screen counts as the one being read.
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    let current = links[0];
    let nearest = -Infinity;

    links.forEach((link) => {
      const section = sectionFor(link);
      if (!section) return;
      const top = section.getBoundingClientRect().top;
      const reached = atBottom ? top < window.innerHeight : top <= line;
      if (reached && top > nearest) {
        nearest = top;
        current = link;
      }
    });

    if (pinnedLink) {
      const section = links.includes(pinnedLink) ? sectionFor(pinnedLink) : null;
      const box = section && section.getBoundingClientRect();
      if (box && box.top < window.innerHeight && box.bottom > headerHeight) current = pinnedLink;
      else pinnedLink = null;
    }

    links.forEach((link) => {
      if (link === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  render();

  // Opening an address that points at a section (/how-to-join/ or /#how-to-join) scrolls there while the
  // images above it are still loading, so the page grows afterwards and the section ends up lower than
  // the header. The jump is made instant while the page loads (the browser's own smooth scroll would keep
  // running to an out-of-date position); once everything has loaded the section is put back under the
  // header, unless the reader has already started scrolling. A reload or the back button is left alone,
  // because the browser puts the reader back where they were.
  let landingId = '';
  if (onHome) {
    try {
      landingId = location.hash.length > 1 ? decodeURIComponent(location.hash.slice(1)) : permalinkOf(location.pathname);
    } catch (err) {
      landingId = '';
    }
  }
  const navigationType = (window.performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0] || {}).type || 'navigate';
  if (landingId && navigationType === 'navigate') {
    const root = document.documentElement;
    let readerMoved = false;
    const jump = () => {
      const target = document.getElementById(landingId);
      if (target) target.scrollIntoView({ block: 'start' });
    };
    root.style.scrollBehavior = 'auto';
    // Unlike a #anchor, a clean address does not scroll by itself.
    if (!location.hash) jump();
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((type) => {
      window.addEventListener(type, () => { readerMoved = true; }, { passive: true, once: true });
    });
    window.addEventListener('load', () => {
      if (!readerMoved) jump();
      root.style.scrollBehavior = '';
    });
  }

  // On the home page a link to one of its sections scrolls there smoothly and shows the clean address
  // (/agency-plan/) instead of #agency-plan. The logo goes back to the top and shows /.
  if (onHome) {
    const scrollBehavior = () => (reducedMotion.matches ? 'auto' : 'smooth');
    const showSection = (id, behavior) => {
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior, block: 'start' });
      else window.scrollTo({ top: 0, behavior });
    };

    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest('a[href]');
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      if (link.getAttribute('href')[0] === '#') return; // plain #anchors keep working the browser's own way
      let url;
      try { url = new URL(link.href); } catch (err) { return; }
      if (url.origin !== location.origin || url.hash || url.search) return;
      const id = permalinkOf(url.pathname);
      const top = url.pathname === '/' || url.pathname === '/index.html';
      if (!id && !top) return;
      event.preventDefault();
      showSection(id, scrollBehavior());
      const clean = id ? `/${id}/` : '/';
      if (location.pathname !== clean || location.hash) window.history.pushState({}, '', clean);
    });
    // The back and forward buttons need no code: the browser puts the reader back where they were.
  }

  let scrollFrame = 0;
  const scheduleCurrentLink = () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      updateCurrentLink();
    });
  };
  window.addEventListener('scroll', scheduleCurrentLink, { passive: true });
  window.addEventListener('resize', scheduleCurrentLink);
  // Scrolling by hand releases the link the visitor picked, so the highlight follows the page again.
  ['wheel', 'touchmove', 'keydown'].forEach((type) => {
    window.addEventListener(type, () => {
      pinnedLink = null;
      scheduleCurrentLink();
    }, { passive: true });
  });

  // The admin panel writes drafts to localStorage; storage events reach every other
  // open page and iframe on this origin, which keeps previews live without reloading.
  window.addEventListener('storage', (event) => {
    if (event.key === DRAFT_KEY || event.key === null) render();
  });

  const menuButton = document.querySelector('.menu-button');
  const menu = document.querySelector('.site-menu');

  if (menuButton && menu) {
    const setOpen = (open) => {
      document.body.classList.toggle('menu-open', open);
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    menuButton.addEventListener('click', () => setOpen(!document.body.classList.contains('menu-open')));
    menu.addEventListener('click', (event) => {
      const link = event.target.closest('a');
      if (!link) return;
      pinnedLink = link;
      setOpen(false);
      updateCurrentLink();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.site-header')) setOpen(false);
    });
  }
});
