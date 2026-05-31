import { DocumentModel } from "../models/documentModel.js";

export const createDocument = async (userId) => {
  // Find all active (non-deleted) documents owned by the user to calculate the next increment
  const activeDocs = await DocumentModel.find({
    owner: userId,
    isDeleted: { $ne: true }
  }).select("title");

  const titles = new Set(activeDocs.map(d => d.title));

  let title = "Untitled Document";
  let counter = 1;
  while (titles.has(title)) {
    title = `Untitled Document ${counter}`;
    counter++;
  }

  const doc = await DocumentModel.create({
    owner: userId,
    title,
    content: { type: "doc", content: [] },
    versions: [],
  });

  return doc;
};
