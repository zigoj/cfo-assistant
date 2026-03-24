"""CFO Assistant — Python FastAPI Worker"""
import os
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine.pipeline import run_pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

WORKER_SECRET = os.environ["WORKER_SECRET"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("CFO Worker starting")
    yield
    log.info("CFO Worker shutting down")


app = FastAPI(title="CFO Assistant Worker", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("NEXT_PUBLIC_APP_URL", "")],
    allow_methods=["POST"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    reportId: str
    orgId: str
    currency: str = "GBP"
    inputBankPdf: Optional[str] = None
    inputPlExcel: Optional[str] = None
    inputTbCsv: Optional[str] = None
    inputBudgetCsv: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(
    req: AnalyzeRequest,
    background_tasks: BackgroundTasks,
    x_worker_secret: str = Header(...),
):
    if x_worker_secret != WORKER_SECRET:
        raise HTTPException(status_code=401, detail="Invalid worker secret")

    background_tasks.add_task(run_pipeline, req.model_dump())
    log.info(f"Enqueued pipeline for report {req.reportId}")
    return {"jobId": req.reportId, "status": "enqueued"}
