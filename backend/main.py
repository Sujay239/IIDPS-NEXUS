from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
import asyncio
import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)

from ml_engine import ml_model
from network_monitor import traffic_simulator_loop, traffic_stats, recent_alerts

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting up IIDPS Backend...")
    # Train the ML model on startup using the synthetic dataset
    ml_model.train()
    
    # Start the simulator task
    sim_task = asyncio.create_task(traffic_simulator_loop())
    
    yield
    print("🛑 Shutting down IIDPS Backend...")
    sim_task.cancel()

app = FastAPI(title="IIDPS API Skeleton", lifespan=lifespan)

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
    return {"status": "IIDPS Backend is running."}

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

class VoiceCommand(BaseModel):
    command: str

@app.post("/api/voice")
def process_voice_command(cmd: VoiceCommand):
    from datetime import datetime
    text = cmd.command
    
    if not os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY") == "INSERT_YOUR_GEMINI_API_KEY_HERE":
        return {"response": "API Key is missing. Please add your Gemini API Key directly into the dot env file in the backend directory."}

    defcon = traffic_stats.get('defcon_level', 5)
    blocked = traffic_stats.get('threats_blocked', 0)
    alerts = ", ".join([f"{a['type']} from {a['ip']} ({a['severity']})" for a in list(recent_alerts)[:5]]) if recent_alerts else "None"
    
    system_context = f"""You are Vanguard AI, the core intelligence for the Intelligent Intrusion Detection & Prevention System.
You are monitoring live cyber threat metrics. 
Current state:
- DEFCON Level: {defcon}
- Threats Blocked: {blocked}
- Recent Alerts: {alerts}

The user is speaking to you. Respond naturally, concisely (1-2 sentences), and authoritatively.

If the user gives a command to clear the logs, reset the system, or clean up, you MUST output the Exact tag [ACTION: CLEAR_LOGS] somewhere in your response.
If the user gives a command to simulate an attack, run a penetration test, or test the defense, you MUST output the Exact tag [ACTION: PENETRATION_TEST] somewhere in your response.

User voice input: {text}"""

    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(system_context)
            
        llm_response = response.text

        # Action Interceptors
        if "[ACTION: CLEAR_LOGS]" in llm_response:
            recent_alerts.clear()
            traffic_stats["defcon_level"] = 5
            llm_response = llm_response.replace("[ACTION: CLEAR_LOGS]", "")
        
        if "[ACTION: PENETRATION_TEST]" in llm_response:
            traffic_stats["threats_blocked"] += 1
            recent_alerts.appendleft({
                "id": int(datetime.utcnow().timestamp() * 1000),
                "type": "AI Triggered Attack Simulation",
                "ip": "10.0.0.99",
                "time": datetime.utcnow().strftime("%H:%M:%S"),
                "severity": "critical",
                "confidence": "100.0%"
            })
            traffic_stats["defcon_level"] = max(1, 5 - min(4, len(recent_alerts) // 2))
            llm_response = llm_response.replace("[ACTION: PENETRATION_TEST]", "")

        response_text = llm_response.strip()

    except Exception as e:
        response_text = f"Connection to LLM Cognitive Core failed. Error: {str(e)}"
        
    return {"response": response_text}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
