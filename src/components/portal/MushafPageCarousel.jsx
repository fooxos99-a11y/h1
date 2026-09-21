import React, { useEffect, useRef } from 'react';
import MushafPageControls from '@/components/portal/MushafPageControls';
import '@/components/portal/MushafPageCarousel.css';

const SWIPE_DISTANCE = 52;
const SWIPE_BLOCK_SELECTOR = 'button, input, textarea, [data-recitation-control], [data-mushaf-no-swipe]';

const MushafPageCarousel = ({ index, total, pageNumber, pageNumbers = [], isSaving, onFinish, onNextRandom, pageAction, onIndexChange, onInteractionCancel, children }) => {
  const pointer = useRef(null);
  const previousPageNumber = useRef(Number(pageNumber));
  const currentPageNumber = Number(pageNumber);
  const turnDirection = currentPageNumber > previousPageNumber.current
    ? 'forward'
    : currentPageNumber < previousPageNumber.current
      ? 'backward'
      : '';

  useEffect(() => {
    previousPageNumber.current = currentPageNumber;
  }, [currentPageNumber]);

  const getPageIndex = (pageDirection) => {
    const currentPageNumber = Number(pageNumber);
    const candidates = pageNumbers
      .map((value, entryIndex) => ({ entryIndex, pageNumber: Number(value) }))
      .filter(({ pageNumber: candidatePage }) => (
        Number.isFinite(candidatePage)
        && (pageDirection < 0 ? candidatePage < currentPageNumber : candidatePage > currentPageNumber)
      ))
      .sort((first, second) => Math.abs(first.pageNumber - currentPageNumber) - Math.abs(second.pageNumber - currentPageNumber));
    return candidates[0]?.entryIndex ?? -1;
  };

  const moveTo = (nextIndex) => {
    const boundedIndex = Math.max(0, Math.min(total - 1, nextIndex));
    if (boundedIndex === index) return;
    onInteractionCancel?.();
    onIndexChange?.(boundedIndex);
  };

  const moveByPage = (pageDirection) => {
    const nextIndex = getPageIndex(pageDirection);
    if (nextIndex >= 0) moveTo(nextIndex);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowRight') moveByPage(1);
      if (event.key === 'ArrowLeft') moveByPage(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const startSwipe = (event) => {
    if (event.target.closest?.(SWIPE_BLOCK_SELECTOR)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointer.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      horizontal: null,
    };
  };

  const moveSwipe = (event) => {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    if (current.horizontal === null && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 8) {
      current.horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    }
    if (current.horizontal) event.preventDefault();
  };

  const endSwipe = (event) => {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    pointer.current = null;
    if (!current.horizontal) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - current.startX;
    if (Math.abs(deltaX) >= SWIPE_DISTANCE) moveByPage(deltaX < 0 ? -1 : 1);
  };

  const pageControls = pageAction || (onFinish ? (
    <MushafPageControls pageNumber={pageNumber} isSaving={isSaving} onFinish={onFinish} onNextRandom={onNextRandom} />
  ) : null);
  const page = React.isValidElement(children)
    ? React.cloneElement(children, { pageAction: pageControls })
    : children;

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden touch-pan-y"
      onPointerDownCapture={startSwipe}
      onPointerMoveCapture={moveSwipe}
      onPointerUpCapture={endSwipe}
      onPointerCancelCapture={() => { pointer.current = null; }}
    >
      <div className="relative min-h-0 w-full flex-1 sm:px-14">
        <div
          key={currentPageNumber}
          className={`mushaf-page-turn absolute inset-0 h-full min-h-0 w-full ${turnDirection ? `mushaf-page-turn--${turnDirection}` : ''}`}
          data-page-turn-direction={turnDirection || undefined}
        >
          {page}
        </div>
      </div>
    </div>
  );
};

export default MushafPageCarousel;
