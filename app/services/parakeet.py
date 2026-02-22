"""
NVIDIA Parakeet CTC 0.6B ASR (NVCF gRPC) client.

Accepts base64 audio, converts to 16kHz mono PCM WAV via ffmpeg when needed,
then calls the Riva ASR gRPC endpoint.
"""
from __future__ import annotations

import base64
import os
import tempfile
import subprocess

import shutil


def _get_ffmpeg_path() -> str:
    env = os.getenv('FFMPEG_PATH', '').strip()
    if env:
        return env
    which = shutil.which('ffmpeg')
    if which:
        return which
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return 'ffmpeg'

from pathlib import Path
from typing import Optional

import grpc

import importlib
import sys

PROTO_DIR = Path(__file__).resolve().parent.parent / 'proto'


def _ensure_proto_generated() -> None:
    """Generate *_pb2.py files from proto if they don't exist."""
    target = PROTO_DIR / 'riva' / 'proto' / 'riva_asr_pb2.py'
    if target.exists():
        return
    try:
        from grpc_tools import protoc  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError('grpcio-tools not installed; cannot generate Riva protos') from exc

    args = [
        'grpc_tools.protoc',
        f'-I{PROTO_DIR}',
        f'--python_out={PROTO_DIR}',
        f'--grpc_python_out={PROTO_DIR}',
        str(PROTO_DIR / 'riva' / 'proto' / 'riva_asr.proto'),
        str(PROTO_DIR / 'riva' / 'proto' / 'riva_audio.proto'),
        str(PROTO_DIR / 'riva' / 'proto' / 'riva_common.proto'),
    ]
    rc = protoc.main(args)
    if rc != 0 or not target.exists():
        raise RuntimeError('Failed to generate Riva protobufs')


def _import_riva_modules():
    _ensure_proto_generated()
    proto_pkg = PROTO_DIR / 'riva' / 'proto'
    if str(proto_pkg) not in sys.path:
        sys.path.insert(0, str(proto_pkg))
    riva_asr_pb2 = importlib.import_module('riva_asr_pb2')
    riva_asr_pb2_grpc = importlib.import_module('riva_asr_pb2_grpc')
    return riva_asr_pb2, riva_asr_pb2_grpc

GRPC_SERVER = os.getenv('NVIDIA_PARAKEET_GRPC_SERVER', 'grpc.nvcf.nvidia.com:443')
FUNCTION_ID = os.getenv('NVIDIA_PARAKEET_FUNCTION_ID', 'd8dd4e9b-fbf5-4fb0-9dba-8cf436c8d965')
API_KEY = os.getenv('NVIDIA_PARAKEET_API_KEY') or os.getenv('NVIDIA_API_KEY') or ''
TIMEOUT_MS = int(os.getenv('NVIDIA_PARAKEET_TIMEOUT_MS', '60000'))

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client

    if not API_KEY:
        raise RuntimeError('Parakeet API key not configured. Set NVIDIA_PARAKEET_API_KEY or NVIDIA_API_KEY.')

    call_credentials = grpc.metadata_call_credentials(
        lambda context, callback: callback((
            ('function-id', FUNCTION_ID),
            ('authorization', f'Bearer {API_KEY}'),
        ), None)
    )
    channel_credentials = grpc.ssl_channel_credentials()
    composite = grpc.composite_channel_credentials(channel_credentials, call_credentials)
    channel = grpc.secure_channel(GRPC_SERVER, composite, options=[
        ('grpc.max_receive_message_length', 50 * 1024 * 1024),
        ('grpc.max_send_message_length', 50 * 1024 * 1024),
    ])
    riva_asr_pb2, riva_asr_pb2_grpc = _import_riva_modules()
    _client = riva_asr_pb2_grpc.RivaSpeechRecognitionStub(channel)
    return _client


