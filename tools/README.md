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
blogs/redirects.nginx.conf    the same redirects as one include file for nginx (aaPanel), plus the cache rule below
blogs/posts.json              the cleaned posts, so pages can be rebuilt later
```

Re-importing replaces the generated pages and removes pages for posts that no longer exist.
Downloaded images in `blogs/media` are kept.

**Updates that appear by themselves.** aaPanel tells browsers to keep `.js`, `.css` and `.json` files for 12 hours,
and Cloudflare keeps its own copy for as long, so a changed script or stylesheet could stay hidden until someone
purged the cache. `redirects.nginx.conf` therefore also holds one rule that makes those files revalidate on every
visit (a quick `304 Not Modified` when nothing changed; pictures stay cached). The rule only takes effect once nginx
re-reads the file: after pulling an updated `redirects.nginx.conf`, press **Save** in the aaPanel URL rewrite tab (wait until
the include line has loaded in the editor first) or reload nginx. Check it with `curl -I https://your-site/script.js`:
the answer should say `Cache-Control: no-cache`.

The same file gives pictures (`webp`, `avif`, `svg`) and fonts (`woff2`) a one-year cache, because they are never replaced under
the same name; aaPanel only does that for png, jpg and gif. **Cloudflare note:** its *Browser Cache TTL* setting (Caching →
Configuration) overrides whatever nginx sends. Leave it on **Respect Existing Headers**, otherwise every script, style and
picture is cached for the 4 hours it defaults to and the rules above do nothing for visitors' browsers.

### Writing and editing posts in the admin

The **Posts** section of the admin lists every post (newest first, searchable by title, address, category or
tag). **+ Add post** opens a blank editor; **Edit** opens an existing post. A post has a title, an address,
a date, an author (empty uses the blog's byline), a category, tags, a summary for the blog list (empty uses
the start of the post), a main picture, and the text, written with a toolbar or in an HTML view. **Preview
post** shows it with the site's header, footer and sidebar exactly as visitors will see it.

Edits wait in the browser as a draft. **Download blog files (.zip)** rebuilds the whole blog with the same
code as `node tools/blog.mjs build`, so posts you did not touch come out byte for byte the same. Unzip it into the
site folder, push to GitHub and pull on the server. Things to know:

- The address of a post that is already on the site cannot change (visitors and Google use it). A post that is
  still only in your draft can be renamed. An address cannot be `page` or `media`, or one a post already has.
- A new post is also added to the blog list, the search box, the sitemap and the recent-posts sidebar. Adding a
  post that is newer than the others changes the recent-posts list, so most post files are rewritten. That is expected.
- A zip cannot delete files, so for deleted posts it also lists the files to remove (`REMOVED-POSTS.txt`).
- New posts get no old-address redirect, because WordPress never knew them.
- A draft that the server already has (after you publish) disappears by itself.
- `blogs/posts.json` stays the source of truth: the admin reads it and the zip writes it back.

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

## Search engines and AI assistants

Every page `build` writes carries what search engines, social sites and AI assistants read:

- a title (the site name is added only while the title stays within about 65 characters), a description of up to
  155 characters taken from the first paragraphs (not the table of contents, and not a paragraph that repeats the title)
  that ends at the end of a sentence where it can, a canonical link, `robots` directives that allow
  large picture previews, icons, and Open Graph / Twitter tags with a share picture (`og-default.jpg` when the page has none);
- structured data (JSON-LD): the organisation (with the social profiles found in the footer) and the website on every
  page, plus `BlogPosting`, `WebPage` or `CollectionPage` and a `BreadcrumbList`;
- headings in a clean order under the single `<h1>` (the first heading in a text becomes an `<h2>`, none skips a level),
  and pictures after the first one load lazily (the first picture, and the first card of a blog list, load at once with
  high priority because they are usually the largest thing on screen);
- every page of the blog list has its own heading and description (`Blogs – Page 2`), so they do not look like copies;
- a page that other pages live under (`/teen-patti-games/`) ends with a **More in …** list linking to each of them, and
  `/site-map/` lists every page; the footer links to it. Together they keep every page reachable by links, not only through the sitemap;
- picture addresses in meta tags and structured data are plain ASCII (`DALL·E` becomes `DALL%C2%B7E`).

**Fonts** are served from `/fonts` (Archivo, Inter and Roboto, variable `woff2` files, `latin` and `latin-ext` only), so a page
never waits for another site. `styles.css` holds the `@font-face` rules and `index.html` preloads the Roboto file; blog and page
files copy that preload from `index.html`. `admin.html` still loads Google Fonts, which only affects the admin.

Files in the site folder that belong to this and are not generated:

```
robots.txt            allows everything public, keeps tools/ and the data dumps out, names the sitemap
fonts/                the self-hosted font files (see above)
llms.txt              a short guide to the site for AI assistants (edit it when key pages change)
favicon.ico, favicon-48.png, apple-touch-icon.png   the icons, made from the logo
og-default.jpg        the 1200 x 630 picture shown when a page without a picture of its own is shared
404.html              the "page not found" page (written by build)
```

The head of the **home page** (`index.html`) is written by hand: its canonical link, share tags and structured data
carry the site address and title as text, so update them there if the address or the main title ever changes.
To show `404.html` for missing addresses, add `error_page 404 /404.html;` in the aaPanel site's configuration.

## Settings

In the admin: **Blog** (title, author name, posts per page) and **General → Site address**
(used for canonical links and the sitemap). Blog pages reuse the site's header and footer from
`index.html`, so changes there show up on the blog after the next rebuild.
