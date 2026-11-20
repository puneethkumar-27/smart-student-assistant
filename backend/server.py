from flask import Flask, jsonify, request
from flask_cors import CORS

from assistant import graph

app = Flask(__name__)

# Local development convenience. In production, restrict this to your deployed
# frontend origin, for example: CORS(app, origins=["https://your-site.example"])
CORS(app)


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "JARVIS Student Assistant"})


@app.post("/chat")
def chat():
    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "")
    thread_id = payload.get("thread_id", "default-chat")

    if not isinstance(message, str) or not message.strip():
        return jsonify({"error": "A non-empty message is required."}), 400

    if not isinstance(thread_id, str) or not thread_id.strip():
        thread_id = "default-chat"

    config = {"configurable": {"thread_id": thread_id[:128]}}

    try:
        result = graph.invoke(
            {"messages": [("user", message.strip())]},
            config=config
        )
        final_message = result["messages"][-1]
        content = final_message.content

        # Most chat models return text. Handle structured content safely too.
        if isinstance(content, list):
            reply = "\n".join(
                part.get("text", "") if isinstance(part, dict) else str(part)
                for part in content
            ).strip()
        else:
            reply = str(content)

        return jsonify({"reply": reply})
    except Exception as exc:
        app.logger.exception("Assistant request failed")
        return jsonify({
            "error": "The assistant could not process that request. Check the backend logs."
        }), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
