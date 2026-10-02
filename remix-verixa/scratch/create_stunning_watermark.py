from PIL import Image, ImageFilter, ImageEnhance
import math

def create_stunning_watermark(input_path, output_path):
    # 1. Open original high-res 1024x1024 logo
    orig = Image.open(input_path).convert("RGBA")
    w, h = orig.size
    
    # 2. Extract the emblem:
    # Instead of harsh thresholding, we use smooth continuous math:
    # Let's inspect each pixel and compute smooth alpha
    r, g, b, _ = orig.split()
    
    # Convert to grayscale for luminance
    gray = orig.convert("L")
    
    # Let's create an alpha mask that smoothly maps luminance:
    # Black background (0-30) -> 0 alpha
    # Transition (30-80) -> smoothstep
    # Bright logo (80-255) -> smooth alpha
    def smoothstep(edge0, edge1, x):
        t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
        return t * t * (3.0 - 2.0 * t)

    # We also want a soft radial falloff near the outer edges so there is NEVER a hard crop!
    # Center is at (w/2, h/2)
    center_x, center_y = w / 2.0, h / 2.0
    max_radius = w * 0.44  # soft fade before the image borders
    
    pixels_rgb = orig.load()
    alpha_img = Image.new("L", (w, h), 0)
    alpha_pixels = alpha_img.load()
    
    out_rgb = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out_pixels = out_rgb.load()
    
    for y in range(h):
        for x in range(w):
            r_val, g_val, b_val, _ = pixels_rgb[x, y]
            brightness = max(r_val, g_val, b_val)
            
            # Distance from center for smooth vignetting
            dist = math.sqrt((x - center_x)**2 + (y - center_y)**2)
            edge_factor = 1.0 - smoothstep(max_radius * 0.85, max_radius, dist)
            
            # Brightness alpha factor
            lum_factor = smoothstep(28, 90, brightness)
            
            final_alpha = int(255 * 0.28 * lum_factor * edge_factor)
            
            if final_alpha > 0:
                # Boost color saturation so the cyan and purple look vibrant, not muddy grey!
                norm = min(2.5, 255.0 / max(40, brightness))
                r_out = min(255, int(r_val * norm))
                g_out = min(255, int(g_val * norm))
                b_out = min(255, int(b_val * norm))
                out_pixels[x, y] = (r_out, g_out, b_out, final_alpha)
            else:
                out_pixels[x, y] = (0, 0, 0, 0)
                
    # 3. Apply a subtle anti-aliasing / smoothing pass
    # Resize to high-density target for crisp retina display
    target_w, target_h = 520, 600
    # Center emblem nicely (e.g. 480x480)
    emblem_size = 480
    resized_emblem = out_rgb.resize((emblem_size, emblem_size), Image.Resampling.LANCZOS)
    
    final_canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    pos_x = (target_w - emblem_size) // 2
    pos_y = (target_h - emblem_size) // 2 + 15
    final_canvas.paste(resized_emblem, (pos_x, pos_y), resized_emblem)
    
    final_canvas.save(output_path, "PNG")
    print(f"Saved stunning watermark to {output_path}")

    # Generate preview on pure white
    preview = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 255))
    preview.paste(final_canvas, (0, 0), final_canvas)
    preview.save("scratch/stunning_preview.png", "PNG")
    print("Saved scratch/stunning_preview.png")

create_stunning_watermark("public/verixa-logo.jpg", "public/verixa-big-watermark.png")
