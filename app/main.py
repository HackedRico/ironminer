import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import sites, video, safety, productivity, alerts, streaming, workers
# NEW: full pipeline (summary → safety + productivity). To revert, comment out next line and the include_router for pipeline.
from app.routers import pipeline
from app.routers.video import UPLOAD_DIR

app = FastAPI(title="IronSite Manager API", version="0.1.0")


@app.on_event("startup")
def _log_startup():
    print("IronSite Manager API starting — http://127.0.0.1:8000  docs: http://127.0.0.1:8000/docs", flush=True)
    sys.stdout.flush()
    sys.stderr.flush()

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sites.router, prefix="/api/sites", tags=["Sites"])
app.include_router(video.router, prefix="/api/video", tags=["Video Agent"])
app.include_router(safety.router, prefix="/api/safety", tags=["Safety Agent"])
app.include_router(productivity.router, prefix="/api/productivity", tags=["Productivity Agent"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(streaming.router, prefix="/api/streaming", tags=["Live Streaming"])
app.include_router(workers.router, prefix="/api/workers", tags=["Workers"])
# NEW: full pipeline endpoint. To revert, comment out the next line.
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["Pipeline"])


@app.get("/")
async def root():
    return {"app": "IronSite Manager", "docs": "/docs"}
