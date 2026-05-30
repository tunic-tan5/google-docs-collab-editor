import React from "react";
import { Plus } from "lucide-react";

const CreateDocumentCard = ({ onCreateDocument, loading }) => {
  return (
    <button
      onClick={onCreateDocument}
      disabled={loading}
      className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow hover:border-blue-300 cursor-pointer overflow-hidden transition-all duration-150 text-left w-full h-full flex flex-col focus:outline-none focus:ring-2 focus:ring-blue-500 group"
    >
      {/* Thumbnail area with Plus */}
      <div className="h-32 bg-slate-50 border-b border-gray-100 flex items-center justify-center w-full flex-grow">
        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors duration-150">
          <Plus className="w-6 h-6 text-blue-600" />
        </div>
      </div>
      
      {/* Label area */}
      <div className="p-4 w-full bg-white">
        <h4 className="text-sm font-semibold text-gray-800 truncate mb-1">
          Blank Document
        </h4>
        <p className="text-xs text-gray-400">
          Start a new doc
        </p>
      </div>
    </button>
  );
};

export default CreateDocumentCard;
