# -*- coding: utf-8 -*-
import os
import json
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(HERE, "content_slides.json")
IMG_DIR = os.path.join(HERE, "pptx_images")
OUT = os.path.join(HERE, "Data Storytelling - editable.pptx")

FONT = "Segoe UI"
MONO = "Consolas"

PURPLE = RGBColor(0x4A, 0x62, 0x8E)
PURPLE_TEXT = RGBColor(0x34, 0x50, 0x7E)
PURPLE_SOFT = RGBColor(0xEA, 0xEE, 0xF4)
PURPLE_MID = RGBColor(0xB9, 0xC5, 0xD6)
ACCENT_BRIGHT = RGBColor(0x8B, 0xA6, 0xD4)
INK = RGBColor(0x1D, 0x26, 0x38)
MUTED = RGBColor(0x58, 0x60, 0x71)
CREAM = RGBColor(0xF2, 0xF0, 0xEB)
GROUND = RGBColor(0xFB, 0xFB, 0xFB)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GREEN_TEXT = RGBColor(0x2A, 0x66, 0x26)
GREEN_SOFT = RGBColor(0xEE, 0xF3, 0xE9)
RED_TEXT = RGBColor(0x7A, 0x1A, 0x2E)
RED_SOFT = RGBColor(0xFB, 0xEE, 0xEB)
GRID_C = RGBColor(0xE4, 0xE7, 0xEC)
SRC_BG = RGBColor(0xF5, 0xF6, 0xF8)
SRC_LABEL = RGBColor(0x4B, 0x55, 0x63)

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)
MARGIN_L = Inches(0.55)
MARGIN_R = Inches(0.55)
MARGIN_T = Inches(0.45)
MARGIN_B = Inches(0.35)
CONTENT_W = SLIDE_W - MARGIN_L - MARGIN_R


