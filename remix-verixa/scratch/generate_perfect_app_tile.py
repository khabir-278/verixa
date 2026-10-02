from PIL import Image, ImageDraw, ImageFilter

def generate_perfect_studio_watermark(input_path, output_path, target_width=520, target_height=600):
    orig = Image.open(input_path).convert("RGBA")
    w, h = orig.size  # 1024x1024
    
    # 1. The icon bounding box is (40, 42, 984, 984) - roughly 944x942
    # Let's crop exactly the 1:1 square icon centered:
    crop_size = 944
    offset_x = (w - crop_size) // 2
    offset_y = (h - crop_size) // 2
    icon_cropped = orig.crop((offset_x, offset_y, offset_x + crop_size, offset_y + crop_size))
    
    # 2. Create a super-sampled 4x antialiased rounded rectangle mask
    # This guarantees 100% vector-smooth, buttery edges with ZERO jagged pixels!
    scale = 4
    mask_size = (crop_size * scale, crop_size * scale)
    corner_radius = int(185 * scale)  # Perfect squircle radius
    
    mask = Image.new("L", mask_size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), mask_size], radius=corner_radius, fill=255)
    
    # Downsample mask with LANCZOS for pristine sub-pixel antialiasing
    smooth_mask = mask.resize((crop_size, crop_size), Image.Resampling.LANCZOS)
    
    # Apply the mask to the cropped icon
    icon_cropped.putalpha(smooth_mask)
    
    # 3. Create studio watermark transparency:
    # We want the icon to be visible, elegant, and modern (around 22% - 26% overall opacity)
    # So it looks like a frosted glass app tile floating behind the content!
    datas = icon_cropped.getdata()
    watermark_data = []
    
    for item in datas:
        r, g, b, a = item
        if a == 0:
            watermark_data.append((0, 0, 0, 0))
            continue
            
        # Target opacity: 24% for dark areas, slightly higher for bright neon highlights
        brightness = max(r, g, b)
        alpha_scale = 0.22 + 0.12 * (brightness / 255.0)  # 22% to 34% opacity
        
        final_alpha = int(a * alpha_scale)
        watermark_data.append((r, g, b, final_alpha))
        
    icon_cropped.putdata(watermark_data)
    
    # 4. Now fit it into the full email card background canvas:
    # The card is 520px wide. We make the icon a big 460x460 (1:1 perfect square)!
    display_size = 460
    icon_final = icon_cropped.resize((display_size, display_size), Image.Resampling.LANCZOS)
    
    # Center on the 520x600 card canvas
    canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
    pos_x = (target_width - display_size) // 2
    pos_y = (target_height - display_size) // 2 + 15
    
    canvas.paste(icon_final, (pos_x, pos_y), icon_final)
    canvas.save(output_path, "PNG")
    print(f"Generated STUDIO QUALITY watermark at {output_path}")

    # Generate preview on white card background
    preview = Image.new("RGBA", (target_width, target_height), (255, 255, 255, 255))
    preview.paste(canvas, (0, 0), canvas)
    preview.save("scratch/perfect_studio_preview.png", "PNG")
    print("Saved scratch/perfect_studio_preview.png")

generate_perfect_studio_watermark("public/verixa-logo.jpg", "public/verixa-big-watermark.png")
