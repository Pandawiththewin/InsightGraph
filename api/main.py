# api/main.py
import os
import json
import time
import uuid
import shutil
import random
import tempfile
from typing import List

import requests
from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from pypdf import PdfReader
from dotenv import load_dotenv

# -----------------------------------------------------------------------------#
# Load env (.env in /api) and basic config
# -----------------------------------------------------------------------------#
load_dotenv()

API_TITLE = "InsightGraph API"
ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "*"]

# Blackbox Chat Completions endpoint (leave default unless your org specifies)
BLACKBOX_API_URL = os.getenv("BLACKBOX_API_URL", "https://api.blackbox.ai/v1/chat/completions")

# Optional: force a specific model via env if you know it
FORCED_MODEL = (os.getenv("BLACKBOX_MODEL") or "").strip()

# Fallback list – we’ll try these in order until one works for your key
MODEL_FALLBACKS = [m for m in [
    FORCED_MODEL,
    "blackboxai-pro",
    "blackboxai-8x7b",
    "gpt-4o",          # generic OpenAI-compatible alias on some Blackbox tenants
    "gpt-4",           # last-resort legacy alias
] if m]

# -----------------------------------------------------------------------------#
# App + CORS
# -----------------------------------------------------------------------------#
app = FastAPI(title=API_TITLE, version="0.6.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------#
# Utilities
# -----------------------------------------------------------------------------#
def blackbox_headers():
    """Return headers that work across Blackbox auth styles."""
    key = (os.getenv("BLACKBOX_API_KEY") or "").strip()
    if not key:
        return None
    return {
        "Content-Type": "application/json",
        "x-blackbox-key": key,            # style 1
        "Authorization": f"Bearer {key}", # style 2
    }

def blackbox_chat(messages: list, temperature: float = 0.2) -> str:
    """
    Call Blackbox chat with model fallbacks.
    Returns the assistant text content or raises HTTPException.
    """
    headers = blackbox_headers()
    if not headers:
        raise HTTPException(status_code=500, detail="BLACKBOX_API_KEY not set")

    errors: list[str] = []
    for model in MODEL_FALLBACKS:
        payload = {"model": model, "messages": messages, "temperature": temperature}
        try:
            resp = requests.post(BLACKBOX_API_URL, headers=headers, data=json.dumps(payload), timeout=60)
        except requests.RequestException as e:
            errors.append(f"{model}: network error {e}")
            continue

        if resp.status_code == 200:
            try:
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            except Exception:
                raise HTTPException(status_code=502, detail="Unexpected Blackbox response shape")

        # 401: auth issue – no point trying more models
        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail=f"Blackbox 401: {resp.text}")

        # For model errors (400/404/422), try next model
        errors.append(f"{model}: {resp.status_code} {resp.text[:200]}")

    raise HTTPException(status_code=502, detail=f"All models failed. Errors: {' | '.join(errors)}")

def extract_text_from_file(path: str) -> str:
    """Return plain text from .txt/.pdf; short note for unsupported types."""
    lower = path.lower()
    if lower.endswith(".txt"):
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    if lower.endswith(".pdf"):
        try:
            reader = PdfReader(path)
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception:
            return f"[PDF: {os.path.basename(path)}; text extraction failed]"
    return f"[Unsupported file type: {os.path.basename(path)}]"

def call_blackbox_for_graph(texts: List[str]) -> dict:
    """
    Build a knowledge graph from raw texts via Blackbox.
    Returns: {"clusters":[...], "links":[...], "summary": "..."}
    """
    joined = "\n\n".join(texts)
    if len(joined) > 120_000:
        joined = joined[:120_000]

    system = (
        "You are InsightGraph, an analysis engine that turns multiple documents into a knowledge graph. "
        "Given a corpus of texts, you MUST output strict JSON with this schema: "
        "{"
        "\"clusters\":[{\"id\":string,\"label\":string,\"concepts\":[string],\"source_docs\":[string]}],"
        "\"links\":[{\"source\":string,\"target\":string,\"relation_label\":string}],"
        "\"summary\":string"
        "}. "
        "Rules: 6-14 clusters, concise labels (2-5 words), 5-10 concepts per cluster, 8-28 links, "
        "relation_label short (<=3 words). The summary is 4-7 sentences, executive tone. Return ONLY JSON."
    )

    content = blackbox_chat(
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": joined},
        ],
        temperature=0.2
    )

    # Strip code fences if LLM wrapped JSON
    s = content.strip()
    if s.startswith("```"):
        s = s.strip("`")
        if s.lower().startswith("json"):
            s = s[4:]
        s = s.strip()

    try:
        parsed = json.loads(s)
        for k in ["clusters", "links", "summary"]:
            if k not in parsed:
                raise ValueError(f"Missing key: {k}")
        return parsed
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse model JSON: {e}")

def call_blackbox_for_answer(question: str, graph_context: dict) -> str:
    """Q&A grounded in the existing graph context."""
    ctx = {
        "summary": graph_context.get("summary", ""),
        "clusters": [
            {
                "id": c.get("id"),
                "label": c.get("label"),
                "concepts": (c.get("concepts") or [])[:10],
                "docs": (c.get("source_docs") or [])[:5],
            }
            for c in (graph_context.get("clusters") or [])[:10]
        ],
        "links": (graph_context.get("links") or [])[:30],
    }

    system = (
        "You are InsightGraph QA. Answer the user's question using ONLY the provided context. "
        "Return a concise, actionable answer (4-8 sentences). If context is insufficient, say what is missing. "
        "When useful, refer to cluster labels or document names from the context."
    )

    return blackbox_chat(
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": f"Question: {question}\n\nContext JSON:\n{json.dumps(ctx, ensure_ascii=False)}"},
        ],
        temperature=0.2
    ).strip()

