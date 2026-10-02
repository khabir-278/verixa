from PIL import Image

im = Image.open(r"C:\Users\syedk\.gemini\antigravity\brain\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\verixa_emblem_enhanced_1790962602045.jpg")
w, h = im.size

# Check column x=0
non_white_left = [(y, im.getpixel((0, y))) for y in range(h) if min(im.getpixel((0, y))) < 240]
print("Non white pixels on column x=0:", len(non_white_left))
if non_white_left:
    print("Samples:", non_white_left[:5])

# Find actual bounding box where min(r,g,b) < 220
left, top, right, bottom = w, h, 0, 0
for y in range(h):
    for x in range(w):
        r, g, b = im.getpixel((x, y))
        if min(r, g, b) < 220:
            if x < left: left = x
            if x > right: right = x
            if y < top: top = y
            if y > bottom: bottom = y

print(f"Real emblem bounding box (min RGB < 220): left={left}, top={top}, right={right}, bottom={bottom}")
