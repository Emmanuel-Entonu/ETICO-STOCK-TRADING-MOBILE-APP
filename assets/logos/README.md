# Ticker logos

Drop PNG logo files here, named after the ticker in **ALL CAPS**, then register them in [`src/lib/localLogos.ts`](../../src/lib/localLogos.ts).

## Naming convention

```
DANGCEM.png
ZENITHBANK.png
MTNN.png
GTCO.png
```

Exact match to the NGX ticker. One file per ticker.

## Recommended specs

- **Format:** PNG with transparent background
- **Size:** 256×256 or 512×512 (renders at 40px – 64px on screen; ~3× resolution is enough for retina)
- **Padding:** ~10% inset so the logo doesn't touch the badge edge
- **Aspect:** square canvas; if the logo is wide, center it and pad vertically

## Where to source logos

- Company press kits / newsrooms (usually the highest quality)
- NGX company profile pages
- Wikipedia article for the company (right-click → save image on the infobox logo)
- Your design team

## After adding a file

Add a line to [`src/lib/localLogos.ts`](../../src/lib/localLogos.ts):

```ts
DANGCEM: require('../../assets/logos/DANGCEM.png'),
```

React Native's bundler needs `require()` calls to be statically resolvable, so every ticker must be listed explicitly. If a `.png` file exists but isn't in the manifest, it won't ship in the bundle.
