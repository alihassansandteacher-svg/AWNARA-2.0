"""
AWNARA — The Advanced Personal AI Assistant
backend/main.py

Production-grade FastAPI backend.

Architecture:

Frontend
   |
   v
FastAPI API
   |
   v
Conversation Service
   |
   v
AwnaraBrain
   |
   +--> Tools / AI Model (future)
   |
   v
SQLite persistence

The simulated AI brain can later be replaced with a real
AI provider without changing the frontend API contract.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

# ============================================================
# 1. CONFIGURATION
# ============================================================

APP_NAME = "AWNARA Backend"
APP_DESCRIPTION = (
    "Backend brain for AWNARA — The Advanced Personal AI Assistant."
)
APP_VERSION = "1.0.0"

ENVIRONMENT = os.getenv("AWNARA_ENV", "development").lower()

HOST = os.getenv("AWNARA_HOST", "127.0.0.1")
PORT = int(os.getenv("AWNARA_PORT", "8000"))

DATABASE_PATH = Path(
    os.getenv(
        "AWNARA_DATABASE",
        str(Path(__file__).resolve().parent / "data" / "awnara.db"),
    )
)

MAX_MESSAGE_LENGTH = int(
    os.getenv("AWNARA_MAX_MESSAGE_LENGTH", "20000")
)

MAX_FILE_COUNT = int(
    os.getenv("AWNARA_MAX_FILE_COUNT", "10")
)

MAX_FILE_SIZE = int(
    os.getenv(
        "AWNARA_MAX_FILE_SIZE",
        str(100 * 1024 * 1024),
    )
)

# Development can use "*".
# Production should provide:
#
# AWNARA_CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
#
CORS_ORIGINS_ENV = os.getenv("AWNARA_CORS_ORIGINS", "")

if CORS_ORIGINS_ENV.strip():
    CORS_ORIGINS = [
        origin.strip()
        for origin in CORS_ORIGINS_ENV.split(",")
        if origin.strip()
    ]
else:
    CORS_ORIGINS = ["*"]

# ============================================================
# 2. LOGGING
# ============================================================

LOG_LEVEL = os.getenv("AWNARA_LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format=(
        "%(asctime)s | "
        "%(levelname)s | "
        "%(name)s | "
        "%(message)s"
    ),
)

logger = logging.getLogger("awnara")

# ============================================================
# 3. APPLICATION STATE
# ============================================================

class AIState(str, Enum):
    IDLE = "idle"
    LISTENING = "listening"
    THINKING = "thinking"
    PROCESSING = "processing"
    EXECUTING = "executing"
    RESPONDING = "responding"
    SUCCESS = "success"
    ERROR = "error"

system_state: Dict[str, Any] = {
    "aiState": AIState.IDLE,
    "coreHealth": 100,
}

# Lock protects the shared prototype AI state.
state_lock = Lock()

# ============================================================
# 4. TIME / ID HELPERS
# ============================================================

def utc_now() -> str:
    """Return current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()

def new_id(prefix: str) -> str:
    """Generate a short unique identifier."""
    return f"{prefix}-{uuid.uuid4().hex[:16]}"

# ============================================================
# 5. DATABASE
# ============================================================

