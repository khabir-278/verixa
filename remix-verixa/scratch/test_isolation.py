from PIL import Image, ImageFilter, ImageOps, ImageEnhance

im = Image.open('public/verixa-logo.jpg').convert('RGBA')
w, h = im.size  # 1024x1024

# Let's inspect isolating the artwork from the dark background
# Background in the dark image is near black: r<35, g<35, b<50.
# Let's write a function to separate foreground from dark background smoothly:

def extract_luminous_foreground(img):
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    pixels_in = img.load()
    pixels_out = out.load()
    
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels_in[x, y]
            # Max RGB value represents luminance
            luma = max(r, g, b)
            
            # Pure dark background threshold
            # Anything below 35 is dark background noise
            if luma <= 35:
                pixels_out[x, y] = (0, 0, 0, 0)
            else:
                # Smooth ramp from 35 to 80
                factor = min(1.0, (luma - 35) / 45.0)
                
                # Check if it's the white text / nodes
                # White elements have r~g~b and high brightness
                is_white = (luma > 180 and abs(r - g) < 25 and abs(g - b) < 25)
                
                if is_white and y > 640:
                    # This is the "Verixa" text!
                    # On a white email, white text is invisible.
                    # We map it to brand deep violet/indigo (#6366f1 to #4f46e5)
                    # so it shows up crisp and gorgeous on white!
                    target_r, target_g, target_b = 99, 102, 241
                    # Opacity for watermark
                    out_alpha = int(255 * factor * 0.28)
                    pixels_out[x, y] = (target_r, target_g, target_b, out_alpha)
                elif is_white:
                    # White circuit nodes / dots: map to vibrant cyan/violet
                    target_r, target_g, target_b = 139, 92, 246
                    out_alpha = int(255 * factor * 0.35)
                    pixels_out[x, y] = (target_r, target_g, target_b, out_alpha)
                else:
                    # Colored elements: V-wing (cyan/blue), Shield (magenta/purple), border
                    # Boost saturation slightly so it pops on white!
                    out_alpha = int(255 * factor * 0.30)
                    pixels_out[x, y] = (r, g, b, out_alpha)
                    
    return out

isolated = extract_luminous_foreground(im)
isolated.save("scratch/isolated_foreground.png")
print("Saved scratch/isolated_foreground.png")

# Now let's create a preview on a white background:
preview_white = Image.new("RGBA", (w, h), (255, 255, 255, 255))
preview_white.paste(isolated, (0, 0), isolated)
preview_white.save("scratch/preview_white_raw.png")
print("Saved scratch/preview_white_raw.png")
