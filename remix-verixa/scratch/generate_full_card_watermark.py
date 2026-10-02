from PIL import Image

def generate_full_card_watermark(input_path, output_path, target_width=520, target_height=600):
    img = Image.open(input_path).convert("RGBA")
    
    # 1. First extract the logo without black background
    datas = img.getdata()
    cleaned_data = []
    
    for item in datas:
        r, g, b, a = item
        brightness = max(r, g, b)
        
        if brightness < 30:
            cleaned_data.append((r, g, b, 0))
        elif brightness < 65:
            factor = (brightness - 30) / 35.0
            cleaned_data.append((r, g, b, int(255 * 0.08 * factor)))
        else:
            # Opacity around 10% - 13% across the entire card
            # This is soft enough that all text, headings, and OTP numbers are 100% readable!
            alpha = int(255 * 0.11 * (0.6 + 0.4 * (brightness / 255.0)))
            cleaned_data.append((r, g, b, min(255, alpha)))
            
    img.putdata(cleaned_data)
    
    # 2. Now resize the logo so it fills a large portion of the full card (e.g. 460x460)
    logo_size = 460
    logo_resized = img.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    
    # 3. Create a full-card canvas of 520x600 transparent pixels
    card_canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
    
    # Center the logo on the card canvas
    pos_x = (target_width - logo_size) // 2
    pos_y = (target_height - logo_size) // 2 + 10  # slightly lower to sit behind the title and OTP
    
    card_canvas.paste(logo_resized, (pos_x, pos_y), logo_resized)
    card_canvas.save(output_path, "PNG")
    print(f"Saved full-card watermark to {output_path} ({target_width}x{target_height})")

    # Also generate a full card preview on pure white
    preview = Image.new("RGBA", (target_width, target_height), (255, 255, 255, 255))
    preview.paste(card_canvas, (0, 0), card_canvas)
    preview.save("scratch/full_card_preview.png", "PNG")
    print("Saved scratch/full_card_preview.png")

generate_full_card_watermark("public/verixa-logo.jpg", "public/verixa-card-watermark.png")
