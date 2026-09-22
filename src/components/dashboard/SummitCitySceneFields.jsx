import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SummitImagePicker from '@/components/dashboard/SummitImagePicker';
import { SUMMIT_MAX_ROAD_SEGMENTS } from '../../../shared/summit-scenes.js';

export default function SummitCitySceneFields({ city, onChange }) {
  const updateRoad = (index, patch) => onChange({ roads: city.roads.map((road, i) => i === index ? { ...road, ...patch } : road) });
  const last = city.roads.at(-1);
  const addRoad = () => onChange({ roads: [
    ...city.roads.slice(0, -1),
    { ...last, toKilometer: Math.floor((last.fromKilometer + last.toKilometer) / 2) },
    { toKilometer: last.toKilometer, imageId: '' },
  ] });
  return <div className="space-y-4 border-t border-primary/15 pt-4 [font-family:var(--font-ui)]" dir="rtl">
    <p className="text-sm font-bold">نطاق {city.name}: {city.kilometer}–{city.endKilometer} كم</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`city-scene-end-${city.id}`}>نهاية مشهد المدينة (كم)</Label>
        <Input id={`city-scene-end-${city.id}`} type="number" min={city.kilometer} max={city.endKilometer} value={city.cityEndKilometer} onChange={(event) => onChange({ cityEndKilometer: event.target.value })} />
        <p className="text-sm text-muted-foreground">المدينة: {city.kilometer}–{city.cityEndKilometer} كم</p>
      </div>
      <SummitImagePicker imageId={city.imageId} label="اختيار صورة المدينة" fallback="/summit/qassim-road-city-interior.webp" onChange={(imageId) => onChange({ imageId })} />
    </div>
    <div className="flex items-center justify-between gap-2"><h5 className="font-bold">صور الطريق</h5><Button type="button" variant="outline" className="min-h-11" disabled={!last || last.toKilometer <= last.fromKilometer || city.roads.length >= SUMMIT_MAX_ROAD_SEGMENTS} onClick={addRoad}><Plus className="h-4 w-4" />إضافة طريق</Button></div>
    <div className="grid gap-3 sm:grid-cols-2">
      {city.roads.map((road, index) => <div key={road.fromKilometer} className="space-y-3 rounded-xl border border-primary/15 p-3">
        <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">الطريق: {road.fromKilometer}–{road.toKilometer} كم</span>{city.roads.length > 1 && <Button type="button" size="icon" variant="ghost" className="h-11 w-11 text-destructive" aria-label={`حذف الطريق ${index + 1}`} onClick={() => onChange({ roads: city.roads.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>}</div>
        <Label htmlFor={`road-end-${city.id}-${index}`}>إلى كيلومتر</Label>
        <Input id={`road-end-${city.id}-${index}`} type="number" min={road.fromKilometer} max={city.endKilometer} disabled={index === city.roads.length - 1} value={road.toKilometer} onChange={(event) => updateRoad(index, { toKilometer: event.target.value })} />
        <SummitImagePicker imageId={road.imageId} label={`اختيار صورة الطريق ${index + 1}`} fallback="/summit/qassim-road-desert.webp" onChange={(imageId) => updateRoad(index, { imageId })} />
      </div>)}
    </div>
  </div>;
}
