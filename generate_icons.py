#!/usr/bin/env python3
from PIL import Image
import os

# Define icon configurations
ICONS = {
    # App icon (iOS, main app icon)
    'icon.png': {
        'size': (1024, 1024),
        'bg_color': '#ffffff',
        'scale_ratio': 0.9,
    },
    # Favicon (web)
    'favicon.png': {
        'size': (512, 512),
        'bg_color': '#ffffff',
        'scale_ratio': 0.9,
    },
    # Splash icon (shown during app startup)
    'splash-icon.png': {
        'size': (1024, 1024),
        'bg_color': '#ecfdf5',  # Light emerald background
        'scale_ratio': 0.6,
    },
    # Adaptive icon (Android, foreground layer)
    'adaptive-icon.png': {
        'size': (192, 192),
        'bg_color': '#ffffff',
        'scale_ratio': 0.8,
    },
}

def create_icon(filename, config):
    """Create an icon with logo image centered on background"""
    size = config['size']
    bg_color = config['bg_color']
    scale_ratio = config['scale_ratio']
    
    # Create background
    img = Image.new('RGB', size, color=bg_color)
    
    # Load logo
    assets_path = os.path.dirname(os.path.abspath(__file__))
    logo_path = os.path.join(assets_path, 'assets', 'Tally.jpg')
    
    logo = Image.open(logo_path)
    
    # Convert to RGBA for better transparency handling
    if logo.mode != 'RGBA':
        logo = logo.convert('RGBA')
    
    # Calculate scaled size based on scale_ratio
    scaled_size = int(size[0] * scale_ratio)
    logo.thumbnail((scaled_size, scaled_size), Image.Resampling.LANCZOS)
    
    # Paste logo centered
    logo_x = (size[0] - logo.width) // 2
    logo_y = (size[1] - logo.height) // 2
    img.paste(logo, (logo_x, logo_y), logo)
    
    # Save icon
    output_path = os.path.join(assets_path, 'assets', filename)
    img.save(output_path, 'PNG')
    print(f"✓ Created {filename} ({size[0]}x{size[1]})")

def main():
    print("Generating Tally icons from logo...")
    for filename, config in ICONS.items():
        create_icon(filename, config)
    
    print("\n✅ All icons created successfully!")

if __name__ == '__main__':
    main()
