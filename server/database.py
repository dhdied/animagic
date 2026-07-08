# database.py
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Boolean, DateTime, JSON
from sqlalchemy.orm import sessionmaker, declarative_base

SQLALCHEMY_DATABASE_URL = "sqlite:///./ocean.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class FishRecord(Base):
    __tablename__ = "fishes"

    id = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    payload = Column(JSON, nullable=False) 
    
    is_active = Column(Boolean, default=True)