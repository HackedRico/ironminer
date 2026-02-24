import os
from dotenv import load_dotenv

load_dotenv()

# Core API keys
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# LiveKit configuration
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "devsecret")
LIVEKIT_HOST = os.getenv("LIVEKIT_HOST", "http://localhost:7880")
LIVEKIT_PUBLIC_WS_URL = os.getenv("LIVEKIT_PUBLIC_WS_URL", "").strip()

# LLM configuration
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# NVIDIA keys
NVIDIA_API_KEY  = os.getenv("NVIDIA_API_KEY", os.getenv("NVIDIA_PARAKEET_API_KEY", ""))  # Grounding DINO + Parakeet fallback
NVIDIA_DINO_KEY = NVIDIA_API_KEY
NVIDIA_CLIP_KEY = os.getenv("NVIDIA_EMBED_API_KEY", NVIDIA_API_KEY)  # NV-CLIP; falls back to NVIDIA_API_KEY

# Vast.ai GPU instance
VASTAI_API_KEY = os.getenv("VASTAI_API_KEY", "")
VASTAI_BASE_URL = os.getenv("VASTAI_BASE_URL", "")
VASTAI_INSTANCE_ID = os.getenv("VASTAI_INSTANCE_ID", "")
VASTAI_MODEL_ID = os.getenv("VASTAI_MODEL_ID", "llava-hf/LLaVA-NeXT-Video-34B-hf")
