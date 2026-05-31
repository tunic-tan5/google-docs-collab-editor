import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api from "../services/api";
import Sidebar from "../components/Sidebar";
import ProfileMenu from "../components/ProfileMenu";
import CreateDocumentCard from "../components/CreateDocumentCard";
import RecentDocuments from "../components/RecentDocuments";

export const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [trashDocs, setTrashDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Fetch documents from backend
  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const activeRes = await api.get("/api/documents/getalldocs");
      const trashRes = await api.get("/api/documents/gettrashdocs");
      
      const serverDocs = activeRes.data?.success ? activeRes.data.documents : [];
      const serverTrash = trashRes.data?.success ? trashRes.data.documents : [];

      setDocuments(serverDocs);
      setTrashDocs(serverTrash);
    } catch (err) {
      console.warn("Backend API not reachable.");
      setDocuments([]);
      setTrashDocs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Create new document and navigate to the editor page
  const handleCreateDocument = async () => {
    setCreating(true);
    try {
      const res = await api.post("/api/documents/create");
      if (res.data && res.data.success) {
        navigate(`/documents/${res.data.document._id}`);
        return;
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.message) {
        const msg = err.response.data.message;
        if (msg.includes("Name already used")) {
          alert(msg);
          setCreating(false);
          return;
        }
      }
      console.warn("Failed to create document on server, creating a local session.");
    }
    
    // Generate simple random mock id for offline use
    const mockId = Math.random().toString(36).substring(7);
    navigate(`/documents/${mockId}`);
    setCreating(false);
  };

  const handleTrashDocument = async (docId) => {
    if (!window.confirm("Are you sure you want to move this document to Trash?")) return;
    
    try {
      const res = await api.put(`/api/documents/${docId}/trash`);
      if (res.data && res.data.success) {
        await fetchDocuments();
        return;
      }
    } catch (err) {
      console.warn("Backend trash API failed, updating local state.");
    }

    // Local mock state update
    const docToTrash = documents.find((doc) => (doc._id || doc.id) === docId);
    if (docToTrash) {
      setDocuments(documents.filter((doc) => (doc._id || doc.id) !== docId));
      setTrashDocs([...trashDocs, { 
        ...docToTrash, 
        updatedAt: new Date().toISOString() 
      }]);
    }
  };

  const handleDocumentClick = (docId) => {
    navigate(`/documents/${docId}`);
  };

  const formatCreated = (dateString) => {
    if (!dateString) return "Created: Unknown";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return `Created: ${dateString}`;

    const formattedDate = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
    return `Created: ${formattedDate}`;
  };

  const formatEdited = (dateString) => {
    if (!dateString) return "Edited: Unknown";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return `Edited: ${dateString}`;

    const formattedTime = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
    return `Edited: ${formattedTime}`;
  };

  return (
    <div className="flex min-h-screen bg-white font-sans">
      {/* 1. LEFT SIDEBAR */}
      <Sidebar 
        documents={documents} 
        trashDocs={trashDocs} 
        onDocumentClick={handleDocumentClick} 
        onLogout={logout}
      />

      {/* Main Content Pane */}
      <main className="flex-1 pl-64 min-w-0 flex flex-col min-h-screen">
        
        {/* 2. TOP RIGHT HEADER */}
        <header className="h-20 px-8 flex items-center justify-between border-b border-gray-100 bg-white flex-shrink-0">
          {/* Left/Middle: Tagline */}
          <div className="hidden md:block max-w-3xl">
            <p className="text-2xl font-black text-blue-600 tracking-wide">
              COLLABORATE. CODE. CREATE <span className="font-medium text-slate-800 text-xl normal-case">— in real time.</span>
            </p>
          </div>
          
          <div className="flex-shrink-0 ml-auto">
            <ProfileMenu user={user} onLogout={logout} />
          </div>
        </header>

        {/* 3. CENTER CONTENT */}
        <div className="flex-1 p-8 space-y-8 max-w-5xl mx-auto w-full">
          {/* RECENT DOCUMENTS SECTION (with Blank Document Card inside) */}
          <section className="space-y-6">
            <h2 className="text-base font-semibold text-gray-700 border-b border-gray-100 pb-3">
              Recent Documents
            </h2>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-gray-500">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mr-2"></div>
                Loading documents...
              </div>
            ) : (
              <RecentDocuments 
                documents={documents} 
                onDocumentClick={handleDocumentClick} 
                formatCreated={formatCreated}
                formatEdited={formatEdited}
                onDelete={handleTrashDocument}
              >
                {/* 1. Blank Document Card on the far left */}
                <CreateDocumentCard 
                  onCreateDocument={handleCreateDocument} 
                  loading={creating} 
                />
              </RecentDocuments>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
