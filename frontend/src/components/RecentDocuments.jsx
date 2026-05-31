import React from "react";
import { FileText, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const RecentDocuments = ({ documents = [], onDocumentClick, formatCreated, formatEdited, onDelete, children }) => {
  const { user } = useAuth();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {children}
      {documents.map((doc) => {
        // Robust check to see if document is owned by someone else (i.e. shared with us)
        const isShared = doc.owner && user && 
          (typeof doc.owner === "object" 
            ? (doc.owner._id !== user.userId && doc.owner._id !== user._id)
            : (doc.owner !== user.userId && doc.owner !== user._id));

        const ownerName = doc.owner && typeof doc.owner === "object"
          ? (doc.owner.firstName ? `${doc.owner.firstName} ${doc.owner.lastName || ""}`.trim() : doc.owner.email)
          : "Another User";

        return (
          <div
            key={doc._id || doc.id}
            onClick={() => onDocumentClick(doc._id || doc.id)}
            className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow hover:border-blue-300 cursor-pointer overflow-hidden transition-all duration-150 flex flex-col group relative"
          >
            {/* Card Thumbnail Area - Minimal Google style */}
            <div className="h-32 bg-slate-50 border-b border-gray-100 flex items-center justify-center">
              <FileText className="w-12 h-12 text-blue-500 opacity-80" />
            </div>
            
            {/* Card Info Area */}
            <div className="p-4 relative flex-grow flex flex-col justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-800 truncate mb-1 pr-7">
                  {doc.title}
                </h4>
                {isShared && (
                  <div className="mb-2">
                    <span className="inline-block bg-red-50 text-red-600 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-red-100">
                      Shared by {ownerName}
                    </span>
                  </div>
                )}
                <p className="text-[11px] text-gray-500 font-medium">
                  {formatCreated ? formatCreated(doc.createdAt) : `Created: ${doc.createdAt || "Unknown"}`}
                </p>
                <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                  {formatEdited ? formatEdited(doc.updatedAt) : `Edited: ${doc.updatedAt || "Unknown"}`}
                </p>
              </div>

            {/* Trash Delete Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(doc._id || doc.id);
              }}
              className="absolute bottom-3 right-3 p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-150"
              title="Move to Trash"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default RecentDocuments;
