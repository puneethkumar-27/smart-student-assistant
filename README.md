# 🎓 Smart Student Assistant

An AI agent that helps college students plan their academics. Built with Python, LangGraph and Google Gemini.

## What it does
- 📚 **Study mode**: explains a topic step by step and checks understanding
- 🔊 **Voice replies**: JARVIS reads answers aloud
- 📎 **PDF and file summaries**: attach a PDF, TXT or MD file to get a summary and ask questions about it
- 🗓️ **Study planner**: builds a timetable from your exam dates
- 🧭 **Flowcharts**: ask for a flowchart and it draws one
- ❓ **Quiz generator**: creates 5 questions and marks your answers
## How it works
The AI model reads your question, decides which tool to call, reads the result, and repeats until it can write a final answer. LangGraph runs this as a loop between a model node and a tools node.

## Tech used
Python, LangGraph, LangChain, Google Gemini API, Antigravity IDE

## How to run
1. Install Python 3.13 or 3.14
2. Create and activate a virtual environment:
   ```
   py -3.14 -m venv .venv
   .venv\Scripts\activate
   ```
3. Install packages:
   ```
   pip install -r requirements.txt
   ```
4. Get a free API key from https://aistudio.google.com/apikey
5. Create a file named `.env` containing:
   ```
   GOOGLE_API_KEY=your-key-here
   MODEL=google_genai:gemini-3.5-flash-lite
   ```
6. Run:
   ```
   python agent1.py
   ```

## Example questions
- How many days until 2026-12-10?
- I attended 30 out of 42 classes. Can I still miss any if I need 75%?
- My marks are 85, 90 and 78. What is the average?

## Web interface (JARVIS)

1. Open a terminal in the `backend` folder:
   ```
   py -3.14 -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and add your free Gemini key from https://aistudio.google.com/apikey
3. Start the backend:
   ```
   python server.py
   ```
4. In a second terminal, open the `frontend` folder and run:
   ```
   python -m http.server 5500
   ```
5. Open http://localhost:5500

## Project structure
- `backend/assistant.py`: the LangGraph agent with its three tools
- `backend/server.py`: Flask API that connects the agent to the web page
- `frontend/`: the JARVIS-style chat interface (HTML, CSS, JavaScript)
- `agent1.py`: the original terminal version
  
## Note
Built by following a LangGraph tutorial manual and customised with my own student tools.

## Screenshots
![Home](1-home.png)
![Study mode](2-study-mode.png)
![Timetable](3-timetable.png)
![Flowchart](4-flowchart.png)
![PDF summary](5-pdf-summary.png)

