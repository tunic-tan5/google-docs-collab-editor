# Collaborative Google Docs Editor 📑

A modern, highly functional full-stack real-time collaborative rich-text editor designed to mimic the core experience of Google Docs. It leverages TipTap and Yjs CRDTs for robust conflict-free text synchronization, Socket.io for live cursor presence and typing status tracking, and a secure Express/MongoDB backend for user management, version history restoration, interactive comment threads, and soft-delete file recovery.

---

## 🌟 Key Features

### 👤 User Management & Hardened Security
* **Secure Authentication:** Secure user sign-up and login utilizing JSON Web Tokens (JWT) stored safely with `cookie-parser`, alongside secure password hashing managed by `bcryptjs`.
* **Profile Customization:** Fully managed profiles and secure session verification middleware protecting private routes and user operations.
* **Access Control:** Verified access restrictions ensuring only the creator or authorized collaborators can view, edit, or modify document contents.

### 📑 Real-Time Collaborative Rich-Text Editing
* **Multi-User Real-time Sync:** Highly optimized collaborative editing powered by **TipTap Editor** integrated with **Yjs CRDT** structures, ensuring smooth, conflict-free document mergers.
* **Presence & Cursor Tracking:** Real-time visual tracking of collaborators showing their active cursor selections, highlighting ranges, and live typing status indicators.
* **Rich Typography Tools:** Advanced formatting options including text alignment, custom formatting, lists, headings, and bold/underline extensions.

### 💬 Document Commenting & Version History
* **Interactive Engagement:** Collaborators can create dynamic comment threads directly on the document, fostering direct team discussion.
* **Version Restoration:** Tracks comprehensive edit timelines with automatic version commits. Users can review full history and restore documents to any historical state.

### 📊 Clean Dashboard & File Management
* **Smart Auto-Increment Naming:** Automatically names new documents sequentially (`Untitled Document`, `Untitled Document 1`, `Untitled Document 2`) during creation. The logic dynamically checks active files, ensuring renamed or deleted documents correctly free up slots.
* **Ownership Identifiers:** Clear visual separation of files: shared documents display a prominent red `SHARED` badge beside the document title (both on dashboard cards and sidebar lists), while owned documents keep a clean layout.
* **Soft Delete & Trash Bin:** A dedicated trash folder that handles safe soft-deletes (`isDeleted` flag) with full restoration capabilities, so no data is lost by accident.

---

## 🛠️ Tech Stack

### Frontend
* **Framework:** React 19 (via Vite)
* **Rich Text Core:** TipTap Editor (`@tiptap/react`, starter-kit)
* **CRDT Collaboration:** Yjs (`yjs`, `@tiptap/extension-collaboration`)
* **Real-time Engine:** Socket.io Client (`socket.io-client`)
* **Styling:** Tailwind CSS v3
* **Routing:** React Router v7
* **HTTP Client:** Axios
* **Icons:** Lucide React

### Backend
* **Runtime:** Node.js
* **Framework:** Express.js 5
* **Real-time Server:** Socket.io
* **Database:** MongoDB with Mongoose 9 (ODM)
* **Authentication:** JWT (jsonwebtoken), cookie-parser, bcryptjs
* **Environment & Security:** dotenv, CORS

---

## 📁 Project Structure

```markdown
collaborative-document-editor/
├── backend/                  # Node.js & Express API Server
│   ├── middleware/           # Cookie validation & JWT auth middlewares
│   ├── models/               # MongoDB models (User, Document, Comment)
│   ├── routes/               # API router endpoints (users, documents, comments)
│   ├── services/             # Core business logic services (auth, document creation)
│   ├── server.js             # Express app config, DB connection, & Socket.io handlers
│   ├── .env                  # Backend credentials & DB keys
│   └── package.json          # Backend dependencies and run scripts
├── frontend/                 # React 19 Frontend Web Application
│   ├── src/
│   │   ├── components/       # Visual components (Sidebar, RecentDocuments, CreateDocumentCard, Toolbar)
│   │   ├── contexts/         # React Context stores (AuthContext, SocketContext)
│   │   ├── pages/            # Routing views (DashboardPage, EditorPage, LoginPage, RegisterPage)
│   │   ├── services/         # Axios API service instances (api.js)
│   │   ├── index.css         # Global stylesheets & Tailwind directives
│   │   ├── main.jsx          # React DOM mounting entry point
│   │   └── App.jsx           # Main routing & application shell
│   ├── vite.config.js        # Vite compilation configuration
│   ├── vercel.json           # Vercel deployment routing rewrites
│   └── package.json          # Frontend packages and scripts
└── README.md                 # Complete project setup guide
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18 or higher recommended)
* **MongoDB** (Local installation or MongoDB Atlas instance)

### Installation & Run

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd collaborative-document-editor
   ```

2. **Backend Configuration:**
   Navigate into the backend directory:
   ```bash
   cd backend
   npm install
   ```
   Create a `.env` file inside the `backend` folder:
   ```env
   PORT=5000
   DB_URL=your_mongodb_connection_string
   JWT_SECRET_KEY=your_jwt_secret_key
   ```
   Start the backend development server:
   ```bash
   npm run dev
   ```

3. **Frontend Configuration:**
   Open a new terminal and navigate to the frontend directory:
   ```bash
   cd ../frontend
   npm install
   ```
   Start the frontend development server:
   ```bash
   npm run dev
   ```

4. **Access the Application:**
   Open your browser and navigate to the local address output by Vite (typically `http://localhost:5173`).

---

## 📜 Scripts

### Backend
* `npm start`: Runs the server in production mode (`node server.js`).
* `npm run dev`: Starts the server with nodemon for live development reloading (`nodemon server.js`).

### Frontend
* `npm run dev`: Starts the Vite development server locally.
* `npm run build`: Generates the optimized production build bundle (`dist` folder).
* `npm run preview`: Previews the production build bundle locally.
* `npm run lint`: Runs ESLint syntax and code quality checks.