class Database:
    """
    Small SQLite persistence layer.

    SQLite is suitable for a single-instance AWNARA deployment
    or prototype.

    For a multi-instance production deployment, replace this
    class with PostgreSQL.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self.lock = Lock()

    def initialize(self) -> None:
        """Create database directory and tables."""
        self.path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        with self._connect() as connection:
            connection.executescript(
                """
                PRAGMA journal_mode=WAL;
                PRAGMA foreign_keys=ON;

                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (
                        conversation_id
                    )
                    REFERENCES conversations(id)
                    ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS message_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    size INTEGER,
                    FOREIGN KEY (
                        message_id
                    )
                    REFERENCES messages(id)
                    ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS
                idx_conversations_updated
                ON conversations(updated_at DESC);

                CREATE INDEX IF NOT EXISTS
                idx_messages_conversation
                ON messages(conversation_id);

                CREATE INDEX IF NOT EXISTS
                idx_message_files_message
                ON message_files(message_id);
                """
            )

        logger.info(
            "Database initialized: %s",
            self.path.resolve(),
        )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.path,
            timeout=30,
        )

        connection.row_factory = sqlite3.Row

        connection.execute(
            "PRAGMA foreign_keys=ON"
        )

        return connection

    def create_conversation(
        self,
        conversation: "Conversation",
    ) -> None:
        with self.lock:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO conversations
                    (
                        id,
                        title,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        conversation.id,
                        conversation.title,
                        conversation.createdAt,
                        conversation.updatedAt,
                    ),
                )

    def conversation_exists(
        self,
        conversation_id: str,
    ) -> bool:
        with self.lock:
            with self._connect() as connection:
                row = connection.execute(
                    """
                    SELECT id
                    FROM conversations
                    WHERE id = ?
                    """,
                    (conversation_id,),
                ).fetchone()

        return row is not None

    def get_conversation(
        self,
        conversation_id: str,
    ) -> Optional["Conversation"]:
        with self.lock:
            with self._connect() as connection:
                conversation_row = connection.execute(
                    """
                    SELECT
                        id,
                        title,
                        created_at,
                        updated_at
                    FROM conversations
                    WHERE id = ?
                    """,
                    (conversation_id,),
                ).fetchone()

                if conversation_row is None:
                    return None

                message_rows = connection.execute(
                    """
                    SELECT
                        id,
                        role,
                        content,
                        timestamp
                    FROM messages
                    WHERE conversation_id = ?
                    ORDER BY rowid ASC
                    """,
                    (conversation_id,),
                ).fetchall()

                messages: List[Message] = []

                for message_row in message_rows:
                    file_rows = connection.execute(
                        """
                        SELECT
                            name,
                            size
                        FROM message_files
                        WHERE message_id = ?
                        ORDER BY id ASC
                        """,
                        (message_row["id"],),
                    ).fetchall()

                    files = [
                        MessageFile(
                            name=file_row["name"],
                            size=file_row["size"],
                        )
                        for file_row in file_rows
                    ]

                    messages.append(
                        Message(
                            id=message_row["id"],
                            role=message_row["role"],
                            content=message_row["content"],
                            timestamp=message_row["timestamp"],
                            files=files,
                        )
                    )

                return Conversation(
                    id=conversation_row["id"],
                    title=conversation_row["title"],
                    createdAt=conversation_row["created_at"],
                    updatedAt=conversation_row["updated_at"],
                    messages=messages,
                )

    def list_conversations(
        self,
    ) -> List["ConversationSummary"]:
        with self.lock:
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT
                        c.id,
                        c.title,
                        c.created_at,
                        c.updated_at,
                        COUNT(m.id) AS message_count
                    FROM conversations c
                    LEFT JOIN messages m
                        ON m.conversation_id = c.id
                    GROUP BY
                        c.id,
                        c.title,
                        c.created_at,
                        c.updated_at
                    ORDER BY c.updated_at DESC
                    """
                ).fetchall()

        return [
            ConversationSummary(
                id=row["id"],
                title=row["title"],
                createdAt=row["created_at"],
                updatedAt=row["updated_at"],
                messageCount=int(row["message_count"]),
            )
            for row in rows
        ]

    def update_conversation(
        self,
        conversation_id: str,
        *,
        title: Optional[str] = None,
        updated_at: Optional[str] = None,
    ) -> None:
        with self.lock:
            with self._connect() as connection:
                if title is not None:
                    connection.execute(
                        """
                        UPDATE conversations
                        SET
                            title = ?,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            title,
                            updated_at or utc_now(),
                            conversation_id,
                        ),
                    )
                else:
                    connection.execute(
                        """
                        UPDATE conversations
                        SET updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            updated_at or utc_now(),
                            conversation_id,
                        ),
                    )

    def add_message(
        self,
        conversation_id: str,
        message: "Message",
    ) -> None:
        with self.lock:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO messages
                    (
                        id,
                        conversation_id,
                        role,
                        content,
                        timestamp
                    )
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        message.id,
                        conversation_id,
                        message.role,
                        message.content,
                        message.timestamp,
                    ),
                )

                for file in message.files:
                    connection.execute(
                        """
                        INSERT INTO message_files
                        (
                            message_id,
                            name,
                            size
                        )
                        VALUES (?, ?, ?)
                        """,
                        (
                            message.id,
                            file.name,
                            file.size,
                        ),
                    )

                connection.execute(
                    """
                    UPDATE conversations
                    SET updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        utc_now(),
                        conversation_id,
                    ),
                )

    def delete_conversation(
        self,
        conversation_id: str,
    ) -> bool:
        with self.lock:
            with self._connect() as connection:
                cursor = connection.execute(
                    """
                    DELETE FROM conversations
                    WHERE id = ?
                    """,
                    (conversation_id,),
                )

                return cursor.rowcount > 0

    def clear_conversations(self) -> None:
        with self.lock:
            with self._connect() as connection:
                connection.execute(
                    "DELETE FROM conversations"
                )

db = Database(DATABASE_PATH)

# ============================================================
# 6. PYDANTIC DATA MODELS
# ============================================================

class MessageFile(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
    )

    size: Optional[int] = Field(
        default=None,
        ge=0,
        le=MAX_FILE_SIZE,
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError(
                "File name cannot be empty."
            )

        if "/" in value or "\\" in value:
            raise ValueError(
                "File name must not contain path separators."
            )

        return value

class Message(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    id: str
    role: str
    content: str
    timestamp: str
    files: List[MessageFile] = Field(
        default_factory=list
    )

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in {"user", "assistant"}:
            raise ValueError(
                "Role must be 'user' or 'assistant'."
            )

        return value

class Conversation(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    id: str
    title: str
    createdAt: str
    updatedAt: str
    messages: List[Message] = Field(
        default_factory=list
    )

class ConversationSummary(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    id: str
    title: str
    createdAt: str
    updatedAt: str
    messageCount: int

class CreateConversationRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    title: Optional[str] = Field(
        default="New Conversation",
        max_length=100,
    )

    @field_validator("title")
    @classmethod
    def validate_title(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return "New Conversation"

        value = value.strip()

        if not value:
            return "New Conversation"

        return value

class SendMessageRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    content: str = Field(
        default="",
        max_length=MAX_MESSAGE_LENGTH,
    )

    files: List[MessageFile] = Field(
        default_factory=list,
        max_length=MAX_FILE_COUNT,
    )

    @field_validator("content")
    @classmethod
    def normalize_content(cls, value: str) -> str:
        return value.strip()

class SendMessageResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    userMessage: Message
    aiMessage: Message
    aiState: AIState
    coreHealth: int

class StatusResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    status: str
    aiState: AIState
    coreHealth: int
    version: str

# ============================================================
# 7. HELPERS
# ============================================================

def make_title(content: str) -> str:
    clean = " ".join(content.split()).strip()

    if not clean:
        return "New Conversation"

    if len(clean) > 32:
        return clean[:32].rstrip() + "…"

    return clean

def get_conversation_or_404(
    conversation_id: str,
) -> Conversation:
    conversation = db.get_conversation(
        conversation_id
    )

    if conversation is None:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    return conversation

def set_ai_state(
    state: AIState,
) -> None:
    with state_lock:
        system_state["aiState"] = state

def change_core_health(
    amount: int,
) -> int:
    with state_lock:
        current = int(
            system_state["coreHealth"]
        )

        updated = max(
            0,
            min(
                100,
                current + amount,
            ),
        )

        system_state["coreHealth"] = updated

        return updated

def get_system_state() -> Dict[str, Any]:
    with state_lock:
        return {
            "aiState": system_state["aiState"],
            "coreHealth": system_state["coreHealth"],
        }

# ============================================================
# 8. AWNARA BRAIN
# ============================================================

TOOL_KEYWORDS = (
    "calculate",
    "search",
    "research",
    "analyze",
    "analyse",
    "file",
    "code",
    "weather",
    "plan",
)

SUGGESTION_REPLIES = {
    "help me plan my day": (
        "I can help you plan your day. "
        "In this prototype planning is simulated, "
        "but the future AWNARA will break your day "
        "into tasks, priorities, and time blocks automatically."
    ),
    "help me learn something new": (
        "I can help you learn something new. "
        "Once connected to a real model, AWNARA will be able "
        "to explain, quiz, and guide you through any topic."
    ),
    "help me build a project": (
        "Let's build something. "
        "The Projects workspace will eventually track scope, "
        "milestones, and progress. For now this is a simulated response."
    ),
    "think through a complex problem with me": (
        "I'm ready to think it through with you. "
        "Real reasoning will arrive with a connected AI model. "
        "For now this is a simulated response."
    ),
}

class AwnaraBrain:
    """
    AWNARA intelligence layer.

    Current implementation:
        simulated response engine.

    Future implementation:
        replace generate_reply/respond internals with:
            - AI model
            - tool router
            - web search
            - calculator
            - file processing
            - memory retrieval
            - task execution
    """

    @staticmethod
    def should_use_tool(
        message: str,
    ) -> bool:
        normalized = message.lower()

        return any(
            keyword in normalized
            for keyword in TOOL_KEYWORDS
        )

    @staticmethod
    def generate_reply(
        message: str,
    ) -> str:
        normalized = message.lower().strip()

        if normalized in SUGGESTION_REPLIES:
            return SUGGESTION_REPLIES[
                normalized
            ]

        if any(
            re.search(r"\b" + re.escape(word) + r"\b", normalized)
            for word in (
                "hello",
                "hi",
                "hey",
            )
        ):
            return (
                "Hello. I'm AWNARA — your personal AI interface. "
                "The backend is currently running a simulated brain "
                "until a real AI model is connected."
            )

        if (
            "who are you" in normalized
            or "what are you" in normalized
        ):
            return (
                "I'm AWNARA, the Advanced Personal AI Assistant. "
                "The long-term goal is to become a personal intelligent "
                "operating system capable of conversation, reasoning, "
                "memory, tool use, and multi-step task execution."
            )

        if (
            "calculate" in normalized
            or "math" in normalized
        ):
            return (
                "I detected a calculation-related request. "
                "Calculator execution is currently simulated. "
                "A real calculator tool can be connected to AWNARA."
            )

        if any(
            word in normalized
            for word in (
                "code",
                "javascript",
                "html",
                "css",
                "python",
            )
        ):
            return (
                "Coding mode detected. "
                "The backend is prepared for a future code tool "
                "and real AI coding workflow."
            )

        if (
            "plan" in normalized
            or "project" in normalized
        ):
            return (
                "I can help structure that into a clear plan. "
                "A future AWNARA planning workflow will break "
                "objectives into tasks, dependencies, and milestones."
            )

        if (
            "remember" in normalized
            or "memory" in normalized
        ):
            return (
                "Memory is part of AWNARA's architecture. "
                "Short-term context, long-term memory, and project "
                "memory can work together once the real memory system "
                "and AI model are connected."
            )

        if not normalized:
            return (
                "I received your attachment. "
                "File understanding is currently simulated until "
                "AWNARA is connected to real document and image processing."
            )

        return (
            "Understood. This is a simulated AWNARA response. "
            "The backend brain is not yet connected to a real AI model, "
            "but the complete conversation flow is working."
        )

    async def respond(
        self,
        message: str,
    ) -> str:
        """
        Simulated AI state machine.

        THINKING
            ->
        PROCESSING
            ->
        EXECUTING (when a tool keyword is detected)
            ->
        RESPONDING
            ->
        SUCCESS
        """

        try:
            set_ai_state(
                AIState.THINKING
            )
            change_core_health(-2)

            await asyncio.sleep(0.15)

            set_ai_state(
                AIState.PROCESSING
            )
            change_core_health(-1)

            await asyncio.sleep(0.15)

            if self.should_use_tool(message):
                set_ai_state(
                    AIState.EXECUTING
                )

                await asyncio.sleep(0.15)

            set_ai_state(
                AIState.RESPONDING
            )

            await asyncio.sleep(0.1)

            reply = self.generate_reply(
                message
            )

            change_core_health(+3)

            set_ai_state(
                AIState.SUCCESS
            )

            return reply

        except Exception:
            set_ai_state(
                AIState.ERROR
            )

            logger.exception(
                "AWNARA brain failed"
            )

            raise

brain = AwnaraBrain()

# ============================================================
# 9. APPLICATION LIFESPAN
# ============================================================

@asynccontextmanager
async def lifespan(
    application: FastAPI,
):
    logger.info(
        "Starting %s v%s",
        APP_NAME,
        APP_VERSION,
    )

    logger.info(
        "Environment: %s",
        ENVIRONMENT,
    )

    db.initialize()

    set_ai_state(
        AIState.IDLE
    )

    logger.info(
        "AWNARA backend is ready."
    )

    yield

    set_ai_state(
        AIState.IDLE
    )

    logger.info(
        "AWNARA backend shutting down."
    )

# ============================================================
# 10. FASTAPI APP
# ============================================================

app = FastAPI(
    title=APP_NAME,
    description=APP_DESCRIPTION,
    version=APP_VERSION,
    lifespan=lifespan,
)

# ============================================================
# 11. CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=(
        CORS_ORIGINS != ["*"]
    ),
    allow_methods=[
        "GET",
        "POST",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Request-ID",
    ],
)

# ============================================================
# 12. REQUEST MIDDLEWARE
# ============================================================

@app.middleware("http")
async def request_logging_middleware(
    request: Request,
    call_next,
):
    request_id = request.headers.get(
        "X-Request-ID"
    ) or new_id("req")

    start_time = time.perf_counter()

    try:
        response = await call_next(
            request
        )

    except Exception:
        logger.exception(
            "Unhandled request error | "
            "%s %s | request_id=%s",
            request.method,
            request.url.path,
            request_id,
        )

        raise

    duration_ms = (
        time.perf_counter() - start_time
    ) * 1000

    response.headers[
        "X-Request-ID"
    ] = request_id

    response.headers[
        "X-Content-Type-Options"
    ] = "nosniff"

    response.headers[
        "X-Frame-Options"
    ] = "DENY"

    response.headers[
        "Referrer-Policy"
    ] = "no-referrer"

    logger.info(
        "%s %s -> %s | %.2fms | request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
    )

    return response

# ============================================================
# 13. EXCEPTION HANDLERS
# ============================================================

@app.exception_handler(
    ValueError
)
async def value_error_handler(
    request: Request,
    exc: ValueError,
):
    logger.warning(
        "Validation error: %s",
        exc,
    )

    return JSONResponse(
        status_code=400,
        content={
            "detail": str(exc)
        },
    )

@app.exception_handler(
    Exception
)
async def generic_exception_handler(
    request: Request,
    exc: Exception,
):
    logger.exception(
        "Unhandled application exception"
    )

    return JSONResponse(
        status_code=500,
        content={
            "detail": (
                "Internal server error."
            )
        },
    )

# ============================================================
# 14. HEALTH ENDPOINTS
# ============================================================

@app.get(
    "/",
    tags=["System"],
)
def root():
    return FileResponse(Path(__file__).resolve().parents[1] / "index.html")

@app.get(
    "/api/health",
    tags=["System"],
)
def health_check():
    return {
        "status": "online",
        "service": "AWNARA Backend",
        "version": APP_VERSION,
    }

@app.get(
    "/api/status",
    response_model=StatusResponse,
    tags=["System"],
)
def get_status():
    state = get_system_state()

    return StatusResponse(
        status="online",
        aiState=state["aiState"],
        coreHealth=state["coreHealth"],
        version=APP_VERSION,
    )

# ============================================================
# 15. CONVERSATION ENDPOINTS
# ============================================================

@app.get(
    "/api/conversations",
    response_model=List[ConversationSummary],
    tags=["Conversations"],
)
def list_conversations():
    return db.list_conversations()

@app.post(
    "/api/conversations",
    response_model=Conversation,
    status_code=201,
    tags=["Conversations"],
)
def create_conversation(
    payload: CreateConversationRequest,
):
    now = utc_now()

    conversation = Conversation(
        id=new_id("conversation"),
        title=(
            payload.title
            or "New Conversation"
        ),
        createdAt=now,
        updatedAt=now,
        messages=[],
    )

    db.create_conversation(
        conversation
    )

    return conversation

@app.get(
    "/api/conversations/{conversation_id}",
    response_model=Conversation,
    tags=["Conversations"],
)
def get_conversation(
    conversation_id: str,
):
    return get_conversation_or_404(
        conversation_id
    )

@app.delete(
    "/api/conversations/{conversation_id}",
    status_code=204,
    tags=["Conversations"],
)
def delete_conversation(
    conversation_id: str,
):
    if not db.conversation_exists(
        conversation_id
    ):
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    deleted = db.delete_conversation(
        conversation_id
    )

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    return None

@app.delete(
    "/api/conversations",
    status_code=204,
    tags=["Conversations"],
)
def clear_conversations():
    db.clear_conversations()

    return None

# ============================================================
# 16. MESSAGE ENDPOINT
# ============================================================

@app.post(
    "/api/conversations/{conversation_id}/messages",
    response_model=SendMessageResponse,
    tags=["Messages"],
)
async def send_message(
    conversation_id: str,
    payload: SendMessageRequest,
):
    conversation = get_conversation_or_404(
        conversation_id
    )

    content = payload.content.strip()

    if not content and not payload.files:
        raise HTTPException(
            status_code=400,
            detail=(
                "Message must have content "
                "or an attachment."
            ),
        )

    # --------------------------------------------------------
    # User message
    # --------------------------------------------------------

    user_message = Message(
        id=new_id("message"),
        role="user",
        content=content,
        timestamp=utc_now(),
        files=payload.files,
    )

    db.add_message(
        conversation_id,
        user_message,
    )

    # --------------------------------------------------------
    # Automatic conversation title
    # --------------------------------------------------------

    if (
        conversation.title
        == "New Conversation"
        and content
    ):
        new_title = make_title(
            content
        )

        db.update_conversation(
            conversation_id,
            title=new_title,
            updated_at=utc_now(),
        )

    # --------------------------------------------------------
    # AI response
    # --------------------------------------------------------

    try:
        reply_text = await brain.respond(
            content
        )

    except Exception:
        set_ai_state(
            AIState.ERROR
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "AWNARA brain failed "
                "while processing the message."
            ),
        )

    # --------------------------------------------------------
    # Assistant message
    # --------------------------------------------------------

    ai_message = Message(
        id=new_id("message"),
        role="assistant",
        content=reply_text,
        timestamp=utc_now(),
        files=[],
    )

    db.add_message(
        conversation_id,
        ai_message,
    )

    # --------------------------------------------------------
    # Return to idle state
    # --------------------------------------------------------

    set_ai_state(
        AIState.IDLE
    )

    state = get_system_state()

    return SendMessageResponse(
        userMessage=user_message,
        aiMessage=ai_message,
        aiState=state["aiState"],
        coreHealth=state["coreHealth"],
    )

# ============================================================
# 17. MEMORY ENDPOINT
# ============================================================

@app.get(
    "/api/memory",
    tags=["Memory"],
)
def get_memory():
    return {
        "shortTerm": {
            "label": "Short-Term Memory",
            "value": "Active conversation",
            "status": "active",
        },
        "longTerm": {
            "label": "Long-Term Memory",
            "value": "Available",
            "status": "available",
        },
        "project": {
            "label": "Project Memory",
            "value": "AWNARA",
            "status": "active",
        },
    }

# ============================================================
# 18. TOOLS ENDPOINT
# ============================================================

@app.get(
    "/api/tools",
    tags=["Tools"],
)
def get_tools():
    return {
        "tools": [
            {
                "id": "web",
                "name": "Web",
                "status": "ready",
            },
            {
                "id": "calculator",
                "name": "Calculator",
                "status": "ready",
            },
            {
                "id": "files",
                "name": "Files",
                "status": "ready",
            },
            {
                "id": "code",
                "name": "Code",
                "status": "ready",
            },
        ]
    }

# Serve only public assets; never expose the database or backend source.
@app.get("/{asset_name}", include_in_schema=False)
def frontend_asset(asset_name: str):
    if asset_name not in {"style.css", "script.js", "config.js"}:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(Path(__file__).resolve().parents[1] / asset_name)


# ============================================================
# 19. ENTRYPOINT
# ============================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=HOST,
        port=PORT,
        reload=(
            ENVIRONMENT == "development"
        ),
        log_level=LOG_LEVEL.lower(),
    )