from PIL import Image, ImageDraw, ImageFont

img = Image.open("scratch/mockup_ai_enhanced_emblem.png")
draw = ImageDraw.Draw(img)

# Try to use standard sans font
try:
    font_title = ImageFont.truetype("arialbd.ttf", 24)
    font_sub = ImageFont.truetype("arial.ttf", 14)
    font_otp = ImageFont.truetype("consola.ttf", 36)
    font_body = ImageFont.truetype("arial.ttf", 13)
except:
    font_title = ImageFont.load_default()
    font_sub = ImageFont.load_default()
    font_otp = ImageFont.load_default()
    font_body = ImageFont.load_default()

# App title below avatar
draw.text((260, 108), "VERIXA", fill=(15, 23, 42), font=font_title, anchor="mm")

# Verify Your Account
draw.text((260, 155), "Verify Your Account", fill=(15, 23, 42), font=font_title, anchor="mm")
draw.text((260, 185), "Your verification code:", fill=(100, 116, 139), font=font_sub, anchor="mm")

# OTP inside OTP box
draw.text((260, 272), "7 4 2 6 6 6", fill=(15, 23, 42), font=font_otp, anchor="mm")

# Instructions below
draw.text((260, 345), "Use the above verification code to validate your email", fill=(71, 85, 105), font=font_body, anchor="mm")
draw.text((260, 365), "and complete your registration.", fill=(71, 85, 105), font=font_body, anchor="mm")

draw.text((260, 400), "This code will expire in 10 minutes.", fill=(148, 163, 184), font=font_body, anchor="mm")

# Safeguard line
draw.line([(60, 440), (460, 440)], fill=(241, 245, 249), width=1)
draw.text((260, 465), "VERIXA Identity Safeguard  •  AI-Shielded Network", fill=(100, 116, 139), font=font_body, anchor="mm")

img.save("scratch/complete_email_preview_rendered.png")
print("Saved scratch/complete_email_preview_rendered.png")
