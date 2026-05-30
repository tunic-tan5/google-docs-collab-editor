import React from "react";
import { Plus } from "lucide-react";

/**
 * FAB – Floating Action Button used to create a new document.
 * Props:
 *   onClick – callback to trigger document creation (DashboardPage passes handleCreateDocument).
 *   creating – boolean indicating if a creation request is in progress; shows a spinner.
 */
export const FAB = ({ onClick, creating }) => (
  <button
    onClick={onClick}
    disabled={creating}
    className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
    aria-label="Create new document"
  >
    {creating ? (
      <svg
        className="animate-spin h-6 w-6 text-white"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v8H4z"
        ></path>
      </svg>
    ) : (
      <Plus size={24} />
    )}
  </button>
);

export default FAB;
