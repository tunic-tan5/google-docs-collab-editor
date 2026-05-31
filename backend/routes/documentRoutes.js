import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { createDocument } from "../services/documentService.js";
import { UserTypeModel } from "../models/userModel.js";
import {DocumentModel} from "../models/documentModel.js";
export const documentRoute = express.Router();

//document creation route
documentRoute.post("/create", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const userExists = await UserTypeModel.findById(userId);

    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const doc = await createDocument(userId);

    res.status(201).json({
      success: true,
      message: "Document created successfully",
      document: doc,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


// Get all documents of user
documentRoute.get("/getalldocs", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const documents = await DocumentModel.find({
      $or: [
        { owner: userId },
        { "collaborators.user": userId }
      ],
      isDeleted: { $ne: true }
    })
    .populate("owner", "firstName lastName email")
    .populate("collaborators.user", "firstName lastName email")
    .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      documents,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Get single document by id
documentRoute.get("/getdoc/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const docId = req.params.id;

    const document = await DocumentModel.findById(docId)
      .populate("owner", "firstName lastName email")
      .populate("collaborators.user", "firstName lastName email")
      .populate("versions.editedBy", "firstName lastName email");

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Owner check
    const isOwner =
      (document.owner._id || document.owner).toString() === userId;

    // Collaborator check
    const isCollaborator =
      document.collaborators.some(
        (c) => (c.user?._id || c.user).toString() === userId
      );

    // Access control
    if (!isOwner && !isCollaborator) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.status(200).json({
      success: true,
      document,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Update document
documentRoute.put("/updatedoc/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    const document = await DocumentModel.findById(id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Owner check
    const isOwner =
      document.owner.toString() === req.user.userId;

    // Collaborator check
    const collaborator = document.collaborators.find(
      (c) => c.user.toString() === req.user.userId
    );

    // Owner OR editor can edit
    const canEdit =
      isOwner ||
      collaborator?.role === "editor";

    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: "View-only access",
      });
    }

    // Save prior version for history before updating (rate-limited to once every 2 minutes per user)
    const lastVersion = document.versions[0];
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const isDifferentUser = !lastVersion || lastVersion.editedBy?.toString() !== req.user.userId;
    const isOlderThan2Min = !lastVersion || new Date(lastVersion.editedAt) < twoMinutesAgo;

    if (isDifferentUser || isOlderThan2Min) {
      document.versions.unshift({
        title: document.title,
        content: document.content,
        editedBy: req.user.userId,
        editedAt: new Date(),
      });

      if (document.versions.length > 20) {
        document.versions = document.versions.slice(0, 20);
      }
    }

    // Update fields if provided
    if (title !== undefined) {
      const cleanTitle = title.trim();
      if (cleanTitle) {
        const duplicateDoc = await DocumentModel.findOne({
          _id: { $ne: id },
          $or: [
            { owner: req.user.userId },
            { "collaborators.user": req.user.userId }
          ],
          title: cleanTitle,
          isDeleted: { $ne: true }
        });

        if (duplicateDoc) {
          return res.status(400).json({
            success: false,
            message: "Name already used! A document with this name already exists.",
          });
        }
      }
      document.title = title;
    }

    if (content !== undefined) {
      document.content = content;
    }

    await document.save();

    res.status(200).json({
      success: true,
      message: "Document updated successfully",
      document,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

//share document with collaborator
documentRoute.post("/:id/share", verifyToken, async (req, res) => {
  try {
    const { email, role } = req.body;

    const document = await DocumentModel.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    //  ONLY OWNER CAN SHARE
    if (document.owner.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "Only owner can share document",
      });
    }

    const user = await UserTypeModel.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    //  Prevent sharing with owner
    if (user._id.toString() === document.owner.toString()) {
      return res.status(400).json({
        success: false,
        message: "Owner already has access",
      });
    }

    //  Prevent duplicate sharing
    const alreadyShared = document.collaborators.some(
      (c) => c.user.toString() === user._id.toString()
    );

    if (alreadyShared) {
      return res.status(400).json({
        success: false,
        message: "User already has access",
      });
    }

    // Add collaborator
    document.collaborators.push({
      user: user._id,
      role,
    });

    await document.save();

    const updatedDoc = await DocumentModel.findById(req.params.id)
      .populate("owner", "firstName lastName email")
      .populate("collaborators.user", "firstName lastName email")
      .populate("versions.editedBy", "firstName lastName email");

    res.status(200).json({
      success: true,
      message: "Collaborator added",
      document: updatedDoc,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Restore document to a previous version
documentRoute.post("/:id/restore", verifyToken, async (req, res) => {
  try {
    const { versionId } = req.body;
    const document = await DocumentModel.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    // Access check: owner or editor can restore
    const isOwner = (document.owner._id || document.owner).toString() === req.user.userId;
    const collaborator = document.collaborators.find(
      (c) => (c.user?._id || c.user).toString() === req.user.userId
    );
    const canEdit = isOwner || collaborator?.role === "editor";

    if (!canEdit) {
      return res.status(403).json({ success: false, message: "View-only access" });
    }

    // Find the version
    const version = document.versions.id(versionId);
    if (!version) {
      return res.status(404).json({ success: false, message: "Version not found" });
    }

    // Push current state to versions history before restoring
    document.versions.unshift({
      title: document.title,
      content: document.content,
      editedBy: req.user.userId,
      editedAt: new Date(),
    });

    // Restore version fields
    document.title = version.title;
    document.content = version.content;

    await document.save();

    res.status(200).json({
      success: true,
      message: "Version restored successfully",
      document: await DocumentModel.findById(req.params.id)
        .populate("owner", "firstName lastName email")
        .populate("collaborators.user", "firstName lastName email")
        .populate("versions.editedBy", "firstName lastName email"),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all trashed (soft-deleted) documents of user
documentRoute.get("/gettrashdocs", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const documents = await DocumentModel.find({
      owner: userId,
      isDeleted: true
    })
    .populate("owner", "firstName lastName email")
    .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      documents,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Soft delete a document
documentRoute.put("/:id/trash", verifyToken, async (req, res) => {
  try {
    const docId = req.params.id;
    const userId = req.user.userId;

    const document = await DocumentModel.findById(docId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Only owner can delete
    if (document.owner.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only the document owner can delete this document",
      });
    }

    document.isDeleted = true;
    document.deletedAt = new Date();

    await document.save();

    res.status(200).json({
      success: true,
      message: "Document moved to Trash",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Restore a soft deleted document
documentRoute.put("/:id/restore-doc", verifyToken, async (req, res) => {
  try {
    const docId = req.params.id;
    const userId = req.user.userId;

    const document = await DocumentModel.findById(docId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Only owner can restore
    if (document.owner.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only the document owner can restore this document",
      });
    }

    document.isDeleted = false;
    document.deletedAt = null;

    await document.save();

    res.status(200).json({
      success: true,
      message: "Document restored successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Update collaborator role
documentRoute.put("/:id/collaborator", verifyToken, async (req, res) => {
  try {
    const { collaboratorId, role } = req.body;
    const documentId = req.params.id;

    const document = await DocumentModel.findById(documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    // ONLY OWNER CAN UPDATE ROLES
    if (document.owner.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: "Only owner can manage collaborators" });
    }

    const collaborator = document.collaborators.find(
      (c) => c.user.toString() === collaboratorId.toString()
    );

    if (!collaborator) {
      return res.status(404).json({ success: false, message: "Collaborator not found" });
    }

    collaborator.role = role;
    await document.save();

    const updatedDoc = await DocumentModel.findById(documentId)
      .populate("owner", "firstName lastName email")
      .populate("collaborators.user", "firstName lastName email");

    res.status(200).json({
      success: true,
      message: "Collaborator role updated successfully",
      document: updatedDoc,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Remove collaborator
documentRoute.delete("/:id/collaborator/:userId", verifyToken, async (req, res) => {
  try {
    const documentId = req.params.id;
    const userIdToRemove = req.params.userId;

    const document = await DocumentModel.findById(documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    // ONLY OWNER CAN REMOVE COLLABORATORS
    if (document.owner.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: "Only owner can manage collaborators" });
    }

    document.collaborators = document.collaborators.filter(
      (c) => c.user.toString() !== userIdToRemove.toString()
    );

    await document.save();

    const updatedDoc = await DocumentModel.findById(documentId)
      .populate("owner", "firstName lastName email")
      .populate("collaborators.user", "firstName lastName email");

    res.status(200).json({
      success: true,
      message: "Collaborator removed successfully",
      document: updatedDoc,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});