from PIL import Image

img = Image.open("public/verixa-logo.jpg")
print("Image size:", img.size, img.mode)

# Sample points in the shield and V
# The image is 1024x1024
# Center is 512, 512
points = [(350, 450), (450, 450), (600, 450), (512, 700)]
for p in points:
    print(f"Pixel at {p}: {img.getpixel(p)}")
