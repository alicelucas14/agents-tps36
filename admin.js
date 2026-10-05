(() => {
  'use strict';

  const { merge, clone, safeUrl, DRAFT_KEY } = window.SiteContent;

  const AUTH_KEY = 'tps_admin_auth_v1';
  const SESSION_KEY = 'tps_admin_unlocked_v1';
  const MIN_PASSCODE = 8;

  const EXPORT_HEADER = [
    '/*',
    ' * Published site content for index.html (edited in admin.html).',
    ' * Replace this file on the server to publish changes.',
    ' * Any text may contain {commission}, which is replaced by the commission value,',
    ' * and {year}, which is replaced by the current year.',
    ' */',
    '',
  ].join('\n');

  const $ = (selector, root = document) => root.querySelector(selector);

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const makeStore = (area) => ({
    get(key) {
      try { return window[area].getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { window[area].setItem(key, value); return true; } catch { return false; }
    },
    remove(key) {
      try { window[area].removeItem(key); } catch { /* storage unavailable */ }
    },
  });
  const local = makeStore('localStorage');
  const session = makeStore('sessionStorage');

  /* ---------- Passcode lock ---------- */

  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  // Plain-http pages have no crypto.subtle, so fall back to a small non-cryptographic hash.
  function fallbackHash(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  async function digest(text) {
    if (window.crypto && window.crypto.subtle) {
      const buffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return toHex(new Uint8Array(buffer));
    }
    return fallbackHash(text);
  }

  const newSalt = () => toHex(window.crypto.getRandomValues(new Uint8Array(16)));

  const readAuth = () => {
    try { return JSON.parse(local.get(AUTH_KEY)); } catch { return null; }
  };

  async function storePasscode(passcode) {
    const salt = newSalt();
    const hash = await digest(`${salt}:${passcode}`);
    return local.set(AUTH_KEY, JSON.stringify({ salt, hash }));
  }

  const lock = {
    root: $('#lock'),
    form: $('#lock-form'),
    title: $('#lock-title'),
    intro: $('#lock-intro'),
    pass: $('#lock-pass'),
    confirmRow: $('#lock-confirm-row'),
    confirm: $('#lock-confirm'),
    error: $('#lock-error'),
    submit: $('#lock-submit'),
  };
  let failures = 0;
  let blockedUntil = 0;

  function showLock() {
    const setup = !readAuth();
    $('#app').hidden = true;
    lock.root.hidden = false;
    lock.title.textContent = setup ? 'Create an admin passcode' : 'Admin sign in';
    lock.intro.textContent = setup
      ? `Choose a passcode of at least ${MIN_PASSCODE} characters. You will use it to open this page on this browser.`
      : 'Enter your passcode to edit the site.';
    lock.pass.autocomplete = setup ? 'new-password' : 'current-password';
    lock.confirmRow.hidden = !setup;
    lock.submit.textContent = setup ? 'Create passcode' : 'Sign in';
    lock.form.dataset.mode = setup ? 'setup' : 'login';
    lock.pass.value = '';
    lock.confirm.value = '';
    lock.error.textContent = '';
    lock.pass.focus();
  }

  lock.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const passcode = lock.pass.value;
    lock.error.textContent = '';

    if (lock.form.dataset.mode === 'setup') {
      if (passcode.length < MIN_PASSCODE) {
        lock.error.textContent = `Use at least ${MIN_PASSCODE} characters.`;
        return;
      }
      if (passcode !== lock.confirm.value) {
        lock.error.textContent = 'The two passcodes do not match.';
        return;
      }
      if (!(await storePasscode(passcode))) {
        lock.error.textContent = 'This browser is blocking storage, so a passcode cannot be saved.';
        return;
      }
      unlock();
      return;
    }

    const wait = Math.ceil((blockedUntil - Date.now()) / 1000);
    if (wait > 0) {
      lock.error.textContent = `Too many attempts. Try again in ${wait} seconds.`;
      return;
    }

    const auth = readAuth();
    if (auth && (await digest(`${auth.salt}:${passcode}`)) === auth.hash) {
      failures = 0;
      unlock();
      return;
    }

    failures += 1;
    if (failures >= 3) blockedUntil = Date.now() + Math.min(2 ** (failures - 2), 30) * 1000;
    lock.error.textContent = 'Wrong passcode.';
    lock.pass.select();
  });

  function unlock() {
    session.set(SESSION_KEY, '1');
    lock.root.hidden = true;
    showApp();
  }

  $('#lock-btn').addEventListener('click', () => {
    session.remove(SESSION_KEY);
    showLock();
  });

  /* ---------- Content model ---------- */

  const SECTIONS = [
    {
      id: 'general',
      label: 'General',
      intro: 'Commission figure, download button and search-engine text.',
      blocks: [
        {
          title: 'Commission',
          fields: [
            {
              path: 'commission', label: 'Commission %', type: 'number', min: 1, max: 100,
              hint: 'Type {commission} in any text on this page to show this number.',
            },
          ],
        },
        {
          title: 'Download button',
          fields: [
            { path: 'header.downloadLabel', label: 'Button text', type: 'text' },
            { path: 'header.downloadUrl', label: 'Button link', type: 'url' },
          ],
        },
        {
          title: 'Search results and browser tab',
          fields: [
            { path: 'seo.title', label: 'Page title', type: 'text', wide: true },
            { path: 'seo.description', label: 'Description', type: 'textarea', wide: true },
            {
              path: 'seo.siteUrl', label: 'Site address', type: 'url', wide: true,
              hint: 'The full web address of this site. Blog pages use it for search-engine links and the sitemap.',
            },
          ],
        },
      ],
    },
    {
      id: 'menu',
      label: 'Header menu',
      intro: 'The links in the top bar. On small screens they open from the menu button.',
      blocks: [
        {
          title: 'Links',
          list: {
            path: 'menu', itemName: 'Link', max: 8,
            blank: { label: '', url: '' },
            fields: [
              { key: 'label', label: 'Label', type: 'text' },
              { key: 'url', label: 'Link', type: 'url', hint: 'Use #section to jump within this page, or a full https:// address.' },
            ],
          },
        },
      ],
    },
    {
      id: 'hero',
      label: 'Hero',
      intro: 'The top section: headline, buttons and the banner slider.',
      blocks: [
        {
          title: 'Headline',
          fields: [
            { path: 'hero.headline.before', label: 'First part (white)', type: 'text', wide: true },
            { path: 'hero.headline.highlight', label: 'Highlighted part (yellow)', type: 'text', wide: true },
            { path: 'hero.headline.after', label: 'Last part (white)', type: 'text', wide: true },
          ],
        },
        {
          title: 'Buttons',
          fields: [
            { path: 'hero.joinLabel', label: 'Join button text', type: 'text' },
            { path: 'hero.joinUrl', label: 'Join button link', type: 'url', hint: 'Also used by the phone button.' },
            {
              path: 'hero.downloadLabel', label: 'Download button text', type: 'text',
              hint: 'Its link is set under General → Download button.',
            },
            { path: 'hero.mobileLabel', label: 'Phone button text', type: 'text', hint: 'On phones the two buttons become this one.' },
          ],
        },
        {
          title: 'Banner slider',
          list: {
            path: 'hero.slides', itemName: 'Slide', max: 8,
            blank: { image: '', alt: '' },
            fields: [
              { key: 'image', label: 'Image link', type: 'url', wide: true, hint: 'Best at about 958 × 662 pixels.' },
              { key: 'alt', label: 'Image description (for screen readers)', type: 'text', wide: true },
            ],
          },
        },
      ],
    },
    {
      id: 'features',
      label: 'Benefit cards',
      intro: 'The cards under the headline. With none, the section is hidden.',
      blocks: [
        {
          title: 'Cards',
          list: {
            path: 'features', itemName: 'Card', max: 6,
            blank: { icon: '⭐', title: '', text: '' },
            fields: [
              { key: 'icon', label: 'Icon (emoji)', type: 'text' },
              { key: 'title', label: 'Title', type: 'text' },
              { key: 'text', label: 'Text', type: 'textarea', wide: true },
            ],
          },
        },
      ],
    },
    {
      id: 'steps',
      label: 'How it works',
      intro: 'Numbered steps. Numbers follow the order below.',
      blocks: [
        {
          title: 'Heading',
          fields: [
            { path: 'steps.eyebrow', label: 'Small label', type: 'text' },
            { path: 'steps.title', label: 'Title', type: 'text' },
          ],
        },
        {
          title: 'Steps',
          list: {
            path: 'steps.items', itemName: 'Step', max: 6,
            blank: { title: '', text: '' },
            fields: [
              { key: 'title', label: 'Title', type: 'text', wide: true },
              { key: 'text', label: 'Text', type: 'textarea', wide: true },
            ],
          },
        },
      ],
    },
    {
      id: 'partners',
      label: 'Withdrawal partners',
      intro: 'The heading and logos under the hero buttons.',
      blocks: [
        {
          title: 'Heading',
          fields: [{ path: 'partners.title', label: 'Heading', type: 'text', wide: true }],
        },
        {
          title: 'Partners',
          list: {
            path: 'partners.items', itemName: 'Partner', max: 14,
            blank: { name: '', image: '' },
            fields: [
              { key: 'name', label: 'Name', type: 'text' },
              { key: 'image', label: 'Logo link', type: 'url' },
            ],
          },
        },
      ],
    },
    {
      id: 'blog',
      label: 'Blog',
      intro: 'Bring your WordPress posts onto this site as fast, searchable blog pages.',
      after: 'blog',
      blocks: [
        {
          title: 'Blog settings',
          fields: [
            { path: 'blog.title', label: 'Blog title', type: 'text' },
            { path: 'blog.author', label: 'Author shown on posts', type: 'text', hint: 'WordPress keeps author names private, so one name is used for every post.' },
            { path: 'blog.perPage', label: 'Posts per page', type: 'number', min: 3, max: 24 },
          ],
        },
      ],
    },
    {
      id: 'footer',
      label: 'Footer',
      intro: 'Disclaimer, quick links, social links and the copyright line at the bottom of the page.',
      blocks: [
        {
          title: 'Disclaimer heading',
          fields: [{ path: 'footer.disclaimerTitle', label: 'Heading', type: 'text', wide: true }],
        },
        {
          title: 'Disclaimer text',
          list: {
            path: 'footer.disclaimer', itemName: 'Paragraph', max: 6,
            blank: { text: '' },
            fields: [{ key: 'text', label: 'Text', type: 'textarea', wide: true }],
          },
        },
        {
          title: 'Quick links heading',
          fields: [{ path: 'footer.linksTitle', label: 'Heading', type: 'text', wide: true }],
        },
        {
          title: 'Quick links',
          list: {
            path: 'footer.links', itemName: 'Link', max: 10,
            blank: { label: '', url: '' },
            fields: [
              { key: 'label', label: 'Label', type: 'text' },
              { key: 'url', label: 'Link', type: 'url' },
            ],
          },
        },
        {
          title: 'Social links',
          list: {
            path: 'footer.social', itemName: 'Social link', max: 8,
            blank: { label: '', url: '', icon: 'facebook' },
            fields: [
              { key: 'label', label: 'Label', type: 'text' },
              { key: 'url', label: 'Link', type: 'url' },
              {
                key: 'icon', label: 'Icon', type: 'select',
                options: [
                  ['facebook', 'Facebook'], ['twitter', 'Twitter'], ['telegram', 'Telegram'],
                  ['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['youtube', 'YouTube'], ['none', 'No icon'],
                ],
              },
            ],
          },
        },
        {
          title: 'Copyright line',
          fields: [
            { path: 'footer.copyright', label: 'Text', type: 'text', wide: true, hint: 'Type {year} to show the current year.' },
          ],
        },
      ],
    },
    {
      id: 'publish',
      label: 'Publish & backup',
      intro: 'Take your changes live, keep a backup, or change the passcode.',
      custom: true,
    },
  ];

  const getPath = (obj, path) => path.split('.').reduce((node, key) => (node == null ? node : node[key]), obj);

  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((node, key) => node[key], obj)[last] = value;
  }

  let state = null;
  let activeSection = 'general';
  let focusKey = null;
  let fieldCounter = 0;

  /* ---------- Saving the draft ---------- */

  const statusEl = $('#status');
  let saveTimer = 0;

  function setStatus(dirty, saved) {
    if (!saved) {
      statusEl.dataset.state = 'error';
      statusEl.textContent = 'Not saved – browser storage is blocked';
    } else if (dirty) {
      statusEl.dataset.state = 'draft';
      statusEl.textContent = 'Unpublished changes (draft saved)';
    } else {
      statusEl.dataset.state = 'synced';
      statusEl.textContent = 'No unpublished changes';
    }
  }

  const isDirty = () => JSON.stringify(state) !== JSON.stringify(window.SITE_DEFAULTS);

  function pushPreview() {
    const frame = $('#preview-frame');
    try {
      frame.contentWindow.dispatchEvent(new StorageEvent('storage', { key: DRAFT_KEY }));
    } catch {
      frame.src = frame.src;
    }
  }

  function saveNow() {
    window.clearTimeout(saveTimer);
    const dirty = isDirty();
    let saved = true;
    if (dirty) saved = local.set(DRAFT_KEY, JSON.stringify(state));
    else local.remove(DRAFT_KEY);
    setStatus(dirty, saved);
    pushPreview();
  }

  const scheduleSave = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 250);
  };

  let toastTimer = 0;
  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4000);
  }

  /* ---------- Form building ---------- */

  function validate(field, value) {
    if (field.type === 'number') {
      const number = parseFloat(value);
      if (!Number.isFinite(number) || number < field.min || number > field.max) {
        return { error: `Enter a number from ${field.min} to ${field.max}.` };
      }
      return { value: number };
    }
    if (field.type === 'url') {
      const trimmed = value.trim();
      if (trimmed && !safeUrl(trimmed)) {
        return { error: 'Use a link that starts with https:// (or a path on this site).' };
      }
      return { value: trimmed };
    }
    return { value };
  }

  function buildField(field, path) {
    const wrap = el('div', `field${field.wide ? ' wide' : ''}`);
    fieldCounter += 1;
    const id = `field-${fieldCounter}`;

    const label = el('label', '', field.label);
    label.htmlFor = id;

    const input = field.type === 'textarea' ? el('textarea') : field.type === 'select' ? el('select') : el('input');
    input.id = id;
    input.dataset.focus = path;
    if (field.type === 'select') {
      field.options.forEach(([value, text]) => {
        const option = el('option', '', text);
        option.value = value;
        input.append(option);
      });
    } else if (field.type === 'textarea') {
      input.rows = 3;
    } else if (field.type === 'number') {
      input.type = 'number';
      input.min = field.min;
      input.max = field.max;
      input.step = 'any';
    } else {
      input.type = 'text';
      if (field.type === 'url') input.inputMode = 'url';
    }
    input.value = getPath(state, path) ?? '';

    const message = el('p', 'field-msg');
    message.id = `${id}-msg`;
    const describedBy = [message.id];

    input.addEventListener('input', () => {
      const result = validate(field, input.value);
      input.classList.toggle('invalid', Boolean(result.error));
      input.setAttribute('aria-invalid', String(Boolean(result.error)));
      message.textContent = result.error || '';
      if (result.error) return;
      setPath(state, path, result.value);
      scheduleSave();
    });

    wrap.append(label, input);
    if (field.hint) {
      const hint = el('p', 'field-hint', field.hint);
      hint.id = `${id}-hint`;
      describedBy.push(hint.id);
      wrap.append(hint);
    }
    wrap.append(message);
    input.setAttribute('aria-describedby', describedBy.join(' '));
    return wrap;
  }

  function buildFieldsBlock(block) {
    const card = el('section', 'card');
    card.append(el('h3', '', block.title));
    const grid = el('div', 'fields');
    block.fields.forEach((field) => grid.append(buildField(field, field.path)));
    card.append(grid);
    return card;
  }

  function buildListBlock(block) {
    const { list } = block;
    const items = getPath(state, list.path);
    const card = el('section', 'card');
    card.append(el('h3', '', block.title));

    const container = el('div', 'list');
    if (!items.length) container.append(el('p', 'empty', `No ${list.itemName.toLowerCase()}s yet. This part of the page is hidden.`));

    items.forEach((_, index) => {
      const item = el('div', 'list-item');
      const head = el('div', 'list-item-head');
      head.append(el('strong', '', `${list.itemName} ${index + 1}`));

      const actions = el('div', 'list-item-actions');
      const action = (symbol, name, onClick, disabled, danger) => {
        const button = el('button', 'icon-btn', symbol);
        button.type = 'button';
        button.setAttribute('aria-label', `${name} ${list.itemName.toLowerCase()} ${index + 1}`);
        button.dataset.focus = `${list.path}.${index}.${name.toLowerCase().replace(/ /g, '-')}`;
        button.disabled = disabled;
        if (danger) button.classList.add('btn-danger');
        button.addEventListener('click', onClick);
        actions.append(button);
      };
      action('↑', 'Move up', () => moveItem(list, index, -1), index === 0);
      action('↓', 'Move down', () => moveItem(list, index, 1), index === items.length - 1);
      action('✕', 'Remove', () => removeItem(list, index), false, true);
      head.append(actions);

      const grid = el('div', 'fields');
      list.fields.forEach((field) => grid.append(buildField(field, `${list.path}.${index}.${field.key}`)));
      item.append(head, grid);
      container.append(item);
    });

    const add = el('button', 'btn', `+ Add ${list.itemName.toLowerCase()}`);
    add.type = 'button';
    add.dataset.focus = `${list.path}.add`;
    add.disabled = items.length >= list.max;
    if (add.disabled) add.title = `Up to ${list.max} items`;
    add.addEventListener('click', () => {
      items.push(clone(list.blank));
      focusKey = `${list.path}.${items.length - 1}.${list.fields[0].key}`;
      changed();
    });

    card.append(container, add);
    return card;
  }

  function moveItem(list, index, delta) {
    const items = getPath(state, list.path);
    const target = index + delta;
    [items[index], items[target]] = [items[target], items[index]];
    const direction = delta < 0 ? 'move-up' : 'move-down';
    const atEdge = delta < 0 ? target === 0 : target === items.length - 1;
    focusKey = `${list.path}.${target}.${atEdge ? (delta < 0 ? 'move-down' : 'move-up') : direction}`;
    changed();
  }

  function removeItem(list, index) {
    if (!window.confirm(`Remove ${list.itemName.toLowerCase()} ${index + 1}?`)) return;
    getPath(state, list.path).splice(index, 1);
    focusKey = `${list.path}.add`;
    changed();
  }

  // Structural change (add/remove/move/import/reset): save, then rebuild the form.
  function changed() {
    saveNow();
    renderEditor();
  }

  /* ---------- Publish & backup ---------- */

  function exportContent() {
    saveNow();
    const text = `${EXPORT_HEADER}window.SITE_DEFAULTS = ${JSON.stringify(state, null, 2)};\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    const link = el('a');
    link.href = url;
    link.download = 'content.js';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Downloaded content.js. Upload it over the one next to index.html to publish.');
  }

  function parseContentFile(text) {
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed);
    } catch { /* not plain JSON; try content.js */ }
    const marker = trimmed.indexOf('SITE_DEFAULTS');
    const start = trimmed.indexOf('{', Math.max(marker, 0));
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('No content found in that file.');
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  async function importContent(file) {
    try {
      const parsed = parseContentFile(await file.text());
      const known = parsed && typeof parsed === 'object' && Object.keys(window.SITE_DEFAULTS).some((key) => key in parsed);
      if (!known) throw new Error('That file does not look like site content.');
      if (!window.confirm('Replace your current draft with the contents of this file?')) return;
      state = merge(window.SITE_DEFAULTS, parsed);
      changed();
      notify('Imported. Review the changes, then download content.js to publish.');
    } catch (error) {
      notify(`Could not import: ${error.message}`);
    }
  }

  function discardDraft() {
    if (!isDirty()) {
      notify('There is no draft to discard.');
      return;
    }
    if (!window.confirm('Discard all unpublished changes and go back to the published content?')) return;
    state = clone(window.SITE_DEFAULTS);
    changed();
    notify('Draft discarded.');
  }

  function buildPublish() {
    const nodes = [];

    const publish = el('section', 'card');
    publish.append(el('h3', '', 'Publish your changes'));
    const note = el('div', 'card-note');
    note.append('Edits are saved as a draft in this browser only. Visitors see them once you publish:');
    const steps = el('ol');
    ['Download content.js below.', 'Upload it to your site, replacing the content.js next to index.html.', 'Reload the site to check it.']
      .forEach((text) => steps.append(el('li', '', text)));
    note.append(steps);
    const download = el('button', 'btn btn-primary', 'Download content.js');
    download.type = 'button';
    download.addEventListener('click', exportContent);
    publish.append(note, download);
    nodes.push(publish);

    const backup = el('section', 'card');
    backup.append(el('h3', '', 'Backup & restore'));
    backup.append(el('p', 'card-note', 'Restore from a content.js you downloaded earlier (a plain .json copy also works), or throw away your draft.'));
    const row = el('div', 'row');
    const file = el('input');
    file.type = 'file';
    file.accept = '.js,.json,application/json,text/javascript';
    file.hidden = true;
    file.addEventListener('change', () => {
      if (file.files[0]) importContent(file.files[0]);
      file.value = '';
    });
    const importBtn = el('button', 'btn', 'Import file…');
    importBtn.type = 'button';
    importBtn.addEventListener('click', () => file.click());
    const discard = el('button', 'btn btn-danger', 'Discard draft');
    discard.type = 'button';
    discard.addEventListener('click', discardDraft);
    row.append(importBtn, discard, file);
    backup.append(row);
    nodes.push(backup);

    const pass = el('form', 'card');
    pass.noValidate = true;
    pass.append(el('h3', '', 'Change passcode'));
    const grid = el('div', 'pass-form');
    const newPass = { label: 'New passcode', autocomplete: 'new-password' };
    const confirmPass = { label: 'Confirm new passcode', autocomplete: 'new-password' };
    const inputs = [newPass, confirmPass].map((spec) => {
      const wrap = el('div', 'field');
      fieldCounter += 1;
      const id = `field-${fieldCounter}`;
      const label = el('label', '', spec.label);
      label.htmlFor = id;
      const input = el('input');
      input.id = id;
      input.type = 'password';
      input.autocomplete = spec.autocomplete;
      wrap.append(label, input);
      grid.append(wrap);
      return input;
    });
    const message = el('p', 'field-msg');
    message.setAttribute('role', 'alert');
    const save = el('button', 'btn', 'Update passcode');
    save.type = 'submit';
    const actions = el('div', 'actions');
    actions.append(message, save);
    grid.append(actions);
    pass.append(grid);
    pass.addEventListener('submit', async (event) => {
      event.preventDefault();
      message.textContent = '';
      if (inputs[0].value.length < MIN_PASSCODE) {
        message.textContent = `Use at least ${MIN_PASSCODE} characters.`;
      } else if (inputs[0].value !== inputs[1].value) {
        message.textContent = 'The two passcodes do not match.';
      } else if (await storePasscode(inputs[0].value)) {
        inputs.forEach((input) => { input.value = ''; });
        notify('Passcode updated.');
      } else {
        message.textContent = 'This browser is blocking storage, so the passcode cannot be saved.';
      }
    });
    nodes.push(pass);

    return nodes;
  }

  /* ---------- Blog import ---------- */

  const BLOG_URL_KEY = 'tps_blog_wp_address';
  let blogCore = null;
  let blogData = null; // { posts, origin, source, importedAt } held in memory until downloaded
  const loadBlogCore = async () => {
    blogCore = blogCore || (await import('./tools/blog-core.mjs'));
    return blogCore;
  };

  const formatWhen = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  function buildBlog() {
    const nodes = [];

    // 1. Import
    const importCard = el('section', 'card');
    importCard.append(el('h3', '', 'Import from WordPress'));
    importCard.append(el('p', 'card-note', 'Pull every published post from your WordPress site, or load a WordPress export file. Posts are cleaned of page-builder markup, share buttons and scripts.'));

    const choice = el('div', 'radio-row');
    const makeRadio = (value, label, checked) => {
      const wrap = el('label', 'radio');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'blog-source';
      radio.value = value;
      radio.checked = checked;
      wrap.append(radio, el('span', '', label));
      choice.append(wrap);
      return radio;
    };
    const siteRadio = makeRadio('site', 'From the WordPress site', true);
    const fileRadio = makeRadio('file', 'From an export file (.xml)', false);
    importCard.append(choice);

    const addressField = el('div', 'field');
    fieldCounter += 1;
    const addressId = `field-${fieldCounter}`;
    const addressLabel = el('label', '', 'WordPress site address');
    addressLabel.htmlFor = addressId;
    const address = el('input');
    address.id = addressId;
    address.type = 'text';
    address.inputMode = 'url';
    address.value = local.get(BLOG_URL_KEY) || 'https://agents.teenpattistars.io';
    addressField.append(addressLabel, address, el('p', 'field-hint', 'The site must allow other websites to read its posts, which WordPress does by default.'));

    const fileField = el('div', 'field');
    fieldCounter += 1;
    const fileId = `field-${fieldCounter}`;
    const fileLabel = el('label', '', 'WordPress export file');
    fileLabel.htmlFor = fileId;
    const file = el('input');
    file.id = fileId;
    file.type = 'file';
    file.accept = '.xml,text/xml,application/xml';
    fileField.append(fileLabel, file, el('p', 'field-hint', 'In WordPress go to Tools → Export, choose Posts, and download the file. Use this if the address option does not work.'));
    fileField.hidden = true;

    const showSource = () => {
      addressField.hidden = !siteRadio.checked;
      fileField.hidden = !fileRadio.checked;
    };
    siteRadio.addEventListener('change', showSource);
    fileRadio.addEventListener('change', showSource);
    importCard.append(addressField, fileField);

    const progress = el('p', 'blog-line');
    progress.setAttribute('role', 'status');
    const importBtn = el('button', 'btn btn-primary', 'Import posts');
    importBtn.type = 'button';
    importCard.append(importBtn, progress);
    nodes.push(importCard);

    // 2. Result + download
    const outCard = el('section', 'card');
    outCard.append(el('h3', '', 'Your blog pages'));
    const summary = el('p', 'blog-line');
    summary.setAttribute('role', 'status');
    const downloadBtn = el('button', 'btn btn-primary', 'Download blog files (.zip)');
    downloadBtn.type = 'button';
    downloadBtn.disabled = true;
    const steps = el('div', 'card-note');
    steps.append('To put the blog on your site:');
    const list = el('ol');
    [
      'Download the .zip above and unzip it into your site folder, next to index.html. It creates (or replaces) the blogs folder.',
      'Upload the folder to your hosting. The blog list is at /blogs/ and each post at /blogs/post-name/.',
      'Add blogs/sitemap.xml to Google Search Console. If this replaces your WordPress site, use blogs/redirects.txt to point the old post addresses at the new ones.',
    ].forEach((text) => list.append(el('li', '', text)));
    steps.append(list);
    outCard.append(summary, downloadBtn, steps);
    nodes.push(outCard);

    const imagesCard = el('section', 'card');
    imagesCard.append(el('h3', '', 'Keep the images'));
    const imagesNote = el('p', 'card-note');
    imagesNote.append('Post images keep loading from the WordPress site. If you plan to switch WordPress off, copy them first. Run this in the site folder (needs Node 18 or newer): ');
    imagesNote.append(el('code', '', 'node tools/blog.mjs import --api https://your-site.com --download-images'));
    imagesCard.append(imagesNote);
    nodes.push(imagesCard);

    // behaviour
    const setBusy = (busy) => {
      importBtn.disabled = busy;
      downloadBtn.disabled = busy || !(blogData || summary.dataset.onSite === '1');
    };
    const showReady = () => {
      if (blogData) {
        const { posts } = blogData;
        const dates = posts.map((p) => p.date.slice(0, 10)).sort();
        summary.textContent = `${posts.length} posts ready (${dates[0]} to ${dates[dates.length - 1]}), imported ${formatWhen(blogData.importedAt)} from ${blogData.source}.`;
        summary.dataset.onSite = '';
      }
      downloadBtn.disabled = !(blogData || summary.dataset.onSite === '1');
    };

    fetch('blogs/search.json', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((items) => {
        if (!Array.isArray(items) || blogData) return;
        summary.textContent = `${items.length} posts are on the site now. Change the settings above and download to rebuild them, or import again to refresh from WordPress.`;
        summary.dataset.onSite = '1';
        downloadBtn.disabled = false;
      })
      .catch(() => {});
    if (!blogData) summary.textContent = 'No posts imported yet.';
    else showReady();

    importBtn.addEventListener('click', async () => {
      progress.textContent = '';
      try {
        const source = siteRadio.checked ? 'site' : 'file';
        if (source === 'file' && !file.files[0]) throw new Error('Choose a WordPress export file first.');
        if (source === 'site' && !address.value.trim()) throw new Error('Enter the address of your WordPress site.');
        setBusy(true);
        progress.textContent = 'Reading posts…';
        const core = await loadBlogCore();
        let imported;
        if (source === 'site') {
          local.set(BLOG_URL_KEY, address.value.trim());
          try {
            imported = await core.fetchWpPosts(address.value, {
              onProgress: ({ loaded, total }) => { progress.textContent = `Reading posts… ${loaded} of ${total}`; },
            });
          } catch (error) {
            if (error instanceof TypeError) throw new Error('Could not reach that site. Check the address, or use an export file instead.');
            throw error;
          }
        } else {
          imported = core.parseWxr(await file.files[0].text());
        }
        progress.textContent = 'Cleaning posts…';
        const posts = core.preparePosts(imported.posts, { origin: imported.origin });
        if (!posts.length) throw new Error('No published posts were found.');
        blogData = {
          posts,
          origin: imported.origin,
          source: source === 'site' ? address.value.trim() : file.files[0].name,
          importedAt: new Date().toISOString(),
        };
        progress.textContent = `Imported ${posts.length} posts.`;
        showReady();
        notify(`Imported ${posts.length} posts. Download the blog files to use them.`);
      } catch (error) {
        progress.textContent = error.message;
      } finally {
        setBusy(false);
      }
    });

    downloadBtn.addEventListener('click', async () => {
      try {
        setBusy(true);
        summary.dataset.busy = '1';
        const core = await loadBlogCore();
        let data = blogData;
        if (!data) {
          const response = await fetch('blogs/posts.json', { cache: 'no-store' });
          if (!response.ok) throw new Error('Could not read the posts already on the site. Import them again.');
          const saved = await response.json();
          data = { posts: saved.posts, origin: saved.origin, source: saved.source, importedAt: saved.importedAt };
        }
        const indexResponse = await fetch('index.html', { cache: 'no-store' });
        if (!indexResponse.ok) throw new Error('Could not read index.html to copy the site header and footer.');
        const chrome = core.extractChrome(await indexResponse.text());
        const files = core.buildBlogFiles(data.posts, {
          settings: state.blog,
          siteUrl: state.seo.siteUrl,
          chrome,
          meta: { source: data.source, origin: data.origin, importedAt: data.importedAt },
        });
        const url = URL.createObjectURL(core.makeZip(files));
        const link = el('a');
        link.href = url;
        link.download = 'blog-pages.zip';
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        notify(`Downloaded ${files.length} files. Unzip them into your site folder.`);
      } catch (error) {
        notify(error.message);
      } finally {
        setBusy(false);
      }
    });

    return nodes;
  }

  /* ---------- Editor shell ---------- */

  const editor = $('#editor');
  const sidenav = $('#sidenav');

  function renderNav() {
    sidenav.replaceChildren(
      ...SECTIONS.map((section) => {
        const button = el('button', 'nav-item', section.label);
        button.type = 'button';
        if (section.id === activeSection) button.setAttribute('aria-current', 'page');
        button.addEventListener('click', () => {
          activeSection = section.id;
          focusKey = null;
          renderNav();
          renderEditor();
          editor.focus({ preventScroll: true });
          window.scrollTo({ top: 0 });
        });
        return button;
      })
    );
  }

  function renderEditor() {
    const section = SECTIONS.find((candidate) => candidate.id === activeSection);
    const head = el('header', 'editor-head');
    head.append(el('h2', '', section.label), el('p', '', section.intro));

    const blocks = section.custom
      ? buildPublish()
      : section.blocks.map((block) => (block.list ? buildListBlock(block) : buildFieldsBlock(block)));
    if (section.after === 'blog') blocks.push(...buildBlog());
    editor.replaceChildren(head, ...blocks);

    if (focusKey) {
      const target = Array.from(editor.querySelectorAll('[data-focus]')).find((node) => node.dataset.focus === focusKey && !node.disabled);
      if (target) target.focus();
      focusKey = null;
    }
  }

  /* ---------- Preview ---------- */

  const app = $('#app');
  const stage = $('#preview-stage');
  const holder = $('#preview-holder');
  const frame = $('#preview-frame');
  let previewMode = 'desktop';

  function layoutPreview() {
    const available = stage.clientWidth;
    if (!available) return;
    const width = previewMode === 'mobile' ? 390 : 1280;
    const scale = Math.min(1, available / width);
    frame.style.width = `${width}px`;
    frame.style.height = `${stage.clientHeight / scale}px`;
    frame.style.transform = `scale(${scale})`;
    holder.style.width = `${width * scale}px`;
  }

  function setPreview(visible) {
    app.dataset.preview = visible ? 'on' : 'off';
    $('#toggle-preview').setAttribute('aria-pressed', String(visible));
    if (visible) window.requestAnimationFrame(layoutPreview);
  }

  $('#toggle-preview').addEventListener('click', () => setPreview(app.dataset.preview !== 'on'));
  $('#close-preview').addEventListener('click', () => setPreview(false));
  $('#export-btn').addEventListener('click', exportContent);

  function setPreviewMode(mode) {
    previewMode = mode;
    document.querySelectorAll('.segmented button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    layoutPreview();
  }

  document.querySelectorAll('.segmented button').forEach((button) => {
    button.addEventListener('click', () => setPreviewMode(button.dataset.mode));
  });

  if ('ResizeObserver' in window) new ResizeObserver(layoutPreview).observe(stage);

  /* ---------- Start ---------- */

  let started = false;

  function showApp() {
    app.hidden = false;
    state = window.SiteContent.load();
    if (!isDirty()) local.remove(DRAFT_KEY);
    setStatus(isDirty(), true);

    if (!started) {
      started = true;
      if (location.protocol === 'file:') $('#file-banner').hidden = false;
      frame.src = 'index.html';
      setPreview(window.matchMedia('(min-width: 1101px)').matches);
      if (window.matchMedia('(max-width: 680px)').matches) setPreviewMode('mobile');
    }
    renderNav();
    renderEditor();
    layoutPreview();
  }

  if (readAuth() && session.get(SESSION_KEY) === '1') {
    lock.root.hidden = true;
    showApp();
  } else {
    showLock();
  }
})();
