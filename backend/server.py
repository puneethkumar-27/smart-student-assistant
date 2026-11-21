from flask import Flask, jsonify, request
from flask_cors import CORS
from pypdf import PdfReader

from assistant import PROMPTS, graph

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB upload limit

# Local development convenience. In production, restrict this to your deployed
# frontend origin, for example: CORS(app, origins=["https://your-site.example"])
CORS(app)

MAX_DOC_CHARS = 40000  # keep the document small enough for the model
ALLOWED_TEXT = {"txt", "md", "csv"}


def clean_mode(value):
    return value if isinstance(value, str) and value in PROMPTS else "chat"


def clean_thread(value):
    if not isinstance(value, str) or not value.strip():
        return "default-chat"
    return value[:128]


def run_graph(message, thread_id, mode):
    """Send one message to the LangGraph agent and return the reply text."""
    config = {"configurable": {"thread_id": thread_id}}
    result = graph.invoke(
        {"messages": [("user", message)], "mode": mode},
        config=config,
    )
    content = result["messages"][-1].content

    # Most chat models return text. Handle structured content safely too.
    if isinstance(content, list):
        return "\n".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        ).strip()
    return str(content)


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "JARVIS Student Assistant"})


@app.post("/chat")
def chat():
    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "")

    if not isinstance(message, str) or not message.strip():
        return jsonify({"error": "A non-empty message is required."}), 400

    try:
        reply = run_graph(
            message.strip(),
            clean_thread(payload.get("thread_id")),
            clean_mode(payload.get("mode")),
        )
        return jsonify({"reply": reply})
    except Exception:
        app.logger.exception("Assistant request failed")
        return jsonify({
            "error": "The assistant could not process that request. Check the backend logs."
        }), 500


@app.post("/upload")
def upload():
    """Read an uploaded PDF or text file and return a summary."""
    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"error": "No file was uploaded."}), 400

    name = file.filename
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""

    try:
        if ext == "pdf":
            reader = PdfReader(file.stream)
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
        elif ext in ALLOWED_TEXT:
            text = file.read().decode("utf-8", errors="ignore")
        else:
            return jsonify({"error": "Please upload a PDF, TXT, MD or CSV file."}), 400
    except Exception:
        app.logger.exception("Could not read uploaded file")
        return jsonify({"error": "I could not read that file. It may be damaged or password protected."}), 400

    text = text.strip()
    if not text:
        return jsonify({
            "error": "I found no readable text in that file. Scanned PDFs (photos of pages) are not supported."
        }), 400

    truncated = len(text) > MAX_DOC_CHARS
    text = text[:MAX_DOC_CHARS]

    prompt = (
        f"The student uploaded a file named '{name}'. Summarise it for exam "
        f"revision.\n\n----- DOCUMENT START -----\n{text}\n----- DOCUMENT END -----"
    )

    try:
        reply = run_graph(
            prompt,
            clean_thread(request.form.get("thread_id")),
            "notes",
        )
    except Exception:
        app.logger.exception("Summary request failed")
        return jsonify({
            "error": "The assistant could not summarise that file. Check the backend logs."
        }), 500

    if truncated:
        reply += "\n\n(Note: the file was long, so only the first part was summarised.)"
    return jsonify({"reply": reply, "filename": name})


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "That file is too large. The limit is 10 MB."}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
