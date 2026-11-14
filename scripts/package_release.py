#!/usr/bin/env python3
"""Create and verify immutable static-site archives. Does not edit dist or deploy.

Examples:
  python3 scripts/package_release.py pack --build 20261113-r26
  python3 scripts/package_release.py verify artifacts/releases/20261113-r26.tgz
  python3 scripts/package_release.py verify-public artifacts/releases/20261113-r26.tgz \
      --url https://lyn.lipopo.org/
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile
from urllib.parse import quote, urlsplit
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_name(name: str) -> bool:
    path = PurePosixPath(name)
    return bool(name) and not path.is_absolute() and '..' not in path.parts


def source_files(source: Path, build: str) -> dict[str, bytes]:
    assert source.is_dir(), f'Missing source directory: {source}'
    photo_release = 'performer-photo.js' in (source / 'main.js').read_text()
    retired = {'performer-gltf.js', 'lighting.js', 'vendor/GLTFLoader.js',
               'vendor/BufferGeometryUtils.js', 'vendor/RoomEnvironment.js',
               'vendor/meshopt_decoder.module.js', 'vendor/LICENSE-meshoptimizer.txt'}
    files = {}
    for file in sorted(source.rglob('*')):
        assert not file.is_symlink(), f'Symlink is not allowed in a release: {file}'
        if not file.is_file() or file.name in {'.DS_Store', 'release.json'}:
            continue
        name = file.relative_to(source).as_posix()
        if photo_release and name in retired:
            continue
        assert safe_name(name)
        files[name] = file.read_bytes()
    assert 'index.html' in files and 'main.js' in files, 'Missing site entry points'
    if photo_release:
        assert 'performer-photo.js' in files and 'performer-views.js' in files
        for view in ['front', 'right', 'back', 'left']:
            data = files.get(f'assets/performer/photo-{view}.webp', b'')
            assert data[:4] == b'RIFF' and data[8:12] == b'WEBP', f'Missing or invalid photo view: {view}'
    elif 'performer-gltf.js' in files:
        model = files.get('assets/performer/standing.glb', b'')
        assert len(model) > 20 and model[:4] == b'glTF', 'The final standing GLB is missing; do not package a loader-only release'
        assert int.from_bytes(model[8:12], 'little') == len(model), 'The standing GLB is truncated'
    for name, data in files.items():
        if '/' not in name and name.endswith(('.js', '.html')):
            text = data.decode('utf-8')
            assert 'LOCAL_QA_BEGIN' not in text and 'window.bloomQA' not in text, f'QA hook remains in {name}'
            for version in re.findall(r'[?&]v=([A-Za-z0-9._-]+)', text):
                assert version == build, f'Stale cache version {version} in {name}; expected {build}'
    html = files['index.html'].decode('utf-8')
    marker = re.search(r'<meta name="demo-build" content="([^"]+)"', html)
    assert marker and marker.group(1) == build, 'HTML demo-build must match the release build'
    return files


def pack(args) -> dict:
    assert re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', args.build), 'Invalid build name'
    source = args.source.resolve()
    output = args.output.resolve()
    assert not output.is_relative_to(source), 'Output must not be inside the source tree'
    files = source_files(source, args.build)
    manifest = {'build': args.build, 'files': {name: sha(data) for name, data in files.items()}}
    files['release.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    output.mkdir(parents=True, exist_ok=True)
    tgz = output / f'{args.build}.tgz'
    zipped = output / f'{args.build}.zip'
    info = output / f'{args.build}.manifest.json'
    assert not any(p.exists() for p in (tgz, zipped, info)), 'Refusing to overwrite an existing release archive'
    with tarfile.open(tgz, 'w:gz', compresslevel=9) as archive:
        for name, data in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(data)
            member.mode = 0o644
            member.mtime = 0
            archive.addfile(member, io.BytesIO(data))
    with zipfile.ZipFile(zipped, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in files.items():
            member = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            member.compress_type = zipfile.ZIP_DEFLATED
            member.external_attr = 0o100644 << 16
            archive.writestr(member, data)
    result = {'build': args.build, 'source': str(source), 'payload_files': len(files),
              'raw_bytes': sum(map(len, files.values())),
              'tgz': {'path': str(tgz), 'bytes': tgz.stat().st_size, 'sha256': sha(tgz.read_bytes())},
              'zip': {'path': str(zipped), 'bytes': zipped.stat().st_size, 'sha256': sha(zipped.read_bytes())},
              'files': manifest['files']}
    info.write_text(json.dumps(result, indent=2) + '\n')
    read_verified(tgz)
    read_verified(zipped)
    return result


def read_verified(path: Path) -> tuple[dict, dict[str, bytes]]:
    files = {}
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            for item in archive.infolist():
                assert safe_name(item.filename) and not item.is_dir(), f'Unsafe archive member: {item.filename}'
                assert item.filename not in files, f'Duplicate member: {item.filename}'
                files[item.filename] = archive.read(item)
    else:
        with tarfile.open(path, 'r:*') as archive:
            for item in archive.getmembers():
                assert safe_name(item.name) and item.isfile(), f'Unsafe archive member: {item.name}'
                assert item.name not in files, f'Duplicate member: {item.name}'
                files[item.name] = archive.extractfile(item).read()
    manifest = json.loads(files['release.json'])
    assert set(files) == set(manifest['files']) | {'release.json'}, 'Archive members differ from the manifest'
    for name, checksum in manifest['files'].items():
        assert sha(files[name]) == checksum, f'Checksum mismatch: {name}'
    return manifest, files


def public_verify(args) -> dict:
    manifest, files = read_verified(args.archive)
    parts = urlsplit(args.url)
    assert parts.scheme == 'https' and parts.netloc and not parts.query and not parts.fragment, 'Use an HTTPS site base URL without query or fragment'
    assert not parts.username and not parts.password, 'Do not put credentials in the URL'
    base = args.url.rstrip('/') + '/'
    selected = [name for name in files if name.endswith(('.js', '.css', '.webmanifest')) or name in {'index.html', 'release.json'} or name.startswith('assets/')]
    def fetch(name):
        url = base + quote(name, safe='/') + '?v=' + quote(manifest['build'])
        # macOS curl uses the system trust store. Never disable certificate checks.
        with tempfile.TemporaryDirectory(prefix='flower-public-') as temp:
            target = Path(temp) / 'body'
            run = subprocess.run(['curl', '--compressed', '--connect-timeout', '10', '--max-time', '180' if name.endswith('.glb') else '30', '-fsS', '-w', '%{http_code}', url, '-o', str(target)], capture_output=True, text=True)
            matches = run.returncode == 0 and target.read_bytes() == files[name]
            return {'file': name, 'http': run.stdout, 'matches': matches, 'error': run.stderr or None}
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(fetch, selected))
    result = {'build': manifest['build'], 'base_url': base, 'results': results, 'passed': all(item['matches'] for item in results)}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
    assert result['passed'], 'At least one public resource differs from the immutable archive'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)
    package = commands.add_parser('pack')
    package.add_argument('--build', required=True)
    package.add_argument('--source', type=Path, default=ROOT / 'dist')
    package.add_argument('--output', type=Path, default=ROOT / 'artifacts/releases')
    verify = commands.add_parser('verify')
    verify.add_argument('archive', type=Path)
    public = commands.add_parser('verify-public')
    public.add_argument('archive', type=Path)
    public.add_argument('--url', required=True)
    public.add_argument('--report', type=Path)
    args = parser.parse_args()
    if args.command == 'pack':
        result = pack(args)
        print(json.dumps({key: value for key, value in result.items() if key != 'files'}, indent=2))
    elif args.command == 'verify':
        manifest, files = read_verified(args.archive)
        print(json.dumps({'build': manifest['build'], 'verified_files': len(files), 'archive_sha256': sha(args.archive.read_bytes())}, indent=2))
    else:
        public_verify(args)


if __name__ == '__main__':
    main()
