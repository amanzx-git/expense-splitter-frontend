---

## 🏗️ System Architecture: A Two-Part Ecosystem

The application is split into **two completely separate systems** that work in harmony. This separation ensures the app is incredibly fast to use, highly secure, and easy to maintain.

```text
  ┌──────────────────────────┐               ┌──────────────────────────┐               ┌──────────────────────────┐
  │      FRONTEND (Client)   │               │     BACKEND (Server)     │               │    DATABASE (Storage)    │
  │     React 18 + Vite      │  ───JSON───>  │   Django REST Framework  │  ────ORM────> │        PostgreSQL        │
  │  (Runs in User Browser)  │  <──Session─  │ (Runs on Secured Server) │               │   (Persistent Storage)   │
  └──────────────────────────┘               └──────────────────────────┘               └──────────────────────────┘
```

### 🎨 Part 1: The Frontend (The Visual Experience)
*   **What it is:** Built using **React 18** and **Vite**, this is everything the user sees, clicks, and interacts with in their web browser.
*   **What it handles:** 
    *   Smooth, instant page navigation and responsive viewports (Mobile, Tablet, Desktop).
    *   Form collection, real-time input limits, and helpful loading wheels.
    *   The offline **Quick Split** engine that calculates math in memory instantly without touching a database.
    *   Generating and displaying secure informational UPI QR codes for easy mobile scanning.

### 🛡️ Part 2: The Backend (The Brain & Security)
*   **What it is:** Powered by **Django REST Framework**, this runs on a secure remote server and guards all data logic.
*   **What it handles:**
    *   User accounts, password encryption, secure session logins, and email verification.
    *   **Strict Security Rules:** The frontend might hide a button to look clean, but the backend double-checks *every single request* to ensure members can never alter frozen logs, self-confirm payments, or peek into private groups.
    *   **Data Serialization & Locking:** Uses robust database locks to prevent "race conditions" (e.g., two admins clicking split simultaneously).
    *   **Data Persistence:** Saves all historical details cleanly to a **PostgreSQL database**.

---

## 🛠️ How to Use and Develop on the Two Parts

The frontend speaks to the backend using **JSON text data** across a secured development proxy network vector.

### 👨‍💻 Developing Locally

When building the project on your local machine, you run both environments side by side:

1.  **Boot the Backend (Port `8000`):** Start the Django server. This launches the data API and mounts your database loops.
2.  **Boot the Frontend (Port `5173`):** Start the Vite development runner.
3.  **The Invisible Proxy Bridge:** A built-in connection in the frontend detects requests sent to `/api` or `/media` and forwards them to port `8000`. This eliminates complex cross-origin security errors (`CORS`) and simulates an authentic production environment out of the box.

### 🚀 Deploying to Production
Because the systems are modular, they can be deployed independently:
*   The **Frontend** can be hosted on ultra-fast content delivery networks (CDNs like Vercel or Netlify) for near-instant page load times globally.
*   The **Backend** can live inside an isolated cloud instance (like AWS, Heroku, or DigitalOcean) behind a secure firewall protecting the PostgreSQL database stack.

