from PIL import Image

def create_card_watermark(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    
    # We want to extract the shield & V symbol and make the black background completely transparent
    datas = img.getdata()
    new_data = []
    
    for item in datas:
        r, g, b, a = item
        # Calculate brightness
        max_c = max(r, g, b)
        
        # If it's near black (background), make it 100% transparent
        if max_c < 30:
            new_data.append((r, g, b, 0))
        elif max_c < 60:
            # Smooth fade at edges
            factor = (max_c - 30) / 30.0
            new_data.append((r, g, b, int(15 * factor)))
        else:
            # For the bright logo, make alpha ~ 14 out of 255 (which is ~5.5% opacity on white)
            # This makes a faint watermark that doesn't compete with the OTP text at all!
            alpha_val = int(min(22, 6 + (max_c / 255.0) * 16))
            new_data.append((r, g, b, alpha_val))
            
    img.putdata(new_data)
    img = img.resize((360, 360), Image.Resampling.LANCZOS)
    img.save(output_path, "PNG")
    print(f"Generated clean watermark at {output_path}")

    # Also generate a preview on white background
    white_bg = Image.new("RGBA", (360, 360), (255, 255, 255, 255))
    white_bg.paste(img, (0, 0), img)
    white_bg.save("scratch/preview_on_white.png", "PNG")
    print("Saved preview_on_white.png")

create_card_watermark("public/verixa-logo.jpg", "public/verixa-watermark.png")
