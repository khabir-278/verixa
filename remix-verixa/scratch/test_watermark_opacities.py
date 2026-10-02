from PIL import Image, ImageEnhance, ImageOps

gen_path = r"C:\Users\syedk\.gemini\antigravity\brain\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\verixa_emblem_enhanced_1790962602045.jpg"
raw = Image.open(gen_path).convert("RGBA")
w, h = raw.size

# 1. Remove white background to isolate the emblem cleanly
# Background is > 245 in all channels
datas = raw.getdata()
isolated_data = []

for r, g, b, a in datas:
    # Brightness / distance from pure white
    dist_from_white = 255 - min(r, g, b)
    
    if dist_from_white < 6:
        # Pure white background
        isolated_data.append((255, 255, 255, 0))
    elif dist_from_white < 30:
        # Smooth antialiased edge
        alpha = int((dist_from_white / 30.0) * 255)
        isolated_data.append((r, g, b, alpha))
    else:
        # Full solid artwork
        isolated_data.append((r, g, b, 255))

isolated = Image.new("RGBA", (w, h))
isolated.putdata(isolated_data)
isolated.save("scratch/isolated_vector_emblem.png")
print("Saved scratch/isolated_vector_emblem.png")

# Let's crop tight to the emblem bounding box
bbox = isolated.getbbox()
print("Emblem bounding box:", bbox)
cropped_emblem = isolated.crop(bbox)
print("Cropped emblem size:", cropped_emblem.size)

# Let's test different watermark opacities on a 520x620 email card canvas
card_w, card_h = 520, 620

for opacity_pct in [18, 24, 30]:
    # Scale emblem to fit nicely on the 520px card (e.g. 420px wide or 450px wide)
    target_emblem_w = 430
    aspect = cropped_emblem.height / cropped_emblem.width
    target_emblem_h = int(target_emblem_w * aspect)
    
    scaled_emblem = cropped_emblem.resize((target_emblem_w, target_emblem_h), Image.Resampling.LANCZOS)
    
    # Adjust opacity
    alpha_mult = opacity_pct / 100.0
    emblem_alpha = scaled_emblem.split()[3]
    emblem_alpha = ImageEnhance.Brightness(emblem_alpha).enhance(alpha_mult)
    scaled_emblem.putalpha(emblem_alpha)
    
    # Create white canvas
    canvas = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
    
    # Center on canvas (offset slightly down so header avatar doesn't clash with it)
    pos_x = (card_w - target_emblem_w) // 2
    pos_y = (card_h - target_emblem_h) // 2 + 10
    
    canvas.paste(scaled_emblem, (pos_x, pos_y), scaled_emblem)
    canvas.save(f"scratch/card_watermark_{opacity_pct}pct.png")
    print(f"Saved scratch/card_watermark_{opacity_pct}pct.png")
