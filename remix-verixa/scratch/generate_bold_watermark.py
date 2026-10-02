from PIL import Image

def generate_bold_watermark(input_path, output_path, target_w=520, target_h=580, opacity=0.48):
    img = Image.open(input_path).convert("RGBA")
    
    datas = img.getdata()
    new_data = []
    
    for item in datas:
        r, g, b, a = item
        brightness = max(r, g, b)
        
        # Transparent for black background outside the logo
        if brightness < 20:
            new_data.append((r, g, b, 0))
        elif brightness < 45:
            factor = (brightness - 20) / 25.0
            new_data.append((r, g, b, int(255 * opacity * 0.4 * factor)))
        else:
            # Solid, unmistakable visibility (~48% opacity)
            # Boost brightness so the colors pop crisply on white
            scale = min(2.4, 255.0 / max(60, brightness))
            r_c = min(255, int(r * scale))
            g_c = min(255, int(g * scale))
            b_c = min(255, int(b * scale))
            
            new_alpha = int(255 * opacity * (0.8 + 0.2 * (brightness / 255.0)))
            new_data.append((r_c, g_c, b_c, min(255, new_alpha)))
            
    img.putdata(new_data)
    
    # Scale to fill 490x490 of the card block
    logo_w, logo_h = 490, 490
    logo_resized = img.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    pos_x = (target_w - logo_w) // 2
    pos_y = (target_h - logo_h) // 2
    
    canvas.paste(logo_resized, (pos_x, pos_y), logo_resized)
    canvas.save(output_path, "PNG")
    print(f"Generated BOLD watermark at {output_path} (opacity={opacity})")

    preview = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 255))
    preview.paste(canvas, (0, 0), canvas)
    preview.save("scratch/bold_preview.png", "PNG")
    print("Saved scratch/bold_preview.png")

generate_bold_watermark("public/verixa-logo.jpg", "public/verixa-big-watermark.png", opacity=0.48)
