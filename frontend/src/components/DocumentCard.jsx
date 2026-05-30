import React from "react";
import { FileText, Share2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * DocumentCard – visual card for a single document displayed on the dashboard.
 * Props:
 *   doc: { id, title, owner, shared } – document data.
 *   onOpen, onShare, onDelete – callbacks for actions.
 */
export const DocumentCard = ({ doc, onOpen, onShare, onDelete }) => {
  const navigate = useNavigate();

  const handleOpen = () => {
    if (onOpen) onOpen(doc.id);
    else navigate(`/editor/${doc.id}`);
  };

  const handleShare = (e) => {
    e.stopPropagation();
    if (onShare) onShare(doc.id);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) onDelete(doc.id);
  };

  return (
    <div
      className="doc-card cursor-pointer rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
      onClick={handleOpen}
    >
      <div className="flex items-center space-x-3 mb-2">
        <FileText size={20} className="text-blue-600" />
        <h3 className="text-sm font-medium text-slate-800 truncate flex-1">{doc.title}</h3>
        {doc.shared && (
          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Shared</span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Owner: {doc.owner?.firstName ? `${doc.owner.firstName} ${doc.owner?.lastName || ''}`.trim() || doc.owner?.email || "Me" : "Me"}</span>
        <div className="flex space-x-2">
          <button onClick={handleShare} className="text-slate-400 hover:text-slate-600" title="Share">
            <Share2 size={16} />
          </button>
          <button onClick={handleDelete} className="text-red-400 hover:text-red-600" title="Delete">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DocumentCard;
