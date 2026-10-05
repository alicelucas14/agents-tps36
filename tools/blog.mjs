#!/usr/bin/env node
/*
 * Blog importer: WordPress -> static pages under /blogs/.
 *
 *   node tools/blog.mjs import --api https://your-wordpress-site.com
 *   node tools/blog.mjs import --file wordpress-export.xml
 *   node tools/blog.mjs build                      (rebuild pages from blogs/posts.json)
 *   node tools/blog.mjs pages --api https://your-wordpress-site.com --all
 *   node tools/blog.mjs pages --api https://your-wordpress-site.com --slugs big-agent-india,teen-patti-bihar
 *                                                  (WordPress pages kept at their old addresses, nested ones included)
 *
 * Options:
 *   --download-images   copy every post image into blogs/media so the site no longer needs WordPress
 *   --out <folder>      write somewhere other than the site folder
 *
 * Needs Node 18 or newer. Blog settings (title, posts per page, byline) and the site address
 * come from content.js; the header and footer come from index.html. Imported pages are saved in
 * pages.json and are rebuilt together with the blog, so they always carry the current header and footer.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as core from './blog-core.mjs';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i += 1; }
    } else args._.push(arg);
  }
  return args;
}

async function readSiteSettings() {
  const source = await fs.readFile(path.join(siteRoot, 'content.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  const content = sandbox.window.SITE_DEFAULTS;
  return {
    settings: content.blog || { title: 'Blogs', perPage: 9, author: '' },
    siteUrl: content.seo?.siteUrl || '',
  };
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

/* ---------- images ---------- */

function localImagePath(url) {
  const marker = '/wp-content/uploads/';
  const at = url.indexOf(marker);
  if (at >= 0) return path.posix.join(core.POSTS_DIR, 'media', decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0]));
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 10);
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image');
  return path.posix.join(core.POSTS_DIR, 'media', 'external', `${hash}-${name}`);
}

