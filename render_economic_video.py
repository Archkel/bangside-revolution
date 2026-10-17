from pathlib import Path
import subprocess
import sys

ROOT = Path.home() / "bangside-revolution"
MEDIA = ROOT / "media" / "courses"
OUTDIR = MEDIA / "video"
OUTDIR.mkdir(parents=True, exist_ok=True)

audio = MEDIA / "economic-liberation-01.mp3"
subs = MEDIA / "economic-liberation-01.srt"
font = Path.home() / "placeholder"
import os
font = Path(os.environ["PREFIX"]) / "share/fonts/TTF/DejaVuSans-Bold.ttf"
regular = Path(os.environ["PREFIX"]) / "share/fonts/TTF/DejaVuSans.ttf"
out = OUTDIR / "economic-liberation-01-full.mp4"
work = OUTDIR / "scene-text"
work.mkdir(exist_ok=True)

if not audio.is_file() or not subs.is_file() or not font.is_file():
    sys.exit("STOP: narration, subtitles, or font missing.")

# Times are approximate lesson sections; the original narration remains continuous.
scenes = [
    (0, 22, "ECONOMIC LIBERATION", "TURN A SKILL INTO A REAL OFFER", "START SMALL. TEST REAL DEMAND."),
    (22, 55, "01  |  USEFUL SKILL", "WHAT CAN YOU DELIVER?", "RÉSUMÉS  •  VIDEO  •  WEBSITES  •  SPREADSHEETS"),
    (55, 95, "02  |  CUSTOMER + PROBLEM", "CHOOSE A SPECIFIC CUSTOMER", "EXAMPLE: A SERVICE PAGE FOR AN INDEPENDENT BARBER"),
    (95, 130, "03  |  TEST THE NEED", "ASK BEFORE YOU SPEND", "LISTEN TO POTENTIAL CUSTOMERS. DON'T ASSUME."),
    (130, 200, "04  |  BUILD THE OFFER", "ANSWER SEVEN QUESTIONS", "SKILL  •  CUSTOMER  •  PROBLEM  •  DELIVERABLES\nPRICE  •  COSTS  •  DEMAND TEST"),
    (200, 250, "05  |  KNOW THE NUMBERS", "$40  −  $5  −  $2  =  $33", "PRICE  −  DIRECT COSTS  −  FEES\nESTIMATED AMOUNT BEFORE TAX"),
    (250, 290, "06  |  TAKE ACTION", "GET HONEST FEEDBACK", "ASK AT LEAST THREE POTENTIAL CUSTOMERS"),
    (290, 324.144, "BANGSIDE REVOLUTION", "KNOWLEDGE. OWNERSHIP. LIBERATION.", "START SMALL  •  MEASURE  •  IMPROVE"),
]

# Text files avoid filter-escaping problems with punctuation and spaces.
for i, (_, _, eyebrow, headline, detail) in enumerate(scenes):
    (work / f"{i}_eyebrow.txt").write_text(eyebrow, encoding="utf-8")
    (work / f"{i}_headline.txt").write_text(headline, encoding="utf-8")
    (work / f"{i}_detail.txt").write_text(detail, encoding="utf-8")

def ffpath(p):
    return str(p).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")

filters = [
    "drawbox=x=0:y=0:w=iw:h=14:color=0xD4AF37:t=fill",
    "drawbox=x=70:y=85:w=1140:h=490:color=0x17232D@0.96:t=fill",
    "drawbox=x=70:y=85:w=9:h=490:color=0xD4AF37:t=fill",
]
for i, (start, end, *_rest) in enumerate(scenes):
    enable = f"between(t,{start},{end})"
    for kind, y, size, color in [
        ("eyebrow", 145, 30, "0xD4AF37"),
        ("headline", 245, 46, "white"),
        ("detail", 370, 27, "white"),
    ]:
        filters.append(
            f"drawtext=fontfile='{ffpath(font if kind != 'detail' else regular)}'"
            f":textfile='{ffpath(work / f'{i}_{kind}.txt')}'"
            f":fontcolor={color}:fontsize={size}:x=(w-text_w)/2:y={y}"
            f":line_spacing=18:shadowcolor=black:shadowx=2:shadowy=2"
            f":enable='{enable}'"
        )

filters.append(
    f"subtitles='{ffpath(subs)}':force_style="
    "'FontName=DejaVu Sans,FontSize=20,PrimaryColour=&H00FFFFFF,"
    "OutlineColour=&H00101820,BorderStyle=1,Outline=2,Shadow=1,"
    "Alignment=2,MarginV=35'"
)
vf = ",".join(filters)

cmd = [
    "ffmpeg", "-y", "-f", "lavfi", "-i",
    "color=c=0x101820:s=1280x720:r=24:d=324.144",
    "-i", str(audio), "-vf", vf, "-t", "324.144",
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "27",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart", str(out)
]
print("Rendering full lesson video. This may take several minutes.")
print("Output:", out)
result = subprocess.run(cmd)
if result.returncode:
    sys.exit(f"FFmpeg failed with exit code {result.returncode}")
print("RENDER COMPLETE:", out)
