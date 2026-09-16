import os
import json
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
DECK = os.path.join(HERE, "deck.html")
IMG_DIR = os.path.join(HERE, "pptx_images")
OUT_JSON = os.path.join(HERE, "content_slides.json")
os.makedirs(IMG_DIR, exist_ok=True)

W, H = 1600, 900

OVERRIDE_CSS = """
.slide{ width:%dpx !important; height:%dpx !important; aspect-ratio:auto !important;
  border-radius:0 !important; box-shadow:none !important; }
.stage{ padding:0 !important; }
.chrome, .hintbar, .prog, .idx, .portrait-hint{ display:none !important; }
body{ overflow:visible !important; }
""" % (W, H)

# JS: walk a container and produce a block tree; tag capturable elements with data-cap ids.
EXTRACT_JS = r"""
() => {
  function runs(el){
    // Walk child nodes, produce [{text,bold,italic,mono}]
    const out = [];
    function walk(node, bold, italic, mono){
      node.childNodes.forEach(n=>{
        if(n.nodeType===3){ // text
          const t = n.textContent;
          if(t && t.trim().length>0 || /\s/.test(t)) out.push({text:t, bold, italic, mono});
        } else if(n.nodeType===1){
          const tag = n.tagName.toLowerCase();
          let b=bold, i=italic, m=mono;
          if(tag==='strong'||tag==='b') b=true;
          if(tag==='em'||tag==='i') i=true;
          if(tag==='span' && n.classList.contains('code')) m=true;
          if(tag==='span' && n.classList.contains('mark')) b=true;
          if(tag==='br'){ out.push({text:'\n', bold, italic, mono}); return; }
          walk(n, b, i, m);
        }
      });
    }
    walk(el, false, false, false);
    return out;
  }
  function cleanRuns(rs){
    // collapse whitespace but keep explicit \n
    return rs.map(r=>({...r, text:r.text.replace(/[ \t]+/g,' ')})).filter(r=>r.text.length>0);
  }

  let capCounter = 0;
  function tagCapture(el, kind){
    capCounter++;
    const id = 'cap-' + capCounter;
    el.setAttribute('data-cap-id', id);
    return {type:'image', kind, capId:id};
  }

  function classifyLeaf(el){
    const cls = el.classList;
    const tag = el.tagName.toLowerCase();

    if(cls.contains('eyebrow')) return {type:'eyebrow', runs: cleanRuns(runs(el))};
    if(cls.contains('num')) return {type:'bignum', text: el.textContent.trim()};
    if(tag==='h1' || tag==='h2' || tag==='h3'){
      return {type:'title', level: tag, runs: cleanRuns(runs(el))};
    }
    if(cls.contains('lede')) return {type:'lede', runs: cleanRuns(runs(el))};
    if(cls.contains('rule')) return null;
    if(cls.contains('deco')) return null;
    if(cls.contains('tag') && tag==='p') return {type:'tag', runs: cleanRuns(runs(el))};
    if(cls.contains('who')) return {type:'who', html: el.innerHTML};
    if(tag==='p') return {type:'p', runs: cleanRuns(runs(el))};

    if(cls.contains('vs')){
      const boxes = [];
      el.querySelectorAll(':scope > div').forEach(b=>{
        const lab = b.querySelector('.lab');
        const label = lab ? lab.textContent.trim() : '';
        const clone = b.cloneNode(true);
        const labEl = clone.querySelector('.lab'); if(labEl) labEl.remove();
        boxes.push({
          tone: b.classList.contains('bad')||b.classList.contains('no') ? 'bad' : 'good',
          label, runs: cleanRuns(runs(clone))
        });
      });
      return {type:'vs', boxes};
    }

    if(cls.contains('pbi') || cls.contains('src')){
      const tEl = el.querySelector(':scope > .t');
      const label = tEl ? tEl.textContent.trim() : (cls.contains('pbi') ? '▶ En Power BI' : '＋ Ampliación');
      const inner = [];
      el.querySelectorAll(':scope > p, :scope > ul, :scope > div.code').forEach(child=>{
        inner.push(classifyLeaf(child) || {type:'p', runs: cleanRuns(runs(child))});
      });
      if(inner.length===0){
        const clone = el.cloneNode(true);
        const t2 = clone.querySelector('.t'); if(t2) t2.remove();
        inner.push({type:'p', runs: cleanRuns(runs(clone))});
      }
      return {type: cls.contains('pbi') ? 'callout_pbi' : 'callout_src', label, inner};
    }

    if(tag==='table'){
      const headers = Array.from(el.querySelectorAll('thead th')).map(th=>th.textContent.trim());
      const rows = Array.from(el.querySelectorAll('tbody tr')).map(tr=>
        Array.from(tr.querySelectorAll('td')).map(td=> cleanRuns(runs(td)))
      );
      return {type:'table', headers, rows};
    }

    if(tag==='ul' && cls.contains('list')){
      const style = cls.contains('check') ? 'check' : (cls.contains('cross') ? 'cross' : 'plain');
      const items = Array.from(el.querySelectorAll(':scope > li')).map(li=> cleanRuns(runs(li)));
      return {type:'list', style, items};
    }
    if(tag==='ol'){
      const items = Array.from(el.querySelectorAll(':scope > li')).map(li=> cleanRuns(runs(li)));
      return {type:'olist', items};
    }

    if(cls.contains('dchd')){
      const b = el.querySelector('b'); const span = el.querySelector('span');
      return {type:'dchd', title: b?b.textContent.trim():'', desc: span?span.textContent.trim():''};
    }
    if(cls.contains('chips')){
      const chips = Array.from(el.querySelectorAll('.chip')).map(c=>c.textContent.trim());
      return {type:'chips', chips};
    }

    if(cls.contains('steps')){
      const items = Array.from(el.querySelectorAll(':scope > .step')).map(s=>{
        const n = s.querySelector('.n'); const c = s.querySelector('.c');
        return {n: n?n.textContent.trim():'', runs: cleanRuns(runs(c))};
      });
      return {type:'steps', items};
    }
    if(cls.contains('kpis')){
      const items = Array.from(el.querySelectorAll('.kpi')).map(k=>{
        const n = k.querySelector('.n'); const l = k.querySelector('.l');
        return {n: n?n.textContent.trim():'', l: l?l.textContent.trim():''};
      });
      return {type:'kpis', items};
    }
    if(cls.contains('chk-grid')){
      const items = Array.from(el.querySelectorAll('.chk')).map(c=>({
        hl: c.classList.contains('hl'), text: c.textContent.trim()
      }));
      return {type:'chkgrid', items};
    }
    if(cls.contains('map-grid')){
      const items = Array.from(el.querySelectorAll('.mapc')).map(c=>{
        const mn=c.querySelector('.mn'), mt=c.querySelector('.mt'), md=c.querySelector('.md');
        return {n: mn?mn.textContent.trim():'', title: mt?mt.textContent.trim():'', desc: md?md.textContent.trim():''};
      });
      return {type:'conceptmap', items};
    }

    if(tag==='svg'){
      return {type:'figure', image: tagCapture(el, 'inlinesvg'), capRuns: []};
    }
    if(tag==='figure' && cls.contains('s')){
      const svg = el.querySelector('svg');
      const cap = el.querySelector('figcap');
      const img = svg ? tagCapture(svg, 'figure') : null;
      return {type:'figure', image: img, capRuns: cap ? cleanRuns(runs(cap)) : []};
    }
    if(cls.contains('ba')){
      const sides = Array.from(el.querySelectorAll(':scope > div')).map(side=>{
        const bh = side.querySelector('.bh'); const bd = side.querySelector('.bd');
        const img = bd ? tagCapture(bd, 'ba-side') : null;
        return {label: bh?bh.textContent.trim():'', image: img};
      });
      return {type:'ba', sides};
    }
    if(cls.contains('dash')){
      const img = tagCapture(el, 'dash');
      return {type:'dashimg', image: img};
    }
    if(cls.contains('attr-grid')){
      const img = tagCapture(el, 'attrgrid');
      return {type:'imageblock', image: img};
    }
    if(cls.contains('code') && tag==='div'){
      return {type:'code', text: el.textContent};
    }

    return undefined; // unrecognized leaf -> caller should try recursing
  }

  function walkContainer(el){
    const hasDirectText = Array.from(el.childNodes).some(
      n => n.nodeType===3 && n.textContent.trim().length>0
    );
    if(hasDirectText){
      return [{type:'p', runs: cleanRuns(runs(el))}];
    }
    const blocks = [];
    Array.from(el.children).forEach(child=>{
      const cls = child.classList;

      if(cls.contains('row')){
        const cols = Array.from(child.querySelectorAll(':scope > .col')).map(col=>{
          const innerBlocks = walkContainer(col);
          const styleAttr = col.getAttribute('style') || '';
          const looksBoxed = col.classList.contains('card') || styleAttr.includes('background');
          if(looksBoxed){
            const accent = styleAttr.includes('purple-soft') || col.classList.contains('pbi');
            return [{type:'card', inner: innerBlocks, accent}];
          }
          return innerBlocks;
        });
        if(cols.length>0){ blocks.push({type:'row', cols}); return; }
      }

      const leaf = classifyLeaf(child);
      if(leaf === null) return; // explicitly skip (decorative)
      if(leaf !== undefined){ blocks.push(leaf); return; }

      // card / generic wrapper -> if it's a "card"/colored box with mixed content, wrap; else flatten
      const childStyle = child.getAttribute('style') || '';
      if(cls.contains('card') || childStyle.includes('background')){
        const inner = walkContainer(child);
        const accent = childStyle.includes('purple-soft');
        blocks.push({type:'card', inner, accent});
        return;
      }
      // bare inline text element (e.g. a standalone <strong>Label</strong> not wrapped in <p>)
      if(child.children.length === 0 && child.textContent.trim().length > 0){
        blocks.push({type:'p', runs: cleanRuns(runs(child))});
        return;
      }

      // generic flatten (e.g. .grow, .pad wrappers, plain layout divs)
      const inner = walkContainer(child);
      blocks.push(...inner);
    });
    return blocks;
  }

  const slides = Array.from(document.querySelectorAll('.slide'));
  const result = [];
  slides.forEach((s, idx)=>{
    const pad = s.querySelector('.pad');
    const blocks = pad ? walkContainer(pad) : [];
    result.push({
      index: idx,
      dataSec: s.getAttribute('data-sec') || '',
      dataKey: s.getAttribute('data-key'),
      isCover: s.classList.contains('cover'),
      isSec: s.classList.contains('sec'),
      blocks
    });
  });
  return result;
}
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": W + 200, "height": H + 200}, device_scale_factor=2)
    page = context.new_page()
    page.emulate_media(reduced_motion="reduce")
    page.goto(f"file:///{DECK.replace(os.sep, '/')}")
    page.wait_for_load_state("networkidle")
    page.evaluate("document.fonts && document.fonts.ready")
    page.add_style_tag(content=OVERRIDE_CSS)

    n = page.evaluate("document.querySelectorAll('.slide').length")
    print(f"Total slides: {n}")

    all_slides_data = []

    for i in range(n):
        page.evaluate(
            "(i)=>{document.querySelectorAll('.slide').forEach((s,k)=>s.classList.toggle('active', k===i));}",
            i,
        )
        page.wait_for_timeout(40)

        # Extract structure for ALL slides at once is wasteful; instead extract only this slide's node.
        slide_data = page.evaluate(
            """([EXTRACT_JS_STR, idx]) => {
                const fn = eval('(' + EXTRACT_JS_STR + ')');
                const all = fn();
                return all[idx];
            }""",
            [EXTRACT_JS, i],
        )

        # Now capture images for any tagged element within this active slide
        def capture_images(node):
            if isinstance(node, dict):
                if node.get("type") == "image" or ("image" in node and isinstance(node["image"], dict)):
                    img = node if node.get("type") == "image" else node["image"]
                    if img and img.get("capId"):
                        cap_id = img["capId"]
                        fname = f"slide{i+1:03d}_{cap_id}.png"
                        fpath = os.path.join(IMG_DIR, fname)
                        try:
                            page.locator(f'[data-cap-id="{cap_id}"]').first.screenshot(path=fpath)
                            img["file"] = fname
                        except Exception as e:
                            img["file"] = None
                            print(f"  WARN capture failed slide {i+1} {cap_id}: {e}")
                for v in node.values():
                    capture_images(v)
            elif isinstance(node, list):
                for v in node:
                    capture_images(v)

        capture_images(slide_data)
        all_slides_data.append(slide_data)

        if (i + 1) % 10 == 0 or i == n - 1:
            print(f"Processed {i+1}/{n}")

    browser.close()

with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(all_slides_data, f, ensure_ascii=False, indent=1)

print("Saved:", OUT_JSON)
