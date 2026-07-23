#!/usr/bin/env python3
"""
One-off generator that scans `public/music/` album folders and rebuilds
`tracks.json`, keeping any existing entry that already has its own
`meta.json` (looked up by folder name) untouched, and appending new
entries for every other album folder's mp3s — using the sibling
`<name>.json` as `lyricsFile` when present (omitted for instrumental
tracks with no lyrics file).

Run from the repo root: python3 scripts/build_tracks_json.py
"""
import json
import os
import re

MUSIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'music')
TRACKS_JSON = os.path.join(MUSIC_DIR, 'tracks.json')
SCENE = 'bellsOfLyonesse'
ARTIST = 'Dancing Salamanders'

# folder-name (on disk) -> (display album name, id prefix)
ALBUMS = {
    'glitch witch': 'Glitch Witch',
    'threads between the stars': 'Threads Between the Stars',
    'the butterfly arcchives': 'The Butterfly Archives',
}


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", '-', text)
    return text.strip('-')


def main() -> None:
    with open(TRACKS_JSON, 'r', encoding='utf-8') as f:
        existing = json.load(f)
    existing_folders = {e['folder'] for e in existing}
    entries = list(existing)
    seen_ids = {e['id'] for e in entries}

    def add_entry(entry):
        base_id = entry['id']
        i = 2
        while entry['id'] in seen_ids:
            entry['id'] = f'{base_id}-{i}'
            i += 1
        seen_ids.add(entry['id'])
        entries.append(entry)

    # Flat album folders: one mp3 per song, loose in the album folder.
    for folder, album in ALBUMS.items():
        folder_path = os.path.join(MUSIC_DIR, folder)
        if folder in existing_folders or not os.path.isdir(folder_path):
            continue
        for fname in sorted(os.listdir(folder_path)):
            if not fname.lower().endswith('.mp3'):
                continue
            title = fname[:-4]
            lyrics_file = title + '.json'
            has_lyrics = os.path.isfile(os.path.join(folder_path, lyrics_file))
            entry = {
                'id': slugify(f'{album}-{title}'),
                'folder': folder,
                'audioFile': fname,
                'scene': SCENE,
                'title': title,
                'artist': ARTIST,
                'album': album,
            }
            if has_lyrics:
                entry['lyricsFile'] = lyrics_file
            add_entry(entry)

    # Ordain: per-song subfolders, each holding "<song>.mp3" + "<song>.json".
    ordain_dir = os.path.join(MUSIC_DIR, 'Ordain')
    if os.path.isdir(ordain_dir):
        for song in sorted(os.listdir(ordain_dir)):
            song_dir = os.path.join(ordain_dir, song)
            if not os.path.isdir(song_dir):
                continue
            folder = f'Ordain/{song}'
            if folder in existing_folders:
                continue
            mp3_name = f'{song}.mp3'
            if not os.path.isfile(os.path.join(song_dir, mp3_name)):
                continue
            lyrics_file = f'{song}.json'
            has_lyrics = os.path.isfile(os.path.join(song_dir, lyrics_file))
            entry = {
                'id': slugify(f'ordain-{song}'),
                'folder': folder,
                'audioFile': mp3_name,
                'scene': SCENE,
                'title': song,
                'artist': ARTIST,
                'album': 'Ordain',
            }
            if has_lyrics:
                entry['lyricsFile'] = lyrics_file
            add_entry(entry)

    with open(TRACKS_JSON, 'w', encoding='utf-8') as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'tracks.json now has {len(entries)} entries (was {len(existing)}).')


if __name__ == '__main__':
    main()
