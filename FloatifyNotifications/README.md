# Floatify Notification website

The website of the Android app Floatify Notification, served by GitHub Pages at
`https://schurkie.github.io/FloatifyNotifications/` (the capital letters matter: URLs are case-sensitive).

This folder is a self-contained site. The repository root (privacy policy, terms) is not part of it;
the site links to `/privacy_policy.html` and `/terms.html` in the root.

## Editing

- All texts live in `_content/en.json`. Edit there, never in `index.html`.
- `index.html` is generated. After a change run (Node 18 or newer, no dependencies):

  ```
  node _tools/build.mjs
  ```

  and commit the new `index.html` too, because GitHub Pages serves files as they are.
- The page layout is `_src/template.html`; the style is `assets/css/site.css`.
- Folders that start with an underscore (`_content`, `_src`, `_tools`) are not published by Jekyll.
- Another language later: copy `_content/en.json` to `_content/<lang>.json`, translate, run
  `node _tools/build.mjs <lang>` (writes `<lang>/index.html`).

## The film

`media/floatify-promo-long.mp4` with its poster `media/floatify-promo-long-poster.webp`. To replace the
film, overwrite these two files (same names). Keep the film under about 15 MB.

## Floaty

Floaty is drawn in `assets/js/floaty.js` (a plain JavaScript port of the Floaty of the promo films),
the two gags are in `assets/js/gags.js`, and the guide behaviour is in `assets/js/guide.js`.
With "reduce motion" switched on in the visitor's system, nothing moves by itself.
The cross hides Floaty; this is remembered in the browser (`localStorage`, key `floatify.site.floatyHidden`).

## Principles

No cookies, trackers, analytics, external fonts or third-party embeds. The font (Fredoka, SIL Open Font
License, see `assets/fonts/OFL.txt`) is hosted here. The Google Play badge is the official, unchanged badge.

## Look at it locally

Serve the folder that contains `FloatifyNotifications` (the repository root) with any static server, for
example `npx serve` or `python -m http.server`, and open `/FloatifyNotifications/`.
`_src/floaty-test.html` is a comparison page for the Floaty port (add `?live` to see it move).
