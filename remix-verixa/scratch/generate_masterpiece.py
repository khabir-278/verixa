import math
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

orig = Image.open("public/verixa-logo.jpg").convert("RGBA")
w, h = orig.size  # 1024x1024

def generate_masterpiece_watermark(output_path, preview_path):
    # 1. Super-sampled canvas for pristine sub-pixel rendering (2048x2048)
    scale = 2
    sw, sh = 1024 * scale, 1024 * scale
    
    # Resize original with Lanczos for smooth subpixel interpolation
    highres_orig = orig.resize((sw, sh), Image.Resampling.LANCZOS)
    
    # 2. Extract and enhance the luminous elements
    # We build an RGBA layer on (sw, sh)
    processed = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    p_in = highres_orig.load()
    p_out = processed.load()
    
    center_x = sw // 2
    center_y = sh // 2
    
    # Squircle parameters:
    # In 1024 space, squircle is ~920x920, centered at (512, 512), radius ~185.
    half_size = int(450 * scale)
    cr = int(185 * scale)
    
    for y in range(sh):
        for x in range(sw):
            dx = abs(x - center_x)
            dy = abs(y - center_y)
            
            # Check if inside squircle
            if dx > half_size or dy > half_size:
                continue
                
            in_corner = (dx > half_size - cr) and (dy > half_size - cr)
            if in_corner:
                cdx = dx - (half_size - cr)
                cdy = dy - (half_size - cr)
                if math.sqrt(cdx*cdx + cdy*cdy) > cr:
                    continue
                    
            r, g, b, _ = p_in[x, y]
            luma = max(r, g, b)
            
            # Check for the "Verixa" text
            # In 1024 space, y is 670..820. In scale=2, y is 1340..1640
            orig_y = y / scale
            orig_x = x / scale
            is_text_zone = (670 <= orig_y <= 820 and 240 <= orig_x <= 780)
            
            # Distance from squircle border
            # The border is at radius roughly half_size
            dist_to_edge = half_size - max(dx, dy)
            if in_corner:
                dist_to_edge = cr - math.sqrt(cdx*cdx + cdy*cdy)
                
            is_border_zone = (dist_to_edge <= 55 * scale)
            
            if is_text_zone and luma > 100:
                # Is it the cyan accent on the 'x'?
                # In 'verixa-logo.jpg', the 'x' has a bright cyan leg
                if b > 160 and g > 100 and r < 140:
                    # Vibrant Cyan accent
                    p_out[x, y] = (0, 190, 255, int(luma * 0.42))
                else:
                    # Clean modern brand Indigo/Violet text
                    p_out[x, y] = (99, 102, 241, int(luma * 0.40))
                    
            elif is_border_zone and luma > 30:
                # The glowing neon squircle border
                # Normalize color for maximum vibrancy on white:
                # Calculate angle for gradient hue
                # Top-left is Cyan (#00c6ff), Right/Bottom is Violet/Pink (#ec4899)
                angle = math.atan2(y - center_y, x - center_x)  # -pi to +pi
                # Map angle to 0..1
                t = (angle + math.pi) / (2 * math.pi)
                
                # Blend border color smoothly from cyan (0, 198, 255) to magenta (236, 72, 153)
                # Boost brightness
                br_factor = min(1.0, luma / 140.0)
                alpha = int(br_factor * 255 * 0.32)
                p_out[x, y] = (r, g, b, alpha)
                
            elif luma > 40:
                # The Central Emblem (V-wing, Shield, Circuit Nodes)
                # Boost color saturation and luminosity
                br_factor = min(1.0, luma / 160.0)
                
                # Boost RGB to pop on white
                scale_rgb = 255.0 / max(luma, 1)
                pop_r = int(r * 0.6 + (r * scale_rgb) * 0.4)
                pop_g = int(g * 0.6 + (g * scale_rgb) * 0.4)
                pop_b = int(b * 0.6 + (b * scale_rgb) * 0.4)
                
                alpha = int(br_factor * 255 * 0.30)
                p_out[x, y] = (pop_r, pop_g, pop_b, alpha)
                
            else:
                # Inside tile ambient fill: ultra-light soft frosted lavender (barely 2% opacity)
                # Gives structure to the tile without muddying the white email background
                p_out[x, y] = (139, 92, 246, 6)
                
    print("Processed pixel data done.")
    
    # 3. Create anti-aliased squircle mask for the entire outer boundary
    super_mask = Image.new("L", (sw, sh), 0)
    draw = ImageDraw.Draw(super_mask)
    draw.rounded_rectangle([(center_x - half_size, center_y - half_size), 
                            (center_x + half_size, center_y + half_size)], 
                           radius=cr, fill=255)
    
    # Soften outer edge slightly (0.5px equivalent) to guarantee zero jagged edge
    super_mask = super_mask.filter(ImageFilter.GaussianBlur(radius=1.5))
    
    # Combine mask with processed image
    processed_alpha = processed.split()[3]
    # Multiply alphas
    final_alpha = Image.composite(processed_alpha, Image.new("L", (sw, sh), 0), super_mask)
    processed.putalpha(final_alpha)
    
    # 4. Now downsample back to pristine 1024x1024 with LANCZOS
    studio_tile = processed.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    # 5. Fit onto the exact email card dimensions: 520px wide by 600px high
    card_w, card_h = 520, 600
    # Make the tile 460px wide (1:1 square: 460x460)
    # This leaves 30px on each side and 70px vertical margin:
    # 100% of the rounded squircle is visible, 0% clipped, 0% flat edges!
    display_size = 460
    final_tile = studio_tile.resize((display_size, display_size), Image.Resampling.LANCZOS)
    
    # Final watermark PNG with transparent background
    card_canvas = Image.new("RGBA", (card_w, card_h), (0, 0, 0, 0))
    pos_x = (card_w - display_size) // 2
    pos_y = (card_h - display_size) // 2 + 10  # optical balance below header
    
    card_canvas.paste(final_tile, (pos_x, pos_y), final_tile)
    card_canvas.save(output_path, "PNG")
    print(f"Saved master watermark to {output_path}")
    
    # Also save a visual preview rendered on the white email card:
    white_preview = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
    white_preview.paste(card_canvas, (0, 0), card_canvas)
    white_preview.save(preview_path, "PNG")
    print(f"Saved white card preview to {preview_path}")

generate_masterpiece_watermark("public/verixa-master-watermark.png", "scratch/masterpiece_preview.png")
