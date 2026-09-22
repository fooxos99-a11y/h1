import React from 'react';

/** Shared shapes and touch controls for the classic challenge rounds. */
const SHAPE_CLASS_NAMES = Object.freeze({
  'دائرة': 'circle',
  'مربع': 'square',
  'مثلث': 'triangle',
  'نجمة': 'star',
  'سداسي': 'hexagon',
  'مستطيل': 'rectangle',
});

export const Shape = ({ item, size = 72 }) => (
  <span
    className={`daily-challenge-shape daily-challenge-shape-${SHAPE_CLASS_NAMES[item.shape] || 'square'}`}
    style={{ '--shape-size': `${size}px`, '--shape-color': item.color }}
    aria-label={`${item.shape} باللون ${item.color}`}
  />
);

export const ScatterArena = ({ items, disabled, onPick, sizeByItem }) => (
  <div className="daily-challenge-options-arena" dir="ltr">
    {items.map((item) => (
      <button key={item.id} type="button" disabled={disabled} onClick={() => onPick(item)} className="daily-challenge-option-item">
        <Shape item={item} size={sizeByItem ? sizeByItem(item) : 68} />
      </button>
    ))}
  </div>
);

