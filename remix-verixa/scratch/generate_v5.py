from PIL import Image, ImageFilter, ImageEnhance

# 1. Load the AI-enhanced 8K master emblem
ai_img = Image.open(r"C:\Users\syedk\.gemini\antigravity\brain\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\verixa_emblem_enhanced_1790962602045.jpg").convert("RGBA")
# Crop tightly to emblem
emblem = ai_img.crop((215, 205, 800, 835))
ew, eh = emblem.size

# 2. Transparentize white background with high-chroma color preservation
p_in = emblem.load()
trans_emblem = Image.new("RGBA", (ew, eh), (0, 0, 0, 0))
p_out = trans_emblem.load()

for y in range(eh):
    for x in range(ew):
        r, g, b, _ = p_in[x, y]
        delta = 255 - min(r, g, b)
        if delta < 10:
            continue
        
        # Soften bottom brand text slightly so footer legal text is 100% legible
        is_bottom_text = (y > eh * 0.72)
        target_alpha = 0.28 if is_bottom_text else 0.44
        
        if delta < 45:
            factor = delta / 45.0
            p_out[x, y] = (r, g, b, int(255 * factor * target_alpha))
        else:
            p_out[x, y] = (r, g, b, int(255 * target_alpha))

# 3. Canvas for Email Card (520x600)
card_w, card_h = 520, 600
disp_w = 430
disp_h = int(disp_w * (eh / ew))
scaled_emblem = trans_emblem.resize((disp_w, disp_h), Image.Resampling.LANCZOS)

card_final = Image.new("RGBA", (card_w, card_h), (0, 0, 0, 0))
pos_x = (card_w - disp_w) // 2
pos_y = (card_h - disp_h) // 2 - 8  # Optical balance
card_final.paste(scaled_emblem, (pos_x, pos_y), scaled_emblem)

# Save transparent PNG
output_watermark = "public/verixa-studio-watermark-v5.png"
card_final.save(output_watermark, "PNG")
print(f"Saved {output_watermark}")

# Save white card preview
white_card = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
white_card.paste(card_final, (0, 0), card_final)
white_card.save("scratch/master_preview_v5.png", "PNG")
print("Saved scratch/master_preview_v5.png")
