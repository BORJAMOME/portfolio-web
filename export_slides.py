import os
import sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
DECK = os.path.join(HERE, "deck.html")
OUT_DIR = os.path.join(HERE, "slides_png")
os.makedirs(OUT_DIR, exist_ok=True)

W, H = 1920, 1080

OVERRIDE_CSS = """
.slide{ width:%dpx !important; height:%dpx !important; aspect-ratio:auto !important;
  border-radius:0 !important; box-shadow:none !important; }
.stage{ padding:0 !important; }
.chrome, .hintbar, .prog, .idx, .portrait-hint{ display:none !important; }
body{ overflow:visible !important; }
""" % (W, H)

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": W + 200, "height": H + 200}, device_scale_factor=1)
    context.reduced_motion = "reduce"
    page = context.new_page()
    page.emulate_media(reduced_motion="reduce")
    page.goto(f"file:///{DECK.replace(os.sep, '/')}")
    page.wait_for_load_state("networkidle")
    page.evaluate("document.fonts && document.fonts.ready")
    page.add_style_tag(content=OVERRIDE_CSS)

    n = page.evaluate("document.querySelectorAll('.slide').length")
    print(f"Total slides: {n}")

    for i in range(n):
        page.evaluate(
            "(i)=>{document.querySelectorAll('.slide').forEach((s,k)=>s.classList.toggle('active', k===i));}",
            i,
        )
        page.wait_for_timeout(60)
        el = page.locator(".slide.active")
        path = os.path.join(OUT_DIR, f"slide_{i+1:03d}.png")
        el.screenshot(path=path)
        if (i + 1) % 10 == 0 or i == n - 1:
            print(f"Captured {i+1}/{n}")

    browser.close()

print("Done. PNGs in", OUT_DIR)
