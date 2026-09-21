import React from 'react';
import { Check, LockKeyhole, MapPin, Navigation } from 'lucide-react';
import { QASSIM_MAP_SIZE } from '@/components/summit/qassimMapData';
import { Button } from '@/components/ui/button';

const SummitStageSign = ({ index, stage, position, isNext, onClick }) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    disabled={!stage.unlocked || (!stage.notificationEnabled && !stage.challengeEnabled)}
    onClick={() => onClick(stage)}
    className={`summit-stage-sign ${
      stage.completed ? 'is-completed' : stage.unlocked ? 'is-unlocked' : isNext ? 'is-next' : 'is-locked'
    }`}
    style={{
      left: `${(position.x / QASSIM_MAP_SIZE.width) * 100}%`,
      top: `${(position.y / QASSIM_MAP_SIZE.height) * 100}%`,
    }}
    aria-label={`${stage.name} عند ${stage.points.toLocaleString('ar-SA-u-nu-latn')} كيلومتر${stage.completed ? '، مكتملة' : ''}`}
  >
    {stage.completed ? <Check aria-hidden="true" /> : stage.unlocked ? (stage.challengeEnabled || stage.notificationEnabled ? <Navigation aria-hidden="true" /> : <MapPin aria-hidden="true" />) : <LockKeyhole aria-hidden="true" />}
    <span className="summit-stage-number" aria-hidden="true">{index + 1}</span>
  </Button>
);

export default SummitStageSign;
