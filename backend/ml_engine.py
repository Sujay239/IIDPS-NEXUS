import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier

class IntrusionDetectionModel:
    def __init__(self):
        self.model = RandomForestClassifier(n_estimators=50, random_state=42)
        self.is_trained = False
        
    def generate_synthetic_data(self):
        """
        Creates a synthetic dataset representing Normal traffic and various anomalies (DDoS, Port Scan, Malware).
        Features: 
        - bandwidth_usage_mbps
        - concurrent_connections
        - distinct_dest_ports
        - failed_auth_attempts
        """
        print("[ML Engine] Generating synthetic network data for PoC...")
        
        # 1. Normal Traffic
        normal_data = pd.DataFrame({
            'bandwidth_usage_mbps': np.random.uniform(5, 50, 500),
            'concurrent_connections': np.random.randint(100, 1000, 500),
            'distinct_dest_ports': np.random.randint(1, 5, 500),
            'failed_auth_attempts': np.random.randint(0, 2, 500),
            'label': 'Normal'
        })
        
        # 2. DDoS Attack (High bandwidth, extreme concurrent connections)
        ddos_data = pd.DataFrame({
            'bandwidth_usage_mbps': np.random.uniform(500, 2000, 100),
            'concurrent_connections': np.random.randint(10000, 50000, 100),
            'distinct_dest_ports': np.random.randint(1, 10, 100),
            'failed_auth_attempts': np.random.randint(0, 5, 100),
            'label': 'DDoS Attempt'
        })
        
        # 3. Port Scan (Low bandwidth, huge number of distinct dest ports touched by single source)
        strut_port_scan = pd.DataFrame({
            'bandwidth_usage_mbps': np.random.uniform(1, 10, 100),
            'concurrent_connections': np.random.randint(10, 100, 100),
            'distinct_dest_ports': np.random.randint(100, 65535, 100),
            'failed_auth_attempts': np.random.randint(0, 2, 100),
            'label': 'Port Scan'
        })
        
        # 4. Brute Force (High failed auths)
        brute_force = pd.DataFrame({
            'bandwidth_usage_mbps': np.random.uniform(2, 20, 100),
            'concurrent_connections': np.random.randint(5, 50, 100),
            'distinct_dest_ports': np.random.randint(1, 3, 100),
            'failed_auth_attempts': np.random.randint(10, 1000, 100),
            'label': 'Brute Force'
        })
        
        df = pd.concat([normal_data, ddos_data, strut_port_scan, brute_force], ignore_index=True)
        return df
        
    def train(self):
        df = self.generate_synthetic_data()
        X = df.drop('label', axis=1)
        y = df['label']
        
        print(f"[ML Engine] Training Random Forest on {len(df)} simulated network events...")
        self.model.fit(X, y)
        self.is_trained = True
        print("[ML Engine] Model training complete. Ready for real-time inference.")
        
    def predict(self, bandwidth_usage_mbps, concurrent_connections, distinct_dest_ports, failed_auth_attempts):
        if not self.is_trained:
            raise Exception("Model is not trained yet!")
            
        features = pd.DataFrame([{
            'bandwidth_usage_mbps': bandwidth_usage_mbps,
            'concurrent_connections': concurrent_connections,
            'distinct_dest_ports': distinct_dest_ports,
            'failed_auth_attempts': failed_auth_attempts
        }])
        
        prediction = self.model.predict(features)[0]
        # Also return probabilities to determine severity
        probas = self.model.predict_proba(features)[0]
        confidence = max(probas) * 100
        
        return {
            "threat_type": prediction,
            "confidence": round(confidence, 2),
            "is_anomaly": prediction != "Normal"
        }

# Singleton instance for the backend to use
ml_model = IntrusionDetectionModel()
