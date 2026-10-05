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
blogs/redirects.nginx.conf    the same redirects as one include file for nginx (aaPanel)
blogs/posts.json              the cleaned posts, so pages can be rebuilt later
```

Re-importing replaces the generated pages and removes pages for posts that no longer exist.
Downloaded images in `blogs/media` are kept.

## Pages

WordPress **pages** (not posts) can be kept at their old addresses, for example `/big-agent-india/`
or the nested `/teen-patti-games/trx-win-go/`:

```
node tools/blog.mjs pages --api https://your-wordpress-site.com --all
node tools/blog.mjs pages --api https://your-wordpress-site.com --slugs big-agent-india,teen-patti-bihar
```

`--all` imports every published page (the home page and `/blogs/` are skipped, because this site has
its own). `--slugs` takes just the named pages. Each page is read from
the WordPress REST API, cleaned the same way as a post, and written as `<page-name>/index.html`
with the site's header, footer and social sidebar, plus the page's own search description.
Links between these pages and to blog posts are pointed at the new addresses, and a nested page's
breadcrumb links to its parent page. Importing pages also refreshes the blog's redirect files, which leave
out any address that a page now owns (WordPress allowed a page and a post to share one). You also get:

```
pages.json          the cleaned pages, so they can be rebuilt without WordPress
sitemap-pages.xml   the home page and these pages, for Google Search Console
```

`build` rebuilds the pages together with the blog, so they always carry the current header and
footer. Run `pages` again to refresh the text from WordPress; it removes pages you left out.
Pictures keep loading from `/wp-content/uploads/...` on this domain, so copy those files to the
server (they are not in the repository).

### Editing pages in the admin

Once `pages.json` exists, the admin has a **Pages** section: a searchable list of every page, an editor
(title, search description, share picture and the text, with a toolbar and an HTML view), a preview, and
buttons to add and delete pages. Edits wait in the browser as a draft. **Download pages (.zip)** builds the
page files with the same code as the command line, so pages you did not touch come out byte for byte the
same. Unzip it into the site folder, push to GitHub and pull on the server. A zip cannot delete files, so
for removed pages it also lists the files to delete (`REMOVED-PAGES.txt`). A new page cannot reuse an
address the site already uses, a section address such as `/agency-plan/`, or an old blog post address.
Link to a new page from the menu with the **Header menu** section (for example `/my-new-page/`).

## Clean addresses for sections of the home page

A section of `index.html` marked with a `data-permalink` attribute gets an address of its own, for
example `/agency-plan/` instead of `/#agency-plan`. Clicking its menu link still scrolls the home page
smoothly and shows the clean address. The address also works when it is opened, shared or refreshed,
because `build` writes `<section-id>/index.html`: a copy of the home page that scrolls to the section.
The copies point to the home page as the main one for search engines, and browsers without JavaScript are
sent to the `#anchor`. Run `build` after changing the structure of `index.html` (text edits made in the
admin need nothing). To add a section, give it an `id` and a `data-permalink` attribute, link to `/<id>/`,
and run `build`.

## Sitemaps

`sitemap_index.xml` lists `sitemap-pages.xml` and `blogs/sitemap.xml`. WordPress published its sitemaps at that
same address, so Google keeps finding them.

## Settings

In the admin: **Blog** (title, author name, posts per page) and **General → Site address**
(used for canonical links and the sitemap). Blog pages reuse the site's header and footer from
`index.html`, so changes there show up on the blog after the next rebuild.
