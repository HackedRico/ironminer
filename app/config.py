import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
VASTAI_API_KEY = os.getenv("VASTAI_API_KEY", "")
VASTAI_BASE_URL = os.getenv("VASTAI_BASE_URL", "")
VASTAI_MODEL_ID = os.getenv("VASTAI_MODEL_ID", "llava-hf/LLaVA-NeXT-Video-34B-hf")
