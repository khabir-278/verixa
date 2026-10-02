from PIL import Image

ai_img = Image.open(r"C:\Users\syedk\.gemini\antigravity\brain\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\verixa_emblem_enhanced_1790962602045.jpg").convert("RGBA")
emblem = ai_img.crop((215, 205, 800, 835))
ew, eh = emblem.size

for target_alpha in [0.55, 0.70, 0.85]:
    p_in = emblem.load()
    trans_emblem = Image.new("RGBA", (ew, eh), (0, 0, 0, 0))
    p_out = trans_emblem.load()

    for y in range(eh):
        for x in range(ew):
            r, g, b, _ = p_in[x, y]
            delta = 255 - min(r, g, b)
            if delta < 8:
                continue
            
            # Bottom text slightly softer than emblem
            is_bottom_text = (y > eh * 0.72)
            alpha_scale = (target_alpha * 0.75) if is_bottom_text else target_alpha
            
            if delta < 35:
                factor = delta / 35.0
                p_out[x, y] = (r, g, b, int(255 * factor * alpha_scale))
            else:
                p_out[x, y] = (r, g, b, int(255 * alpha_scale))

    card_w, card_h = 520, 600
    disp_w = 420
    disp_h = int(disp_w * (eh / ew))
    scaled = trans_emblem.resize((disp_w, disp_h), Image.Resampling.LANCZOS)

    watermark = Image.new("RGBA", (card_w, card_h), (0, 0, 0, 0))
    pos_x = (card_w - disp_w) // 2
    pos_y = (card_h - disp_h) // 2 - 10
    watermark.paste(scaled, (pos_x, pos_y), scaled)

    solid = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
    comp = Image.alpha_composite(solid, watermark).convert("RGB")
    comp.save(f"scratch/preview_opacity_{int(target_alpha*100)}.png")
    print(f"Saved scratch/preview_opacity_{int(target_alpha*100)}.png")
