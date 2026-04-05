import asyncio
import os
import psutil
from collections import deque
from datetime import datetime
from ml_engine import ml_model

# Thread-safe(ish) global state for the dashboard
traffic_stats = {
    "bandwidth_mbps": 0.0,
    "active_connections": 0,
    "threats_blocked": 0,
    "defcon_level": 5
}

# Keep the last 20 alerts
recent_alerts = deque(maxlen=20)

def get_live_connections():
    """Gets real connection stats from psutil, falling back to netstat if access is denied."""
    try:
        conns = psutil.net_connections(kind='inet')
        unique_ports = len(set(c.raddr.port for c in conns if c.raddr))
        conn_count = len(conns)
        return conn_count, unique_ports
    except psutil.AccessDenied:
        # Fallback to netstat without random if access denied
        output = os.popen('netstat -an').read()
        lines = [line for line in output.split('\n') if 'TCP' in line or 'UDP' in line]
        return len(lines), 1 # 1 is a fallback for unique ports
    except Exception:
        return 0, 0 # True fallback, no fake data

async def traffic_simulator_loop():
    """
    Monitors live network traffic hardware continuously via psutil, feeds it to the ML engine, 
    and updates the global stats accessible via the API.
    """
    print("[Network Monitor] Hardware OS monitoring loop starting...")
    
    last_io = psutil.net_io_counters()

    while True:
        await asyncio.sleep(2) # Update every 2 seconds
        
        # 1. LIVE BANDWIDTH CALCULATION
        current_io = psutil.net_io_counters()
        bytes_sent = current_io.bytes_sent - last_io.bytes_sent
        bytes_recv = current_io.bytes_recv - last_io.bytes_recv
        last_io = current_io
        
        total_mb = (bytes_sent + bytes_recv) / (1024 * 1024)
        bw_mbps = total_mb / 2.0  # divided by 2 seconds interval
        
        # 2. LIVE CONNECTION SOCKET TRACKING
        conn, ports = get_live_connections()
        auths = 0 
            
        # Update current stats
        traffic_stats["bandwidth_mbps"] = round(bw_mbps, 3)
        traffic_stats["active_connections"] = conn
        
        # Run ML Prediction
        try:
            # Using raw data, no artificial scaling for demo
            prediction = ml_model.predict(bw_mbps, conn, ports, auths)
            
            if prediction["is_anomaly"]:
                traffic_stats["threats_blocked"] += 1
                new_alert = {
                    "id": int(datetime.utcnow().timestamp() * 1000),
                    "type": str(prediction["threat_type"]),
                    "ip": "WAN / Local Socket",
                    "time": datetime.utcnow().strftime("%H:%M:%S"),
                    "severity": "critical" if prediction["confidence"] > 90 else "high",
                    "confidence": f"{prediction['confidence']}%"
                }
                recent_alerts.appendleft(new_alert)
                
                # Update DEFCON automatically based on recent threats limit
                traffic_stats["defcon_level"] = max(1, 5 - min(4, len(recent_alerts) // 2))
                
        except Exception as e:
            print(f"[Network Monitor] Error during ML prediction: {e}")
