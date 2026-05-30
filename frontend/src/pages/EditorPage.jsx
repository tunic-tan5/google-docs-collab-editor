import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";
import api from "../services/api";

/* ---------------- TIPTAP & PROSEMIRROR ---------------- */
import { useEditor, EditorContent, Extension, Mark, mergeAttributes } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/* ---------------- ICONS ---------------- */
import {
  ArrowLeft,
  FileText,
  Share2,
  AlertCircle,
  Loader2,
  CloudCheck,
  Undo,
  Redo,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Code,
  Quote,
  Eye,
  Lock,
  Users,
  History,
  X,
  Underline as UnderlineIcon,
  Download,
  FileDown,
  ChevronDown,
  MessageSquare,
  Search,
  Heading1,
  Heading2,
  Maximize2,
  Minimize2,
  PlusSquare,
  BookOpen,
  Star,
  Compass,
  Pencil,
  UserMinus
} from "lucide-react";

/* ---------------- COLLABORATIVE CURSORS CONFIG ---------------- */
const cursorsPluginKey = new PluginKey("collaborative-cursors");

const CollaborativeCursorsExtension = Extension.create({
  name: "collaborativeCursors",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: cursorsPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, value) {
            const cursors = tr.getMeta("updateCursors");
            if (cursors) {
              const decorations = [];
              Object.entries(cursors).forEach(([userId, cursor]) => {
                if (!cursor || !cursor.range) return;
                const { from } = cursor.range;

                // Ensure position is valid inside the document boundaries
                if (from > tr.doc.content.size) return;

                // Create Caret Line
                const caret = document.createElement("span");
                caret.className = "collab-caret";
                caret.style.borderLeft = `2px solid ${cursor.color}`;
                caret.style.position = "relative";
                caret.style.marginLeft = "-1px";
                caret.style.marginRight = "-1px";
                caret.style.display = "inline-block";
                caret.style.height = "1.2em";
                caret.style.verticalAlign = "text-bottom";

                // Create floating Name Label
                const label = document.createElement("span");
                label.className = "collab-cursor-label";
                label.textContent = cursor.name;
                label.style.backgroundColor = cursor.color;
                label.style.color = "#ffffff";
                label.style.fontSize = "10px";
                label.style.fontWeight = "bold";
                label.style.padding = "1px 4.5px";
                label.style.borderRadius = "2px";
                label.style.position = "absolute";
                label.style.top = "-16px";
                label.style.left = "0";
                label.style.whiteSpace = "nowrap";
                label.style.zIndex = "10";
                label.style.pointerEvents = "none";
                label.style.lineHeight = "normal";
                label.style.opacity = "0.9";

                caret.appendChild(label);
                decorations.push(Decoration.widget(from, caret));
              });
              return DecorationSet.create(tr.doc, decorations);
            }
            return value.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

const COLLAB_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // yellow
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

const getCollaboratorColor = (userId) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLLAB_COLORS.length;
  return COLLAB_COLORS[index];
};

/* ---------------- TIPTAP FONT SIZE EXTENSION ---------------- */
const FontSizeExtension = Mark.create({
  name: "fontSize",

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => element.style.fontSize,
        renderHTML: (attributes) => {
          if (!attributes.size) {
            return {};
          }
          return {
            style: `font-size: ${attributes.size}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[style*=font-size]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) => {
          return chain().setMark("fontSize", { size }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain().unsetMark("fontSize").run();
        },
    };
  },
});

/* ---------------- TIPTAP EDITOR EXTENSIONS ---------------- */
const editorExtensions = [
  StarterKit,
  Underline,
  TextAlign.configure({
    types: ["heading", "paragraph"],
  }),
  CollaborativeCursorsExtension,
  FontSizeExtension,
];

export const EditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();

  /* ---------------- STATES ---------------- */
  const [docData, setDocData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("Untitled Document");
  const [isReadOnly, setIsReadOnly] = useState(true);
  const titleInputRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState("Saved to cloud");
  const [onlineCollaborators, setOnlineCollaborators] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [collaboratorCursors, setCollaboratorCursors] = useState({});

  /* ---------------- SIDEBARS STATES ---------------- */
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [rightActiveTab, setRightActiveTab] = useState("comments"); // "comments", "history"
  const [isZenMode, setIsZenMode] = useState(false);

  /* ---------------- DOCUMENT ZOOM ---------------- */
  const [zoomLevel, setZoomLevel] = useState(100); 

  /* ---------------- MOCK COMMENTS & OUTLINE ---------------- */
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [isOutlineStarred, setIsOutlineStarred] = useState(false);

  /* ---------------- DYNAMIC HEADINGS MAP ---------------- */
  const [documentOutline, setDocumentOutline] = useState([]);

  /* ---------------- NOTION-STYLE PALETTES ---------------- */
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuCoords, setSlashMenuCoords] = useState({ top: 0, left: 0 });
  const [showBubbleMenu, setShowBubbleMenu] = useState(false);
  const [bubbleCoords, setBubbleCoords] = useState({ top: 0, left: 0 });

  /* ---------------- SHARE MODAL ---------------- */
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("viewer");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareSuccess, setShareSuccess] = useState("");

  /* ---------------- VERSION HISTORY & PREVIEW ---------------- */
  const [versionPreview, setVersionPreview] = useState(null); 
  const [restoring, setRestoring] = useState(false);

  /* ---------------- FORMAT DROPDOWNS ---------------- */
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const [showHeadingDropdown, setShowHeadingDropdown] = useState(false);
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);

  const [documentFont, setDocumentFont] = useState("font-inter"); 
  const [documentFontSize, setDocumentFontSize] = useState("text-[15px]"); 

  /* ---------------- REFS FOR CLOSURES ---------------- */
  const titleRef = useRef(title);
  const isReadOnlyRef = useRef(isReadOnly);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    isReadOnlyRef.current = isReadOnly;
  }, [isReadOnly]);

  /* ---------------- CONTROL REFS ---------------- */
  const ignoreUpdate = useRef(false);
  const stopTypingTimeout = useRef(null);
  const isTyping = useRef(false);
  const autoSaveTimeout = useRef(null);

  /* ---------------- TIPTAP EDITOR ---------------- */
  const editor = useEditor({
    extensions: editorExtensions,
    immediatelyRender: false,
    content: {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
    editable: false,
    onUpdate: ({ editor }) => {
      if (ignoreUpdate.current) return;

      /* ---------------- SOCKET REALTIME ---------------- */
      if (socket) {
        socket.emit("send-changes", {
          documentId: id,
          content: editor.getJSON(),
        });
      }

      /* ---------------- TYPING INDICATOR ---------------- */
      handleUserTyping();

      /* ---------------- AUTOSAVE ---------------- */
      triggerAutoSave(editor.getJSON(), titleRef.current);

      /* ---------------- SCAN OUTLINE ---------------- */
      updateOutlineMap();
    },
    onSelectionUpdate: ({ editor }) => {
      if (ignoreUpdate.current) return;

      /* ---------------- REALTIME CURSOR MOVE ---------------- */
      if (socket && !isReadOnlyRef.current && !versionPreview) {
        const { from, to } = editor.state.selection;
        socket.emit("cursor-move", {
          documentId: id,
          range: { from, to },
        });
      }

      /* ---------------- BUBBLE MENU POPUP COORDINATES ---------------- */
      const { empty } = editor.state.selection;
      if (empty || isReadOnlyRef.current || versionPreview) {
        setShowBubbleMenu(false);
        return;
      }

      try {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setBubbleCoords({
            top: window.scrollY + rect.top - 46,
            left: window.scrollX + rect.left + rect.width / 2 - 100,
          });
          setShowBubbleMenu(true);
        }
      } catch (err) {
        setShowBubbleMenu(false);
      }
    },
  });

  // Dynamic Outliner DOM Scanner
  const updateOutlineMap = () => {
    if (!editor || editor.isDestroyed) return;
    try {
      const headings = [];
      const headingElements = editor.view.dom.querySelectorAll("h1, h2, h3, h4");
      headingElements.forEach((el, index) => {
        headings.push({
          id: `heading-${index}`,
          text: el.textContent || "Heading Block",
          level: parseInt(el.tagName.charAt(1)),
          element: el,
        });
      });
      setDocumentOutline(headings);
    } catch (e) {
      console.error("Outline scan failed:", e);
    }
  };

  // Scroll smoothly to Outlined heading blocks
  const handleScrollToHeading = (heading) => {
    if (heading.element) {
      heading.element.scrollIntoView({ behavior: "smooth", block: "center" });
      heading.element.style.transition = "background-color 0.4s ease";
      heading.element.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
      setTimeout(() => {
        heading.element.style.backgroundColor = "transparent";
      }, 800);
    }
  };

  /* ---------------- COMMENTS SUBMISSION ---------------- */
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    try {
      const res = await api.post("/api/comments/add", {
        documentId: id,
        text: newCommentText,
      });

      if (res.data && res.data.success) {
        const savedComment = res.data.comment;
        setComments((prev) => [...prev, savedComment]);

        if (socket) {
          socket.emit("new-comment", {
            documentId: id,
            comment: savedComment,
          });
        }

        setNewCommentText("");
      }
    } catch (err) {
      console.error("Failed to add comment:", err);
      alert("Failed to post comment. " + (err.response?.data?.message || ""));
    }
  };

  /* ---------------- NOTION-STYLE PALETTE SLASH MENU ---------------- */
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e) => {
      if (e.key === "/") {
        setTimeout(() => {
          const { $from } = editor.state.selection;
          const text = $from.parent.textContent;
          if (text === "/" || text.trim() === "/") {
            try {
              const selection = window.getSelection();
              if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                setSlashMenuCoords({
                  top: window.scrollY + rect.bottom + 6,
                  left: window.scrollX + rect.left,
                });
                setShowSlashMenu(true);
              }
            } catch (err) {
              setShowSlashMenu(false);
            }
          }
        }, 50);
      } else if (e.key === "Escape" || e.key === " ") {
        setShowSlashMenu(false);
      }
    };

    editor.view.dom.addEventListener("keydown", handleKeyDown);
    return () => {
      if (editor.view.dom) {
        editor.view.dom.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [editor]);

  const handleInsertBlock = (type) => {
    if (!editor) return;
    
    editor.chain().focus().deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from }).run();

    if (type === "h1") {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    } else if (type === "h2") {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    } else if (type === "bullet") {
      editor.chain().focus().toggleBulletList().run();
    } else if (type === "number") {
      editor.chain().focus().toggleOrderedList().run();
    } else if (type === "quote") {
      editor.chain().focus().toggleBlockquote().run();
    } else if (type === "code") {
      editor.chain().focus().toggleCodeBlock().run();
    } else if (type === "divider") {
      editor.chain().focus().setHorizontalRule().run();
    } else if (type === "table") {
      editor.chain().focus().insertContent("<table><tbody><tr><td>Header 1</td><td>Header 2</td></tr><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody></table>").run();
    }
    
    setShowSlashMenu(false);
  };

  /* ---------------- TYPING ---------------- */
  const handleUserTyping = () => {
    if (!socket) return;

    if (!isTyping.current) {
      isTyping.current = true;
      socket.emit("typing-start", { documentId: id });
    }

    if (stopTypingTimeout.current) {
      clearTimeout(stopTypingTimeout.current);
    }

    stopTypingTimeout.current = setTimeout(() => {
      isTyping.current = false;
      socket.emit("typing-stop", { documentId: id });
    }, 2000);
  };

  /* ---------------- AUTOSAVE ---------------- */
  const triggerAutoSave = (content, currentTitle) => {
    setSaveStatus("Saving...");

    if (autoSaveTimeout.current) {
      clearTimeout(autoSaveTimeout.current);
    }

    autoSaveTimeout.current = setTimeout(async () => {
      try {
        await api.put(`/api/documents/updatedoc/${id}`, {
          title: currentTitle,
          content,
        });

        setSaveStatus("Saved to cloud");

        const res = await api.get(`/api/documents/getdoc/${id}`);
        if (res.data && res.data.success) {
          setDocData(res.data.document);
        }
      } catch (err) {
        console.error("Autosave error:", err);
        setSaveStatus("Error saving");

        if (err.response && err.response.data && err.response.data.message) {
          const msg = err.response.data.message;
          if (msg.includes("Name already used")) {
            alert(msg);
            // Revert title to previous valid title
            if (docData) {
              const previousTitle = docData.title || "Untitled Document";
              setTitle(previousTitle);
              if (socket) {
                socket.emit("title-update", {
                  documentId: id,
                  title: previousTitle,
                });
              }
            }
          }
        }
      }
    }, 1500);
  };

  /* ---------------- TITLE EDIT HANDLERS ---------------- */
  const handleRenameClick = () => {
    if (titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  };

  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);

    if (socket) {
      socket.emit("title-update", {
        documentId: id,
        title: newTitle,
      });
    }

    if (editor && !versionPreview) {
      triggerAutoSave(editor.getJSON(), newTitle);
    }
  };

  const handleTitleBlur = () => {
    if (!title.trim()) {
      const defaultTitle = "Untitled Document";
      setTitle(defaultTitle);

      if (socket) {
        socket.emit("title-update", {
          documentId: id,
          title: defaultTitle,
        });
      }

      if (editor && !versionPreview) {
        triggerAutoSave(editor.getJSON(), defaultTitle);
      }
    }
  };

  /* ---------------- FETCH DOCUMENT ---------------- */
  useEffect(() => {
    if (!editor) return;
    let active = true;

    const fetchDoc = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/documents/getdoc/${id}`);
        
        if (!active) return;

        if (res.data.success) {
          const doc = res.data.document;
          setDocData(doc);
          setTitle(doc.title || "Untitled Document");

          // Fetch persistent comments
          try {
            const commentsRes = await api.get(`/api/comments/${id}`);
            if (active && commentsRes.data.success) {
              setComments(commentsRes.data.comments);
            }
          } catch (commentErr) {
            console.error("Error fetching comments:", commentErr);
          }

          /* ---------------- ACCESS & PERMISSIONS ---------------- */
          const ownerId = (doc.owner?._id || doc.owner || "").toString();
          const currentUserId = (user?._id || user?.userId || "").toString();
          const isOwner = ownerId === currentUserId;

          const collaborator = doc.collaborators?.find((c) => {
            const collabId = (c.user?._id || c.user || "").toString();
            return collabId === currentUserId;
          });

          const hasEditAccess = isOwner || collaborator?.role === "editor";
          setIsReadOnly(!hasEditAccess);

          /* ---------------- SAFE CONTENT INTEGRITY ---------------- */
          const safeContent =
            doc.content &&
            typeof doc.content === "object" &&
            doc.content.type === "doc"
              ? doc.content
              : {
                  type: "doc",
                  content: [{ type: "paragraph" }],
                };

          ignoreUpdate.current = true;
          
          if (editor && !editor.isDestroyed) {
            editor.commands.setContent(safeContent);
            editor.setEditable(hasEditAccess);
          }
          
          ignoreUpdate.current = false;
          setTimeout(updateOutlineMap, 200);
        }
      } catch (err) {
        console.error("Error fetching document:", err);
        if (active) {
          setError(
            err.response?.data?.message || "Failed to load document. Please check permissions."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchDoc();

    return () => {
      active = false;
    };
  }, [editor, id, user?._id]);

  /* ---------------- SOCKET SYNCHRONIZATION ---------------- */
  useEffect(() => {
    if (!socket || !editor || !id) return;

    socket.emit("join-document", id);

    /* ---------------- RECEIVE CHANGES ---------------- */
    socket.on("receive-changes", (content) => {
      if (versionPreview) return;

      ignoreUpdate.current = true;
      const safeContent =
        content && content.type === "doc"
          ? content
          : {
              type: "doc",
              content: [{ type: "paragraph" }],
            };

      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(safeContent);
      }
      ignoreUpdate.current = false;
      setTimeout(updateOutlineMap, 200);
    });

    /* ---------------- RECEIVE TITLE UPDATES ---------------- */
    socket.on("title-updated", (newTitle) => {
      if (versionPreview) return;
      setTitle(newTitle);
    });

    /* ---------------- ONLINE PRESENCE & CLEANUP ---------------- */
    socket.on("presence-update", (users) => {
      const currentUserId = (user?._id || user?.userId || "").toString();
      const filtered = users.filter((u) => u.userId !== currentUserId);
      setOnlineCollaborators(filtered);

      const onlineUserIds = new Set(filtered.map((u) => u.userId));
      setCollaboratorCursors((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((uid) => {
          if (!onlineUserIds.has(uid)) {
            delete next[uid];
          }
        });
        return next;
      });
    });

    /* ---------------- TYPING INDICATORS ---------------- */
    socket.on("user-typing", ({ userId, name, typing }) => {
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (typing) {
          next[userId] = name || "Someone";
        } else {
          delete next[userId];
        }
        return next;
      });
    });

    /* ---------------- COLLABORATIVE CURSORS SYNC ---------------- */
    socket.on("cursor-moved", ({ userId, name, range }) => {
      if (versionPreview) return;
      
      setCollaboratorCursors((prev) => ({
        ...prev,
        [userId]: {
          name,
          range,
          color: getCollaboratorColor(userId),
        },
      }));
    });

    /* ---------------- RECEIVE COMMENTS ---------------- */
    socket.on("receive-comment", (newComment) => {
      setComments((prev) => [...prev, newComment]);
    });

    return () => {
      socket.off("receive-changes");
      socket.off("title-updated");
      socket.off("presence-update");
      socket.off("user-typing");
      socket.off("cursor-moved");
      socket.off("receive-comment");
    };
  }, [socket, editor, id, user?._id, versionPreview]);

  /* ---------------- PROSEMIRROR DECORATION DISPATCHER ---------------- */
  useEffect(() => {
    if (!editor || editor.isDestroyed || versionPreview) return;

    editor.view.dispatch(
      editor.state.tr.setMeta("updateCursors", collaboratorCursors)
    );
  }, [collaboratorCursors, editor, versionPreview]);

  /* ---------------- VERSION PREVIEW HANDLERS ---------------- */
  const handlePreviewVersion = (version) => {
    setVersionPreview(version);
    ignoreUpdate.current = true;
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(version.content);
      editor.setEditable(false);
    }
    ignoreUpdate.current = false;
  };

  const handleClosePreview = () => {
    setVersionPreview(null);
    ignoreUpdate.current = true;
    
    const activeContent = docData?.content || {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(activeContent);
      editor.setEditable(!isReadOnly);
    }
    
    ignoreUpdate.current = false;
    setTimeout(updateOutlineMap, 200);
  };

  const handleRestoreVersion = async (version) => {
    try {
      setRestoring(true);
      const res = await api.post(`/api/documents/${id}/restore`, {
        versionId: version._id,
      });

      if (res.data && res.data.success) {
        const restoredDoc = res.data.document;
        setDocData(restoredDoc);
        setTitle(restoredDoc.title);
        setVersionPreview(null);

        ignoreUpdate.current = true;
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(restoredDoc.content);
          editor.setEditable(!isReadOnly);
        }
        ignoreUpdate.current = false;

        if (socket) {
          socket.emit("send-changes", {
            documentId: id,
            content: restoredDoc.content,
          });
          socket.emit("title-update", {
            documentId: id,
            title: restoredDoc.title,
          });
        }

        setSaveStatus("Saved to cloud");
        setIsRightSidebarOpen(false);
        setTimeout(updateOutlineMap, 200);
      }
    } catch (err) {
      console.error("Restoring version failed:", err);
      alert("Failed to restore selected version. " + (err.response?.data?.message || ""));
    } finally {
      setRestoring(false);
    }
  };

  /* ---------------- SHARE DOCUMENT HANDLERS & MANAGEMENT ---------------- */
  const [copied, setCopied] = useState(false);

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareSubmit = async (e) => {
    e.preventDefault();
    setShareError("");
    setShareSuccess("");

    if (!shareEmail.trim()) {
      setShareError("Please enter a valid email address.");
      return;
    }

    const emailInput = shareEmail.toLowerCase().trim();

    // Prevent duplicate collaborator additions dynamically
    if (docData?.owner?.email?.toLowerCase() === emailInput) {
      setShareError("This user already has access.");
      return;
    }

    const isAlreadyCollaborator = docData?.collaborators?.some(
      (c) => c.user?.email?.toLowerCase() === emailInput
    );

    if (isAlreadyCollaborator) {
      setShareError("This user already has access.");
      return;
    }

    setShareLoading(true);
    try {
      const res = await api.post(`/api/documents/${id}/share`, {
        email: shareEmail,
        role: shareRole,
      });

      if (res.data && res.data.success) {
        setShareSuccess(`Successfully shared with ${shareEmail} as ${shareRole}!`);
        setShareEmail("");
        
        if (res.data.document) {
          setDocData(res.data.document);
        }
      }
    } catch (err) {
      setShareError(err.response?.data?.message || "Failed to share document.");
    } finally {
      setShareLoading(false);
    }
  };

  const handleUpdateRole = async (collaboratorUserId, newRole) => {
    try {
      const res = await api.put(`/api/documents/${id}/collaborator`, {
        collaboratorId: collaboratorUserId,
        role: newRole
      });
      if (res.data && res.data.success) {
        setDocData(res.data.document);
      }
    } catch (err) {
      console.error("Failed to update role:", err);
      alert(err.response?.data?.message || "Failed to update collaborator role.");
    }
  };

  const handleRemoveCollaborator = async (collaboratorUserId) => {
    try {
      const res = await api.delete(`/api/documents/${id}/collaborator/${collaboratorUserId}`);
      if (res.data && res.data.success) {
        setDocData(res.data.document);
      }
    } catch (err) {
      console.error("Failed to remove collaborator:", err);
      alert(err.response?.data?.message || "Failed to remove collaborator.");
    }
  };

  /* ---------------- DOCUMENT DOWNLOAD HANDLERS ---------------- */
  const downloadTXT = () => {
    if (!editor) return;
    const textContent = editor.getText();
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "document"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setShowDownloadDropdown(false);
  };

  const downloadHTML = () => {
    if (!editor) return;
    const htmlContent = editor.getHTML();
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "document"}.html`;
    link.click();
    URL.revokeObjectURL(url);
    setShowDownloadDropdown(false);
  };

  const downloadPDF = () => {
    window.print();
    setShowDownloadDropdown(false);
  };

  /* ---------------- COMPONENT SCOPE OWNERSHIP DERIVATION ---------------- */
  const currentUserId = (user?._id || user?.userId || "").toString();
  const isOwner = docData ? (docData.owner?._id || docData.owner || "").toString() === currentUserId : false;

  const getAvatarColor = (name) => {
    const colors = [
      "bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-indigo-500", 
      "bg-pink-500", "bg-amber-500", "bg-rose-500", "bg-violet-500"
    ];
    if (!name) return colors[0];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const isUserOnline = (userId) => {
    const isSelf = userId === currentUserId;
    const isCollabOnline = onlineCollaborators.some((oc) => oc.userId === userId);
    return isSelf || isCollabOnline;
  };

  // Words / Characters Metrics
  const wordCount = editor ? editor.storage.characterCount?.words?.() || editor.getText().split(/\s+/).filter(Boolean).length : 0;
  const charCount = editor ? editor.getText().length : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative font-sans overflow-hidden select-none">
      
      {/* 1. TOP FLOATING GLASSMORPHIC HEADER */}
      <header className="mx-4 mt-3 bg-white/85 backdrop-blur-md border border-slate-200/60 px-5 py-2.5 flex items-center justify-between rounded-2xl sticky top-3 z-30 shadow-sm no-print">
        <div className="flex items-center space-x-3.5 flex-1 min-w-0">
          <Link
            to="/"
            title="Go back to Dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all flex-shrink-0"
          >
            <ArrowLeft size={18} />
          </Link>

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md flex-shrink-0">
            <FileText size={20} />
          </div>

          <div className="flex flex-col min-w-0 text-left">
            <div className="flex items-center space-x-2">
              <input
                ref={titleInputRef}
                value={title}
                disabled={isReadOnly || versionPreview}
                onChange={handleTitleChange}
                onBlur={handleTitleBlur}
                className="text-base font-bold bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:outline-none text-slate-800 leading-none py-0.5 truncate transition-all max-w-[240px] font-sans"
                title={isReadOnly ? "View Only Title" : "Rename Document"}
              />
              
              {!isReadOnly && !versionPreview && (
                <button
                  onClick={handleRenameClick}
                  title="Rename Document"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 hover:scale-105 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Pencil size={16} />
                </button>
              )}
              
              {isReadOnly && (
                <div className="flex items-center space-x-1 text-[9px] font-bold bg-slate-100 border border-slate-200/50 text-slate-500 px-2 py-0.5 rounded-full uppercase select-none">
                  <Lock size={9} />
                  <span>Read Only</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-1 select-none font-medium">
              <span className="flex items-center space-x-1">
                <CloudCheck size={13} className={saveStatus === "Saving..." ? "animate-pulse text-blue-500" : "text-emerald-500"} />
                <span>{saveStatus}</span>
              </span>
              <span>•</span>
              <span>Last edited just now</span>
            </div>
          </div>
        </div>

        {/* Header Center Options */}
        <div className="flex items-center space-x-1 border-r border-slate-200 pr-4 mr-4 no-print">
          <button
            onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
            title="Toggle Collaborators Sidebar"
            className={`p-1.5 rounded-lg transition-all ${
              isLeftSidebarOpen ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Users size={16} />
          </button>
          <button
            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
            title="Toggle Chat & Versions Sidebar"
            className={`p-1.5 rounded-lg transition-all ${
              isRightSidebarOpen ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <History size={16} />
          </button>
          <button
            onClick={() => setIsZenMode(!isZenMode)}
            title="Toggle Zen Focus Mode"
            className={`p-1.5 rounded-lg transition-all ${
              isZenMode ? "bg-blue-50 text-blue-600 border border-blue-100" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {isZenMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        {/* Header Right Strip */}
        <div className="flex items-center space-x-4">
          {/* Active typing flags */}
          {Object.keys(typingUsers).length > 0 && (
            <div className="text-xs text-slate-400 font-medium animate-pulse border border-slate-100 bg-slate-50 px-3 py-1 rounded-full flex items-center space-x-1.5 max-w-[200px] truncate">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block animate-ping"></span>
              <span>{Object.values(typingUsers).join(", ")} is typing...</span>
            </div>
          )}

          {/* Dynamic Collaborator Presence Avatars */}
          {onlineCollaborators.length > 0 && (
            <div className="flex items-center -space-x-2">
              {onlineCollaborators.map((c) => {
                const colorHex = getCollaboratorColor(c.userId);
                return (
                  <div
                    key={c.socketId}
                    title={`${c.firstName} ${c.lastName} (${c.email})`}
                    className="relative group cursor-help transition-transform hover:-translate-y-1 hover:z-10"
                  >
                    <div
                      style={{ borderColor: colorHex, backgroundColor: colorHex + "20", color: colorHex }}
                      className="flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white text-xs font-bold uppercase select-none shadow-sm"
                    >
                      {c.firstName?.charAt(0) || "U"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action Triggers */}
          <div className="flex items-center space-x-2 border-l border-slate-200 pl-4 no-print">
            {isOwner && (
              <button
                onClick={() => {
                  setShareError("");
                  setShareSuccess("");
                  setIsShareModalOpen(true);
                }}
                className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs px-4 py-1.5 rounded-xl shadow-sm hover:shadow transition-all cursor-pointer"
              >
                <Share2 size={14} />
                <span>Share</span>
              </button>
            )}
            
            <div
              title={`${user?.firstName || ""} ${user?.lastName || ""}`}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold uppercase select-none cursor-default"
            >
              {user?.firstName?.charAt(0) || "U"}
            </div>
          </div>
        </div>
      </header>

      {/* 2. LIVE VERSION PREVIEW HEADER BANNER */}
      {versionPreview && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-200/60 py-3 px-6 rounded-2xl flex items-center justify-between text-amber-800 z-10 shadow-sm no-print animate-fade-in text-left">
          <div className="flex items-center space-x-2.5">
            <Eye size={18} className="text-amber-600" />
            <div className="text-sm">
              <span className="font-bold">Viewing Version Snapshot</span> saved on{" "}
              <span className="underline font-semibold">
                {new Date(versionPreview.editedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>{" "}
              by <span className="font-bold">{versionPreview.editedBy?.firstName || "Unknown User"}</span>.
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => handleRestoreVersion(versionPreview)}
              disabled={restoring}
              className="flex items-center space-x-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-1.5 rounded shadow transition-all cursor-pointer"
            >
              {restoring ? <Loader2 size={12} className="animate-spin" /> : null}
              <span>Restore This Version</span>
            </button>
            <button
              onClick={handleClosePreview}
              className="border border-amber-300 hover:bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded transition-all cursor-pointer"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

      {/* 3. GROUPED CANVA-STYLE FORMAT RIBBON */}
      {!isReadOnly && editor && !versionPreview && !isZenMode && (
        <div className="mx-4 mt-3 bg-white border border-slate-200/50 px-5 py-2 flex flex-wrap gap-1.5 items-center rounded-2xl shadow-sm toolbar-container no-print text-left">
          {/* Group 1: History */}
          <button
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-all"
            title="Undo"
          >
            <Undo size={15} />
          </button>
          <button
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-all"
            title="Redo"
          >
            <Redo size={15} />
          </button>

          <div className="w-[1px] h-5 bg-slate-200 mx-1.5"></div>

          {/* Group 2: Formatting Dropdowns */}
          {/* Heading Formatting Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowHeadingDropdown(!showHeadingDropdown)}
              className="flex items-center space-x-1 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-all min-w-[110px] justify-between cursor-pointer font-sans"
            >
              <span>
                {editor.isActive("heading", { level: 1 })
                  ? "Heading 1"
                  : editor.isActive("heading", { level: 2 })
                  ? "Heading 2"
                  : editor.isActive("heading", { level: 3 })
                  ? "Heading 3"
                  : editor.isActive("heading", { level: 4 })
                  ? "Heading 4"
                  : "Normal Text"}
              </span>
              <ChevronDown size={12} className="text-slate-400" />
            </button>

            {showHeadingDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowHeadingDropdown(false)}></div>
                <div className="absolute left-0 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg z-20 text-left font-sans">
                  <button
                    onClick={() => {
                      editor.chain().focus().setParagraph().run();
                      setShowHeadingDropdown(false);
                      setTimeout(updateOutlineMap, 100);
                    }}
                    className={`flex w-full items-center px-3 py-2 text-xs hover:bg-slate-50 rounded-lg font-medium ${
                      editor.isActive("paragraph") ? "text-blue-600 bg-blue-50/50" : "text-slate-600"
                    }`}
                  >
                    Normal Text
                  </button>
                  {[1, 2, 3, 4].map((level) => (
                    <button
                      key={level}
                      onClick={() => {
                        editor.chain().focus().toggleHeading({ level }).run();
                        setShowHeadingDropdown(false);
                        setTimeout(updateOutlineMap, 100);
                      }}
                      className={`flex w-full items-center px-3 py-2 text-xs hover:bg-slate-50 rounded-lg ${
                        level === 1 ? "font-bold text-sm" : level === 2 ? "font-semibold text-xs" : "font-medium text-xs"
                      } ${
                        editor.isActive("heading", { level }) ? "text-blue-600 bg-blue-50/50" : "text-slate-600"
                      }`}
                    >
                      Heading {level}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Font Family Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFontDropdown(!showFontDropdown)}
              className="flex items-center space-x-1 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-all min-w-[110px] justify-between cursor-pointer font-sans"
            >
              <span className="capitalize">{documentFont.replace("font-", "")}</span>
              <ChevronDown size={12} className="text-slate-400" />
            </button>

            {showFontDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFontDropdown(false)}></div>
                <div className="absolute left-0 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg z-20 text-left font-sans">
                  {["font-inter", "font-outfit", "font-serif", "font-mono"].map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setDocumentFont(f);
                        setShowFontDropdown(false);
                      }}
                      className={`flex w-full items-center px-3 py-2 text-xs hover:bg-slate-50 rounded-lg font-medium capitalize ${
                        documentFont === f ? "text-blue-600 bg-blue-50/50" : "text-slate-600"
                      }`}
                    >
                      {f.replace("font-", "")}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Point Size Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSizeDropdown(!showSizeDropdown)}
              className="flex items-center space-x-1 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-all min-w-[56px] justify-between cursor-pointer font-sans"
            >
              <span>{editor.getAttributes("fontSize").size || "15px"}</span>
              <ChevronDown size={12} className="text-slate-400" />
            </button>

            {showSizeDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSizeDropdown(false)}></div>
                <div className="absolute left-0 mt-1 w-24 rounded-xl border border-slate-200 bg-white p-1 shadow-lg z-20 text-left max-h-56 overflow-y-auto font-sans">
                  {["10px", "12px", "14px", "16px", "18px", "20px", "24px", "30px", "36px"].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        editor.chain().focus().setFontSize(s).run();
                        setShowSizeDropdown(false);
                      }}
                      className={`flex w-full items-center px-3 py-2 text-xs hover:bg-slate-50 rounded-lg font-medium ${
                        (editor.getAttributes("fontSize").size || "15px") === s ? "text-blue-600 bg-blue-50/50" : "text-slate-600"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="w-[1px] h-5 bg-slate-200 mx-1.5"></div>

          {/* Group 3: Text Formats */}
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded-lg transition-all ${
              editor.isActive("bold")
                ? "bg-blue-100 text-blue-700 font-bold"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Bold"
          >
            <Bold size={15} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded-lg transition-all ${
              editor.isActive("italic")
                ? "bg-blue-100 text-blue-700 font-bold"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Italic"
          >
            <Italic size={15} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded-lg transition-all ${
              editor.isActive("underline")
                ? "bg-blue-100 text-blue-700 font-bold"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Underline"
          >
            <UnderlineIcon size={15} />
          </button>

          <div className="w-[1px] h-5 bg-slate-200 mx-1.5"></div>

          {/* Group 4: Alignments */}
          <button
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={`p-1.5 rounded-lg transition-all ${
              editor.isActive({ textAlign: "left" })
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Align Left"
          >
            <AlignLeft size={15} />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={`p-1.5 rounded-lg transition-all ${
              editor.isActive({ textAlign: "center" })
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Align Center"
          >
            <AlignCenter size={15} />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={`p-1.5 rounded-lg transition-all ${
              editor.isActive({ textAlign: "right" })
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Align Right"
          >
            <AlignRight size={15} />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            className={`p-1.5 rounded-lg transition-all ${
              editor.isActive({ textAlign: "justify" })
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Align Justify"
          >
            <AlignJustify size={15} />
          </button>

          <div className="w-[1px] h-5 bg-slate-200 mx-1.5"></div>

          {/* Group 5: Insert Blocks */}
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded-lg transition-all ${
              editor.isActive("bulletList")
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Bullet List"
          >
            <List size={15} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded-lg transition-all ${
              editor.isActive("orderedList")
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Numbered List"
          >
            <ListOrdered size={15} />
          </button>

          <div className="w-[1px] h-5 bg-slate-200 mx-1.5"></div>

          {/* Advanced Blocks */}
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`p-1.5 rounded-lg transition-all ${
              editor.isActive("codeBlock")
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Code Block"
          >
            <Code size={15} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded-lg transition-all ${
              editor.isActive("blockquote")
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Blockquote"
          >
            <Quote size={15} />
          </button>
          <button
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
            title="Insert Divider"
          >
            <X size={15} className="rotate-45" />
          </button>

          <div className="flex-1"></div>

          {/* Exporter triggers */}
          <div className="relative">
            <button
              onClick={() => setShowDownloadDropdown(!showDownloadDropdown)}
              className="flex items-center space-x-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <FileDown size={14} />
              <span>Download</span>
            </button>

            {showDownloadDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowDownloadDropdown(false)}></div>
                <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg z-20 text-left">
                  <button
                    onClick={downloadTXT}
                    className="flex w-full items-center px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg font-medium"
                  >
                    Plain Text (.txt)
                  </button>
                  <button
                    onClick={downloadHTML}
                    className="flex w-full items-center px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg font-medium"
                  >
                    HTML Code (.html)
                  </button>
                  <button
                    onClick={downloadPDF}
                    className="flex w-full items-center px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg font-medium"
                  >
                    Printable PDF (.pdf)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 4. WORKSPACE CONTENT WRAPPER */}
      <div className="flex-1 flex flex-row overflow-hidden relative bg-slate-50 p-4 gap-4">
        
        {/* LEFT COLLABORATORS SIDEBAR */}
        {isLeftSidebarOpen && !isZenMode && (
          <aside className="w-64 bg-white flex flex-col h-full shrink-0 no-print animate-slide-in relative select-none rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <span className="font-bold text-slate-800 text-sm flex items-center space-x-1.5 text-left">
                <Users size={16} className="text-blue-600" />
                <span>Collaborators</span>
              </span>
              <button
                onClick={() => setIsLeftSidebarOpen(false)}
                className="h-7 w-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* Collaborators List Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 text-left">
              {/* 1. Document Owner */}
              {docData?.owner && (
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Owner
                  </h4>
                  <div className="flex items-center space-x-3 p-2 rounded-xl border border-slate-50 bg-slate-50/30">
                    <div className={`h-8 w-8 rounded-full shrink-0 ${getAvatarColor(docData.owner.firstName || "O")} text-white flex items-center justify-center text-xs font-bold shadow-inner`}>
                      {((docData.owner.firstName?.[0] || "") + (docData.owner.lastName?.[0] || "")).toUpperCase() || "O"}
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-xs font-bold text-slate-800 leading-tight truncate">
                        {`${docData.owner.firstName || ""} ${docData.owner.lastName || ""}`.trim() || "Owner"}
                      </p>
                      <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded mt-1 inline-block">
                        Owner
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Shared Collaborators */}
              <div className="pt-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  Shared People
                </h4>
                
                <div className="space-y-2">
                  {docData?.collaborators && docData.collaborators.length > 0 ? (
                    docData.collaborators.map((collab) => {
                      if (!collab.user) return null;
                      const collabUser = collab.user;
                      const collabUserId = collabUser._id;
                      const name = `${collabUser.firstName || ""} ${collabUser.lastName || ""}`.trim() || "Collaborator";
                      const initials = ((collabUser.firstName?.[0] || "") + (collabUser.lastName?.[0] || "")).toUpperCase() || "C";
                      const isOnline = onlineCollaborators.some((oc) => oc.userId === collabUserId);

                      return (
                        <div key={collabUserId} className="flex items-center justify-between p-2 rounded-xl border border-slate-50 hover:bg-slate-50/40 transition-all gap-2">
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            {/* Profile Avatar */}
                            <div className="relative shrink-0">
                              <div className={`h-8 w-8 rounded-full ${getAvatarColor(collabUser.firstName || "C")} text-white flex items-center justify-center text-xs font-bold shadow-inner`}>
                                {initials}
                              </div>
                              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${isOnline ? "bg-green-500 animate-pulse" : "bg-slate-300"}`} />
                            </div>
                            
                            {/* Name and Role */}
                            <div className="min-w-0 text-left">
                              <p className="text-xs font-bold text-slate-800 leading-tight truncate">
                                {name}
                                {collabUserId === currentUserId && <span className="text-[9px] text-slate-400 font-semibold ml-1">(You)</span>}
                              </p>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-1 inline-block capitalize ${
                                collab.role === "editor" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                              }`}>
                                {collab.role}
                              </span>
                            </div>
                          </div>

                          {/* Remove button */}
                          {(isOwner || collabUserId === currentUserId) && (
                            <button
                              onClick={() => handleRemoveCollaborator(collabUserId)}
                              className="h-7 w-7 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all cursor-pointer shrink-0"
                              title={collabUserId === currentUserId ? "Leave document" : "Remove collaborator"}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-slate-450 border border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
                      <p className="text-xs font-medium text-slate-500">Not shared with anyone yet</p>
                      <p className="text-[9px] text-slate-400 mt-1 px-3">
                        Use the "Share" button in the header to invite other editors or viewers.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* CENTER DOCUMENT CANVAS AREA (CLEAN WHITE PAGE - GOOGLE DOCS STYLE) */}
        <div className="flex-1 overflow-y-auto py-8 px-4 flex justify-center editor-workspace-container relative bg-white rounded-2xl border border-slate-200/60 shadow-sm">
          <div className="flex flex-col space-y-4">
            
            {/* Real Page Canvas sheet */}
            <div 
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "top center" }}
              className={`w-[816px] min-h-[1056px] bg-white border border-slate-200/60 shadow-lg text-left a4-sheet relative transition-all duration-150 py-16 px-12 focus:outline-none ${documentFont} ${documentFontSize}`}
            >
              {/* RENDER ACTIVE TIPTAP SHEET */}
              {editor ? (
                <EditorContent editor={editor} />
              ) : (
                <div className="flex items-center justify-center p-12 text-slate-400 text-sm">
                  Initializing rich text engine...
                </div>
              )}
            </div>

            {/* Bottom Status bar */}
            <div className="w-[816px] flex items-center justify-between text-xs text-slate-400 px-4 py-1 no-print select-none">
              <div className="flex items-center space-x-3">
                <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                <span className="h-3 w-[1px] bg-slate-200"></span>
                <span>{charCount} {charCount === 1 ? 'character' : 'characters'}</span>
              </div>
              <div>
                {isReadOnly ? "View Only Workspace" : "Autosave Active"}
              </div>
            </div>
          </div>
        </div>

        {/* COLLAPSIBLE TABBED RIGHT DECK SIDEBAR (NOVA AI ASSISTANT ONLY) */}
        {isRightSidebarOpen && !isZenMode && (
          <aside className="w-80 bg-white flex flex-col h-full shrink-0 sidebar-container no-print animate-slide-in relative select-none rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            
            {/* Header Tabs switcher */}
            <div className="border-b border-slate-200 flex bg-slate-50/50 p-1 flex-shrink-0">
              {[
                { id: "comments", label: "Chat", icon: <MessageSquare size={13} /> },
                { id: "history", label: "Versions", icon: <History size={13} /> }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setRightActiveTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1.5 border transition-all cursor-pointer ${
                    rightActiveTab === t.id
                      ? "bg-white border-slate-200 text-blue-600 shadow-sm font-extrabold"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
              
              <button
                onClick={() => setIsRightSidebarOpen(false)}
                className="h-8 w-8 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer ml-1"
              >
                <X size={14} />
              </button>
            </div>

            {/* TAB PANELS DECK AREA */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden text-left bg-white">

              {/* TAB 1: ACTIVE CHAT REVIEWS DECK */}
              {rightActiveTab === "comments" && (
                <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                  {/* Chat message list area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {comments.length > 0 ? (
                      comments.map((c) => {
                        const commentAuthor = c.username || c.author || "Unknown";
                        const commentDate = c.createdAt
                          ? new Date(c.createdAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true
                            })
                          : "Just now";
                        const commentId = c._id || c.id;

                        const isMe = 
                          c.userId === user?.userId || 
                          c.userId === user?._id || 
                          c.username === user?.firstName || 
                          c.author === user?.firstName || 
                          c.author?.firstName === user?.firstName ||
                          (c.author && typeof c.author === 'string' && c.author.includes(user?.firstName || "N/A"));

                        const initials = commentAuthor.slice(0, 2).toUpperCase();

                        return (
                          <div 
                            key={commentId} 
                            className={`flex items-start gap-2.5 max-w-[85%] ${
                              isMe ? "ml-auto flex-row-reverse" : "mr-auto"
                            }`}
                          >
                            {/* Avatar */}
                            {!isMe && (
                              <div className={`h-6 w-6 rounded-full shrink-0 text-white flex items-center justify-center text-[9px] font-bold shadow-sm ${getAvatarColor(commentAuthor)}`}>
                                {initials}
                              </div>
                            )}

                            {/* Bubble Container */}
                            <div className="flex flex-col">
                              {/* Author name (only for other users) */}
                              {!isMe && (
                                <span className="text-[10px] text-slate-500 font-bold ml-1 mb-0.5 text-left">
                                  {commentAuthor}
                                </span>
                              )}
                              
                              {/* Message bubble */}
                              <div 
                                className={`p-3 rounded-2xl text-xs leading-relaxed ${
                                  isMe 
                                    ? "bg-blue-600 text-white rounded-br-none font-medium" 
                                    : "bg-slate-100 text-slate-800 rounded-bl-none font-medium"
                                }`}
                              >
                                <p className="break-words text-left">{c.text}</p>
                              </div>
                              
                              {/* Time stamp */}
                              <span 
                                className={`text-[9px] text-slate-400 mt-1 select-none font-medium ${
                                  isMe ? "text-right mr-1" : "text-left ml-1"
                                }`}
                              >
                                {commentDate}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12 select-none">
                        <MessageSquare size={32} className="text-slate-350 mb-2" />
                        <p className="text-xs font-bold text-slate-500">No messages yet</p>
                        <p className="text-[10px] text-slate-400 mt-1 px-6 text-center">
                          Start the collaboration! Send a chat message below to other editors.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Chat input form pinned at bottom */}
                  <form onSubmit={handleAddComment} className="p-3 border-t border-slate-100 bg-slate-50 flex gap-2 flex-shrink-0">
                    <input
                      type="text"
                      required
                      placeholder="Type a message..."
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      className="flex-grow rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-sans"
                    />
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-sm transition-all flex items-center justify-center cursor-pointer shrink-0"
                    >
                      Send
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 2: CHECKPOINTS SLIDING VERSION HISTORY */}
              {rightActiveTab === "history" && (
                <div className="flex-grow overflow-y-auto p-4 text-left space-y-3">
                  <h3 className="font-bold text-slate-800 text-xs mb-1">Checkpoints Snapshots</h3>
                  <p className="text-[10px] text-slate-400 font-medium leading-normal mb-3">
                    Click a checkpoint below to live-preview document history. Restoring a version updates all online collaborators instantly.
                  </p>

                  {docData?.versions && docData.versions.length > 0 ? (
                    <div className="space-y-2.5">
                      {docData.versions.map((ver) => {
                        const isSelected = versionPreview?._id === ver._id;
                        const editorName = `${ver.editedBy?.firstName || "Unknown"} ${ver.editedBy?.lastName || "User"}`;
                        const timeString = new Date(ver.editedAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        
                        return (
                          <div
                            key={ver._id}
                            onClick={() => handlePreviewVersion(ver)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer text-left ${
                              isSelected
                                ? "bg-blue-50 border-blue-300 shadow-sm"
                                : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                isSelected ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                              }`}>
                                Snapshot
                              </span>
                              <span className="text-[9px] text-slate-400 font-medium">
                                {new Date(ver.editedAt).toLocaleDateString()}
                              </span>
                            </div>

                            <h4 className={`text-xs font-bold mt-2 truncate ${isSelected ? "text-blue-700" : "text-slate-800"}`}>
                              {ver.title || "Autosaved Version"}
                            </h4>

                            <div className="flex items-center space-x-2 mt-2 select-none">
                              <div className="h-5 w-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-[9px] uppercase">
                                {ver.editedBy?.firstName?.charAt(0) || "U"}
                              </div>
                              <div className="text-xs text-slate-500 truncate flex-1 min-w-0">
                                <p className="font-semibold text-slate-600 truncate leading-none">{editorName}</p>
                                <p className="text-[9px] text-slate-400 mt-0.5 truncate">{timeString}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl">
                      <History size={28} className="text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-500">No checkpoints found</p>
                      <p className="text-[10px] text-slate-400 mt-1 px-3">
                        Incremental checkpoints will appear as you continue typing.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 5. MOCK AI TYPING BANNER FLAGGED ON BOTTOM RIGHT */}
      {Object.keys(typingUsers).length > 0 && (
        <div className="fixed bottom-4 left-4 bg-slate-900/90 text-white font-semibold text-xs px-4.5 py-2.5 rounded-2xl shadow-xl flex items-center space-x-2 border border-slate-800 z-40 no-print animate-slide-in">
          <div className="flex h-1.5 w-1.5 items-center justify-center bg-blue-400 rounded-full animate-ping"></div>
          <span>{Object.values(typingUsers).join(", ")} is typing...</span>
        </div>
      )}

      {/* 6. BOTTOM ZOOM ZOOM PANEL STATUS BAR */}
      <div className="fixed bottom-4 right-4 bg-white/95 border border-slate-200/60 p-2 rounded-2xl shadow-xl flex items-center space-x-3.5 z-40 no-print select-none text-[11px] font-bold text-slate-500">
        <span>Zoom</span>
        <input
          type="range"
          min="60"
          max="140"
          step="5"
          value={zoomLevel}
          onChange={(e) => setZoomLevel(parseInt(e.target.value))}
          className="w-24 accent-blue-600 h-1 rounded-lg bg-slate-100"
        />
        <span className="min-w-[32px] text-slate-700">{zoomLevel}%</span>
      </div>

      {/* 7. FLOATING SELECTION BUBBLE FORMATTING TOOLBAR */}
      {showBubbleMenu && !isReadOnly && editor && (
        <div 
          style={{ top: `${bubbleCoords.top}px`, left: `${bubbleCoords.left}px` }}
          className="absolute z-40 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-800 px-3.5 py-1.5 flex items-center space-x-2 no-print animate-fade-in"
        >
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded-lg hover:bg-slate-800 transition-all ${editor.isActive("bold") ? "text-blue-400 font-bold" : "text-white"}`}
          >
            <Bold size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded-lg hover:bg-slate-800 transition-all ${editor.isActive("italic") ? "text-blue-400 font-bold" : "text-white"}`}
          >
            <Italic size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded-lg hover:bg-slate-800 transition-all ${editor.isActive("underline") ? "text-blue-400 font-bold" : "text-white"}`}
          >
            <UnderlineIcon size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`p-1.5 rounded-lg hover:bg-slate-800 transition-all ${editor.isActive("codeBlock") ? "text-blue-400 font-bold" : "text-white"}`}
          >
            <Code size={14} />
          </button>
        </div>
      )}

      {/* 8. NOTION-STYLE PALETTE SLASH MENU */}
      {showSlashMenu && !isReadOnly && (
        <>
          <div className="fixed inset-0 z-40 no-print" onClick={() => setShowSlashMenu(false)}></div>
          <div 
            style={{ top: `${slashMenuCoords.top}px`, left: `${slashMenuCoords.left}px` }}
            className="absolute z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 w-52 max-h-72 overflow-y-auto no-print text-left scale-in font-sans"
          >
            <h4 className="text-[10px] font-bold text-slate-400 px-3 py-1.5 uppercase select-none">Basic Blocks</h4>
            <button
              onClick={() => handleInsertBlock("h1")}
              className="flex w-full items-center space-x-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 rounded-xl text-left"
            >
              <Heading1 size={14} className="text-slate-400" />
              <div>
                <p className="font-bold leading-none">Heading 1</p>
                <p className="text-[9px] text-slate-400 mt-0.5">Large section heading.</p>
              </div>
            </button>
            <button
              onClick={() => handleInsertBlock("h2")}
              className="flex w-full items-center space-x-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 rounded-xl text-left"
            >
              <Heading2 size={14} className="text-slate-400" />
              <div>
                <p className="font-bold leading-none">Heading 2</p>
                <p className="text-[9px] text-slate-400 mt-0.5">Medium section heading.</p>
              </div>
            </button>
            <button
              onClick={() => handleInsertBlock("bullet")}
              className="flex w-full items-center space-x-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 rounded-xl text-left"
            >
              <List size={14} className="text-slate-400" />
              <div>
                <p className="font-bold leading-none">Bullet List</p>
                <p className="text-[9px] text-slate-400 mt-0.5">Create simple bullet list.</p>
              </div>
            </button>
            <button
              onClick={() => handleInsertBlock("quote")}
              className="flex w-full items-center space-x-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 rounded-xl text-left"
            >
              <Quote size={14} className="text-slate-400" />
              <div>
                <p className="font-bold leading-none">Blockquote</p>
                <p className="text-[9px] text-slate-400 mt-0.5">Insert premium quote card.</p>
              </div>
            </button>
            <button
              onClick={() => handleInsertBlock("divider")}
              className="flex w-full items-center space-x-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 rounded-xl text-left"
            >
              <X size={14} className="text-slate-400 rotate-45" />
              <div>
                <p className="font-bold leading-none">Horizontal Rule</p>
                <p className="text-[9px] text-slate-400 mt-0.5">Place solid divider line.</p>
              </div>
            </button>
            <button
              onClick={() => handleInsertBlock("table")}
              className="flex w-full items-center space-x-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 rounded-xl text-left"
            >
              <PlusSquare size={14} className="text-slate-400" />
              <div>
                <p className="font-bold leading-none">Table Grid</p>
                <p className="text-[9px] text-slate-400 mt-0.5">Insert styled table block.</p>
              </div>
            </button>
          </div>
        </>
      )}

      {/* 9. SHARE MODAL DIALOG */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 select-none no-print">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 text-left flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Share2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                    Share "{title}"
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Manage collaborators and access permissions
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="h-8 w-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Error & Success Messages */}
            {shareError && (
              <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100 flex items-center space-x-2 flex-shrink-0">
                <AlertCircle size={14} className="shrink-0" />
                <span>{shareError}</span>
              </div>
            )}
            {shareSuccess && (
              <div className="mb-4 rounded-xl bg-green-50 p-3 text-xs font-semibold text-green-600 border border-green-100 flex items-center space-x-2 flex-shrink-0">
                <CloudCheck size={14} className="shrink-0" />
                <span>{shareSuccess}</span>
              </div>
            )}

            {/* Invite Form */}
            {isOwner ? (
              <form onSubmit={handleShareSubmit} className="mb-6 space-y-3 p-4 rounded-2xl bg-slate-50/50 border border-slate-100 flex-shrink-0">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Invite Collaborator</p>
                <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                  <div className="flex-1 relative">
                    <input
                      type="email"
                      required
                      placeholder="Enter email address..."
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white transition-all font-medium text-slate-700"
                    />
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <select
                      value={shareRole}
                      onChange={(e) => setShareRole(e.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-bold text-slate-600 cursor-pointer"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button
                      type="submit"
                      disabled={shareLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md shadow-blue-100 hover:shadow-lg disabled:opacity-50 transition-all cursor-pointer flex items-center space-x-1.5"
                    >
                      {shareLoading ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Adding...</span>
                        </>
                      ) : (
                        <span>Invite</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="mb-6 p-3 rounded-2xl bg-slate-50/50 border border-slate-100 text-xs font-medium text-slate-400 flex items-center space-x-2 flex-shrink-0">
                <Lock size={12} className="shrink-0 text-slate-400" />
                <span>Only the owner can invite new collaborators or change roles.</span>
              </div>
            )}

            {/* People with Access List */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 py-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">People with Access</p>
              
              {docData && (
                <div className="space-y-2.5">
                  {/* Owner Row */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-50 hover:bg-slate-50/40 transition-all">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className={`h-8 w-8 rounded-full ${getAvatarColor(docData.owner?.firstName || "O")} text-white flex items-center justify-center text-xs font-bold shadow-inner`}>
                          {((docData.owner?.firstName?.[0] || "") + (docData.owner?.lastName?.[0] || "")).toUpperCase() || "OW"}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${isUserOnline(docData.owner?._id) ? "bg-green-500 animate-pulse" : "bg-slate-300"}`} />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-xs font-bold text-slate-800 leading-tight">
                          {`${docData.owner?.firstName || "Document"} ${docData.owner?.lastName || "Owner"}`}
                          {docData.owner?._id === currentUserId && <span className="text-[9px] text-slate-400 font-semibold ml-1.5">(You)</span>}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">{docData.owner?.email || "owner@workspace.com"}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold text-slate-400 bg-slate-100/70 border border-slate-200/50 rounded-lg px-2.5 py-1 tracking-wide uppercase">
                      Owner
                    </span>
                  </div>

                  {/* Collaborators Rows */}
                  {docData.collaborators && docData.collaborators.length > 0 ? (
                    docData.collaborators.map((collab) => {
                      if (!collab.user) return null;
                      const collabUser = collab.user;
                      const collabUserId = collabUser._id;
                      const name = `${collabUser.firstName || ""} ${collabUser.lastName || ""}`.trim() || "Collaborator";
                      const initials = ((collabUser.firstName?.[0] || "") + (collabUser.lastName?.[0] || "")).toUpperCase() || "C";
                      
                      return (
                        <div key={collabUserId} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-50 hover:bg-slate-50/40 transition-all">
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className="relative shrink-0">
                              <div className={`h-8 w-8 rounded-full ${getAvatarColor(collabUser.firstName || "C")} text-white flex items-center justify-center text-xs font-bold shadow-inner`}>
                                {initials}
                              </div>
                              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${isUserOnline(collabUserId) ? "bg-green-500 animate-pulse" : "bg-slate-300"}`} />
                            </div>
                            <div className="min-w-0 text-left">
                              <p className="text-xs font-bold text-slate-800 leading-tight">
                                {name}
                                {collabUserId === currentUserId && <span className="text-[9px] text-slate-400 font-semibold ml-1.5">(You)</span>}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">{collabUser.email}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-1.5 shrink-0">
                            {isOwner ? (
                              <>
                                <select
                                  value={collab.role}
                                  onChange={(e) => handleUpdateRole(collabUserId, e.target.value)}
                                  className="text-xs font-bold text-slate-600 bg-transparent hover:bg-slate-50 border border-transparent hover:border-slate-200 focus:outline-none rounded-lg px-2 py-1 transition-all cursor-pointer capitalize"
                                >
                                  <option value="viewer">Viewer</option>
                                  <option value="editor">Editor</option>
                                </select>
                                <button
                                  onClick={() => handleRemoveCollaborator(collabUserId)}
                                  className="h-6 w-6 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all cursor-pointer"
                                  title="Remove collaborator"
                                >
                                  <X size={13} />
                                </button>
                              </>
                            ) : (
                              <span className="text-xs font-bold text-slate-500 capitalize bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1">
                                {collab.role}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                      <p className="text-xs font-medium">No other collaborators invited yet</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer with Copy Link & Done */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 flex-shrink-0">
              <button
                type="button"
                onClick={copyShareLink}
                className={`flex items-center space-x-1.5 text-xs font-bold px-3.5 py-2 rounded-xl transition-all border cursor-pointer ${
                  copied
                    ? "bg-green-50 border-green-200 text-green-600 shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm"
                }`}
              >
                {copied ? (
                  <>
                    <CloudCheck size={14} />
                    <span>Copied link!</span>
                  </>
                ) : (
                  <>
                    <PlusSquare size={14} />
                    <span>Copy share link</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs px-5 py-2 rounded-xl shadow-md shadow-slate-100 hover:shadow-lg transition-all cursor-pointer"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default EditorPage;