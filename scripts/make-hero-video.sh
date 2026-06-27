#!/usr/bin/env bash
# 生成首页 Hero 水墨空镜视频：以「林黛玉·潇湘馆」大图为底，
# 缓推镜（Ken Burns）+ 水墨调色 + 漂移雾气 + 细颗粒，前后回放拼接成无缝循环。
# 依赖：ffmpeg。产物：public/videos/hero-scrub.mp4（首页 hero 视频逐帧擦洗源）。
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="public/images/人物/assets/人物 - 林黛玉/10-vol2-p6-xiaoxiang.webp"
OUT_DIR="public/videos"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

W=720; H=1056; FPS=30; SEG=6          # 单段 6s，前后回放 → 12s 无缝循环
FRAMES=$(( FPS * SEG ))

[ -f "$SRC" ] || { echo "找不到底图：$SRC" >&2; exit 1; }

echo "▶ 1/2 渲染缓推空镜段（${SEG}s, ${W}x${H}@${FPS}）…"
# 注意：不加逐帧随机颗粒(noise)，否则画面几乎不可压缩、体积会暴涨到上百 MB。
ffmpeg -hide_banner -loglevel error -y -loop 1 -i "$SRC" -filter_complex "
  [0:v]scale=1440:-1:flags=lanczos,setsar=1[base];
  [base]zoompan=z='min(zoom+0.00052,1.10)':\
x='iw/2-(iw/zoom/2)':\
y='ih/2-(ih/zoom/2)-on*0.35':\
d=${FRAMES}:s=${W}x${H}:fps=${FPS}[zp];
  [zp]eq=contrast=1.05:brightness=-0.015:saturation=0.80:gamma=1.03,
      colorbalance=rs=0.05:gs=0.00:bs=-0.06:rm=0.03:gm=0.00:bm=-0.05,
      vignette=angle=PI/5[graded];
  gradients=s=${W}x${H}:d=${SEG}:r=${FPS}:speed=0.006:\
c0=0x0d0a08:c1=0x000000:x0=140:y0=120:x1=600:y1=980[mist];
  [graded][mist]blend=all_mode=screen:all_opacity=0.16,
      format=yuv420p[v]
" -map "[v]" -frames:v "${FRAMES}" -an "$TMP/fwd.mp4"

echo "▶ 2/2 生成回放段、拼接为无缝循环并编码 mp4…"
ffmpeg -hide_banner -loglevel error -y -i "$TMP/fwd.mp4" -vf reverse -an "$TMP/rev.mp4"
printf "file '%s/fwd.mp4'\nfile '%s/rev.mp4'\n" "$TMP" "$TMP" > "$TMP/list.txt"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/hero-scrub.mp4" "$OUT_DIR/hero.webm"   # 清理旧命名残留，避免歧义
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$TMP/list.txt" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 27 -preset slow \
  -movflags +faststart -an "$OUT_DIR/hero-scrub.mp4"

echo "✓ 完成："
ls -lh "$OUT_DIR"/hero-scrub.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_DIR/hero-scrub.mp4" | awk '{printf "  时长 %.1fs\n",$1}'
