import math
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageFont

orig = Image.open("public/verixa-logo.jpg").convert("RGBA")
w, h = orig.size  # 1024x1024

def build_perfect_studio_watermark():
    # 1. Start with 1024x1024 original
    # We want:
    # - Silky smooth neon squircle border (cyan to magenta)
    # - Vibrant cyan V wing and magenta/purple shield
    # - Indigo Verixa typography
    # - Subtle frosted glass ambient fill inside the squircle
    # - Transparent outside the squircle
    
    out = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    p_in = orig.load()
    p_out = out.load()
    
    center = 512
    half_size = 430  # 860x860 tile, fits with ample margin
    cr = 175         # perfect squircle radius
    
    for y in range(1024):
        for x in range(1024):
            dx = abs(x - center)
            dy = abs(y - center)
            
            # Squircle geometry
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
            
            # Check for Verixa text
            if 660 <= y <= 820 and 220 <= x <= 790 and luma > 90:
                # Is it cyan leg of 'x'?
                if b > 150 and g > 90 and r < 120:
                    p_out[x, y] = (0, 195, 255, int(luma * 0.45))
                else:
                    # Crisp indigo text
                    p_out[x, y] = (79, 70, 229, int(luma * 0.42))
            elif luma > 35:
                # Shield or V-wing or Glowing Border
                # Normalize color for vibrant pop on white:
                # Scale RGB to maintain high saturation
                scale = 255.0 / max(luma, 1)
                sat_r = int(r * 0.5 + (r * scale) * 0.5)
                sat_g = int(g * 0.5 + (g * scale) * 0.5)
                sat_b = int(b * 0.5 + (b * scale) * 0.5)
                
                # Balanced alpha (26% to 38%)
                alpha = int(min(255, luma * 1.2) * 0.32)
                p_out[x, y] = (sat_r, sat_g, sat_b, alpha)
            else:
                # Ultra subtle frosted glass interior tint (lavender glow, ~3% alpha)
                p_out[x, y] = (139, 92, 246, 7)
                
    # 2. Perfect Antialiased Outer Edge
    # Mask with radius cr
    scale_m = 4
    mask_size = (1024 * scale_m, 1024 * scale_m)
    m = Image.new("L", mask_size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([( (center - half_size)*scale_m, (center - half_size)*scale_m ),
                         ( (center + half_size)*scale_m, (center + half_size)*scale_m )],
                        radius=cr * scale_m, fill=255)
    smooth_mask = m.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    final_alpha = Image.composite(out.split()[3], Image.new("L", (1024, 1024), 0), smooth_mask)
    out.putalpha(final_alpha)
    
    # 3. Canvas for Email Card (520x600)
    card_w, card_h = 520, 600
    display_size = 440  # 440x440 (leaves 40px margin horizontally, 80px vertically)
    tile_scaled = out.resize((display_size, display_size), Image.Resampling.LANCZOS)
    
    canvas = Image.new("RGBA", (card_w, card_h), (0, 0, 0, 0))
    pos_x = (card_w - display_size) // 2
    pos_y = (card_h - display_size) // 2 + 10
    canvas.paste(tile_scaled, (pos_x, pos_y), tile_scaled)
    
    output_png = "public/verixa-studio-watermark-v3.png"
    canvas.save(output_png, "PNG")
    print(f"Saved {output_png}")
    
    # 4. Generate FULL EMAIL CARD PREVIEW WITH TEXT AND OTP
    email_preview = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
    email_preview.paste(canvas, (0, 0), canvas)
    
    # Draw simulated email contents on top:
    draw_sim = ImageDraw.Draw(email_preview)
    
    # Avatar at top
    avatar = orig.resize((56, 56), Image.Resampling.LANCZOS)
    # rounded avatar mask
    av_m = Image.new("L", (56*4, 56*4), 0)
    ImageDraw.Draw(av_m).rounded_rectangle([(0,0), (56*4, 56*4)], radius=14*4, fill=255)
    av_smooth_m = av_m.resize((56, 56), Image.Resampling.LANCZOS)
    avatar.putalpha(av_smooth_m)
    
    av_x = (card_w - 56) // 2
    av_y = 38
    email_preview.paste(avatar, (av_x, av_y), avatar)
    
    # Simulate OTP Box (centered, y=240, 280x74)
    otp_box_w, otp_box_h = 280, 72
    otp_x = (card_w - otp_box_w) // 2
    otp_y = 236
    # White background for OTP box with purple border
    draw_sim.rounded_rectangle([(otp_x, otp_y), (otp_x + otp_box_w, otp_y + otp_box_h)], 
                               radius=14, fill=(255, 255, 255, 255), outline=(216, 180, 254, 255), width=2)
    
    email_preview.save("scratch/full_email_mockup_v3.png")
    print("Saved scratch/full_email_mockup_v3.png")

build_perfect_studio_watermark()
