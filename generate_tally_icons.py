#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont

# Define icon configurations for Tally.jpg
ICONS = {
    'tally-adaptive-icon.png': {
        'size': (192, 192),
        'logo_size': (120, 120),
        'show_text': True,
        'app_name_size': 18,
        'description_size': 8,
    },
    'tally-favicon.png': {
        'size': (512, 512),
        'logo_size': (300, 300),
        'show_text': True,
        'app_name_size': 48,
        'description_size': 20,
    },
    'tally-icon.png': {
        'size': (1024, 1024),
        'logo_size': (600, 600),
        'show_text': True,
        'app_name_size': 96,
        'description_size': 40,
    },
}

def create_icon(filename, config):
    """Create an icon with logo, app name, and description"""
    # Create background
    size = config['size']
    img = Image.new('RGB', size, color='white')
    draw = ImageDraw.Draw(img)
    
    # Load and resize logo
    logo = Image.open('/Users/payam/projects/github.com/payamqorbanpour/Tally/assets/Tally.jpg')
    # Convert to RGBA if needed for transparency
    if logo.mode != 'RGBA':
        logo = logo.convert('RGBA')
    
    logo_w, logo_h = config['logo_size']
    # For logos with aspect ratio, use thumbnail to maintain proportions
    logo.thumbnail((logo_w, logo_h), Image.Resampling.LANCZOS)
    
    # Create a transparent background for the logo
    logo_bg = Image.new('RGBA', (logo_w, logo_h), (255, 255, 255, 0))
    logo_x_offset = (logo_w - logo.width) // 2
    logo_y_offset = (logo_h - logo.height) // 2
    logo_bg.paste(logo, (logo_x_offset, logo_y_offset), logo)
    
    # Calculate positions for centered layout
    total_height = logo_h + (config['app_name_size'] + config['description_size'] + 40)
    start_y = (size[1] - total_height) // 2
    
    # Paste logo centered
    logo_img_x = (size[0] - logo_w) // 2
    logo_img_y = start_y
    img.paste(logo_bg, (logo_img_x, logo_img_y), logo_bg)
    
    if config['show_text']:
        try:
            # Try to use a system font, fall back if not available
            try:
                app_name_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", config['app_name_size'])
                description_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", config['description_size'])
            except:
                app_name_font = ImageFont.load_default()
                description_font = ImageFont.load_default()
            
            # Draw app name "Tally"
            app_name = "Tally"
            bbox = draw.textbbox((0, 0), app_name, font=app_name_font)
            text_width = bbox[2] - bbox[0]
            app_name_x = (size[0] - text_width) // 2
            app_name_y = logo_img_y + logo_h + 20
            draw.text((app_name_x, app_name_y), app_name, fill='#1a8b74', font=app_name_font)
            
            # Draw description
            description = "expense-splitting application"
            bbox = draw.textbbox((0, 0), description, font=description_font)
            text_width = bbox[2] - bbox[0]
            description_x = (size[0] - text_width) // 2
            description_y = app_name_y + config['app_name_size'] + 10
            draw.text((description_x, description_y), description, fill='#666666', font=description_font)
        except Exception as e:
            print(f"Warning: Could not add text to {filename}: {e}")
    
    # Save icon
    img.save(f'/Users/payam/projects/github.com/payamqorbanpour/Tally/assets/{filename}', 'PNG')
    print(f"✓ Created {filename} ({size[0]}x{size[1]})")

def main():
    print("Generating Tally icons from Tally.jpg with typography...")
    for filename, config in ICONS.items():
        create_icon(filename, config)
    
    print("\nAll icons created successfully!")

if __name__ == '__main__':
    main()
