from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

# Load the AI enhanced image (which has pure white background, crisp vector shield & V)
ai_img = Image.open(r"C:\Users\syedk\.gemini\antigravity\brain\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\verixa_emblem_enhanced_1790962602045.jpg").convert("RGBA")
# Emblem bbox is [220, 210, 795, 830]
emblem = ai_img.crop((215, 205, 800, 835))
ew, eh = emblem.size

# Transparentize white background
p_in = emblem.load()
trans_emblem = Image.new("RGBA", (ew, eh), (0, 0, 0, 0))
p_out = trans_emblem.load()

for y in range(eh):
    for x in range(ew):
        r, g, b, _ = p_in[x, y]
        delta = 255 - min(r, g, b)
        if delta < 10:
            continue
        elif delta < 45:
            # Smooth antialiasing
            factor = delta / 45.0
            # Watermark opacity: 45% so colors are clearly visible!
            p_out[x, y] = (r, g, b, int(255 * factor * 0.40))
        else:
            p_out[x, y] = (r, g, b, int(255 * 0.40))

# Email Card (520x600)
card_w, card_h = 520, 600
disp_w = 420
disp_h = int(disp_w * (eh / ew))
scaled_emblem = trans_emblem.resize((disp_w, disp_h), Image.Resampling.LANCZOS)

card_ai = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
pos_x = (card_w - disp_w) // 2
pos_y = (card_h - disp_h) // 2 + 10
card_ai.paste(scaled_emblem, (pos_x, pos_y), scaled_emblem)

# Simulate Avatar & OTP box
draw_sim = ImageDraw.Draw(card_ai)
orig = Image.open("public/verixa-logo.jpg").convert("RGBA")
avatar = orig.resize((56, 56), Image.Resampling.LANCZOS)
av_m = Image.new("L", (56*4, 56*4), 0)
ImageDraw.Draw(av_m).rounded_rectangle([(0,0), (56*4, 56*4)], radius=14*4, fill=255)
av_smooth_m = av_m.resize((56, 56), Image.Resampling.LANCZOS)
avatar.putalpha(av_smooth_m)
av_x = (card_w - 56) // 2
av_y = 38
card_ai.paste(avatar, (av_x, av_y), avatar)

otp_box_w, otp_box_h = 280, 72
otp_x = (card_w - otp_box_w) // 2
otp_y = 236
draw_sim.rounded_rectangle([(otp_x, otp_y), (otp_x + otp_box_w, otp_y + otp_box_h)], 
                           radius=14, fill=(255, 255, 255, 255), outline=(216, 180, 254, 255), width=2)

card_ai.save("scratch/mockup_ai_enhanced_emblem.png")
print("Saved scratch/mockup_ai_enhanced_emblem.png")
