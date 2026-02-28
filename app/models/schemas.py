from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class User(BaseModel):
    id: str
    username: str
    password_hash: str
    email: Optional[str] = None
    api_key: Optional[str] = None


class UserSettings(BaseModel):
    user_id: str
    api_key: Optional[str] = None
    preferences: dict = Field(default_factory=dict)


class ChatMessage(BaseModel):
    id: str
    conversation_id: str
    user_id: str
    role: str  # user / assistant / system / tool
    content: str
    files: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Conversation(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    message_ids: List[str] = Field(default_factory=list)


class AutomationTask(BaseModel):
    id: str
    user_id: str
    description: str
    steps: List[dict] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = "pending"