def set_fill(shape, color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def no_shadow(shape):
    el = shape.shadow._element if hasattr(shape, "shadow") else None
    # simplest: leave default (pptx blank shapes don't add shadow by default)


def add_rect(slide, l, t, w, h, color, rounded=True, line_color=None, line_w=None):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE
    shp = slide.shapes.add_shape(shape_type, l, t, w, h)
    if rounded:
        try:
            shp.adjustments[0] = 0.06
        except Exception:
            pass
    shp.fill.solid()
    shp.fill.fore_color.rgb = color
    if line_color:
        shp.line.color.rgb = line_color
        shp.line.width = line_w or Pt(0.75)
    else:
        shp.line.fill.background()
    shp.shadow.inherit = False
    return shp


def add_textbox(slide, l, t, w, h):
    tb = slide.shapes.add_textbox(l, t, w, h)
    tb.text_frame.word_wrap = True
    return tb


def _split_runs_on_newline(runs):
    """Split a flat run list into a list of run-groups on explicit '\\n' runs."""
    groups = [[]]
    for r in runs:
        if r.get("text") == "\n":
            groups.append([])
        else:
            groups[-1].append(r)
    return [g for g in groups if g] or [[]]


def set_runs(paragraph, runs, base_size=Pt(14), base_color=INK, bold_all=False, mono_all=False, font=FONT):
    if not runs:
        return
    for r in runs:
        text = r.get("text", "")
        if text == "" or text == "\n":
            continue
        run = paragraph.add_run()
        run.text = text
        run.font.size = base_size
        run.font.name = MONO if (mono_all or r.get("mono")) else font
        run.font.bold = bool(bold_all or r.get("bold"))
        run.font.italic = bool(r.get("italic"))
        run.font.color.rgb = base_color


def set_runs_multiline(tf, runs, base_size=Pt(14), base_color=INK, bold_all=False, align=None, use_first=True):
    """Write runs into a text_frame, honoring embedded '\\n' as real paragraph breaks."""
    groups = _split_runs_on_newline(runs)
    for gi, group in enumerate(groups):
        if gi == 0 and use_first:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        if align:
            p.alignment = align
        set_runs(p, group, base_size=base_size, base_color=base_color, bold_all=bold_all)


def runs_plain_text(runs):
    return "".join(r.get("text", "") for r in runs)


def add_paragraph_runs(tf, runs, size=Pt(14), color=INK, space_after=Pt(6), bold_all=False, first=False, align=None):
    p = tf.paragraphs[0] if (first and not tf.paragraphs[0].runs) else tf.add_paragraph()
    p.space_after = space_after
    if align:
        p.alignment = align
    set_runs(p, runs, base_size=size, base_color=color, bold_all=bold_all)
    return p


# ---------------------------------------------------------------- content block renderers

def img_size_in(fname, max_w_in, max_h_in):
    path = os.path.join(IMG_DIR, fname)
    with Image.open(path) as im:
        w, h = im.size
    ratio = w / h
    box_ratio = max_w_in / max_h_in
    if ratio > box_ratio:
        out_w = max_w_in
        out_h = max_w_in / ratio
    else:
        out_h = max_h_in
        out_w = max_h_in * ratio
    return out_w, out_h


def render_blocks(slide, blocks, left, top, width, avail_height):
    """Render a vertical stack of blocks starting at (left, top) within `width`.
    Returns the y (Emu) cursor after the last block."""
    y = top
    gap = Inches(0.10)

    for b in blocks:
        t = b.get("type")
        remaining_h = max(Inches(0.3), (top + avail_height) - y)

        if t == "p" or t == "lede" or t == "tag":
            size = Pt(15) if t == "lede" else (Pt(11) if t == "tag" else Pt(13))
            color = MUTED if t in ("lede", "tag") else INK
            n_lines = max(1, len(_split_runs_on_newline(b["runs"])))
            h = Inches(0.5 * n_lines + 0.35)
            tb = add_textbox(slide, left, y, width, h)
            tb.text_frame.word_wrap = True
            set_runs_multiline(tb.text_frame, b["runs"], base_size=size, base_color=color)
            y += h + gap

        elif t == "dchd":
            h = Inches(0.42)
            tb = add_textbox(slide, left, y, width, h)
            p = tb.text_frame.paragraphs[0]
            r1 = p.add_run(); r1.text = b.get("title", ""); r1.font.bold = True
            r1.font.size = Pt(12); r1.font.color.rgb = PURPLE_TEXT; r1.font.name = FONT
            if b.get("desc"):
                r2 = p.add_run(); r2.text = "  " + b["desc"]
                r2.font.size = Pt(10.5); r2.font.color.rgb = MUTED; r2.font.name = FONT
            y += h

        elif t == "chips":
            h = Inches(0.55)
            tb = add_textbox(slide, left, y, width, h)
            p = tb.text_frame.paragraphs[0]
            txt = "   ·   ".join(b.get("chips", []))
            r = p.add_run(); r.text = txt
            r.font.size = Pt(10.5); r.font.color.rgb = PURPLE_TEXT; r.font.name = FONT
            tb.text_frame.word_wrap = True
            y += h + Inches(0.06)

        elif t == "list":
            n = max(1, len(b["items"]))
            h = Inches(min(2.6, 0.34 * n + 0.15))
            tb = add_textbox(slide, left, y, width, h)
            tf = tb.text_frame
            tf.word_wrap = True
            prefix = {"check": "✓  ", "cross": "✕  ", "plain": "—  "}[b.get("style", "plain")]
            pcolor = GREEN_TEXT if b.get("style") == "check" else (RED_TEXT if b.get("style") == "cross" else PURPLE)
            for i, item_runs in enumerate(b["items"]):
                p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                p.space_after = Pt(4)
                rp = p.add_run(); rp.text = prefix; rp.font.bold = True
                rp.font.size = Pt(13); rp.font.color.rgb = pcolor; rp.font.name = FONT
                set_runs(p, item_runs, base_size=Pt(13), base_color=INK)
            y += h + gap

        elif t == "olist":
            n = max(1, len(b["items"]))
            h = Inches(min(2.8, 0.4 * n + 0.15))
            tb = add_textbox(slide, left, y, width, h)
            tf = tb.text_frame
            tf.word_wrap = True
            for i, item_runs in enumerate(b["items"]):
                p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                p.space_after = Pt(5)
                rp = p.add_run(); rp.text = f"{i+1}.  "; rp.font.bold = True
                rp.font.size = Pt(14); rp.font.color.rgb = PURPLE_TEXT; rp.font.name = FONT
                set_runs(p, item_runs, base_size=Pt(14), base_color=INK)
            y += h + gap

        elif t == "steps":
            n = max(1, len(b["items"]))
            h = Inches(min(3.2, 0.55 * n + 0.15))
            tb = add_textbox(slide, left, y, width, h)
            tf = tb.text_frame
            tf.word_wrap = True
            for i, item in enumerate(b["items"]):
                p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                p.space_after = Pt(6)
                rn = p.add_run(); rn.text = f"{item.get('n','•')}.  "; rn.font.bold = True
                rn.font.size = Pt(14); rn.font.color.rgb = WHITE
                rn.font.name = FONT
                # colored number badge look isn't feasible inline; use purple text instead
                rn.font.color.rgb = PURPLE
                set_runs(p, item["runs"], base_size=Pt(14), base_color=INK)
            y += h + gap

        elif t == "kpis":
            h = Inches(1.3)
            n = max(1, len(b["items"]))
            col_w = Emu(int((width - Inches(0.15) * (n - 1)) / n))
            x = left
            for item in b["items"]:
                box = add_textbox(slide, x, y, col_w, h)
                tf = box.text_frame
                tf.word_wrap = True
                p1 = tf.paragraphs[0]
                p1.alignment = PP_ALIGN.CENTER
                r1 = p1.add_run(); r1.text = item.get("n", "")
                r1.font.size = Pt(30); r1.font.bold = True; r1.font.color.rgb = PURPLE_TEXT; r1.font.name = FONT
                p2 = tf.add_paragraph(); p2.alignment = PP_ALIGN.CENTER
                r2 = p2.add_run(); r2.text = item.get("l", "")
                r2.font.size = Pt(10.5); r2.font.color.rgb = MUTED; r2.font.name = FONT
                x = Emu(int(x + col_w + Inches(0.15)))
            y += h + gap

        elif t == "table":
            headers = b.get("headers", [])
            rows = b.get("rows", [])
            nrows = len(rows) + (1 if headers else 0)
            ncols = max(len(headers), max((len(r) for r in rows), default=1))
            if ncols == 0 or nrows == 0:
                continue
            h = Inches(min(remaining_h / 914400, 0.5 * nrows + 0.2))
            gshape = slide.shapes.add_table(nrows, ncols, left, y, width, h)
            table = gshape.table
            r_i = 0
            if headers:
                for c_i, htxt in enumerate(headers):
                    cell = table.cell(0, c_i)
                    cell.text = htxt
                    cell.fill.solid(); cell.fill.fore_color.rgb = PURPLE_TEXT
                    for p in cell.text_frame.paragraphs:
                        for run in p.runs:
                            run.font.color.rgb = WHITE; run.font.size = Pt(12); run.font.bold = True; run.font.name = FONT
                r_i = 1
            for row in rows:
                for c_i in range(ncols):
                    cell = table.cell(r_i, c_i)
                    cell.fill.solid(); cell.fill.fore_color.rgb = WHITE if r_i % 2 else GROUND
                    tf = cell.text_frame
                    tf.word_wrap = True
                    if c_i < len(row):
                        set_runs(tf.paragraphs[0], row[c_i], base_size=Pt(12), base_color=INK)
                r_i += 1
            y += h + gap

        elif t == "vs":
            n = len(b["boxes"])
            gap_w = Inches(0.2)
            box_w = Emu(int((width - gap_w * (n - 1)) / n))
            h = Inches(1.7)
            x = left
            for box in b["boxes"]:
                bg = GREEN_SOFT if box["tone"] == "good" else RED_SOFT
                lbl_color = GREEN_TEXT if box["tone"] == "good" else RED_TEXT
                shp = add_rect(slide, x, y, box_w, h, bg)
                tf = shp.text_frame
                tf.word_wrap = True
                tf.margin_left = Inches(0.15); tf.margin_right = Inches(0.15)
                tf.margin_top = Inches(0.1)
                p1 = tf.paragraphs[0]
                r1 = p1.add_run(); r1.text = box.get("label", "")
                r1.font.bold = True; r1.font.size = Pt(12); r1.font.color.rgb = lbl_color; r1.font.name = FONT
                p2 = tf.add_paragraph(); p2.space_before = Pt(4)
                set_runs(p2, box["runs"], base_size=Pt(12.5), base_color=INK)
                x = Emu(int(x + box_w + gap_w))
            y += h + gap

        elif t == "callout_pbi" or t == "callout_src":
            bg = PURPLE_SOFT if t == "callout_pbi" else SRC_BG
            lbl_color = PURPLE_TEXT if t == "callout_pbi" else SRC_LABEL
            n_lines_est = sum(1 + len(runs_plain_text(ib.get("runs", []))) // 90 for ib in b["inner"] if "runs" in ib)
            h = Inches(min(remaining_h / 914400, max(0.9, 0.32 * max(1, n_lines_est) + 0.5)))
            shp = add_rect(slide, left, y, width, h, bg)
            tf = shp.text_frame
            tf.word_wrap = True
            tf.margin_left = Inches(0.2); tf.margin_right = Inches(0.2); tf.margin_top = Inches(0.12)
            p1 = tf.paragraphs[0]
            r1 = p1.add_run(); r1.text = b.get("label", "")
            r1.font.bold = True; r1.font.size = Pt(11); r1.font.color.rgb = lbl_color; r1.font.name = MONO
            for ib in b["inner"]:
                p = tf.add_paragraph(); p.space_before = Pt(5)
                if ib.get("type") == "list":
                    for i, item_runs in enumerate(ib["items"]):
                        pp = p if i == 0 else tf.add_paragraph()
                        rp = pp.add_run(); rp.text = "—  "
                        rp.font.size = Pt(12); rp.font.color.rgb = PURPLE
                        set_runs(pp, item_runs, base_size=Pt(12), base_color=INK)
                elif ib.get("type") == "code":
                    rp = p.add_run(); rp.text = ib.get("text", "")
                    rp.font.name = MONO; rp.font.size = Pt(10.5); rp.font.color.rgb = INK
                else:
                    set_runs(p, ib.get("runs", []), base_size=Pt(12), base_color=INK)
            y += h + gap

        elif t == "chkgrid":
            items = b["items"]
            half = (len(items) + 1) // 2
            cols = [items[:half], items[half:]]
            col_w = Emu(int((width - Inches(0.2)) / 2))
            h = Inches(min(remaining_h / 914400, 0.36 * half + 0.2))
            x = left
            for col_items in cols:
                tb = add_textbox(slide, x, y, col_w, h)
                tf = tb.text_frame; tf.word_wrap = True
                for i, it in enumerate(col_items):
                    p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                    p.space_after = Pt(5)
                    mark = "★  " if it.get("hl") else "✓  "
                    rm = p.add_run(); rm.text = mark; rm.font.bold = True
                    rm.font.color.rgb = PURPLE_TEXT if it.get("hl") else GREEN_TEXT
                    rm.font.size = Pt(12.5)
                    rt = p.add_run(); rt.text = it.get("text", "")
                    rt.font.size = Pt(12.5); rt.font.bold = bool(it.get("hl")); rt.font.color.rgb = INK; rt.font.name = FONT
                x = Emu(int(x + col_w + Inches(0.2)))
            y += h + gap

        elif t == "conceptmap":
            items = b["items"]
            ncols = 5 if len(items) > 6 else 2
            nrows = -(-len(items) // ncols)
            row_h = 0.95 if ncols == 5 else 0.85
            table_h_in = min(remaining_h / 914400, row_h * nrows + 0.2)
            gshape = slide.shapes.add_table(nrows, ncols, left, y, width, Inches(table_h_in))
            table = gshape.table
            for idx, it in enumerate(items):
                r_i, c_i = divmod(idx, ncols)
                cell = table.cell(r_i, c_i)
                cell.fill.solid(); cell.fill.fore_color.rgb = PURPLE_SOFT if idx < 2 else WHITE
                tf = cell.text_frame; tf.word_wrap = True
                p1 = tf.paragraphs[0]
                r1 = p1.add_run(); r1.text = it.get("n", "")
                r1.font.bold = True; r1.font.size = Pt(13); r1.font.color.rgb = PURPLE_TEXT; r1.font.name = FONT
                p2 = tf.add_paragraph()
                r2 = p2.add_run(); r2.text = it.get("title", "")
                r2.font.bold = True; r2.font.size = Pt(10.5); r2.font.color.rgb = INK; r2.font.name = FONT
                if it.get("desc"):
                    p3 = tf.add_paragraph()
                    r3 = p3.add_run(); r3.text = it["desc"]
                    r3.font.size = Pt(9); r3.font.color.rgb = MUTED; r3.font.name = FONT
            # fill any leftover cells blank
            y += Inches(table_h_in) + gap

        elif t == "code":
            h = Inches(0.9)
            shp = add_rect(slide, left, y, width, h, RGBColor(0xF4, 0xF4, 0xF6), rounded=False)
            tf = shp.text_frame; tf.word_wrap = True
            tf.margin_left = Inches(0.15)
            r = tf.paragraphs[0].add_run(); r.text = b.get("text", "")
            r.font.name = MONO; r.font.size = Pt(11); r.font.color.rgb = INK
            y += h + gap

        elif t == "figure":
            img = b.get("image") or {}
            fname = img.get("file")
            cap_runs = b.get("capRuns", [])
            fig_h = Inches(min(remaining_h/914400 - 0.5, 3.6))
            if fname:
                w_in, h_in = img_size_in(fname, width / 914400, fig_h / 914400)
                pic_left = Emu(int(left + (width - Inches(w_in)) / 2))
                slide.shapes.add_picture(os.path.join(IMG_DIR, fname), pic_left, y, height=Inches(h_in))
                y += Inches(h_in) + Inches(0.05)
            if cap_runs:
                cap_h = Inches(0.4)
                tb = add_textbox(slide, left, y, width, cap_h)
                p = tb.text_frame.paragraphs[0]
                p.alignment = PP_ALIGN.CENTER
                set_runs(p, cap_runs, base_size=Pt(11), base_color=MUTED)
                y += cap_h
            y += gap

        elif t == "ba":
            sides = b["sides"]
            n = len(sides)
            gap_w = Inches(0.2)
            side_w = Emu(int((width - gap_w * (n - 1)) / n))
            head_h = Inches(0.35)
            img_h = Inches(min(remaining_h/914400 - 0.5, 2.6))
            x = left
            for side in sides:
                is_yes = side.get("label", "").strip().startswith("✓")
                hd_bg = GREEN_SOFT if is_yes else RED_SOFT
                hd_col = GREEN_TEXT if is_yes else RED_TEXT
                hshp = add_rect(slide, x, y, side_w, head_h, hd_bg, rounded=False)
                p = hshp.text_frame.paragraphs[0]
                p.alignment = PP_ALIGN.CENTER
                r = p.add_run(); r.text = side.get("label", "")
                r.font.bold = True; r.font.size = Pt(11); r.font.color.rgb = hd_col; r.font.name = FONT
                fname = (side.get("image") or {}).get("file")
                if fname:
                    w_in, h_in = img_size_in(fname, side_w / 914400 - 0.1, img_h / 914400)
                    pic_left = Emu(int(x + (side_w - Inches(w_in)) / 2))
                    slide.shapes.add_picture(os.path.join(IMG_DIR, fname), pic_left, y + head_h + Inches(0.05), height=Inches(h_in))
                x = Emu(int(x + side_w + gap_w))
            y += head_h + img_h + Inches(0.1) + gap

        elif t == "dashimg" or t == "imageblock":
            img = b.get("image") or {}
            fname = img.get("file")
            fig_h = Inches(min(remaining_h/914400, 3.6))
            if fname:
                w_in, h_in = img_size_in(fname, width / 914400, fig_h / 914400)
                pic_left = Emu(int(left + (width - Inches(w_in)) / 2))
                slide.shapes.add_picture(os.path.join(IMG_DIR, fname), pic_left, y, height=Inches(h_in))
                y += Inches(h_in) + gap

        elif t == "row":
            cols = b["cols"]
            ncols = max(1, len(cols))
            gap_w = Inches(0.25)
            col_w = Emu(int((width - gap_w * (ncols - 1)) / ncols))
            x = left
            max_y = y
            for col_blocks in cols:
                col_end = render_blocks(slide, col_blocks, x, y, col_w, avail_height - (y - top))
                max_y = max(max_y, col_end)
                x = Emu(int(x + col_w + gap_w))
            y = max_y + gap

        elif t == "card":
            inner_h_est = Inches(1.6)
            if b.get("accent"):
                shp = add_rect(slide, left, y, width, inner_h_est, PURPLE_SOFT, line_color=PURPLE_MID, line_w=Pt(1))
            else:
                shp = add_rect(slide, left, y, width, inner_h_est, WHITE, line_color=GRID_C, line_w=Pt(1))
            # render inner content inside a slightly inset textbox area (approx, not nested shapes)
            pad = Inches(0.15)
            end_y = render_blocks(slide, b["inner"], left + pad, y + pad, width - pad * 2, inner_h_est - pad * 2)
            y = max(y + inner_h_est, end_y) + gap

        elif t == "who":
            h = Inches(0.7)
            tb = add_textbox(slide, left, y, width, h)
            tf = tb.text_frame
            p1 = tf.paragraphs[0]
            r1 = p1.add_run(); r1.text = "Borja Mora Méndez"; r1.font.bold = True; r1.font.size = Pt(16); r1.font.color.rgb = INK; r1.font.name = FONT
            p2 = tf.add_paragraph()
            r2 = p2.add_run(); r2.text = "Data Analyst · Power BI & Data Storytelling"; r2.font.size = Pt(12); r2.font.color.rgb = MUTED; r2.font.name = FONT
            y += h

        # unhandled types (title/eyebrow/lede already consumed at slide-header level normally) fall through silently

    return y


def render_title_header(slide, slide_data, left, top, width):
    """Render eyebrow + title(s) at top of a normal content slide. Returns new y cursor."""
    y = top
    blocks = slide_data["blocks"]
    remaining = []
    consumed_title = False
    for b in blocks:
        if b["type"] == "eyebrow" and not consumed_title:
            tb = add_textbox(slide, left, y, width, Inches(0.35))
            p = tb.text_frame.paragraphs[0]
            set_runs(p, b["runs"], base_size=Pt(12), base_color=PURPLE_TEXT, bold_all=True)
            y += Inches(0.32)
        elif b["type"] == "title" and not consumed_title:
            size = {"h1": Pt(34), "h2": Pt(30), "h3": Pt(24)}.get(b["level"], Pt(24))
            n_lines = max(1, len(_split_runs_on_newline(b["runs"])))
            tb = add_textbox(slide, left, y, width, Inches(0.55 * n_lines + 0.2))
            tb.text_frame.word_wrap = True
            set_runs_multiline(tb.text_frame, b["runs"], base_size=size, base_color=INK, bold_all=True)
            y += Inches(0.55 * n_lines + 0.15) if b["level"] != "h3" else Inches(0.62)
            consumed_title = True
        else:
            remaining.append(b)
    y += Inches(0.08)
    return y, remaining


def build_cover(slide, slide_data):
    bg = add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, CREAM, rounded=False)
    bar = add_rect(slide, 0, 0, SLIDE_W, Inches(0.12), PURPLE, rounded=False)
    y = MARGIN_T + Inches(0.15)
    for b in slide_data["blocks"]:
        if b["type"] == "eyebrow":
            tb = add_textbox(slide, MARGIN_L, y, CONTENT_W, Inches(0.35))
            set_runs(tb.text_frame.paragraphs[0], b["runs"], base_size=Pt(13), base_color=PURPLE_TEXT, bold_all=True)
            y += Inches(0.5)
        elif b["type"] == "title":
            n_lines = max(1, len(_split_runs_on_newline(b["runs"])))
            tb = add_textbox(slide, MARGIN_L, y, CONTENT_W, Inches(0.75 * n_lines + 0.2))
            tb.text_frame.word_wrap = True
            set_runs_multiline(tb.text_frame, b["runs"], base_size=Pt(40), base_color=INK, bold_all=True)
            y += Inches(0.75 * n_lines + 0.3)
        elif b["type"] == "lede":
            tb = add_textbox(slide, MARGIN_L, y, Inches(9.5), Inches(1.0))
            tb.text_frame.word_wrap = True
            set_runs_multiline(tb.text_frame, b["runs"], base_size=Pt(16), base_color=MUTED)
            y += Inches(1.1)
        elif b["type"] == "who":
            tb = add_textbox(slide, MARGIN_L, SLIDE_H - Inches(1.1), CONTENT_W, Inches(0.8))
            tf = tb.text_frame
            p1 = tf.paragraphs[0]
            r1 = p1.add_run(); r1.text = "Borja Mora Méndez"; r1.font.bold = True; r1.font.size = Pt(18); r1.font.color.rgb = INK; r1.font.name = FONT
            p2 = tf.add_paragraph()
            r2 = p2.add_run(); r2.text = "Data Analyst · Power BI & Data Storytelling"; r2.font.size = Pt(13); r2.font.color.rgb = MUTED; r2.font.name = FONT


def build_divider(slide, slide_data):
    add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, INK, rounded=False)
    y = Inches(1.3)
    for b in slide_data["blocks"]:
        if b["type"] == "eyebrow":
            tb = add_textbox(slide, MARGIN_L, y, CONTENT_W, Inches(0.35))
            set_runs(tb.text_frame.paragraphs[0], b["runs"], base_size=Pt(13), base_color=PURPLE_MID, bold_all=True)
            y += Inches(0.5)
        elif b["type"] == "bignum":
            tb = add_textbox(slide, MARGIN_L, y, Inches(4), Inches(1.8))
            r = tb.text_frame.paragraphs[0].add_run(); r.text = b["text"]
            r.font.size = Pt(110); r.font.bold = True; r.font.color.rgb = ACCENT_BRIGHT; r.font.name = FONT
            y += Inches(1.7)
        elif b["type"] == "title":
            n_lines = max(1, len(_split_runs_on_newline(b["runs"])))
            tb = add_textbox(slide, MARGIN_L, y, CONTENT_W, Inches(0.55 * n_lines + 0.2))
            tb.text_frame.word_wrap = True
            set_runs_multiline(tb.text_frame, b["runs"], base_size=Pt(32), base_color=WHITE, bold_all=True)
            y += Inches(0.55 * n_lines + 0.3)
        elif b["type"] == "lede":
            tb = add_textbox(slide, MARGIN_L, y, Inches(9.5), Inches(1.0))
            tb.text_frame.word_wrap = True
            set_runs_multiline(tb.text_frame, b["runs"], base_size=Pt(15), base_color=RGBColor(0xC8, 0xC2, 0xB8))
            y += Inches(1.0)
    add_rect(slide, MARGIN_L, y + Inches(0.15), Inches(1.1), Inches(0.045), ACCENT_BRIGHT, rounded=False)


def build_content(slide, slide_data):
    add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, GROUND, rounded=False)
    y, remaining = render_title_header(slide, slide_data, MARGIN_L, MARGIN_T, CONTENT_W)
    avail_h = (SLIDE_H - MARGIN_B) - y
    render_blocks(slide, remaining, MARGIN_L, y, CONTENT_W, avail_h)


def main():
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    blank = prs.slide_layouts[6]

    for i, sd in enumerate(data):
        slide = prs.slides.add_slide(blank)
        try:
            if sd.get("isCover"):
                build_cover(slide, sd)
            elif sd.get("isSec"):
                build_divider(slide, sd)
            else:
                build_content(slide, sd)
        except Exception as e:
            print(f"ERROR on slide {i+1} ({sd.get('dataSec')}): {e}")
            raise

        if (i + 1) % 20 == 0 or i == len(data) - 1:
            print(f"Built {i+1}/{len(data)}")

    prs.save(OUT)
    print("Saved:", OUT)


if __name__ == "__main__":
    main()
