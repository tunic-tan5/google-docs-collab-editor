import React from "react";
import { Search, LogOut, User } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const Toolbar = ({ searchQuery, setSearchQuery }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="toolbar">
      <div className="flex items-center space-x-3">
        {/* Simple Docs logo */}
        <svg height="24" viewBox="0 0 24 24" fill="#1a73e8" xmlns="http://www.w3.org/2000/svg" className="mr-2">
          <text x="0" y="20" fontFamily="'Inter', sans-serif" fontSize="20" fontWeight="600">Docs</text>
        </svg>
        <span className="text-xl font-bold text-slate-900">My Drive</span>
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="text"
          placeholder="Search docs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <button
          onClick={logout}
          className="flex items-center space-x-1 rounded-md bg-gray-100 px-2 py-1 text-sm text-slate-700 hover:bg-gray-200"
        >
          <LogOut size={16} />
          <span>{user?.firstName ? `${user.firstName}` : "Sign Out"}</span>
        </button>
      </div>
    </header>
  );
};

export default Toolbar;
