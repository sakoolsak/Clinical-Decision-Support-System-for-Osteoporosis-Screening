from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    full_name: str
    password: str
    role: str = "nurse"


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str

    class Config:
        from_attributes = True


class PatientBase(BaseModel):
    hn: str
    first_name: str
    last_name: str
    age: int
    gender: str
    bmi: Optional[float] = None
    smoking: int = 0
    steroid_use: int = 0
    spine_bmd: Optional[float] = None


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    bmi: Optional[float] = None
    smoking: Optional[int] = None
    steroid_use: Optional[int] = None
    spine_bmd: Optional[float] = None


class PatientOut(PatientBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class PredictionOut(BaseModel):
    id: int
    patient_id: int
    risk_score: float
    risk_label: str
    probability: float
    model_version: str
    visualization_json: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
