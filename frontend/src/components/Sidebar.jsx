import React from "react";
import { FileText, Trash2, BookOpen, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

// DocumentsList component
export const DocumentsList = ({ documents = [], onDocumentClick }) => {
  const { user } = useAuth();

  if (documents.length === 0) {
    return <p className="text-xs text-gray-400 px-4 py-2 italic">No active documents</p>;
  }

  return (
    <ul className="space-y-1 px-2">
      {documents.map((doc) => {
        const isOwner = doc.owner && user &&
          (typeof doc.owner === "object"
            ? (doc.owner._id === user.userId || doc.owner._id === user._id)
            : (doc.owner === user.userId || doc.owner === user._id));

        return (
          <li key={doc._id || doc.id}>
            <button
              onClick={() => onDocumentClick(doc._id || doc.id)}
              className="w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-200 transition-colors duration-150 flex items-center justify-between gap-2 min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="truncate">{doc.title}</span>
              </div>
              {isOwner ? (
                <span className="flex-shrink-0 bg-green-50 text-green-700 border border-green-200 text-[8px] font-extrabold tracking-wider px-1.5 py-0.5 rounded uppercase">
                  OWNER
                </span>
              ) : (
                <span className="flex-shrink-0 bg-blue-50 text-blue-700 border border-blue-200 text-[8px] font-extrabold tracking-wider px-1.5 py-0.5 rounded uppercase">
                  SHARED
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

// TrashList component
export const TrashList = ({ trashDocs = [], onDocumentClick }) => {
  if (trashDocs.length === 0) {
    return <p className="text-xs text-gray-400 px-4 py-2 italic">Trash is empty</p>;
  }

  return (
    <ul className="space-y-1 px-2">
      {trashDocs.map((doc) => (
        <li key={doc._id || doc.id}>
          <button
            onClick={() => onDocumentClick(doc._id || doc.id)}
            className="w-full text-left px-3 py-2 rounded-md text-sm text-gray-500 hover:bg-gray-200 transition-colors duration-150 flex items-center gap-2 truncate"
          >
            <Trash2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="truncate line-through decoration-gray-400">{doc.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

// Sidebar component
const Sidebar = ({ documents = [], trashDocs = [], onDocumentClick, onLogout }) => {
  return (
    <aside className="w-64 bg-gray-100 border-r border-gray-200 flex flex-col h-screen fixed left-0 top-0 z-30">
      {/* App Logo */}
      <div className="p-5 border-b border-gray-200 flex items-center gap-2.5">
        <div className="w-8 h-9 rounded bg-blue-600 flex items-center justify-center shadow-sm">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <span className="font-semibold text-lg text-gray-800 tracking-tight">
          DocCollab
        </span>
      </div>

      {/* Navigation Area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-6">
        {/* Documents Section */}
        <div>
          <h3 className="px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Documents
          </h3>
          <DocumentsList documents={documents} onDocumentClick={onDocumentClick} />
        </div>

        {/* Trash Section */}
        <div>
          <h3 className="px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 font-medium">
            Trash
          </h3>
          <TrashList trashDocs={trashDocs} onDocumentClick={onDocumentClick} />
        </div>
      </div>

      {/* Bottom Signout Button */}
      <div className="p-4 border-t border-gray-200 mt-auto">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors duration-150"
        >
          <LogOut className="w-4 h-4 text-gray-500" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
