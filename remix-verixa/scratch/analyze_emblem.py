from PIL import Image

im = Image.open('public/verixa-logo.jpg').convert('RGB')
w, h = im.size

# The inner elements: find bounding box of pixels strictly inside [150, 874]
min_x, min_y, max_x, max_y = w, h, 0, 0
for y in range(160, 860):
    for x in range(160, 860):
        r, g, b = im.getpixel((x, y))
        if max(r, g, b) > 50:
            if x < min_x: min_x = x
            if x > max_x: max_x = x
            if y < min_y: min_y = y
            if y > max_y: max_y = y

print(f"Inner emblem bounding box: x=[{min_x}, {max_x}] (width {max_x-min_x}), y=[{min_y}, {max_y}] (height {max_y-min_y})")

# Let's see the text "Verixa" at the bottom:
text_min_y, text_max_y = h, 0
for y in range(650, 850):
    for x in range(200, 820):
        r, g, b = im.getpixel((x, y))
        if max(r, g, b) > 80:
            if y < text_min_y: text_min_y = y
            if y > text_max_y: text_max_y = y

print(f"Verixa text y range: [{text_min_y}, {text_max_y}]")

# Let's see the shield/V at the top:
shield_min_y, shield_max_y = h, 0
for y in range(160, 650):
    for x in range(160, 860):
        r, g, b = im.getpixel((x, y))
        if max(r, g, b) > 50:
            if y < shield_min_y: shield_min_y = y
            if y > shield_max_y: shield_max_y = y

print(f"Shield + V symbol y range: [{shield_min_y}, {shield_max_y}]")
