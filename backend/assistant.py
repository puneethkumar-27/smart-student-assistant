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

SYSTEM = SystemMessage(
    "You are Smart Student Assistant, a helpful academic planner for college "
    "students. Always use tools for date counting, attendance and maths. "
    "Answer in 2-3 simple sentences."
)

# ---------- 3. Graph ----------
def agent(state: MessagesState):
    reply = llm.invoke([SYSTEM] + state["messages"])
    return {"messages": [reply]}


builder = StateGraph(MessagesState)
builder.add_node("agent", agent)
builder.add_node("tools", ToolNode(tools))
builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", tools_condition)
builder.add_edge("tools", "agent")
graph = builder.compile(checkpointer=InMemorySaver())
