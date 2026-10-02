from PIL import Image

def generate_big_full_card_watermark(input_path, output_path, target_w=520, target_h=580, alpha_val=0.18):
    img = Image.open(input_path).convert("RGBA")
    
    # Extract logo and remove black background
    datas = img.getdata()
    cleaned_data = []
    
    for item in datas:
        r, g, b, a = item
        brightness = max(r, g, b)
        
        if brightness < 28:
            cleaned_data.append((r, g, b, 0))
        elif brightness < 60:
            factor = (brightness - 28) / 32.0
            cleaned_data.append((r, g, b, int(255 * alpha_val * 0.4 * factor)))
        else:
            alpha = int(255 * alpha_val * (0.6 + 0.4 * (brightness / 255.0)))
            cleaned_data.append((r, g, b, min(255, alpha)))
            
    img.putdata(cleaned_data)
    
    # Scale logo so it fills virtually the ENTIRE width of the card (490x490)
    logo_w, logo_h = 490, 490
    logo_resized = img.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    
    # Create the full-card canvas (520x580)
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    
    # Place it centered on the canvas
    pos_x = (target_w - logo_w) // 2
    pos_y = (target_h - logo_h) // 2
    
    canvas.paste(logo_resized, (pos_x, pos_y), logo_resized)
    canvas.save(output_path, "PNG")
    print(f"Generated BIG full-card watermark at {output_path} ({target_w}x{target_h})")

    # Generate preview on white
    preview = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 255))
    preview.paste(canvas, (0, 0), canvas)
    preview.save("scratch/big_full_card_preview.png", "PNG")
    print("Saved scratch/big_full_card_preview.png")

generate_big_full_card_watermark("public/verixa-logo.jpg", "public/verixa-big-watermark.png")