def _convert_to_pcm_wav(input_bytes: bytes) -> bytes:
    with tempfile.TemporaryDirectory(prefix='parakeet_') as tmp:
        in_path = Path(tmp) / 'input.audio'
        out_path = Path(tmp) / 'output.wav'
        in_path.write_bytes(input_bytes)
        args = [
            _get_ffmpeg_path(), '-y',
            '-i', str(in_path),
            '-ar', '16000',
            '-ac', '1',
            '-sample_fmt', 's16',
            '-f', 'wav',
            str(out_path),
        ]
        try:
            subprocess.run(args, check=True, capture_output=True)
        except FileNotFoundError as exc:
            raise RuntimeError('ffmpeg not found. Install ffmpeg or set FFMPEG_PATH.') from exc
        return out_path.read_bytes()


def _parse_wav_header(buf: bytes):
    if len(buf) < 44:
        return None
    if buf[0:4] != b'RIFF' or buf[8:12] != b'WAVE':
        return None
    offset = 12
    num_channels = sample_rate = bits_per_sample = audio_format = 0
    found_fmt = False
    while offset + 8 < len(buf):
        chunk_id = buf[offset:offset+4]
        chunk_size = int.from_bytes(buf[offset+4:offset+8], 'little')
        if chunk_id == b'fmt ':
            if chunk_size < 16 or offset + 8 + 16 > len(buf):
                break
            audio_format = int.from_bytes(buf[offset+8:offset+10], 'little')
            num_channels = int.from_bytes(buf[offset+10:offset+12], 'little')
            sample_rate = int.from_bytes(buf[offset+12:offset+16], 'little')
            bits_per_sample = int.from_bytes(buf[offset+22:offset+24], 'little')
            found_fmt = True
        if chunk_id == b'data' and found_fmt:
            if audio_format != 1 or sample_rate == 0 or num_channels == 0 or bits_per_sample == 0:
                return None
            pcm_offset = offset + 8
            pcm_length = chunk_size
            return {
                'num_channels': num_channels,
                'sample_rate': sample_rate,
                'bits_per_sample': bits_per_sample,
                'pcm_offset': pcm_offset,
                'pcm_length': pcm_length,
            }
        offset += 8 + chunk_size
        if chunk_size % 2 != 0:
            offset += 1
    return None


def transcribe_audio_base64(audio_base64: str, lang: str = 'en-US') -> str:
    if not audio_base64:
        raise RuntimeError('audio_base64 required')

    raw = base64.b64decode(audio_base64)

    wav = _parse_wav_header(raw)
    if wav:
        sample_rate = wav['sample_rate']
        pcm_bytes = raw[wav['pcm_offset']:wav['pcm_offset'] + wav['pcm_length']]
    else:
        converted = _convert_to_pcm_wav(raw)
        conv = _parse_wav_header(converted)
        if conv:
            sample_rate = conv['sample_rate']
            pcm_bytes = converted[conv['pcm_offset']:conv['pcm_offset'] + conv['pcm_length']]
        else:
            sample_rate = 16000
            pcm_bytes = converted

    client = _get_client()
    riva_asr_pb2, _ = _import_riva_modules()
    riva_audio_pb2 = importlib.import_module('riva_audio_pb2')
    request = riva_asr_pb2.RecognizeRequest(
        config=riva_asr_pb2.RecognitionConfig(
            encoding=riva_audio_pb2.AudioEncoding.LINEAR_PCM,
            sample_rate_hertz=sample_rate,
            language_code=lang,
            max_alternatives=1,
            enable_automatic_punctuation=True,
            audio_channel_count=1,
        ),
        audio=pcm_bytes,
    )

    response = client.Recognize(request, timeout=TIMEOUT_MS / 1000)
    # Concatenate all result segments — longer audio returns multiple results
    parts = []
    for result in response.results:
        if result.alternatives:
            text = result.alternatives[0].transcript or ''
            if text:
                parts.append(text)
    return ' '.join(parts).strip()
