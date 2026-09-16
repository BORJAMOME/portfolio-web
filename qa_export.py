import os
import win32com.client

HERE = os.path.dirname(os.path.abspath(__file__))
PPTX = os.path.join(HERE, "Data Storytelling - editable.pptx")
OUT_DIR = os.path.join(HERE, "qa_png")
os.makedirs(OUT_DIR, exist_ok=True)

app = win32com.client.Dispatch("PowerPoint.Application")
app.Visible = True
pres = app.Presentations.Open(PPTX, WithWindow=False)

targets = [11, 17, 40, 41, 53, 76]
for idx in targets:
    if idx > pres.Slides.Count:
        continue
    slide = pres.Slides(idx)
    out_path = os.path.join(OUT_DIR, f"qa_{idx:03d}.png")
    slide.Export(out_path, "PNG", 1600, 900)
    print("Exported", out_path)

pres.Close()
app.Quit()
