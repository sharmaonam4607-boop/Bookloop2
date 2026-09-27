# BookLoop — Giving Books a Second Chance

A modern, community-driven student book-sharing platform for buying, selling, exchanging, donating, and lending textbooks.

> **Academic Context**: B.Tech Final-Year Project.  
> **Development Model**: Strict Phase-by-Phase implementation.

---

## Current Status: Phase 0 — Foundation Complete

- **Frontend**: Component-driven Modern HTML5 + Modern CSS (Custom Properties, Glassmorphism, Responsive Grid) + ES6+ JavaScript.
- **Backend**: FastAPI modular REST API with CORS middleware and lifecycle management.
- **Database Layer**: SQLAlchemy 2.0 with PostgreSQL target configuration, explicit connection validation, and diagnostics.
- **Environment**: Centralized configuration management with `.env` and `.env.example`.

---

## Project Structure

```
bookloop2/
├── .env.example              # Environment variables template
├── .env                      # Active local configuration
├── .gitignore                # Git ignore rules
├── README.md                 # Project documentation
├── backend/
│   ├── requirements.txt      # Python dependencies
│   ├── run.py                # Backend server runner
│   └── app/
│       ├── main.py           # FastAPI entrypoint & CORS
│       ├── core/
│       │   └── config.py     # Pydantic Settings & environment loader
│       ├── database/
│       │   ├── base.py       # SQLAlchemy DeclarativeBase & TimestampMixin
│       │   └── session.py    # PostgreSQL engine & connection diagnostics
│       ├── schemas/
│       │   └── health.py     # Pydantic response models
│       └── routers/
│           └── health.py     # /api/v1/health monitoring endpoint
└── frontend/
    ├── index.html            # Main SPA dashboard entrypoint
    └── assets/
        ├── css/
        │   ├── variables.css # Design tokens, colors, dark/light theme
        │   ├── reset.css     # CSS reset
        │   ├── components.css# Reusable buttons, cards, badges, pulse rings
        │   └── style.css     # Layout, navbar, and phase matrix
        └── js/
            ├── config.js     # API URLs and app settings
            ├── api.js        # Fetch client with latency benchmarking
            ├── theme.js      # Persistent dark/light theme manager
            ├── router.js     # Lightweight client-side router
            └── app.js        # Main UI controller & live health monitor
```

---

## Quick Start Instructions

### 1. Backend Setup
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```
* The FastAPI server will start on: **http://127.0.0.1:8000**
* Interactive Swagger API docs: **http://127.0.0.1:8000/api/v1/docs**
* Health check endpoint: **http://127.0.0.1:8000/api/v1/health**

### 2. Frontend Setup

The BookLoop frontend is served through the FastAPI application.

The application is available at:

**http://localhost:8000/app/#/home**

Open this URL in your browser to access the BookLoop application, including the home page, book discovery, communities, chats, library, theme controls, and other features.

