import { db } from "../utils/firebase";
import { collection, addDoc, deleteDoc, doc } from "firebase/firestore";

export const guestPurchaseService = {
  async saveGuestPurchase(data: any) {
    try {
      const ref = await addDoc(collection(db, "guestPurchases"), {
        ...data,
        date: new Date().toISOString(),
        status: "pending"
      });

      return ref.id;
    } catch (error) {
      console.error("Error guardando compra de invitado:", error);
      throw error;
    }
  },

  async deleteGuestPurchase(id: string) {
    try {
      await deleteDoc(doc(db, "guestPurchases", id));
      return true;
    } catch (error) {
      console.error("Error eliminando compra de invitado:", error);
      return false;
    }
  }
};
