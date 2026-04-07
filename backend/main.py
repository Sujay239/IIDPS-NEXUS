from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
import asyncio
import json
import urllib.request

from ml_engine import ml_model
from network_monitor import traffic_simulator_loop, traffic_stats, recent_alerts

# ──────────────────────────────────────────────
# IIDPS Action Endpoints (Triggered by Vanguard AI)
# ──────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting up IIDPS Backend...")
    print("🧠 LLM Core: Google Gemini (via Puter.js) — Cloud-based speed.")
    # Train the ML model on startup using the synthetic dataset
    ml_model.train()
    
    # Start the network monitor task
    sim_task = asyncio.create_task(traffic_simulator_loop())
    
    yield
    print("🛑 Shutting down IIDPS Backend...")
    sim_task.cancel()

app = FastAPI(title="IIDPS NEXUS API", lifespan=lifespan)

# Allow Frontend to communicate with the Backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "IIDPS Backend is running.", "llm": "Google Gemini (Puter.js Integration)"}

@app.get("/api/status")
def get_status():
    return {
        "status": "online",
        "threat_level": f"DEFCON {traffic_stats['defcon_level']}",
        "message": f"System is operating at DEFCON {traffic_stats['defcon_level']}. {traffic_stats['threats_blocked']} threats contained."
    }

@app.get("/api/dashboard")
def get_dashboard_data():
    return {
        "stats": traffic_stats,
        "recent_alerts": list(recent_alerts)
    }

@app.post("/api/actions/clear-logs")
def clear_logs():
    recent_alerts.clear()
    traffic_stats["defcon_level"] = 5
    return {"status": "success", "message": "Threat logs cleared and DEFCON reset to 5."}

@app.post("/api/actions/simulate-attack")
def simulate_attack():
    from datetime import datetime
    traffic_stats["threats_blocked"] += 1
    recent_alerts.appendleft({
        "id": int(datetime.now().timestamp() * 1000),
        "type": "AI Triggered Attack Simulation",
        "ip": "10.0.0.99",
        "time": datetime.now().strftime("%H:%M:%S"),
        "severity": "critical",
        "confidence": "100.0%"
    })
    traffic_stats["defcon_level"] = max(1, 5 - min(4, len(recent_alerts) // 2))
    return {"status": "success", "message": "Attack simulation initiated by AI."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
