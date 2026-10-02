from PIL import Image

im = Image.open('public/verixa-logo.jpg').convert('RGB')
w, h = im.size

# Let's find highest brightness points across the image
bright_pts = []
for y in range(0, h, 10):
    for x in range(0, w, 10):
        r, g, b = im.getpixel((x, y))
        br = max(r, g, b)
        if br > 180:
            bright_pts.append((x, y, (r, g, b)))

print(f"Total bright sample points: {len(bright_pts)}")
# Print samples from text
text_samples = [p for p in bright_pts if 700 <= p[1] <= 820]
print("Text samples count:", len(text_samples))
if text_samples:
    print("Example text pixel:", text_samples[len(text_samples)//2])

# Shield samples
shield_samples = [p for p in bright_pts if 250 <= p[1] <= 600 and p[0] > 450]
print("Shield samples count:", len(shield_samples))
if shield_samples:
    print("Example shield pixel:", shield_samples[len(shield_samples)//2])

# V wing samples
v_samples = [p for p in bright_pts if 250 <= p[1] <= 650 and p[0] <= 450]
print("V wing samples count:", len(v_samples))
if v_samples:
    print("Example V wing pixel:", v_samples[len(v_samples)//2])
