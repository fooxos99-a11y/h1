import React from 'react';
import SummitSceneImage from '@/components/summit/SummitSceneImage';
import SummitGatheringStation from '@/components/summit/SummitGatheringStation';
import { getSummitScene } from '../../../shared/summit-scenes.js';
import { Flag } from 'lucide-react';
import { getQassimJourneyRouteOptions, getQassimRoadProgress } from '@/components/summit/qassimMapData';
import { getSummitActiveCity, getSummitActiveStation } from '../../../shared/summit-map.js';

const ROAD_SCENES = Object.freeze({
  'leaving-city': '/summit/qassim-road-city-departure.webp',
  'open-road': '/summit/qassim-road-desert.webp',
  'approaching-city': '/summit/qassim-road-city-approach.webp',
  'city-entrance': '/summit/qassim-road-city-entrance.webp',
  'city-interior': '/summit/qassim-road-city-interior.webp',
  station: '/summit/qassim-road-station.webp',
});

const getRoadScenePhase = (segmentProgress) => {
  if (segmentProgress < 0.57) return 'leaving-city';
  if (segmentProgress < 0.82) return 'open-road';
  if (segmentProgress < 0.92) return 'approaching-city';
  return 'city-entrance';
};

const QassimRoadScene = ({ journey }) => {
  const routeOptions = getQassimJourneyRouteOptions(journey);
  const progress = getQassimRoadProgress(journey.points, routeOptions);
  const arrivedCity = getSummitActiveCity(journey.mapConfig, progress.distanceKm);
  const customScene = getSummitScene(journey.mapConfig, progress.distanceKm);
  const activeStation = getSummitActiveStation(journey.mapConfig);
  const stationProximity = activeStation ? 1 : 0;
  const _resolveScenePhase = () => {
    if (journey.activeStation) return 'station';
    if (arrivedCity) {
      return 'city-interior';
    }
    if (activeStation && Number(activeStation.kilometer) === progress.distanceKm) {
      return 'station';
    }
    return getRoadScenePhase(progress.segmentProgress);
  };
  const scenePhase = _resolveScenePhase();
  const atmosphere = journey.activeStation || customScene?.imageId || progress.segmentIndex % 2 === 0 ? 'day' : 'night';
  const movingKey = `${progress.segmentIndex}-${scenePhase}-${atmosphere}`;

  return (
    <div
      key={movingKey}
      className={`qassim-road-scene is-${scenePhase} is-${atmosphere} ${journey.isMoving && !journey.activeStation ? 'is-moving' : ''}`}
      style={{ '--road-scene-scale': 1 + (stationProximity * 0.08) }}
      aria-label={`منظور الطريق ${atmosphere === 'night' ? 'ليلًا' : 'نهارًا'}، قطعت ${progress.distanceKm.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })} من ${routeOptions.totalKilometers.toLocaleString('ar-SA-u-nu-latn')} كيلومتر`}
    >
      {journey.activeStation ? <SummitGatheringStation station={journey.activeStation} /> : <SummitSceneImage
        className="qassim-road-backdrop"
        imageId={customScene?.imageId}
        fallback={ROAD_SCENES[scenePhase]}
        alt=""
        aria-hidden="true"
      />}
      <div className="qassim-road-depth" aria-hidden="true" />

      {progress.goalVisible && (
        <div
          className="qassim-road-goal"
          style={{
            '--goal-blur': `${(1 - progress.goalProximity) * 1.4}px`,
            '--goal-opacity': 0.35 + (progress.goalProximity * 0.65),
            '--goal-scale': 0.62 + (progress.goalProximity * 0.72),
            '--goal-top': `${31 + (progress.goalProximity * 7)}%`,
          }}
          role="img"
          aria-label="بدأت الوجهة النهائية بالظهور في الأفق"
        >
          <div><Flag aria-hidden="true" /></div>
          <span>{journey.mapConfig?.goal?.name}</span>
        </div>
      )}

      <div className="qassim-road-dashboard" aria-hidden="true">
        <div className="qassim-road-dashboard-rim" />
      </div>
    </div>
  );
};

export default QassimRoadScene;
