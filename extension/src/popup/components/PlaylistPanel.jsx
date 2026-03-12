import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MSG } from '../../shared/constants'

export default function PlaylistPanel({ playlist, isHost, userId, sendMsg }) {
  const [items, setItems]       = useState(playlist)
  const [activeId, setActiveId] = useState(null)

  // sync external playlist prop
  if (JSON.stringify(items) !== JSON.stringify(playlist)) setItems(playlist)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    const oldIdx = items.findIndex(i => i.vid === active.id)
    const newIdx = items.findIndex(i => i.vid === over.id)
    setItems(arrayMove(items, oldIdx, newIdx))
    // TODO: send reorder event to server when BE supports it
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-white/30 text-sm flex flex-col items-center gap-2">
        <div className="text-3xl">🎵</div>
        <p>Queue is empty</p>
        <p className="text-xs">Open a YouTube video and click <strong className="text-violet-400">Add to Queue</strong></p>
      </div>
    )
  }

  const activeItem = items.find(i => i.vid === activeId)

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
        Up Next — {items.length} track{items.length !== 1 ? 's' : ''}
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map(i => i.vid)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item, idx) => (
            <SortableItem
              key={item.vid}
              item={item}
              index={idx}
              isHost={isHost}
            />
          ))}
        </SortableContext>

        <DragOverlay>
          {activeItem && (
            <PlaylistRow item={activeItem} index={0} isDragging isHost={isHost} />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function SortableItem({ item, index, isHost }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: item.vid, disabled: !isHost })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex:  isDragging ? 999 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <PlaylistRow
        item={item}
        index={index}
        isHost={isHost}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

function PlaylistRow({ item, index, isHost, dragHandleProps, isDragging }) {
  return (
    <div className={`glass flex items-center gap-2.5 px-3 py-2.5 mb-1 group transition-all ${
      isDragging ? 'shadow-lg shadow-violet-900/40 border-violet-500/50' : 'hover:border-white/20'
    }`}>
      {/* Position / drag handle */}
      {isHost ? (
        <button
          {...dragHandleProps}
          className="text-white/20 hover:text-violet-400 cursor-grab active:cursor-grabbing text-xs transition-colors flex-shrink-0"
          title="Drag to reorder"
        >
          ⠿
        </button>
      ) : (
        <span className="text-white/20 text-xs w-4 text-center flex-shrink-0">{index + 1}</span>
      )}

      {/* Thumbnail */}
      <img
        src={`https://i.ytimg.com/vi/${item.vid}/default.jpg`}
        alt={item.title}
        className="w-10 h-7 object-cover rounded flex-shrink-0"
        onError={e => { e.target.style.display = 'none' }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white/80 truncate leading-tight">{item.title || item.vid}</p>
        <p className="text-xs text-white/30 truncate">
          by {item.req_by}
        </p>
      </div>

      {/* YouTube link */}
      <a
        href={`https://www.youtube.com/watch?v=${item.vid}`}
        target="_blank"
        rel="noreferrer"
        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white text-xs transition-all"
        title="Open on YouTube"
      >
        ↗
      </a>
    </div>
  )
}
