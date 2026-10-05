# Blog importer

Brings the posts from a WordPress site onto this site as plain, fast, searchable pages under `/blogs/`.

## Two ways to run it

**In the admin (no command line).** Open `admin.html` → **Blog**. Enter your WordPress address (or choose a WordPress export file), click **Import posts**, then **Download blog files (.zip)** and unzip it into the site folder, next to `index.html`.

**From the command line** (Node 18 or newer), run in the site folder:

```
node tools/blog.mjs import --api https://your-wordpress-site.com
node tools/blog.mjs import --file wordpress-export.xml
node tools/blog.mjs build
```

- `import --api` reads every published post straight from the WordPress REST API.
- `import --file` reads a WordPress export: in WordPress choose **Tools → Export → Posts** and download the `.xml` file. Use this if the site's API is switched off.
- `build` rebuilds the pages from `blogs/posts.json` (for example after changing the blog title, posts per page or byline in the admin) without contacting WordPress.
- `--download-images` (with `import`) saves every post image into `blogs/media`, so the site no longer depends on WordPress. Without it, images keep loading from the WordPress site.

Both ways produce identical files.

## What you get

```
blogs/index.html              the blog list (page 1), then blogs/page/2/ ... 
blogs/<post-name>/index.html  one page per post
blogs/search.json             powers the search box
blogs/sitemap.xml             submit this to Google Search Console
blogs/redirects.txt           old WordPress address -> new address (301), for your server
blogs/posts.json              the cleaned posts, so pages can be rebuilt later
```

Re-importing replaces the generated pages and removes pages for posts that no longer exist.
Downloaded images in `blogs/media` are kept.

## Pages

Some WordPress **pages** (not posts) can be kept at their old addresses, for example `/big-agent-india/`:

```
node tools/blog.mjs pages --api https://your-wordpress-site.com --slugs big-agent-india,teen-patti-bihar
```

`--slugs` is the list of page names, the last part of each page's address. Each page is read from
the WordPress REST API, cleaned the same way as a post, and written as `<page-name>/index.html`
with the site's header, footer and social sidebar, plus the page's own search description.
Links between these pages and to blog posts are pointed at the new addresses. You also get:

```
pages.json          the cleaned pages, so they can be rebuilt without WordPress
sitemap-pages.xml   the home page and these pages, for Google Search Console
```

`build` rebuilds the pages together with the blog, so they always carry the current header and
footer. Run `pages` again to refresh the text from WordPress; it removes pages you left out.
Pictures keep loading from `/wp-content/uploads/...` on this domain, so copy those files to the
server (they are not in the repository).

## Settings

In the admin: **Blog** (title, author name, posts per page) and **General → Site address**
(used for canonical links and the sitemap). Blog pages reuse the site's header and footer from
`index.html`, so changes there show up on the blog after the next rebuild.
