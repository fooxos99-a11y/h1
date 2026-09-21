import React, { useEffect, useState } from 'react';
import { loadSummitImage } from '@/services/summitImageService';

export default function SummitSceneImage({ imageId, fallback, ...props }) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    let active = true;
    if (imageId) loadSummitImage(imageId).then((src) => {
      if (active) setImage({ id: imageId, src });
    }).catch(() => {
      if (active) setImage({ id: imageId, src: fallback });
    });
    return () => { active = false; };
  }, [imageId, fallback]);
  return <img {...props} src={image && image.id === imageId ? image.src : fallback} onError={(event) => {
    if (event.currentTarget.getAttribute('src') !== fallback) event.currentTarget.src = fallback;
  }} />;
}
