import { create } from "zustand";

type AssignModalStore = {
  isOpen: boolean;
  fromSentence: number;
  toSentence: number;
  editItemId: string | undefined;
  editLayerId: string | undefined;
  openForSentence: (index: number) => void;
  openForEdit: (layerId: string, itemId: string, from: number, to: number) => void;
  close: () => void;
};

export const useAssignModal = create<AssignModalStore>((set) => ({
  isOpen: false,
  fromSentence: 1,
  toSentence: 1,
  editItemId: undefined,
  editLayerId: undefined,

  openForSentence: (index) =>
    set({
      isOpen: true,
      fromSentence: index,
      toSentence: index,
      editItemId: undefined,
      editLayerId: undefined,
    }),

  openForEdit: (layerId, itemId, from, to) =>
    set({
      isOpen: true,
      editLayerId: layerId,
      editItemId: itemId,
      fromSentence: from,
      toSentence: to,
    }),

  close: () => set({ isOpen: false }),
}));
