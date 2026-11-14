/*
 * Helpers shared by index.html and admin.html.
 *
 * content.js holds the published content (window.SITE_DEFAULTS). The admin panel
 * keeps unpublished edits as a draft in this browser's localStorage, and
 * SiteContent.load() overlays that draft on the published content.
 * index.html carries the same text as a no-JavaScript fallback.
 */
(function () {
  var DRAFT_KEY = 'tps_site_content_draft_v1';

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // Overlay `draft` on `base`, keeping base's shape and ignoring wrongly typed values,
  // so a hand-edited or corrupt draft can never break the page.
  function merge(base, draft) {
    if (isPlainObject(base)) {
      var out = {};
      Object.keys(base).forEach(function (key) {
        out[key] = merge(base[key], isPlainObject(draft) ? draft[key] : undefined);
      });
      return out;
    }
    if (Array.isArray(base)) {
      if (!Array.isArray(draft)) return clone(base);
      var template = base[0];
      return draft
        .filter(function (item) { return isPlainObject(template) ? isPlainObject(item) : typeof item === typeof template; })
        .map(function (item) { return isPlainObject(template) ? merge(template, item) : item; });
    }
    if (typeof draft === typeof base && (typeof base !== 'number' || isFinite(draft))) return draft;
    return base;
  }

  // Settings added after content.js was first published. The copy on the server is written by the admin's
  // Publish button, so it only gains a new setting at the next Publish; until then these values fill the gap.
  // (Do not add them to content.js in git: the server's copy differs and its `git pull` would conflict.)
  var ADDED = {
    analytics: { measurementId: 'G-921DPXFB4H' }
  };

  // A Google Analytics 4 Measurement ID. Checked before it is ever put into a script address.
  var GA_ID = /^G-[A-Z0-9]{4,20}$/;

  function fill(target, extra) {
    Object.keys(extra).forEach(function (key) {
      if (isPlainObject(extra[key]) && isPlainObject(target[key])) fill(target[key], extra[key]);
      else if (!(key in target)) target[key] = clone(extra[key]);
    });
    return target;
  }

  // The published content plus any setting from ADDED that it does not have yet.
  function complete(published) {
    return fill(clone(published), ADDED);
  }

  // The Measurement ID visitors are counted under: the PUBLISHED one only, never this browser's draft, so an
  // unfinished edit in the admin cannot send visits to the wrong property. Empty means analytics is off.
  function analyticsId() {
    try {
      var id = String(complete(window.SITE_DEFAULTS).analytics.measurementId || '').trim().toUpperCase();
      return GA_ID.test(id) ? id : '';
    } catch (err) {
      return '';
    }
  }

  function readDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  // Only http(s), mailto, and relative/anchor URLs are allowed; anything else
  // (javascript:, data:, ...) is dropped so edited content cannot inject script.
  function safeUrl(url) {
    var value = String(url == null ? '' : url).trim();
    if (!value) return '';
    if (/^(https?:|mailto:)/i.test(value)) return value;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return '';
    return value;
  }

  function format(text, content) {
    return String(text == null ? '' : text)
      .replace(/\{commission\}/g, String(content.commission))
      .replace(/\{year\}/g, String(new Date().getFullYear()));
  }

  window.SiteContent = {
    DRAFT_KEY: DRAFT_KEY,
    GA_ID: GA_ID,
    defaults: function () { return complete(window.SITE_DEFAULTS); },
    // Published content with this browser's draft (if any) applied on top.
    load: function () { return merge(complete(window.SITE_DEFAULTS), readDraft()); },
    complete: complete,
    analyticsId: analyticsId,
    merge: merge,
    clone: clone,
    safeUrl: safeUrl,
    format: format
  };
})();