async function downloadImages(posts, outDir) {
  // 1. collect every remote image
  const wanted = new Map();
  const collect = (tag) => {
    const src = tag.match(/\ssrc="([^"]+)"/);
    const url = src && core.decodeEntities(src[1]);
    if (url && /^https?:/i.test(url)) wanted.set(url, localImagePath(url));
  };
  for (const post of posts) {
    for (const tag of post.html.match(/<img\b[^>]*>/gi) || []) collect(tag);
    if (post.image && /^https?:/i.test(post.image.src)) wanted.set(post.image.src, localImagePath(post.image.src));
  }

  // 2. download them, several at a time
  const queue = [...wanted];
  const saved = new Set();
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const [url, local] = queue.shift();
      const target = path.join(outDir, local);
      let ok = await exists(target);
      for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw new Error(String(response.status));
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
          ok = true;
        } catch { /* try again */ }
      }
      if (ok) saved.add(url);
      else console.warn(`\n  could not download ${url}`);
      done += 1;
      if (done % 50 === 0 || done === wanted.size) process.stdout.write(`\r  images: ${done}/${wanted.size}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  if (wanted.size) process.stdout.write('\n');

  // 3. point posts at the local copies, but only for images that arrived
  for (const post of posts) {
    post.html = post.html.replace(/<img\b[^>]*>/gi, (tag) => {
      const src = tag.match(/\ssrc="([^"]+)"/);
      const url = src && core.decodeEntities(src[1]);
      if (!url || !saved.has(url)) return tag;
      return tag.replace(/\ssrc="[^"]+"/, ` src="/${wanted.get(url)}"`).replace(/\s(?:srcset|sizes)="[^"]*"/g, '');
    });
    if (post.image && saved.has(post.image.src)) post.image.src = `/${wanted.get(post.image.src)}`;
  }
  return { total: wanted.size, failed: wanted.size - saved.size };
}

/* ---------- writing ---------- */

async function writeFiles(outDir, files) {
  const manifestPath = path.join(outDir, core.POSTS_DIR, '.manifest.json');
  let previous = [];
  try { previous = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { /* first run */ }

  const current = new Set(files.map((file) => file.path));
  let removed = 0;
  for (const old of previous) {
    if (current.has(old)) continue;
    await fs.rm(path.join(outDir, old), { force: true });
    removed += 1;
    // tidy up folders that are now empty
    let dir = path.dirname(old);
    while (dir.length > core.POSTS_DIR.length) {
      try { await fs.rmdir(path.join(outDir, dir)); } catch { break; }
      dir = path.dirname(dir);
    }
  }

  for (const file of files) {
    const target = path.join(outDir, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content);
  }
  await fs.writeFile(manifestPath, JSON.stringify([...current].sort(), null, 1));
  return { written: files.length, removed };
}

/* ---------- plain pages ---------- */

async function readSavedPages(outDir) {
  try { return JSON.parse(await fs.readFile(path.join(outDir, 'pages.json'), 'utf8')); } catch { return null; }
}

async function readPostSlugs(outDir) {
  try {
    return JSON.parse(await fs.readFile(path.join(outDir, core.POSTS_DIR, 'posts.json'), 'utf8')).posts.map((post) => post.slug);
  } catch {
    return [];
  }
}

// A page's address without slashes, e.g. "teen-patti-games/trx-win-go" (pages saved earlier only have a slug).
const pagePath = (page) => page.path ?? page.slug;

async function writePageFiles(outDir, files, previousPaths = []) {
  const current = new Set(files.filter((file) => file.path.endsWith('/index.html')).map((file) => file.path.slice(0, -'/index.html'.length)));
  let removed = 0;
  for (const old of previousPaths) {
    if (current.has(old)) continue;
    await fs.rm(path.join(outDir, old, 'index.html'), { force: true });
    // tidy up folders that are now empty, from the page's own folder upwards (a folder that still holds pages stays)
    for (let dir = old; dir; dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '') {
      try { await fs.rmdir(path.join(outDir, dir)); } catch { break; }
    }
    removed += 1;
  }
  for (const file of files) {
    const target = path.join(outDir, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content);
  }
  return { written: files.length, removed };
}

async function importPages(args, outDir, { siteUrl, chrome }) {
  if (!args.api || args.api === true) throw new Error('Give the WordPress address: --api https://your-wordpress-site.com');
  const everything = args.all === true;
  if (!everything && (!args.slugs || args.slugs === true)) throw new Error('Say which pages: --all, or --slugs big-agent-india,teen-patti-bihar');
  const slugs = everything ? null : String(args.slugs).split(',').map((slug) => slug.trim()).filter(Boolean);

  console.log(everything ? `Reading every page from ${args.api} ...` : `Reading ${slugs.length} pages from ${args.api} ...`);
  const imported = await core.fetchWpPages(args.api, slugs, { onProgress: ({ loaded, total }) => process.stdout.write(`\r  ${loaded}/${total} pages`) });
  process.stdout.write('\n');
  const skipped = [];
  const pages = core.preparePages(imported.pages, { origin: imported.origin, postSlugs: await readPostSlugs(outDir), skipped });
  const meta = { source: args.api, origin: imported.origin, importedAt: new Date().toISOString() };

  const previous = (await readSavedPages(outDir))?.pages?.map(pagePath) || [];
  const result = await writePageFiles(outDir, core.buildSitePages(pages, { siteUrl, chrome, meta }), previous);
  console.log(`Done. ${pages.length} pages written (${result.written} files)${result.removed ? `, ${result.removed} old pages removed` : ''}.`);
  for (const page of pages.slice(0, 8)) console.log(`  /${pagePath(page)}/`);
  if (pages.length > 8) console.log(`  ... and ${pages.length - 8} more`);
  for (const item of skipped) console.log(`  skipped ${item.path}: ${item.reason}`);
}

/* ---------- commands ---------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let command = args._[0];
  const outDir = args.out ? path.resolve(args.out) : siteRoot;

  if (!['import', 'build', 'pages'].includes(command)) {
    console.log(`Usage:
  node tools/blog.mjs import --api https://your-wordpress-site.com
  node tools/blog.mjs import --file wordpress-export.xml
  node tools/blog.mjs build
  node tools/blog.mjs pages --api https://your-wordpress-site.com --all
  node tools/blog.mjs pages --api https://your-wordpress-site.com --slugs big-agent-india,teen-patti-bihar

Options: --download-images   --out <folder>`);
    process.exit(command ? 1 : 0);
  }

  const { settings, siteUrl } = await readSiteSettings();
  const chrome = core.extractChrome(await fs.readFile(path.join(siteRoot, 'index.html'), 'utf8'));
  if (command === 'pages') {
    await importPages(args, outDir, { siteUrl, chrome });
    command = 'build'; // then refresh the blog too, so its redirects leave out any address a page now uses
  }
  let posts;
  let meta;

  if (command === 'import') {
    let imported;
    if (args.api && args.api !== true) {
      console.log(`Reading posts from ${args.api} ...`);
      imported = await core.fetchWpPosts(args.api, { onProgress: ({ loaded, total }) => process.stdout.write(`\r  ${loaded}/${total} posts`) });
      process.stdout.write('\n');
      meta = { source: args.api };
    } else if (args.file && args.file !== true) {
      console.log(`Reading ${args.file} ...`);
      imported = core.parseWxr(await fs.readFile(args.file, 'utf8'));
      meta = { source: path.basename(args.file) };
    } else {
      console.error('Give a source: --api <wordpress address> or --file <export.xml>');
      process.exit(1);
    }
    posts = core.preparePosts(imported.posts, { origin: imported.origin });
    meta.origin = imported.origin;
    meta.importedAt = new Date().toISOString();
    console.log(`Cleaned ${posts.length} posts.`);
    if (args['download-images']) {
      console.log('Downloading images ...');
      const result = await downloadImages(posts, outDir);
      console.log(`  ${result.total - result.failed} images saved${result.failed ? `, ${result.failed} failed (those stay linked to the WordPress site)` : ''}.`);
    }
  } else {
    const existing = path.join(outDir, core.POSTS_DIR, 'posts.json');
    if (!(await exists(existing))) {
      console.error(`No ${path.join(core.POSTS_DIR, 'posts.json')} yet. Run "import" first.`);
      process.exit(1);
    }
    const saved = JSON.parse(await fs.readFile(existing, 'utf8'));
    posts = saved.posts;
    meta = { source: saved.source, origin: saved.origin, importedAt: saved.importedAt };
    console.log(`Rebuilding ${posts.length} posts from ${core.POSTS_DIR}/posts.json ...`);
  }

  if (!posts.length) {
    console.error('No published posts found, so nothing was written.');
    process.exit(1);
  }
  const pagePaths = new Set(((await readSavedPages(outDir))?.pages || []).map(pagePath));
  const files = core.buildBlogFiles(posts, { settings, siteUrl, chrome, meta, skipRedirects: pagePaths });
  const result = await writeFiles(outDir, files);
  console.log(`Done. ${result.written} files written to ${path.join(outDir, core.POSTS_DIR)}${result.removed ? `, ${result.removed} old files removed` : ''}.`);
  console.log(`Open /${core.POSTS_DIR}/ on your site to see them.`);

  // Imported pages share the header and footer, so they are refreshed along with the blog.
  const savedPages = await readSavedPages(outDir);
  if (savedPages?.pages?.length) {
    const meta = { source: savedPages.source, origin: savedPages.origin, importedAt: savedPages.importedAt };
    await writePageFiles(outDir, core.buildSitePages(savedPages.pages, { siteUrl, chrome, meta }));
    console.log(`Rebuilt ${savedPages.pages.length} pages.`);
  }
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
