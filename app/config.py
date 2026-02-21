import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
VESTAI_API_KEY = os.getenv("VESTAI_API_KEY", "")
VESTAI_BASE_URL = os.getenv("VESTAI_BASE_URL", "")
