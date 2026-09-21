# BookLoop Security & Token Utilities
# Password hashing via PBKDF2-SHA256 and JWT Token generation/validation.

import os
import hmac
import hashlib
import json
import base64
import time
from typing import Optional, Dict, Any

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "bookloop_super_secret_jwt_key_2026_change_in_prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

def hash_password(password: str) -> str:
    """Hash password using PBKDF2-SHA256 with random salt."""
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return base64.b64encode(salt + key).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against stored hash."""
    try:
        data = base64.b64decode(hashed_password.encode('utf-8'))
        salt = data[:16]
        stored_key = data[16:]
        computed_key = hashlib.pbkdf2_hmac('sha256', plain_password.encode('utf-8'), salt, 100000)
        return hmac.compare_digest(stored_key, computed_key)
    except Exception:
        return False

def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def _base64url_decode(data: str) -> bytes:
    padding = '=' * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data + padding)

def create_access_token(data: Dict[str, Any], expires_delta_seconds: Optional[int] = None) -> str:
    """Create a signed JWT access token."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload = data.copy()
    
    expire = int(time.time()) + (expires_delta_seconds if expires_delta_seconds else ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    payload["exp"] = expire
    payload["iat"] = int(time.time())
    
    encoded_header = _base64url_encode(json.dumps(header).encode('utf-8'))
    encoded_payload = _base64url_encode(json.dumps(payload).encode('utf-8'))
    
    signing_input = f"{encoded_header}.{encoded_payload}".encode('utf-8')
    signature = hmac.new(SECRET_KEY.encode('utf-8'), signing_input, hashlib.sha256).digest()
    encoded_signature = _base64url_encode(signature)
    
    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify a signed JWT token."""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        
        encoded_header, encoded_payload, encoded_signature = parts
        signing_input = f"{encoded_header}.{encoded_payload}".encode('utf-8')
        expected_sig = hmac.new(SECRET_KEY.encode('utf-8'), signing_input, hashlib.sha256).digest()
        actual_sig = _base64url_decode(encoded_signature)
        
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
            
        payload = json.loads(_base64url_decode(encoded_payload).decode('utf-8'))
        
        if payload.get("exp", 0) < time.time():
            return None
            
        return payload
    except Exception:
        return None
