import math
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

orig = Image.open("public/verixa-logo.jpg").convert("RGBA")
w, h = orig.size  # 1024x1024

# Let's inspect the exact squircle geometry in verixa-logo.jpg:
# Glowing border is between x in [60, 960], y in [60, 960].
# Bounding box of the whole tile including glow is [45, 45, 979, 979].
# Size of tile is ~934 x 934.
# Corner radius is ~180px.

# =========================================================================
# TREATMENT 1: Pristine Full App Tile with Luminous Glass & Antialiased Squircle
# =========================================================================
def create_treatment_1():
    # Take the full 1024x1024 image
    # Generate a super-smooth 4x antialiased squircle mask for the tile
    scale = 4
    mask_w, mask_h = 920 * scale, 920 * scale
    radius = int(185 * scale)
    
    super_mask = Image.new("L", (1024 * scale, 1024 * scale), 0)
    draw = ImageDraw.Draw(super_mask)
    # Centered squircle
    offset = int((1024 - 920) / 2 * scale)
    draw.rounded_rectangle([(offset, offset), (offset + mask_w, offset + mask_h)], radius=radius, fill=255)
    
    # Downsample with Lanczos for subpixel perfection
    squircle_mask = super_mask.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    tile_img = orig.copy()
    tile_img.putalpha(squircle_mask)
    
    # Now set overall watermark opacity to 18% so it is a gentle, luxury watermark
    alpha = tile_img.split()[3]
    alpha = ImageEnhance.Brightness(alpha).enhance(0.18)
    tile_img.putalpha(alpha)
    
    # Composite onto 520x620 email card
    card_w, card_h = 520, 620
    display_size = 460
    resized_tile = tile_img.resize((display_size, display_size), Image.Resampling.LANCZOS)
    
    card = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
    pos_x = (card_w - display_size) // 2
    pos_y = (card_h - display_size) // 2 + 10
    card.paste(resized_tile, (pos_x, pos_y), resized_tile)
    card.save("scratch/preview_treatment_1_full_tile.png")
    print("Saved scratch/preview_treatment_1_full_tile.png")

# =========================================================================
# TREATMENT 2: Luminous Frosted Neon Glass (Dark background replaced by clean translucent tint,
# glowing neon border and cyan/purple emblem preserved vibrantly, typography in sharp indigo)
# =========================================================================
def create_treatment_2():
    # Process 1024x1024 pixels
    out = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    p_in = orig.load()
    p_out = out.load()
    
    # Squircle boundary check
    center = 512
    half_size = 445
    cr = 185
    
    for y in range(1024):
        for x in range(1024):
            # Check if point is inside squircle
            dx = abs(x - center)
            dy = abs(y - center)
            
            # Corner distance check
            if dx > half_size or dy > half_size:
                p_out[x, y] = (0, 0, 0, 0)
                continue
                
            in_corner = (dx > half_size - cr) and (dy > half_size - cr)
            if in_corner:
                cdx = dx - (half_size - cr)
                cdy = dy - (half_size - cr)
                if math.sqrt(cdx*cdx + cdy*cdy) > cr:
                    p_out[x, y] = (0, 0, 0, 0)
                    continue
                    
            r, g, b, _ = p_in[x, y]
            luma = max(r, g, b)
            
            # Is it the "Verixa" text?
            is_text = (y >= 650 and y <= 820 and luma > 100 and abs(r - g) < 30 and abs(g - b) < 30)
            
            if is_text:
                # Indigo text with crisp contrast
                p_out[x, y] = (99, 102, 241, int(luma * 0.35))
            elif luma > 60:
                # Glowing emblem or border: keep vibrant colors!
                p_out[x, y] = (r, g, b, int(luma * 0.38))
            elif luma > 20:
                # Soft neon glow transition
                p_out[x, y] = (r, g, b, int(luma * 0.25))
            else:
                # Interior frosted glass background of the tile
                # Soft ambient lavender tint
                p_out[x, y] = (124, 58, 237, 8)  # ~3% opacity tint
                
    # Smooth with slight blur to remove any grain
    out_smooth = out.filter(ImageFilter.SMOOTH_MORE)
    
    # Composite onto 520x620 email card
    card_w, card_h = 520, 620
    display_size = 460
    resized_tile = out_smooth.resize((display_size, display_size), Image.Resampling.LANCZOS)
    
    card = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
    pos_x = (card_w - display_size) // 2
    pos_y = (card_h - display_size) // 2 + 10
    card.paste(resized_tile, (pos_x, pos_y), resized_tile)
    card.save("scratch/preview_treatment_2_neon_glass.png")
    print("Saved scratch/preview_treatment_2_neon_glass.png")

# =========================================================================
# TREATMENT 3: The 8K Vector Studio Emblem (From AI Enhancement, centered, balanced, no borders)
# =========================================================================
def create_treatment_3():
    gen_path = r"C:\Users\syedk\.gemini\antigravity\brain\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\verixa_emblem_enhanced_1790962602045.jpg"
    raw = Image.open(gen_path).convert("RGBA")
    
    # Real bounding box is [229, 229, 785, 814]
    cropped = raw.crop((220, 210, 795, 830))
    
    # Transparentize pure white background
    w_c, h_c = cropped.size
    out = Image.new("RGBA", (w_c, h_c), (0, 0, 0, 0))
    p_in = cropped.load()
    p_out = out.load()
    
    for y in range(h_c):
        for x in range(w_c):
            r, g, b, _ = p_in[x, y]
            # Distance from white
            delta = 255 - min(r, g, b)
            if delta < 8:
                p_out[x, y] = (0, 0, 0, 0)
            elif delta < 40:
                alpha = int((delta / 40.0) * 255 * 0.22)
                p_out[x, y] = (r, g, b, alpha)
            else:
                p_out[x, y] = (r, g, b, int(255 * 0.22))
                
    card_w, card_h = 520, 620
    # Scale emblem to 420px wide
    disp_w = 420
    disp_h = int(disp_w * (h_c / w_c))
    resized = out.resize((disp_w, disp_h), Image.Resampling.LANCZOS)
    
    card = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
    pos_x = (card_w - disp_w) // 2
    pos_y = (card_h - disp_h) // 2 + 10
    card.paste(resized, (pos_x, pos_y), resized)
    card.save("scratch/preview_treatment_3_vector_emblem.png")
    print("Saved scratch/preview_treatment_3_vector_emblem.png")

create_treatment_1()
create_treatment_2()
create_treatment_3()
