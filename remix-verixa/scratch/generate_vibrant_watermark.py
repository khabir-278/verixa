from PIL import Image, ImageEnhance

def generate_vibrant_colored_watermark(input_path, output_path, target_w=520, target_h=580, alpha_target=0.45):
    img = Image.open(input_path).convert("RGBA")
    
    datas = img.getdata()
    cleaned_data = []
    
    for item in datas:
        r, g, b, a = item
        brightness = max(r, g, b)
        
        if brightness < 26:
            cleaned_data.append((r, g, b, 0))
        elif brightness < 50:
            factor = (brightness - 26) / 24.0
            cleaned_data.append((r, g, b, int(255 * 0.15 * factor)))
        else:
            # Boost color vibrancy so it doesn't look washed out on white!
            # Scale up RGB so the colors are vivid and saturated
            scale_rgb = min(2.2, 255.0 / max(1, brightness))
            r_boost = min(255, int(r * scale_rgb))
            g_boost = min(255, int(g * scale_rgb))
            b_boost = min(255, int(b * scale_rgb))
            
            # Alpha between 35% and 50%
            alpha = int(255 * alpha_target * (0.7 + 0.3 * (brightness / 255.0)))
            cleaned_data.append((r_boost, g_boost, b_boost, min(255, alpha)))
            
    img.putdata(cleaned_data)
    
    # Scale logo to fill 490x490 of the card
    logo_w, logo_h = 490, 490
    logo_resized = img.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    pos_x = (target_w - logo_w) // 2
    pos_y = (target_h - logo_h) // 2
    
    canvas.paste(logo_resized, (pos_x, pos_y), logo_resized)
    canvas.save(output_path, "PNG")
    print(f"Generated VIBRANT colored watermark at {output_path} (alpha={alpha_target})")

    # Preview on white
    preview = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 255))
    preview.paste(canvas, (0, 0), canvas)
    preview.save("scratch/vibrant_colored_preview.png", "PNG")
    print("Saved scratch/vibrant_colored_preview.png")

generate_vibrant_colored_watermark("public/verixa-logo.jpg", "public/verixa-big-watermark.png", alpha_target=0.45)
