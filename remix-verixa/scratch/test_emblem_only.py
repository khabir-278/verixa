from PIL import Image

raw = Image.open("scratch/isolated_foreground.png")
w, h = raw.size

# The emblem bounding box is roughly x in [160, 780], y in [160, 814]
# Let's crop just the emblem (shield + V + nodes + Verixa text)
emblem_box = (150, 150, 850, 850)
emblem_cropped = raw.crop(emblem_box)

# Preview on white
white = Image.new("RGBA", (700, 700), (255, 255, 255, 255))
white.paste(emblem_cropped, (0, 0), emblem_cropped)
white.save("scratch/emblem_only_preview.png")
print("Saved scratch/emblem_only_preview.png")
