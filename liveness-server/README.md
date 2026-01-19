Liveness + Anti-Spoof Service (Blink / Head Turn / Mouth Open)

Run locally:
1) cd liveness-server
2) pip install -r requirements.txt
3) uvicorn app:app --host 0.0.0.0 --port 8001

Endpoint:
POST http://localhost:8001/liveness
Body:
{
  "frames": [{"image_base64": "data:image/jpeg;base64,..."}],
  "challenge": "head_turn" | "blink" | "mouth_open",
  "debug": false
}

Response:
{ "status": "live" | "spoof", "reason": "..." }
