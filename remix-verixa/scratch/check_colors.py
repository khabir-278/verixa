from PIL import Image

img = Image.open("public/verixa-logo.jpg").convert("RGB")
# Let's find pixels where r, g, b are colored (saturation > 0.3)
colored_pixels = []
for y in range(0, 1024, 20):
    for x in range(0, 1024, 20):
        r, g, b = img.getpixel((x, y))
        mx = max(r, g, b)
        mn = min(r, g, b)
        if mx > 60 and (mx - mn) / mx > 0.4:
            colored_pixels.append(((x, y), (r, g, b)))

print(f"Found {len(colored_pixels)} colored pixels")
for p in colored_pixels[:10]:
    print(p)
