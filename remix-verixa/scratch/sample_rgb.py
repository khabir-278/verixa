from PIL import Image

im = Image.open('public/verixa-logo.jpg').convert('RGB')
w, h = im.size

# Sample corners and center background
print("Corner (0,0):", im.getpixel((0, 0)))
print("Corner (1023,0):", im.getpixel((1023, 0)))
print("Inside tile background (250, 250):", im.getpixel((250, 250)))
print("Inside tile background (750, 250):", im.getpixel((750, 250)))
print("Emblem V wing (350, 450):", im.getpixel((350, 450)))
print("Emblem Shield (600, 400):", im.getpixel((600, 400)))
print("Text Verixa (500, 740):", im.getpixel((500, 740)))
