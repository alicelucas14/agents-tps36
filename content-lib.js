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
    defaults: function () { return clone(window.SITE_DEFAULTS); },
    // Published content with this browser's draft (if any) applied on top.
    load: function () { return merge(window.SITE_DEFAULTS, readDraft()); },
    merge: merge,
    clone: clone,
    safeUrl: safeUrl,
    format: format
  };
})();
