#!/usr/bin/env python3
"""
Gera os ícones do Quanto (marca de QR estilizada) sem depender de arquivo externo.

    python3 scripts/make_icons.py

Saída em apps/mobile/assets/: icon, adaptive foreground/background/monochrome,
splash e favicon.
"""
from PIL import Image, ImageDraw

TEAL = (15, 76, 76, 255)      # #0F4C4C
WHITE = (255, 255, 255, 255)
SIZE = 1024


def finder(draw, x, y, size, stroke, color):
    """Padrão de localização de QR: anel arredondado + miolo."""
    radius = int(size * 0.18)
    draw.rounded_rectangle(
        [x, y, x + size, y + size], radius=radius, outline=color, width=stroke
    )
    inner = int(size * 0.42)
    offset = (size - inner) // 2
    draw.rounded_rectangle(
        [x + offset, y + offset, x + offset + inner, y + offset + inner],
        radius=int(inner * 0.22),
        fill=color,
    )


def draw_mark(draw, canvas, scale=1.0, color=WHITE):
    """Marca centralizada, ocupando `scale` do canvas."""
    area = int(canvas * 0.66 * scale)
    origin = (canvas - area) // 2
    gap = int(area * 0.12)
    cell = (area - gap) // 2
    stroke = max(8, int(cell * 0.26))

    finder(draw, origin, origin, cell, stroke, color)
    finder(draw, origin + cell + gap, origin, cell, stroke, color)
    finder(draw, origin, origin + cell + gap, cell, stroke, color)

    # canto inferior direito: pontinhos (o "dado" do QR)
    dot_area = cell
    dot = int(dot_area * 0.2)
    step = int(dot_area * 0.33)
    left = origin + cell + gap
    top = origin + cell + gap
    for row in range(3):
        for col in range(3):
            if (row, col) in {(0, 0), (0, 2), (1, 1), (2, 0), (2, 2)}:
                cx = left + int(dot_area * 0.12) + col * step
                cy = top + int(dot_area * 0.12) + row * step
                draw.rounded_rectangle(
                    [cx, cy, cx + dot, cy + dot], radius=int(dot * 0.3), fill=color
                )


def flat(color):
    return Image.new("RGBA", (SIZE, SIZE), color)


def mark_only(scale=1.0, color=WHITE):
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(image), SIZE, scale=scale, color=color)
    return image


out = "apps/mobile/assets"

# ícone do app: fundo teal + marca
icon = flat(TEAL)
draw_mark(ImageDraw.Draw(icon), SIZE, scale=0.86)
icon.convert("RGB").save(f"{out}/icon.png")

# adaptive icon (Android): fundo chapado + marca na área segura (66%)
flat(TEAL).convert("RGB").save(f"{out}/android-icon-background.png")
mark_only(scale=0.72).save(f"{out}/android-icon-foreground.png")
mark_only(scale=0.72).save(f"{out}/android-icon-monochrome.png")

# splash: marca sobre o backgroundColor do app.json
mark_only(scale=0.62).resize((512, 512), Image.LANCZOS).save(f"{out}/splash-icon.png")

# favicon (web de debug)
icon.convert("RGB").resize((48, 48), Image.LANCZOS).save(f"{out}/favicon.png")

print("ícones gerados em", out)
