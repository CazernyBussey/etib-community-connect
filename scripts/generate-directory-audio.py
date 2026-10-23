"""Generate only missing or changed directory narrations with the fixed free voice."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import tempfile
import urllib.request
import wave

VOICE = 'en_US-ljspeech-high'
BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/high/'
MODEL_HASHES = {
    '.onnx': '5d4f08ba6a2a48c44592eed3ce56bf85e9de3dd4e20df90541ae68a8310c029a',
    '.onnx.json': '7e1f4634af596d83cca997fb7a931ba80b70f8a316a2655ee69c55365e0ace14',
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def generate(root, cache):
    catalog_path = root / 'server/data/businesses.json'
    manifest_path = root / 'server/data/narration-manifest.json'
    catalog = json.loads(catalog_path.read_text())
    manifest = json.loads(manifest_path.read_text())
    if manifest['voice'] != VOICE:
        raise ValueError('Narration voice must remain ' + VOICE)
    previous = {entry['id']: entry for entry in manifest['listings']}
    entries = []
    voice = None
    generated = 0
    for business in catalog['businesses']:
        if business['status'] != 'active':
            continue
        ident = business['id']
        if not ident or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in ident):
            raise ValueError('Unsafe listing id')
        text = business['description']
        audio = business.get('descriptionAudio', {})
        entry = previous.get(ident, {})
        url = audio.get('url', '')
        audio_path = root / 'public' / url.lstrip('/')
        valid = (url.startswith('/audio/' + ident + '-piper-lj-')
                 and '..' not in url and entry.get('url') == url
                 and audio.get('text') == text and audio_path.is_file()
                 and entry.get('sha256') == digest(audio_path.read_bytes()))
        if valid:
            entries.append(entry)
            continue
        if voice is None:
            from piper import PiperVoice
            cache.mkdir(parents=True, exist_ok=True)
            for suffix, expected in MODEL_HASHES.items():
                model = cache / (VOICE + suffix)
                if not model.is_file() or digest(model.read_bytes()) != expected:
                    data = urllib.request.urlopen(BASE + VOICE + suffix, timeout=120).read()
                    if digest(data) != expected:
                        raise ValueError('Voice model checksum changed; review before changing the voice')
                    model.write_bytes(data)
            voice = PiperVoice.load(str(cache / (VOICE + '.onnx')))
        text_hash = digest(text.encode())[:16]
        url = f'/audio/{ident}-piper-lj-{text_hash}.mp3'
        audio_path = root / 'public' / url.lstrip('/')
        audio_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as temp:
            wav_path = pathlib.Path(temp) / 'narration.wav'
            with wave.open(str(wav_path), 'wb') as out:
                voice.synthesize_wav(text, out)
            with wave.open(str(wav_path)) as recording:
                duration = recording.getnframes() / recording.getframerate()
            if duration <= 0:
                raise ValueError('Generated empty narration')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav_path),
                            '-af', 'loudnorm=I=-18:TP=-2:LRA=7', '-ar', '22050',
                            '-ac', '1', '-b:a', '48k', '-metadata',
                            'comment=Piper en_US-ljspeech-high; public-domain LJ Speech dataset',
                            str(audio_path)], check=True)
        business['descriptionAudio'] = {'url': url, 'text': text}
        entries.append({'id': ident, 'url': url, 'sha256': digest(audio_path.read_bytes()), 'duration': duration})
        generated += 1
        print('Generated: ' + ident, flush=True)
    manifest['listings'] = entries
    catalog_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n')
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Generated {generated}; verified {len(entries)} active narrations.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1])
    parser.add_argument('--voice-cache', type=pathlib.Path, default=pathlib.Path(tempfile.gettempdir()) / 'etib-piper-voices')
    args = parser.parse_args()
    generate(args.root.resolve(), args.voice_cache.resolve())
