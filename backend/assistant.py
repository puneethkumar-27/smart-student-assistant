import math
import os
from datetime import date

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.messages import SystemMessage
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import MessagesState, StateGraph, START
from langgraph.prebuilt import ToolNode, tools_condition

load_dotenv()

# ---------- 1. Tools ----------

@tool
def calculate(expression: str) -> str:
    """Evaluate a maths expression such as '(85 + 90 + 78) / 3'. Use it for
    ALL arithmetic, percentages and GPA/CGPA calculations."""
    if not set(expression) <= set("0123456789+-*/(). %") or "**" in expression:
        return "Error: only numbers and + - * / ( ) % are allowed."
    try:
        return str(eval(expression, {"__builtins__": {}}, {}))
    except Exception as e:
        return f"Error: {e}"


@tool
def days_until(target_date: str) -> str:
    """Count the days from today until a date given as YYYY-MM-DD,
    e.g. an exam or assignment deadline."""
    try:
        days = (date.fromisoformat(target_date) - date.today()).days
    except ValueError:
        return "Error: use the format YYYY-MM-DD."
    return f"{days} days from today ({date.today()}) to {target_date}"


@tool
def attendance_calculator(attended: int, total: int, required_percent: float = 75) -> str:
    """Check a student's attendance. Give classes attended, total classes held,
    and the required percentage (default 75). Tells the current percentage and
    either how many classes can still be missed, or how many must be attended
    in a row to reach the requirement."""
    if total <= 0 or attended < 0 or attended > total:
        return "Error: check the numbers (attended must be between 0 and total)."
    if required_percent <= 0 or required_percent > 100:
        return "Error: required percentage must be greater than 0 and at most 100."
    current = attended / total * 100
    if current >= required_percent:
        can_miss = math.floor(attended * 100 / required_percent - total)
        return (f"Current attendance: {current:.1f}%. You can still miss "
                f"{can_miss} class(es) and stay at or above {required_percent}%.")
    if required_percent >= 100:
        return f"Current attendance: {current:.1f}%. 100% is no longer possible."
    need = math.ceil((required_percent * total - 100 * attended) / (100 - required_percent))
    return (f"Current attendance: {current:.1f}%, below {required_percent}%. "
            f"Attend the next {need} class(es) in a row to reach {required_percent}%.")


tools = [calculate, days_until, attendance_calculator]

# ---------- 2. Model ----------
MODEL = os.getenv("MODEL", "google_genai:gemini-3.5-flash-lite")
llm = init_chat_model(MODEL).bind_tools(tools)

PLAIN = (
    "Write in plain text only: no markdown, no asterisks, no hash symbols. "
    "Use simple numbered lines (1., 2., 3.) for lists. Your reply may be read "
    "aloud, so keep it clean and natural. "
    "EXCEPTION - two special blocks the web page can draw: "
    "(1) FLOWCHART: if the student asks for a flowchart, diagram, process or "
    "algorithm flow, add ONE block exactly like this, and the opening line MUST be ```mermaid (never ```flowchart); labels: plain words only, "
    "no brackets, quotes or symbols inside labels, at most 10 nodes):\n"
    "```mermaid\n"
    "flowchart TD\n"
    "A[Start] --> B[Do something]\n"
    "B --> C{Decision}\n"
    "C -->|Yes| D[Next step]\n"
    "C -->|No| B\n"
    "```\n"
    "(2) TIMETABLE: if you give a study plan or timetable, put it in ONE block, "
    "first line is the header, columns separated by ' | ', no other text inside:\n"
    "```table\n"
    "Day | Date | Subject | Task | Hours\n"
    "Mon | 2026-11-23 | Maths | Revise Unit 1 | 2\n"
    "```\n"
    "Put a short plain-text sentence before a block, never repeat its content "
    "in words after it. "
)
BASE = "You are JARVIS, the Smart Student Assistant, a friendly academic helper for college students. "

# One system prompt per mode (the frontend sends the selected mode).
PROMPTS = {
    "chat": BASE + PLAIN +
        "Always use tools for date counting, attendance and maths. "
        "Answer in 2-3 simple sentences.",
    "study": BASE + PLAIN +
        "STUDY MODE: teach the topic the student names, step by step, like a "
        "patient tutor. Format: a one-line idea, then 4-6 numbered steps, then "
        "one simple real-life example, then end with ONE quick question to "
        "check understanding. Keep it under 200 words. Use tools for any maths "
        "or dates.",
    "notes": BASE + PLAIN +
        "NOTES MODE: the student uploads notes or PDFs. Summarise them for exam "
        "revision: a 2-line overview, then 5-8 numbered key points, then a "
        "line starting 'Key terms:' with the important terms. For follow-up "
        "questions, answer only from the uploaded document when possible.",
    "quiz": BASE + PLAIN +
        "QUIZ MODE: create 5 multiple-choice questions (A-D) on the topic the "
        "student gives (or the uploaded document). Do NOT show answers yet. "
        "When the student replies with their answers, mark each one, give the "
        "score out of 5 and a one-line explanation per question.",
    "planner": BASE + PLAIN +
        "PLANNER MODE: build a study timetable. Use the days_until tool to "
        "count days to each exam date the student gives. If they have not "
        "given subjects and exam dates, ask for them first. Once you have "
        "them, ALWAYS answer with one short sentence and then the ```table "
        "block (one row per study day or session, maximum 14 rows, realistic "
        "hours, revision before each exam, a rest day if the plan is long). "
        "Finish with one line of advice.",
}


class State(MessagesState):
    mode: str


# ---------- 3. Graph ----------
def agent(state: State):
    mode = state.get("mode") or "chat"
    system = SystemMessage(PROMPTS.get(mode, PROMPTS["chat"]))
    reply = llm.invoke([system] + state["messages"])
    return {"messages": [reply]}


builder = StateGraph(State)
builder.add_node("agent", agent)
builder.add_node("tools", ToolNode(tools))
builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", tools_condition)
builder.add_edge("tools", "agent")
graph = builder.compile(checkpointer=InMemorySaver())
