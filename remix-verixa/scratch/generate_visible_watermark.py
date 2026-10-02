from PIL import Image

def generate_visible_card_watermark(input_path, output_path, target_w=520, target_h=580, alpha_target=0.38):
    img = Image.open(input_path).convert("RGBA")
    
    datas = img.getdata()
    cleaned_data = []
    
    for item in datas:
        r, g, b, a = item
        brightness = max(r, g, b)
        
        # Transparent background for pure dark pixels
        if brightness < 26:
            cleaned_data.append((r, g, b, 0))
        elif brightness < 55:
            factor = (brightness - 26) / 29.0
            cleaned_data.append((r, g, b, int(255 * alpha_target * 0.5 * factor)))
        else:
            # Substantial, clearly visible alpha (38% to 45%)
            # Bright neon features get full alpha_target, giving strong definition!
            alpha = int(255 * alpha_target * (0.75 + 0.25 * (brightness / 255.0)))
            cleaned_data.append((r, g, b, min(255, alpha)))
            
    img.putdata(cleaned_data)
    
    # Scale logo to fill 490x490 of the card
    logo_w, logo_h = 490, 490
    logo_resized = img.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    
    # Full card canvas
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    pos_x = (target_w - logo_w) // 2
    pos_y = (target_h - logo_h) // 2
    
    canvas.paste(logo_resized, (pos_x, pos_y), logo_resized)
    canvas.save(output_path, "PNG")
    print(f"Generated MORE VISIBLE watermark at {output_path} (alpha={alpha_target})")

    # Generate preview on pure white
    preview = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 255))
    preview.paste(canvas, (0, 0), canvas)
    preview.save("scratch/more_visible_preview.png", "PNG")
    print("Saved scratch/more_visible_preview.png")

generate_visible_card_watermark("public/verixa-logo.jpg", "public/verixa-big-watermark.png", alpha_target=0.40)
