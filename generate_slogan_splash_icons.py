#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont

# Define splash screen icon configurations
ICONS = {
    'splash-icon.png': {
        'size': (512, 512),
        'show_text': False,  # Splash screens usually don't need additional text
    },
}

def create_icon(filename, config):
    """Create a splash screen icon with full logo image"""
    # Create background
    size = config['size']
    img = Image.new('RGB', size, color='white')
    
    # Load logo
    logo = Image.open('/Users/payam/projects/github.com/payamqorbanpour/Tally/assets/Tally-Slogan.jpg')
    # Convert to RGBA if needed for transparency
    if logo.mode != 'RGBA':
        logo = logo.convert('RGBA')
    
    # Scale logo to fit in the canvas while maintaining aspect ratio
    logo.thumbnail(size, Image.Resampling.LANCZOS)
    
    # Paste logo centered
    logo_img_x = (size[0] - logo.width) // 2
    logo_img_y = (size[1] - logo.height) // 2
    img.paste(logo, (logo_img_x, logo_img_y), logo)
    
    # Save icon
    img.save(f'/Users/payam/projects/github.com/payamqorbanpour/Tally/assets/{filename}', 'PNG')
    print(f"✓ Created {filename} ({size[0]}x{size[1]})")

def main():
    print("Generating splash screen icons from Tally-Slogan.jpg...")
    for filename, config in ICONS.items():
        create_icon(filename, config)
    
    print("\nSplash screen icons created successfully!")

if __name__ == '__main__':
    main()
