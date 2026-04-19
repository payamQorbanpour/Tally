#!/bin/bash

# Create Tally Icons with Logo, Typography, and Description

cd "$(dirname "$0")/assets"

# Colors from Tally logo
DARK_TEAL="#0A6B6B"
LIGHT_GREEN="#2DD4BF"
WHITE="#FFFFFF"
DARK_TEXT="#1F2937"

echo "Creating Tally icon files with logo and typography..."

# 1. Create icon.png (1024x1024) - Large, with logo, app name, and description
magick -size 1024x1024 xc:white \
  \( Tally-logos.png -resize 400x300 \) \
  -gravity North -annotate 0x0+0+80 \
  -font "Helvetica-Bold" -pointsize 120 -fill "$DARK_TEAL" \
  -gravity Center -annotate 0x0+0-150 "Tally" \
  -font "Helvetica" -pointsize 48 -fill "$DARK_TEXT" \
  -gravity Center -annotate 0x0+0+150 "Expense-splitting application" \
  -composite -gravity North -compose Over -offset +0+100 \
  icon.png

# 2. Create favicon.png (512x512) - Medium, with logo, app name, and description
magick -size 512x512 xc:white \
  \( Tally-logos.png -resize 200x150 \) \
  -font "Helvetica-Bold" -pointsize 60 -fill "$DARK_TEAL" \
  -gravity Center -annotate 0x0+0-80 "Tally" \
  -font "Helvetica" -pointsize 24 -fill "$DARK_TEXT" \
  -gravity Center -annotate 0x0+0+80 "Expense-splitting" \
  -composite -gravity North -compose Over -offset +0+50 \
  favicon.png

# 3. Create splash-icon.png (512x512) - Medium, with logo, app name, and description
magick -size 512x512 xc:white \
  \( Tally-logos.png -resize 200x150 \) \
  -font "Helvetica-Bold" -pointsize 60 -fill "$DARK_TEAL" \
  -gravity Center -annotate 0x0+0-80 "Tally" \
  -font "Helvetica" -pointsize 24 -fill "$DARK_TEXT" \
  -gravity Center -annotate 0x0+0+80 "Expense-splitting" \
  -composite -gravity North -compose Over -offset +0+50 \
  splash-icon.png

# 4. Create adaptive-icon.png (192x192) - Small, with logo and app name only
magick -size 192x192 xc:white \
  \( Tally-logos.png -resize 100x75 \) \
  -font "Helvetica-Bold" -pointsize 24 -fill "$DARK_TEAL" \
  -gravity Center -annotate 0x0+0-25 "Tally" \
  -composite -gravity North -compose Over -offset +0+20 \
  adaptive-icon.png

echo "✅ Icon files created successfully!"
echo ""
echo "Generated files:"
ls -lh adaptive-icon.png favicon.png icon.png splash-icon.png
echo ""
echo "File details:"
file adaptive-icon.png favicon.png icon.png splash-icon.png
