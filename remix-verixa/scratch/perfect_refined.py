from PIL import Image, ImageDraw, ImageFont

# Load the AI enhanced emblem
ai_img = Image.open(r"C:\Users\syedk\.gemini\antigravity\brain\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\verixa_emblem_enhanced_1790962602045.jpg").convert("RGBA")
emblem = ai_img.crop((215, 205, 800, 835))
ew, eh = emblem.size

# Transparentize white background with exquisite alpha gradients
p_in = emblem.load()
trans_emblem = Image.new("RGBA", (ew, eh), (0, 0, 0, 0))
p_out = trans_emblem.load()

for y in range(eh):
    for x in range(ew):
        r, g, b, _ = p_in[x, y]
        delta = 255 - min(r, g, b)
        if delta < 10:
            continue
        
        # Soften the text at the bottom slightly so footer text has supreme legibility
        is_bottom_text = (y > eh * 0.72)
        target_alpha = 0.22 if is_bottom_text else 0.32
        
        if delta < 45:
            factor = delta / 45.0
            p_out[x, y] = (r, g, b, int(255 * factor * target_alpha))
        else:
            p_out[x, y] = (r, g, b, int(255 * target_alpha))

# Email Card (520x600)
card_w, card_h = 520, 600
# Target display width: 400px
disp_w = 400
disp_h = int(disp_w * (eh / ew))
scaled_emblem = trans_emblem.resize((disp_w, disp_h), Image.Resampling.LANCZOS)

card_final = Image.new("RGBA", (card_w, card_h), (0, 0, 0, 0))
pos_x = (card_w - disp_w) // 2
pos_y = (card_h - disp_h) // 2 - 10  # Shift up slightly for perfect visual balance
card_final.paste(scaled_emblem, (pos_x, pos_y), scaled_emblem)

# Save the final transparent watermark image
output_watermark = "public/verixa-studio-watermark-v4.png"
card_final.save(output_watermark, "PNG")
print(f"Saved {output_watermark}")

# Render complete preview on white
white_card = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
white_card.paste(card_final, (0, 0), card_final)

# Add simulated text & components
draw = ImageDraw.Draw(white_card)
try:
    font_title = ImageFont.truetype("arialbd.ttf", 23)
    font_sub = ImageFont.truetype("arial.ttf", 14)
    font_otp = ImageFont.truetype("consola.ttf", 36)
    font_body = ImageFont.truetype("arial.ttf", 13)
    font_small = ImageFont.truetype("arial.ttf", 11)
except:
    font_title = ImageFont.load_default()
    font_sub = ImageFont.load_default()
    font_otp = ImageFont.load_default()
    font_body = ImageFont.load_default()
    font_small = ImageFont.load_default()

# Avatar
orig = Image.open("public/verixa-logo.jpg").convert("RGBA")
avatar = orig.resize((56, 56), Image.Resampling.LANCZOS)
av_m = Image.new("L", (56*4, 56*4), 0)
ImageDraw.Draw(av_m).rounded_rectangle([(0,0), (56*4, 56*4)], radius=14*4, fill=255)
av_smooth_m = av_m.resize((56, 56), Image.Resampling.LANCZOS)
avatar.putalpha(av_smooth_m)
av_x = (card_w - 56) // 2
av_y = 38
white_card.paste(avatar, (av_x, av_y), avatar)

# Title & subtitle
draw.text((260, 108), "VERIXA", fill=(15, 23, 42), font=font_title, anchor="mm")
draw.text((260, 150), "Verify Your Account", fill=(15, 23, 42), font=font_title, anchor="mm")
draw.text((260, 178), "Your verification code:", fill=(100, 116, 139), font=font_sub, anchor="mm")

# OTP Box
otp_box_w, otp_box_h = 280, 72
otp_x = (card_w - otp_box_w) // 2
otp_y = 216
draw.rounded_rectangle([(otp_x, otp_y), (otp_x + otp_box_w, otp_y + otp_box_h)], 
                       radius=14, fill=(255, 255, 255, 255), outline=(216, 180, 254, 255), width=2)
draw.text((260, 252), "7 4 2 6 6 6", fill=(15, 23, 42), font=font_otp, anchor="mm")

# Body
draw.text((260, 320), "Use the above verification code to validate your email", fill=(71, 85, 105), font=font_body, anchor="mm")
draw.text((260, 340), "and complete your registration.", fill=(71, 85, 105), font=font_body, anchor="mm")
draw.text((260, 380), "This code will expire in 10 minutes. If you did not request this", fill=(148, 163, 184), font=font_small, anchor="mm")
draw.text((260, 396), "verification, you can safely ignore this email.", fill=(148, 163, 184), font=font_small, anchor="mm")

# Divider
draw.line([(60, 435), (460, 435)], fill=(241, 245, 249), width=1)
draw.text((260, 460), "VERIXA Identity Safeguard  •  AI-Shielded Network", fill=(100, 116, 139), font=font_small, anchor="mm")
draw.text((260, 480), "This is an automated security transmission. Please do not reply directly.", fill=(148, 163, 184), font=font_small, anchor="mm")

white_card.save("scratch/perfect_refined_preview.png")
print("Saved scratch/perfect_refined_preview.png")
