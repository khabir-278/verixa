from PIL import Image

gen_path = r"C:\Users\syedk\.gemini\antigravity\brain\6e2fcc2e-e314-4e2f-9f7c-8800b4550261\verixa_emblem_enhanced_1790962602045.jpg"
im = Image.open(gen_path)
print("Enhanced emblem size:", im.size)
print("Corners:", im.getpixel((0, 0)), im.getpixel((im.width - 1, 0)), im.getpixel((0, im.height - 1)))
