from PIL import Image

img = Image.open("public/verixa-logo.jpg")
w, h = img.size

# Find the bounding box where brightness > 25
min_x, max_x = w, 0
min_y, max_y = h, 0

for y in range(h):
    for x in range(w):
        r, g, b = img.getpixel((x, y))
        if max(r, g, b) > 25:
            if x < min_x: min_x = x
            if x > max_x: max_x = x
            if y < min_y: min_y = y
            if y > max_y: max_y = y

print(f"Bounding box of logo inside {w}x{h}:")
print(f"X: {min_x} to {max_x} (width: {max_x - min_x})")
print(f"Y: {min_y} to {max_y} (height: {max_y - min_y})")
