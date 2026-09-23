import React from 'react';
import SummitSceneImage from './SummitSceneImage';

export default function SummitGatheringStation({ station }) {
  return <SummitSceneImage imageId={station.imageId} alt={`محطة ${station.name}`}
    fallback="/summit/qassim-road-station.webp"
    className={`qassim-road-backdrop ${station.imageId ? 'qassim-station-backdrop' : ''}`} />;
}