# ------------------------- Synthetic /sample generator ------------------------#
LABEL_BANK = [
    "AI for Climate Modeling","Carbon Capture Methods","Renewable Energy Trends",
    "Battery Storage","Grid Optimization","Policy & Incentives","EV Adoption",
    "Hydrogen Tech","Ocean Solutions","Satellite Sensing","Agri Emissions",
    "Methane Monitoring","Trading & Offsets","Carbon Accounting","Wildfire Risk",
    "Extreme Weather","Demand Response","Building Efficiency","Heat Pumps",
    "Nuclear SMR","Geothermal","Biofuels","CCUS Infrastructure","Supply Chains",
]
CONCEPT_BANK = [
    "forecasting","time series","LCOE","curtailment","grid inertia","flexibility",
    "sensor fusion","ensemble models","optimization","LLM extraction","retrieval",
    "QA pairs","embedding","classification","regression","policy levers","tax credits",
    "CAPEX","OPEX","MRV","DAC","BECCS","amine scrubbing","electrolysis",
    "pipeline transport","storage","permitting","satellites","SAR","microwave",
    "hyperspectral","OCR","document parsing","scenario analysis","Monte Carlo",
    "risk scoring","benchmarking","baseline","offset integrity","additionality",
    "verification","alerts","anomaly detection","centrality","betweenness",
]
REL_LABELS = ["depends","informs","tradeoff","enables","costs","relates"]

def build_sample_graph(n_clusters=12, concepts_per=7, link_prob=0.35, seed=42):
    rng = random.Random(seed)
    labels = rng.sample(LABEL_BANK, k=min(n_clusters, len(LABEL_BANK)))
    clusters = []
    for i, label in enumerate(labels):
        cid = f"c{i+1}"
        concepts = rng.sample(CONCEPT_BANK, k=min(concepts_per, len(CONCEPT_BANK)))
        docs = [f"{label.replace(' ','_').lower()}_{j+1}.txt" for j in range(rng.randint(2, 6))]
        clusters.append({
            "id": cid,
            "label": label,
            "concepts": concepts,
            "source_docs": docs
        })

    links = []
    # ring for connectivity
    for i in range(len(clusters)):
        j = (i+1) % len(clusters)
        links.append({"source": clusters[i]["id"], "target": clusters[j]["id"], "relation_label": "related"})
    # random extra links
    for i in range(len(clusters)):
        for j in range(i+2, len(clusters)):
            if rng.random() < link_prob:
                links.append({
                    "source": clusters[i]["id"],
                    "target": clusters[j]["id"],
                    "relation_label": rng.choice(REL_LABELS)
                })

    summary = (
        f"{n_clusters} thematic clusters link policy, technology, and deployment. "
        f"Typical concepts per cluster ≈{concepts_per}; density controlled by link_prob={link_prob}. "
        "Dependencies highlight how upstream infrastructure and incentives shape downstream adoption."
    )
    return {"clusters": clusters, "links": links, "summary": summary}

# -----------------------------------------------------------------------------#
# Routes
# -----------------------------------------------------------------------------#
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/debug/env")
def debug_env():
    return {"BLACKBOX_API_KEY_present": bool((os.getenv("BLACKBOX_API_KEY") or "").strip()),
            "BLACKBOX_MODEL": FORCED_MODEL or None}

@app.get("/sample")
def sample(
    size: str = Query("small", description="small|medium|large"),
    seed: int = Query(42),
    clusters: int | None = Query(None),
    concepts: int | None = Query(None),
    link_prob: float | None = Query(None),
):
    """Generate a demo graph: returns {clusters, links, summary}."""
    presets = {
        "small":  {"n": 3,  "concepts": 6, "p": 0.25},
        "medium": {"n": 8,  "concepts": 7, "p": 0.33},
        "large":  {"n": 14, "concepts": 8, "p": 0.40},
    }
    cfg = presets.get(size, presets["small"])
    n = clusters or cfg["n"]
    c = concepts or cfg["concepts"]
    p = link_prob if link_prob is not None else cfg["p"]
    return build_sample_graph(n_clusters=n, concepts_per=c, link_prob=p, seed=seed)

@app.post("/analyze")
async def analyze(files: List[UploadFile] = File(...)):
    """
    Upload .txt/.pdf, build a knowledge graph via Blackbox, return {clusters, links, summary}.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    if len(files) > 20:
        raise HTTPException(status_code=413, detail="Too many files (max 20)")

    tmpdir = tempfile.mkdtemp(prefix=f"igbx-{uuid.uuid4().hex[:6]}-")
    try:
        texts, names = [], []
        for f in files:
            if getattr(f, "size", None) and f.size > 20 * 1024 * 1024:
                raise HTTPException(status_code=413, detail=f"{f.filename} exceeds 20MB limit")
            path = os.path.join(tmpdir, f.filename or "doc")
            with open(path, "wb") as out:
                out.write(await f.read())
            names.append(os.path.basename(path))
            texts.append(extract_text_from_file(path))

        joined = "\n\n".join([f"# FILE: {n}\n{t}" for n, t in zip(names, texts)])
        result = call_blackbox_for_graph([joined])
        return JSONResponse(result)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

@app.post("/ask")
def ask(payload: dict = Body(...)):
    """
    Payload: { "question": str, "graph": {clusters:[], links:[], summary:""} }
    Returns: { "answer": str }
    """
    q = (payload or {}).get("question", "").strip()
    graph = (payload or {}).get("graph") or {}
    if not q:
        raise HTTPException(status_code=400, detail="Missing question")
    answer = call_blackbox_for_answer(q, graph)
    return {"answer": answer}
