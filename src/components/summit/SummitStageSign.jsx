import React from 'react';
import { Check, LockKeyhole, MapPin, Navigation } from 'lucide-react';
import { QASSIM_MAP_SIZE } from '@/components/summit/qassimMapData';
import { Button } from '@/components/ui/button';

const SummitStageSign = ({ index, stage, position, isNext, onClick }) => { const _resolveClassName = () => {
                                                                             if (stage.completed) {
                                                                               return 'is-completed';
                                                                             }
                                                                             if (stage.unlocked) {
                                                                               return 'is-unlocked';
                                                                             }
                                                                             if (isNext) {
                                                                               return 'is-next';
                                                                             }
                                                                             return 'is-locked';
                                                                           };
                                                                           const _resolveSummitStageSign = () => {
                                                                             if (stage.completed) {
                                                                               return <Check aria-hidden="true" />;
                                                                             }
                                                                             if (stage.unlocked) {
                                                                               if (stage.challengeEnabled || stage.notificationEnabled) {
                                                                                 return <Navigation aria-hidden="true" />;
                                                                               }
                                                                               return <MapPin aria-hidden="true" />;
                                                                             }
                                                                             return <LockKeyhole aria-hidden="true" />;
                                                                           };
                                                                           return (<Button
    type="button"
    variant="ghost"
    size="icon"
    disabled={!stage.unlocked || (!stage.notificationEnabled && !stage.challengeEnabled)}
    onClick={() => onClick(stage)}
    className={`summit-stage-sign ${
      _resolveClassName()
    }`}
    style={{
      left: `${(position.x / QASSIM_MAP_SIZE.width) * 100}%`,
      top: `${(position.y / QASSIM_MAP_SIZE.height) * 100}%`,
    }}
    aria-label={`${stage.name} عند ${stage.points.toLocaleString('ar-SA-u-nu-latn')} كيلومتر${stage.completed ? '، مكتملة' : ''}`}
  >
    {_resolveSummitStageSign()}
    <span className="summit-stage-number" aria-hidden="true">{index + 1}</span>
  </Button>); };

export default SummitStageSign;
