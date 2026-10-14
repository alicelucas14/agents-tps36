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

  // The page's own HTML gives every picture a size and says which ones can wait (loading="lazy").
  // Rebuilding a list from content.js would throw that away, so the page would jump as pictures arrive
  // and everything below the fold would load at once. A rebuilt picture takes over what the old one with
  // the same address had; a picture the admin just added gets async decoding and nothing else.
  const IMAGE_HINTS = ['width', 'height', 'loading', 'decoding', 'fetchpriority'];
  const imageHints = new Map();
  const rememberImages = () => {
    document.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src');
      if (imageHints.has(src)) return;
      const hints = {};
      IMAGE_HINTS.forEach((name) => { if (img.hasAttribute(name)) hints[name] = img.getAttribute(name); });
      imageHints.set(src, hints);
    });
  };
  const makeImage = (src, alt) => {
    const img = el('img');
    // The hints go on before the address: a picture that gets its address first starts loading at once, lazy or not.
    const hints = imageHints.get(src);
    if (hints) Object.keys(hints).forEach((name) => img.setAttribute(name, hints[name]));
    else img.setAttribute('decoding', 'async');
    img.setAttribute('alt', alt);
    img.setAttribute('src', src);
    return img;
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
    linkedin: ['0 0 448 512', 'M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z'],
    pinterest: ['0 0 384 512', 'M204 6.5C101.4 6.5 0 74.9 0 185.6 0 256 39.6 296 63.6 296c9.9 0 15.6-27.6 15.6-35.4 0-9.3-23.7-29.1-23.7-67.8 0-80.4 61.2-137.4 140.4-137.4 68.1 0 118.5 38.7 118.5 109.8 0 53.1-21.3 152.7-90.3 152.7-24.9 0-46.2-18-46.2-43.8 0-37.8 26.4-74.4 26.4-113.4 0-66.2-93.9-54.2-93.9 25.8 0 16.8 2.1 35.4 9.6 50.7-13.8 59.4-42 147.9-42 209.1 0 18.9 2.7 37.5 4.5 56.4 3.4 3.8 1.7 3.4 6.9 1.5 50.4-69 48.6-82.5 71.4-172.8 12.3 23.4 44.1 36 69.3 36 106.2 0 153.9-103.5 153.9-196.8C384 71.3 298.2 6.5 204 6.5z'],
    quora: ['0 0 448 512', 'M440.5 386.7h-29.3c-1.5 13.5-10.5 30.8-33 30.8-20.5 0-35.3-14.2-49.5-35.8 44.2-34.2 74.7-87.5 74.7-153C403.5 111.2 306.8 32 205 32 105.3 32 7.3 111.7 7.3 228.7c0 134.1 131.3 221.6 249 189C276 451.3 302 480 351.5 480c81.8 0 90.8-75.3 89-93.3zM297 329.2C277.5 300 253.3 277 205.5 277c-30.5 0-54.3 10-69 22.8l12.2 24.3c6.2-3 13-4 19.8-4 35.5 0 53.7 30.8 69.2 61.3-10 3-20.7 4.2-32.7 4.2-75 0-107.5-53-107.5-156.7C97.5 124.5 130 71 205 71c76.2 0 108.7 53.5 108.7 157.7.1 41.8-5.4 75.6-16.7 100.5z'],
    x: ['0 0 512 512', 'M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z'],
    reddit: ['0 0 512 512', 'M373 138.6c-25.2 0-46.3-17.5-51.9-41l0 0c-30.6 4.3-54.2 30.7-54.2 62.4l0 .2c47.4 1.8 90.6 15.1 124.9 36.3c12.6-9.7 28.4-15.5 45.5-15.5c41.3 0 74.7 33.4 74.7 74.7c0 29.8-17.4 55.5-42.7 67.5c-2.4 86.8-97 156.6-213.2 156.6S45.5 410.1 43 323.4C17.6 311.5 0 285.7 0 255.7c0-41.3 33.4-74.7 74.7-74.7c17.2 0 33 5.8 45.7 15.6c34-21.1 76.8-34.4 123.7-36.4l0-.3c0-44.3 33.7-80.9 76.8-85.5C325.8 50.2 347.2 32 373 32c29.4 0 53.3 23.9 53.3 53.3s-23.9 53.3-53.3 53.3zM157.5 255.3c-20.9 0-38.9 20.8-40.2 47.9s17.1 38.1 38 38.1s36.6-9.8 37.8-36.9s-14.7-49.1-35.7-49.1zM395 303.1c-1.2-27.1-19.2-47.9-40.2-47.9s-36.9 22-35.7 49.1c1.2 27.1 16.9 36.9 37.8 36.9s39.3-11 38-38.1zm-60.1 70.8c1.5-3.6-1-7.7-4.9-8.1c-23-2.3-47.9-3.6-73.8-3.6s-50.8 1.3-73.8 3.6c-3.9 .4-6.4 4.5-4.9 8.1c12.9 30.8 43.3 52.4 78.7 52.4s65.8-21.6 78.7-52.4z'],
    tiktok: ['0 0 448 512', 'M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z'],
    threads: ['0 0 448 512', 'M331.5 235.7c2.2 .9 4.2 1.9 6.3 2.8c29.2 14.1 50.6 35.2 61.8 61.4c15.7 36.5 17.2 95.8-30.3 143.2c-36.2 36.2-80.3 52.5-142.6 53h-.3c-70.2-.5-124.1-24.1-160.4-70.2c-32.3-41-48.9-98.1-49.5-169.6V256v-.2C17 184.3 33.6 127.2 65.9 86.2C102.2 40.1 156.2 16.5 226.4 16h.3c70.3 .5 124.9 24 162.3 69.9c18.4 22.7 32 50 40.6 81.7l-40.4 10.8c-7.1-25.8-17.8-47.8-32.2-65.4c-29.2-35.8-73-54.2-130.5-54.6c-57 .5-100.1 18.8-128.2 54.4C72.1 146.1 58.5 194.3 58 256c.5 61.7 14.1 109.9 40.3 143.3c28 35.6 71.2 53.9 128.2 54.4c51.4-.4 85.4-12.6 113.7-40.9c32.3-32.2 31.7-71.8 21.4-95.9c-6.1-14.2-17.1-26-31.9-34.9c-3.7 26.9-11.8 48.3-24.7 64.8c-17.1 21.8-41.4 33.6-72.7 35.3c-23.6 1.3-46.3-4.4-63.9-16c-20.8-13.8-33-34.8-34.3-59.3c-2.5-48.3 35.7-83 95.2-86.4c21.1-1.2 40.9-.3 59.2 2.8c-2.4-14.8-7.3-26.6-14.6-35.2c-10-11.7-25.6-17.7-46.2-17.8H227c-16.6 0-39 4.6-53.3 26.3l-34.4-23.6c19.2-29.1 50.3-45.1 87.8-45.1h.8c62.6 .4 99.9 39.5 103.7 107.7l-.2 .2zm-156 68.8c1.3 25.1 28.4 36.8 54.6 35.3c25.6-1.4 54.6-11.4 59.5-73.2c-13.2-2.9-27.8-4.4-43.4-4.4c-4.8 0-9.6 .1-14.4 .4c-42.9 2.4-57.2 23.2-56.2 41.8l-.1 .1z'],
    snapchat: ['0 0 512 512', 'M496.926,366.6c-3.373-9.176-9.8-14.086-17.112-18.153-1.376-.806-2.641-1.451-3.72-1.947-2.182-1.128-4.414-2.22-6.634-3.373-22.8-12.09-40.609-27.341-52.959-45.42a102.889,102.889,0,0,1-9.089-16.12c-1.054-3.013-1-4.724-.248-6.287a10.221,10.221,0,0,1,2.914-3.038c3.918-2.591,7.96-5.22,10.7-6.993,4.885-3.162,8.754-5.667,11.246-7.44,9.362-6.547,15.909-13.5,20-21.278a42.371,42.371,0,0,0,2.1-35.191c-6.2-16.318-21.613-26.449-40.287-26.449a55.543,55.543,0,0,0-11.718,1.24c-1.029.224-2.059.459-3.063.72.174-11.16-.074-22.94-1.066-34.534-3.522-40.758-17.794-62.123-32.674-79.16A130.167,130.167,0,0,0,332.1,36.443C309.515,23.547,283.91,17,256,17S202.6,23.547,180,36.443a129.735,129.735,0,0,0-33.281,26.783c-14.88,17.038-29.152,38.44-32.673,79.161-.992,11.594-1.24,23.435-1.079,34.533-1-.26-2.021-.5-3.051-.719a55.461,55.461,0,0,0-11.717-1.24c-18.687,0-34.125,10.131-40.3,26.449a42.423,42.423,0,0,0,2.046,35.228c4.105,7.774,10.652,14.731,20.014,21.278,2.48,1.736,6.361,4.24,11.246,7.44,2.641,1.711,6.5,4.216,10.28,6.72a11.054,11.054,0,0,1,3.3,3.311c.794,1.624.818,3.373-.36,6.6a102.02,102.02,0,0,1-8.94,15.785c-12.077,17.669-29.363,32.648-51.434,44.639C32.355,348.608,20.2,352.75,15.069,366.7c-3.868,10.528-1.339,22.506,8.494,32.6a49.137,49.137,0,0,0,12.4,9.387,134.337,134.337,0,0,0,30.342,12.139,20.024,20.024,0,0,1,6.126,2.741c3.583,3.137,3.075,7.861,7.849,14.78a34.468,34.468,0,0,0,8.977,9.127c10.019,6.919,21.278,7.353,33.207,7.811,10.776.41,22.989.881,36.939,5.481,5.778,1.91,11.78,5.605,18.736,9.92C194.842,480.951,217.707,495,255.973,495s61.292-14.123,78.118-24.428c6.907-4.24,12.872-7.9,18.489-9.758,13.949-4.613,26.163-5.072,36.939-5.481,11.928-.459,23.187-.893,33.206-7.812a34.584,34.584,0,0,0,10.218-11.16c3.434-5.84,3.348-9.919,6.572-12.771a18.971,18.971,0,0,1,5.753-2.629A134.893,134.893,0,0,0,476.02,408.71a48.344,48.344,0,0,0,13.019-10.193l.124-.149C498.389,388.5,500.708,376.867,496.926,366.6Zm-34.013,18.277c-20.745,11.458-34.533,10.23-45.259,17.137-9.114,5.865-3.72,18.513-10.342,23.076-8.134,5.617-32.177-.4-63.239,9.858-25.618,8.469-41.961,32.822-88.038,32.822s-62.036-24.3-88.076-32.884c-31-10.255-55.092-4.241-63.239-9.858-6.609-4.563-1.24-17.211-10.341-23.076-10.739-6.907-24.527-5.679-45.26-17.075-13.206-7.291-5.716-11.8-1.314-13.937,75.143-36.381,87.133-92.552,87.666-96.719.645-5.046,1.364-9.014-4.191-14.148-5.369-4.96-29.189-19.7-35.8-24.316-10.937-7.638-15.748-15.264-12.2-24.638,2.48-6.485,8.531-8.928,14.879-8.928a27.643,27.643,0,0,1,5.965.67c12,2.6,23.659,8.617,30.392,10.242a10.749,10.749,0,0,0,2.48.335c3.6,0,4.86-1.811,4.612-5.927-.768-13.132-2.628-38.725-.558-62.644,2.84-32.909,13.442-49.215,26.04-63.636,6.051-6.932,34.484-36.976,88.857-36.976s82.88,29.92,88.931,36.827c12.611,14.421,23.225,30.727,26.04,63.636,2.071,23.919.285,49.525-.558,62.644-.285,4.327,1.017,5.927,4.613,5.927a10.648,10.648,0,0,0,2.48-.335c6.745-1.624,18.4-7.638,30.4-10.242a27.641,27.641,0,0,1,5.964-.67c6.386,0,12.4,2.48,14.88,8.928,3.546,9.374-1.24,17-12.189,24.639-6.609,4.612-30.429,19.343-35.8,24.315-5.568,5.134-4.836,9.1-4.191,14.149.533,4.228,12.511,60.4,87.666,96.718C468.629,373.011,476.119,377.524,462.913,384.877Z'],
    discord: ['0 0 640 512', 'M524.531,69.836a1.5,1.5,0,0,0-.764-.7A485.065,485.065,0,0,0,404.081,32.03a1.816,1.816,0,0,0-1.923.91,337.461,337.461,0,0,0-14.9,30.6,447.848,447.848,0,0,0-134.426,0,309.541,309.541,0,0,0-15.135-30.6,1.89,1.89,0,0,0-1.924-.91A483.689,483.689,0,0,0,116.085,69.137a1.712,1.712,0,0,0-.788.676C39.068,183.651,18.186,294.69,28.43,404.354a2.016,2.016,0,0,0,.765,1.375A487.666,487.666,0,0,0,176.02,479.918a1.9,1.9,0,0,0,2.063-.676A348.2,348.2,0,0,0,208.12,430.4a1.86,1.86,0,0,0-1.019-2.588,321.173,321.173,0,0,1-45.868-21.853,1.885,1.885,0,0,1-.185-3.126c3.082-2.309,6.166-4.711,9.109-7.137a1.819,1.819,0,0,1,1.9-.256c96.229,43.917,200.41,43.917,295.5,0a1.812,1.812,0,0,1,1.924.233c2.944,2.426,6.027,4.851,9.132,7.16a1.884,1.884,0,0,1-.162,3.126,301.407,301.407,0,0,1-45.89,21.83,1.875,1.875,0,0,0-1,2.611,391.055,391.055,0,0,0,30.014,48.815,1.864,1.864,0,0,0,2.063.7A486.048,486.048,0,0,0,610.7,405.729a1.882,1.882,0,0,0,.765-1.352C623.729,277.594,590.933,167.465,524.531,69.836ZM222.491,337.58c-28.972,0-52.844-26.587-52.844-59.239S193.056,219.1,222.491,219.1c29.665,0,53.306,26.82,52.843,59.239C275.334,310.993,251.924,337.58,222.491,337.58Zm195.38,0c-28.971,0-52.843-26.587-52.843-59.239S388.437,219.1,417.871,219.1c29.667,0,53.307,26.82,52.844,59.239C470.715,310.993,447.538,337.58,417.871,337.58Z'],
    medium: ['0 0 640 512', 'M180.5,74.262C80.813,74.262,0,155.633,0,256S80.819,437.738,180.5,437.738,361,356.373,361,256,280.191,74.262,180.5,74.262Zm288.25,10.646c-49.845,0-90.245,76.619-90.245,171.095s40.406,171.1,90.251,171.1,90.251-76.619,90.251-171.1H559C559,161.5,518.6,84.908,468.752,84.908Zm139.506,17.821c-17.526,0-31.735,68.628-31.735,153.274s14.2,153.274,31.735,153.274S640,340.631,640,256C640,171.351,625.785,102.729,608.258,102.729Z'],
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
        slide.setAttribute('aria-label', `Step ${index + 1} of ${items.length}`);
        const img = makeImage(safeUrl(item.image), format(item.alt, content));
        slide.append(img, el('figcaption', '', `${index + 1}. ${format(item.text, content)}`));
        return slide;
      }),

    'agencyPlan.highlights': (items, content) =>
      items.map((item) => {
        const box = el('div', 'plan-highlight');
        const img = makeImage(safeUrl(item.image), format(item.alt, content));
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
        const img = makeImage(safeUrl(item.image), format(item.alt, content));
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
      items.map((item) => makeImage(safeUrl(item.image), format(item.name, content))),
  };

  function render() {
    rememberImages();
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
    const firstTime = !root.dataset.ready;
    // The first time, the ResizeObserver below reports the size once the page has been laid out. Measuring here
    // instead would make the browser lay the whole page out in the middle of this script.
    if (!(firstTime && 'ResizeObserver' in window)) buildDots();

    if (!firstTime) return;
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
    // The page's own HTML already holds these slides. When they show the same pictures they are kept as they are:
    // replacing the first picture with a new element would restart the browser's paint timing of the largest image on the page.
    const present = Array.from(track.children);
    const reuse = count > 0 && present.length === count && present.every((node, i) => {
      const img = node.querySelector('img');
      return img && node.getAttribute('aria-hidden') !== 'true' && img.getAttribute('src') === safeUrl(slides[i].image) && (img.getAttribute('alt') || '') === (slides[i].alt || '');
    });
    if (!reuse) track.replaceChildren();
    dotsBox.replaceChildren();
    root.teardown = null;
    if (!count) return;

    const describe = (node, number) => {
      node.setAttribute('role', 'group');
      node.setAttribute('aria-roledescription', 'slide');
      node.setAttribute('aria-label', `${number} of ${count}`);
    };

    const makeSlide = (slide, number, isClone) => {
      const node = el('div', 'slider-slide');
      const img = makeImage(safeUrl(slide.image), isClone ? '' : slide.alt);
      // Only the slide the visitor sees first is worth fetching ahead of everything else.
      if (isClone) img.removeAttribute('fetchpriority');
      img.draggable = false;
      describe(node, number);
      if (isClone) node.setAttribute('aria-hidden', 'true');
      node.append(img);
      return node;
    };

    // Looping uses a clone of the last slide in front and of the first slide behind,
    // so the slider can keep moving in one direction and jump back unseen.
    const loop = count > 1 && !reducedMotion.matches;
    if (reuse) {
      present.forEach((node, i) => {
        describe(node, i + 1);
        node.querySelector('img').draggable = false;
      });
      if (loop) {
        track.prepend(makeSlide(slides[count - 1], count, true));
        track.append(makeSlide(slides[0], 1, true));
      }
    } else {
      const nodes = slides.map((slide, i) => makeSlide(slide, i + 1, false));
      if (loop) {
        nodes.unshift(makeSlide(slides[count - 1], count, true));
        nodes.push(makeSlide(slides[0], 1, true));
      }
      track.append(...nodes);
    }

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

  // Agent registration form handler
  const applyForm = document.getElementById('agent-register-form');
  if (applyForm) {
    applyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (document.getElementById('apply-name') || {}).value?.trim();
      const phone = (document.getElementById('apply-phone') || {}).value?.trim();
      const state = (document.getElementById('apply-state') || {}).value || 'Maharashtra';
      const referral = (document.getElementById('apply-ref') || {}).value?.trim();
      const successMsg = document.getElementById('apply-success-msg');
      if (!name || !phone) return;

      const USERS_STORAGE_KEY = 'tps_agents_users_v1';
      let currentUsers = [];
      try {
        const raw = localStorage.getItem(USERS_STORAGE_KEY);
        currentUsers = raw ? JSON.parse(raw) : [];
      } catch (err) {
        currentUsers = [];
      }
      if (!Array.isArray(currentUsers)) currentUsers = [];

      const newId = `TPS-${Math.floor(10000 + Math.random() * 90000)}`;
      const newUser = {
        id: newId,
        name: name,
        phone: phone,
        email: '',
        state: state,
        role: 'Agent',
        commission: 70,
        balance: 0,
        status: 'Pending',
        referralCode: name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase(),
        referredBy: referral || 'WEBSITE',
        registeredAt: new Date().toISOString(),
        notes: 'Submitted application via website registration form.'
      };

      currentUsers.unshift(newUser);
      try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(currentUsers));
      } catch (err) {}

      applyForm.reset();
      if (successMsg) {
        successMsg.textContent = `🎉 Congratulations ${name}! Your agent application has been submitted successfully. Your new Agent ID is ${newId}. Our agent manager will review your application and contact you on WhatsApp (${phone}) shortly.`;
        successMsg.hidden = false;
        successMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }
});
