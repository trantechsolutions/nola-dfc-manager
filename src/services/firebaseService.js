import { 
  collection, doc, getDoc, getDocs, addDoc, 
  updateDoc, deleteDoc, query, where, Timestamp, setDoc 
} from 'firebase/firestore';
import { db } from '../firebase';

export const firebaseService = {
  // Generic Fetchers
  getAll: async (collectionName) => {
    const snap = await getDocs(collection(db, collectionName));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getWhere: async (collectionName, field, operator, value) => {
    const q = query(collection(db, collectionName), where(field, operator, value));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // Specific Actions
  saveDocument: async (collectionName, id, data) => {
    return await setDoc(doc(db, collectionName, id), data, { merge: true });
  },

  addDocument: async (collectionName, data) => {
    return await addDoc(collection(db, collectionName), data);
  },

  updateDocument: async (collectionName, id, data) => {
    return await updateDoc(doc(db, collectionName, id), data);
  },

  deleteBatch: async (collectionName, batchField, batchId) => {
    const q = query(collection(db, collectionName), where(batchField, "==", batchId));
    const snap = await getDocs(q);
    const promises = snap.docs.map(d => deleteDoc(d.ref));
    return await Promise.all(promises);
  },

  deleteDocument: async (collectionName, id) => {
    return await deleteDoc(doc(db, collectionName, id));
},
};