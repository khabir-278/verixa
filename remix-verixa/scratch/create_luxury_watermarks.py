import math
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

# Load original high-res logo
orig = Image.open('public/verixa-logo.jpg').convert('RGBA')
w, h = orig.size  # 1024 x 1024

print("Loaded logo:", w, h)
