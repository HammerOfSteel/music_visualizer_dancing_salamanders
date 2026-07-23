#!/usr/bin/env python3
"""
Converts a .srt subtitle file (as exported by the Suno lyric downloader)
into this project's lyrics.json schema: a JSON array of
`{ "start": <seconds:float>, "end": <seconds:float>, "text": "<line>" }`
objects, matching `src/engine/lyrics.ts`'s `LyricLine` shape.

Usage:
    python3 scripts/srt_to_lyrics_json.py input.srt output.json
    python3 scripts/srt_to_lyrics_json.py input.srt          # prints to stdout

Handles multi-line cues (joins with a space) and strips basic HTML-ish tags
(e.g. <i>, </i>) that some SRT exporters include.
"""
import json
import re
import sys

TIMECODE_RE = re.compile(
    r'(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})'
)
TAG_RE = re.compile(r'</?[a-zA-Z][^>]*>')


def timecode_to_seconds(h: str, m: str, s: str, ms: str) -> float:
    total = int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000
    return round(total, 3)


def parse_srt(srt_text: str) -> list[dict]:
    # Normalize line endings and split into blank-line-separated blocks.
    srt_text = srt_text.replace('\r\n', '\n').replace('\r', '\n')
    blocks = re.split(r'\n\s*\n', srt_text.strip())
    lines_out: list[dict] = []
    for block in blocks:
        lines = [ln for ln in block.split('\n') if ln.strip() != '']
        if not lines:
            continue
        # First line is a numeric index (optional/ignored); find the
        # timecode line wherever it is (usually line 0 or 1).
        timecode_line_idx = None
        for i, ln in enumerate(lines):
            if TIMECODE_RE.search(ln):
                timecode_line_idx = i
                break
        if timecode_line_idx is None:
            continue
        match = TIMECODE_RE.search(lines[timecode_line_idx])
        start = timecode_to_seconds(*match.group(1, 2, 3, 4))
        end = timecode_to_seconds(*match.group(5, 6, 7, 8))
        text_lines = lines[timecode_line_idx + 1:]
        text = ' '.join(text_lines).strip()
        text = TAG_RE.sub('', text)
        text = re.sub(r'\s+', ' ', text).strip()
        if not text:
            continue
        lines_out.append({'start': start, 'end': end, 'text': text})
    return lines_out


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    input_path = sys.argv[1]
    with open(input_path, 'r', encoding='utf-8-sig') as f:
        srt_text = f.read()
    lyrics = parse_srt(srt_text)
    output_json = json.dumps(lyrics, indent=2, ensure_ascii=False) + '\n'
    if len(sys.argv) >= 3:
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            f.write(output_json)
        print(f'Wrote {len(lyrics)} lines to {sys.argv[2]}')
    else:
        print(output_json)


if __name__ == '__main__':
    main()
