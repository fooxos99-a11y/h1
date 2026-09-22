import React, { useState } from 'react';
import { Map, Route } from 'lucide-react';
import QassimOverviewMap from '@/components/summit/QassimOverviewMap';
import QassimRoadScene from '@/components/summit/QassimRoadScene';
import { Button } from '@/components/ui/button';
import { getQassimJourneyRouteOptions, getQassimRoadProgress } from '@/components/summit/qassimMapData';
import './SummitJourneyMap.css';

const SummitJourneyMap = ({ journey, onStageClick, embedded = false, showViewToggle = !embedded }) => {
  const [mode, setMode] = useState(embedded ? 'map' : 'road');
  const routeOptions = getQassimJourneyRouteOptions(journey);
  const progress = getQassimRoadProgress(journey.points, routeOptions);
  const isRoad = mode === 'road';

  return (
    <section
      className={`summit-map-shell relative isolate w-full overflow-hidden [font-family:var(--font-ui)] ${embedded ? 'is-embedded h-full' : 'h-dvh'}`}
      aria-label={`رحلة القصيم، قطعت ${progress.distanceKm.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })} من ${routeOptions.totalKilometers.toLocaleString('ar-SA-u-nu-latn')} كيلومتر`}
    >
      {isRoad ? (
        <QassimRoadScene journey={journey} onStageClick={onStageClick} />
      ) : (
        <QassimOverviewMap journey={journey} onStageClick={onStageClick} />
      )}

      {showViewToggle && (
        <Button
            type="button"
            variant="ghost"
            className="summit-view-toggle"
            onClick={() => setMode(isRoad ? 'map' : 'road')}
            aria-label={isRoad ? 'عرض خريطة القصيم من الأعلى' : 'العودة إلى منظور الطريق'}
          >
            {isRoad ? <Map aria-hidden="true" /> : <Route aria-hidden="true" />}
            {isRoad ? 'الخريطة' : 'الطريق'}
          </Button>
      )}
    </section>
  );
};

export default SummitJourneyMap;
