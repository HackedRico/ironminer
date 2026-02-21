from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import sites, video, safety, productivity, alerts, streaming

app = FastAPI(title="IronSite Manager API", version="0.1.0")

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


@app.get("/")
async def root():
    return {"app": "IronSite Manager", "docs": "/docs"}
