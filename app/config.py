import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
VESTAI_API_KEY = os.getenv("VESTAI_API_KEY", "")
VESTAI_BASE_URL = os.getenv("VESTAI_BASE_URL", "")

# LiveKit — defaults match livekit.yaml dev config so no .env needed locally
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "devsecret")
LIVEKIT_HOST = os.getenv("LIVEKIT_HOST", "http://localhost:7880")
# Optional: URL returned to clients (e.g. phone) for connecting to LiveKit.
# Set to your machine's LAN IP for demo, e.g. ws://192.168.1.100:7880
LIVEKIT_PUBLIC_WS_URL = os.getenv("LIVEKIT_PUBLIC_WS_URL", "").strip()
