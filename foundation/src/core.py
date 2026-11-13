"""Timmy core: isolated workspace memory and approval-gated action requests."""
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(os.environ.get('TIMMY_DB_PATH', 'timmy.sqlite3'))
CONFIG = Path(__file__).resolve().parents[1] / 'config' / 'agents.json'


def connect():
    db = sqlite3.connect(DB_PATH)
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY, workspace TEXT NOT NULL, content TEXT NOT NULL,
      source TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS action_requests (
      id INTEGER PRIMARY KEY, workspace TEXT NOT NULL, action TEXT NOT NULL,
      payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL, reviewed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY, event TEXT NOT NULL, workspace TEXT NOT NULL,
      details TEXT NOT NULL, created_at TEXT NOT NULL
    );''')
    return db


def allowed_workspace(workspace):
    if workspace not in json.loads(CONFIG.read_text())['workspaces']:
        raise ValueError('Unknown workspace')


def now():
    return datetime.now(timezone.utc).isoformat()


def remember(workspace, content, source):
    allowed_workspace(workspace)
    if not source.strip():
        raise ValueError('Memory source required')
    with connect() as db:
        db.execute('INSERT INTO memory(workspace,content,source,created_at) VALUES(?,?,?,?)',
                   (workspace, content, source, now()))


def recall(workspace):
    allowed_workspace(workspace)
    with connect() as db:
        return db.execute('SELECT content,source FROM memory WHERE workspace=? ORDER BY id DESC',
                          (workspace,)).fetchall()


def request_action(workspace, action, payload):
    allowed_workspace(workspace)
    if action not in json.loads(CONFIG.read_text())['approval_required']:
        raise ValueError('Unsupported action; no execution permitted')
    with connect() as db:
        cur = db.execute('INSERT INTO action_requests(workspace,action,payload,created_at) VALUES(?,?,?,?)',
                         (workspace, action, json.dumps(payload), now()))
        db.execute('INSERT INTO audit_log(event,workspace,details,created_at) VALUES(?,?,?,?)',
                   ('action_requested',workspace,str(cur.lastrowid),now()))
        return cur.lastrowid


def review_action(request_id, approve):
    with connect() as db:
        cur = db.execute('UPDATE action_requests SET status=?, reviewed_at=? WHERE id=? AND status="pending"',
                         ('approved' if approve else 'rejected', now(), request_id))
        if cur.rowcount != 1:
            raise ValueError('Pending request not found')
        db.execute('INSERT INTO audit_log(event,workspace,details,created_at) '
                   'SELECT ?,workspace,?,? FROM action_requests WHERE id=?',
                   ('approval_recorded', f'{request_id}:{approve}',now(),request_id))
    # Approval records authorization only; no external side effects are implemented.
