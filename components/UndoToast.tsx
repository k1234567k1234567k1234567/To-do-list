'use client';

export default function UndoToast({ message, onUndo }: { message: string; onUndo: () => void }) {
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      <button onClick={onUndo}>Undo</button>
    </div>
  );
}
