"""All tests use a disposable database, never the developer's accounts."""
import os
import tempfile
from pathlib import Path
_test_directory = tempfile.TemporaryDirectory(prefix="swinglens-tests-")
os.environ["DATABASE_URL"] = "sqlite:///" + (Path(_test_directory.name) / "tests.db").as_posix()
os.environ["SECRET_KEY"] = "test-only-signing-secret-with-at-least-32-characters"
os.environ["DEMO_MODE"] = "0"
os.environ["APP_ENV"] = "test"
os.environ.pop("VERCEL", None)

def pytest_sessionfinish(session, exitstatus):
    from app.database import engine
    engine.dispose()
    _test_directory.cleanup()
