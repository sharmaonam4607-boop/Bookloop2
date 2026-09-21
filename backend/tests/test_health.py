import sys
from pathlib import Path

# Fix Windows console encoding for emoji and unicode characters
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "BookLoop" in data["project"]
    assert data["status"] == "online"
    assert "/api/v1/health" in data["health_check"]
    print("✅ test_root_endpoint PASSED")


def test_health_check_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    
    # Verify top-level structure
    assert data["status"] in ["online", "degraded"]
    assert "BookLoop" in data["project_name"]
    assert "database" in data
    
    # Verify database structure & engine
    db = data["database"]
    assert db["target_engine"] == "PostgreSQL"
    assert "target_url" in db
    assert "message" in db
    
    # Check error reporting fidelity
    if not db["connected"]:
        assert db["error"] is not None
        print(f"ℹ️ Database offline as expected in fresh environment: {db['message']}")
    else:
        print("✅ Database connected to live PostgreSQL instance!")
        
    print("✅ test_health_check_endpoint PASSED")


if __name__ == "__main__":
    test_root_endpoint()
    test_health_check_endpoint()
    print("\n🎉 ALL PHASE 0 BACKEND TESTS PASSED SUCCESSFULLY!")
