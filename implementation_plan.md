# Intelligent Intrusion Detection & Prevention System (IIDPS) with Voice Interaction

This plan outlines the architecture and implementation steps for building a proof-of-concept (POC) IIDPS that utilizes Machine Learning for threat detection and features a real-time voice interaction interface.

## 🎯 Goal Description
The objective is to create a fully functional POC of an intelligent network security system. The system will monitor network traffic, use an ML model to detect anomalous or malicious behavior (e.g., DDoS, Port Scans), simulate prevention (blocking IPs), and allow users to interact with it using voice commands using a sleek web dashboard.

## ⚠️ User Review Required

> [!WARNING]
> **Scope & Permissions Context**: A true production-grade IPS requires kernel-level drivers, low-level network packet interception, and significant data processing infrastructure. For this project, we will build a **Proof of Concept (PoC)**. 
> 
> My proposal is to build the application with a **network simulator** by default. This will allow the ML model and dashboard to function immediately without requiring Administrator/Root privileges or complex network adapters to be configured. 
> *Do you prefer to use a simulated data stream for guaranteed results out of the box, or would you like to attempt actual live local network sniffing (requires running as Admin)?*

> [!IMPORTANT]
> **Voice Interaction Approach**: Implementing voice processing natively in Python can be very slow and hardware-dependent. To guarantee real-time, low-latency voice interaction, I propose using the **Web Speech API** on the frontend dashboard. The browser will handle Speech-to-Text, send the text to our Python backend to formulate an intelligent response, and then the browser will speak the response using Text-to-Speech.
> *Are you okay with using the browser-based Web Speech API for the robust voice functionality?*

## 🏗️ Proposed Architecture

The system will be split into two main components:

### 1. Backend (Python + FastAPI)
- **API Engine**: Serves data to the frontend and receives voice queries.
- **Traffic Monitor**: An engine that either sniffs live packets using `scapy` or generates realistic simulated network flow telemetry.
- **ML Detection Engine**: A Python component using `scikit-learn` (e.g., Random Forest or Isolation Forest) that evaluates network features in real-time to flag intrusions.
- **IIDPS Logic Controller**: Manages the "Prevention" by keeping a simulated firewall blocklist and responding intelligently to system queries.

### 2. Frontend (HTML + JS + CSS / Vite React)
- **Security Dashboard**: A dark-mode, premium UI (glassmorphism, neon accents) displaying live traffic graphs, recent threats, and blocked IPs.
- **Voice Assistant Interface**: A glowing microphone button that handles continuous listening or push-to-talk to chat with the IIDPS about system status.

---

## 📝 Proposed Changes

### Backend Setup (Python)

#### [NEW] `backend/main.py`
The FastAPI application entry point. Handles REST endpoints for fetching traffic stats, threat logs, and the webhook for the voice assistant.

#### [NEW] `backend/ml_engine.py`
Houses the machine learning pipeline. For the PoC, it will generate a synthetic dataset, train a lightweight Random Forest model on startup, and provide a `predict(traffic_features)` function.

#### [NEW] `backend/network_monitor.py`
A background thread simulating (or capturing) live network traffic features (bytes per second, distinct IPs, packet sizes) and pushing them to the ML engine.

#### [NEW] `backend/requirements.txt`
Dependencies: `fastapi`, `uvicorn`, `scikit-learn`, `pandas`, `scapy`.

---

### Frontend Setup (Vanilla Web App or Vite)

#### [NEW] `frontend/index.html`
Structure of the security dashboard. Includes sections for overall bandwidth, threat dial, recent alerts, and the voice AI interface.

#### [NEW] `frontend/style.css`
Premium, responsive, cyber-security themed styling using pure CSS. Includes sleek data visualization wrappers and a dynamic pulse effect for the voice assistant.

#### [NEW] `frontend/script.js`
Handles UI updates via polling or WebSockets. Includes the `SpeechRecognition` setup to transcribe user speech, calls the backend `/api/voice` endpoint, and uses `SpeechSynthesis` to speak the responses.

## ❓ Open Questions

1. **Machine Learning Specifics**: Do you have a specific dataset in mind (e.g., CICIDS2017, NSL-KDD), or should I create a synthetic generator/model to make the application run instantly upon startup?
2. **Frameworks**: I can build the frontend using React (Vite) or Vanilla HTML/CSS/JS. Which do you prefer? (I recommend Vanilla for immediate local execution without npm steps, but React if you want a scalable architecture).

## 🧪 Verification Plan

### Automated / Unit Tests
- The backend will have unit tests ensuring the ML model correctly flags artificial anomaly feature sets.

### Manual Verification
- We will start the FastAPI backend and open the Frontend.
- We will view the simulated traffic flowing on the dashboard.
- We will trigger a simulated DDoS attack to see the IPS detect, mitigate, and log it.
- We will use the microphone to ask the system "What is the current threat level?" and hear it report back successfully.
