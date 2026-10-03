"""Generates MovieMango "Cine-specs" logo assets. Requires: pip install cairosvg"""
import cairosvg

YELLOW, YELLOW_SHADE = "#FED201", "#F2B705"
GREEN, GREEN_LIGHT, GREEN_RIB = "#8CC63F", "#A9D46A", "#6FA22E"
NAVY, STEM = "#27323F", "#5A6B2E"
LENS_L, LENS_R = "#EF5350", "#26C6DA"
CREAM = "#FFF8E1"

BODY = "M300 118 C382 128 430 202 424 288 C418 382 352 454 262 456 C176 458 116 400 112 318 C108 250 136 190 176 152 C212 120 254 110 300 118 Z"
STACHE_HALF = ("M266 356 C276 338 300 331 322 339 C340 346 352 358 368 356 "
               "C380 354 386 344 384 334 C396 350 389 373 364 381 "
               "C336 390 300 381 280 371 C272 367 268 363 266 362 Z")


def mango(simple=False):
    """Leaves, stem and body. `simple` drops fine details for favicon sizes."""
    rib = "" if simple else f'<path d="M274 120 C236 100 196 84 156 74" stroke="{GREEN_RIB}" stroke-width="5" fill="none" stroke-linecap="round"/>'
    highlight = "" if simple else '<ellipse cx="190" cy="196" rx="30" ry="16" transform="rotate(-38 190 196)" fill="#fff" opacity=".45"/>'
    return f'''
  <defs><clipPath id="mm-body"><path d="{BODY}"/></clipPath></defs>
  <path d="M286 120 C302 92 330 80 358 86 C346 114 316 128 286 120 Z" fill="{GREEN_LIGHT}"/>
  <path d="M280 124 C250 70 190 50 138 68 C166 120 228 142 280 124 Z" fill="{GREEN}"/>
  {rib}
  <path d="M284 124 C290 102 300 88 296 68 C292 50 300 38 314 30" stroke="{STEM}" stroke-width="11" fill="none" stroke-linecap="round"/>
  <path d="{BODY}" fill="{YELLOW}"/>
  <g clip-path="url(#mm-body)">
    <circle cx="210" cy="250" r="236" fill="none" stroke="{YELLOW_SHADE}" stroke-width="60" opacity=".55"/>
  </g>
  {highlight}'''


def specs(simple=False):
    """Red/cyan 3D cinema glasses."""
    def lens(x, colour):
        return f'<rect x="{x}" y="238" width="92" height="64" rx="18" fill="{colour}" stroke="{NAVY}" stroke-width="13"/>'

    def shine(x):
        return f'<path d="M{x + 18} 286 L{x + 40} 254" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".5"/>'

    shines = "" if simple else shine(160) + shine(280)
    return f'''
  <path d="M160 258 L128 248 M372 258 L404 248" stroke="{NAVY}" stroke-width="12" stroke-linecap="round"/>
  {lens(160, LENS_L)}{lens(280, LENS_R)}
  <path d="M252 262 C258 252 274 252 280 262" stroke="{NAVY}" stroke-width="12" fill="none" stroke-linecap="round"/>
  {shines}'''


def stache():
    return (f'<path d="{STACHE_HALF}" fill="{NAVY}"/>'
            f'<path d="{STACHE_HALF}" fill="{NAVY}" transform="translate(532 0) scale(-1 1)"/>')


def logo_svg(simple=False):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="MovieMango">'
            f'{mango(simple)}{specs(simple)}{stache()}</svg>')


def icon_svg(bg=CREAM, scale=0.8):
    """Full-bleed square icon; scale 0.8 keeps the mark inside the maskable safe zone."""
    off = 256 * (1 - scale)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="{bg}"/>'
            f'<g transform="translate({off} {off + 6}) scale({scale})">{mango()}{specs()}{stache()}</g></svg>')


def png(svg, path, size):
    cairosvg.svg2png(bytestring=svg.encode(), write_to=path, output_width=size, output_height=size)


if __name__ == "__main__":
    logo, icon, favicon = logo_svg(), icon_svg(), logo_svg(simple=True)
    open("moviemango-logo.svg", "w").write(logo)
    open("moviemango-icon-maskable.svg", "w").write(icon)
    open("favicon.svg", "w").write(favicon)
    for size in (512, 192):
        png(logo, f"moviemango-logo-{size}.png", size)
        png(icon, f"moviemango-icon-maskable-{size}.png", size)
    for size in (32, 16):
        png(favicon, f"favicon-{size}.png", size)
    png(icon_svg(scale=0.92), "apple-touch-icon-180.png", 180)
