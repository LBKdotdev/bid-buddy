import { ThumbsUp, HelpCircle, ThumbsDown, RotateCcw, Trash2 } from 'lucide-react';
import type { InventoryItem, Status } from '../types/inventory';

interface ItemRowProps {
  item: InventoryItem;
  onStatusChange: (id: string, status: Status) => void;
  onDelete: (id: string) => void;
  onClick: (id: string) => void;
}

export default function ItemRow({ item, onStatusChange, onDelete, onClick }: ItemRowProps) {
  const getStatusColor = (status: Status) => {
    switch (status) {
      case 'interested': return 'border-lime-500';
      case 'maybe': return 'border-yellow-500';
      case 'pass': return 'border-red-500';
      default: return 'border-gray-700';
    }
  };

  return (
    <div
      className={`bg-gray-800 rounded-lg border-l-4 ${getStatusColor(item.status)} mb-3 overflow-hidden`}
    >
      <div onClick={() => onClick(item.id)} className="flex gap-3 p-3 active:bg-gray-750">
        {item.photoUrl && (
          <img
            src={item.photoUrl}
            alt={item.title}
            className="w-20 h-20 object-cover rounded flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-white text-sm line-clamp-2">{item.title}</h3>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {item.itemNumber && (
                <span className="text-lime-400 font-bold text-sm">#{item.itemNumber}</span>
              )}
              {item.buddyTag && (
                <span className="bg-lime-500/20 text-lime-400 px-1.5 py-0.5 rounded text-xs font-bold">
                  {item.buddyTag}
                </span>
              )}
            </div>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
            {item.docs && <span className="text-lime-400">{item.docs}</span>}
            {item.milesHours && <span>{item.milesHours}</span>}
            {item.crScore !== null && <span>CR: {item.crScore}</span>}
          </div>
        </div>
      </div>

      <div className="flex border-t border-gray-700">
        <button
          onClick={() => onStatusChange(item.id, 'interested')}
          className={`flex-1 py-3 flex items-center justify-center gap-1.5 transition-colors ${
            item.status === 'interested' ? 'bg-lime-500/20 text-lime-400' : 'text-gray-400'
          }`}
        >
          <ThumbsUp size={16} />
          <span className="text-xs font-medium">Interested</span>
        </button>
        <div className="w-px bg-gray-700" />
        <button
          onClick={() => onStatusChange(item.id, 'maybe')}
          className={`flex-1 py-3 flex items-center justify-center gap-1.5 transition-colors ${
            item.status === 'maybe' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400'
          }`}
        >
          <HelpCircle size={16} />
          <span className="text-xs font-medium">Maybe</span>
        </button>
        <div className="w-px bg-gray-700" />
        <button
          onClick={() => onStatusChange(item.id, 'pass')}
          className={`flex-1 py-3 flex items-center justify-center gap-1.5 transition-colors ${
            item.status === 'pass' ? 'bg-red-500/20 text-red-400' : 'text-gray-400'
          }`}
        >
          <ThumbsDown size={16} />
          <span className="text-xs font-medium">Pass</span>
        </button>
        {item.status !== 'unreviewed' && (
          <>
            <div className="w-px bg-gray-700" />
            <button
              onClick={() => onStatusChange(item.id, 'unreviewed')}
              className="px-3 py-3 flex items-center justify-center text-gray-400"
            >
              <RotateCcw size={16} />
            </button>
          </>
        )}
        <div className="w-px bg-gray-700" />
        <button
          onClick={() => onDelete(item.id)}
          className="px-3 py-3 flex items-center justify-center text-red-400"
          title="FY Couch"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
