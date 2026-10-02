from PIL import Image

# 1. Load the AI-enhanced master emblem
ai_img = Image.open(r"C:\Users\syedk\.gemini\antigravity\brain\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\verixa_emblem_enhanced_1790962602045.jpg").convert("RGBA")
emblem = ai_img.crop((215, 205, 800, 835))
ew, eh = emblem.size

# Transparentize white background
p_in = emblem.load()
trans_emblem = Image.new("RGBA", (ew, eh), (0, 0, 0, 0))
p_out = trans_emblem.load()

# We want vibrant, gorgeous watermark colors
# Shield & V wing: ~35% opacity
# Bottom text: ~25% opacity
for y in range(eh):
    for x in range(ew):
        r, g, b, _ = p_in[x, y]
        delta = 255 - min(r, g, b)
        if delta < 8:
            continue
        
        is_bottom_text = (y > eh * 0.72)
        target_alpha = 0.26 if is_bottom_text else 0.38
        
        if delta < 35:
            factor = delta / 35.0
            p_out[x, y] = (r, g, b, int(255 * factor * target_alpha))
        else:
            p_out[x, y] = (r, g, b, int(255 * target_alpha))

card_w, card_h = 520, 600
disp_w = 420
disp_h = int(disp_w * (eh / ew))
scaled_emblem = trans_emblem.resize((disp_w, disp_h), Image.Resampling.LANCZOS)

# Create an RGBA layer for the watermark on the card
watermark_layer = Image.new("RGBA", (card_w, card_h), (0, 0, 0, 0))
pos_x = (card_w - disp_w) // 2
pos_y = (card_h - disp_h) // 2 - 10
watermark_layer.paste(scaled_emblem, (pos_x, pos_y), scaled_emblem)

# Save the transparent PNG (for users who want transparent PNG)
watermark_layer.save("public/verixa-studio-watermark-v6.png", "PNG")
print("Saved public/verixa-studio-watermark-v6.png")

# Now composite onto a pure solid white background using real alpha compositing:
solid_white = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
composited = Image.alpha_composite(solid_white, watermark_layer).convert("RGB")
composited.save("public/verixa-solid-white-card-v6.jpg", "JPEG", quality=98)
composited.save("scratch/real_composite_preview.png", "PNG")
print("Saved scratch/real_composite_preview.png and public/verixa-solid-white-card-v6.jpg")
