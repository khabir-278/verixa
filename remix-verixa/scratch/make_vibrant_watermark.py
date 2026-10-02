from PIL import Image, ImageEnhance

def make_vibrant_watermark(input_path, output_path, alpha_target=0.22):
    img = Image.open(input_path).convert("RGBA")
    
    # We want to keep the vibrant blue and purple neon shield colors,
    # make the black background 100% transparent,
    # and set the logo opacity to alpha_target (around 22% - 25% opacity so it is clearly visible on white!)
    datas = img.getdata()
    new_data = []
    
    for item in datas:
        r, g, b, a = item
        brightness = max(r, g, b)
        
        if brightness < 28:
            new_data.append((r, g, b, 0))
        elif brightness < 60:
            fade = (brightness - 28) / 32.0
            new_data.append((r, g, b, int(255 * alpha_target * 0.4 * fade)))
        else:
            # Scale alpha cleanly
            alpha = int(255 * alpha_target * (0.6 + 0.4 * (brightness / 255.0)))
            new_data.append((r, g, b, min(255, alpha)))
            
    img.putdata(new_data)
    # Resize to 340x160 or 300x300
    img_square = img.resize((320, 320), Image.Resampling.LANCZOS)
    img_square.save(output_path, "PNG")
    print(f"Saved {output_path}")
    
    # Also preview against white canvas with simulated OTP numbers on top
    preview = Image.new("RGBA", (420, 200), (248, 250, 252, 255))
    # Paste centered
    offset_x = (420 - 320) // 2
    offset_y = (200 - 320) // 2
    preview.paste(img_square, (offset_x, offset_y), img_square)
    preview.save("scratch/otp_box_watermark_preview.png", "PNG")
    print("Saved scratch/otp_box_watermark_preview.png")

make_vibrant_watermark("public/verixa-logo.jpg", "public/verixa-watermark.png", alpha_target=0.25)
